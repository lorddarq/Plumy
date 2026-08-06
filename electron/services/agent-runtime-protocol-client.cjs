const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { buildRuntimeEnvironment } = require('./agent-runtime-environment.cjs');

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_PENDING_REQUESTS = 32;
const MAX_LINE_BYTES = 1024 * 1024;
const MAX_INPUT_TEXT_BYTES = 256 * 1024;

function runtimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateWorkspacePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw runtimeError('ACP_RUNTIME_UNAVAILABLE', 'workspacePath must be an absolute path.');
  }
  return value;
}

function validateSessionRef(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || value.includes('\0')) {
    throw runtimeError('ACP_SESSION_NOT_FOUND', 'A valid runtime session reference is required.');
  }
  return value.trim();
}

function validateInputText(value) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > MAX_INPUT_TEXT_BYTES || value.includes('\0')) {
    throw runtimeError('ACP_PROTOCOL_INCOMPATIBLE', 'Runtime input text is invalid or too large.');
  }
  return value;
}

function validateMcpServers(value) {
  const servers = value === undefined ? [] : value;
  if (!Array.isArray(servers) || servers.length > 16 || Buffer.byteLength(JSON.stringify(servers)) > 64 * 1024) {
    throw runtimeError('ACP_MCP_GRANT_FAILED', 'Scoped MCP configuration is invalid or too large.');
  }
  return servers;
}

function validateProfileLaunch(profile) {
  if (typeof profile.executablePath !== 'string' || !path.isAbsolute(profile.executablePath) || profile.executablePath.includes('\0')) {
    throw runtimeError('ACP_RUNTIME_MISSING', 'Runtime executablePath must be absolute.');
  }
  try {
    if (fs.statSync(profile.executablePath).isDirectory()) {
      throw runtimeError('ACP_RUNTIME_UNAVAILABLE', 'Runtime executablePath must point to an executable file, not a directory. For the ChatGPT app, select /Applications/ChatGPT.app/Contents/Resources/codex.');
    }
  } catch (error) {
    if (error?.code === 'ACP_RUNTIME_UNAVAILABLE') throw error;
    if (error?.code !== 'ENOENT') throw runtimeError('ACP_RUNTIME_UNAVAILABLE', `Runtime executablePath could not be inspected: ${error.message}`);
  }
  if (profile.fixedArgs !== undefined && (!Array.isArray(profile.fixedArgs) || profile.fixedArgs.length > 64
    || profile.fixedArgs.some(argument => typeof argument !== 'string' || argument.length > 1024 || argument.includes('\0')))) {
    throw runtimeError('ACP_RUNTIME_UNAVAILABLE', 'Runtime fixedArgs are invalid.');
  }
}

class JsonLineTransport {
  constructor(command, args, options = {}) {
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.pending = new Map();
    this.listeners = new Set();
    this.nextId = 0;
    this.buffer = '';
    this.stderr = '';
    this.closed = false;
    this.jsonRpc = options.jsonRpc === true;
    this.logger = options.logger || null;
    this.lifecycleListeners = new Set();
    const spawnProcess = options.spawnProcess || spawn;
    this.logger?.info?.('[agent-runtime:transport] process.starting', { executable: path.basename(command), workspacePath: options.workspacePath });
    this.child = spawnProcess(command, args, {
      cwd: validateWorkspacePath(options.workspacePath),
      env: buildRuntimeEnvironment(options.env),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout?.on('data', chunk => this.#receive(chunk));
    this.child.stderr?.on('data', chunk => { this.stderr = `${this.stderr}${chunk}`.slice(-2048); });
    this.child.once('error', error => {
      this.logger?.error?.('[agent-runtime:transport] process.error', { code: error.code || null, message: error.message || String(error) });
      this.#fail(runtimeError(error.code === 'ENOENT' ? 'ACP_RUNTIME_MISSING' : 'ACP_RUNTIME_UNAVAILABLE', error.message), { kind: 'error', processCode: error.code || null });
    });
    this.child.once('exit', code => {
      if (!this.closed) {
        const detail = this.stderr.trim();
        this.logger?.error?.('[agent-runtime:transport] process.exited', { code: code ?? null, stderr: detail || null });
        this.#fail(runtimeError('ACP_SESSION_INTERRUPTED', `Runtime exited unexpectedly (${code ?? 'unknown'}).${detail ? ` ${detail}` : ''}`), { kind: 'exit', processCode: code ?? null });
      }
    });
  }

  onNotification(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onLifecycle(listener) {
    this.lifecycleListeners.add(listener);
    return () => this.lifecycleListeners.delete(listener);
  }

  request(method, params = {}, timeoutMs = this.timeoutMs) {
    if (this.closed) return Promise.reject(runtimeError('ACP_SESSION_INTERRUPTED', 'Runtime connection is closed.'));
    if (this.pending.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(runtimeError('ACP_QUEUE_FULL', 'Runtime request queue is full.'));
    }
    const id = this.nextId++;
    this.logger?.debug?.('[agent-runtime:transport] request.started', { id, method, timeoutMs });
    return new Promise((resolve, reject) => {
      const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => {
          this.logger?.error?.('[agent-runtime:transport] request.timed-out', { id, method, timeoutMs });
          this.#fail(runtimeError('ACP_RUNTIME_UNAVAILABLE', `${method} timed out after ${timeoutMs} ms.`), { kind: 'timeout' });
        }, timeoutMs)
        : null;
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        this.#write({ id, method, params });
      } catch (error) {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        reject(runtimeError('ACP_SESSION_INTERRUPTED', error.message));
      }
    });
  }

  notify(method, params = {}) {
    if (this.closed) throw runtimeError('ACP_SESSION_INTERRUPTED', 'Runtime connection is closed.');
    this.#write({ method, params });
  }

  respond(id, result, error) {
    if ((!Number.isInteger(id) && typeof id !== 'string') || (typeof id === 'string' && !id)) {
      throw runtimeError('ACP_PROTOCOL_INCOMPATIBLE', 'Runtime request ID is invalid.');
    }
    this.send(error ? { id, error } : { id, result });
  }

  send(message) {
    if (this.closed) throw runtimeError('ACP_SESSION_INTERRUPTED', 'Runtime connection is closed.');
    this.#write(message);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.child && !this.child.killed) this.child.kill();
    this.#rejectPending(runtimeError('ACP_SESSION_INTERRUPTED', 'Runtime connection closed.'));
  }

  #write(message) {
    this.child.stdin.write(`${JSON.stringify(this.jsonRpc ? { jsonrpc: '2.0', ...message } : message)}\n`);
  }

  #receive(chunk) {
    this.buffer += chunk.toString();
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) {
      this.#fail(runtimeError('ACP_PROTOCOL_INCOMPATIBLE', 'Runtime message exceeded the maximum size.'));
      return;
    }
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.#fail(runtimeError('ACP_PROTOCOL_INCOMPATIBLE', 'Runtime emitted malformed JSON.'));
        return;
      }
      if (typeof message.method === 'string') {
        for (const listener of this.listeners) listener(message);
      } else if (Object.prototype.hasOwnProperty.call(message, 'id') && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          this.logger?.error?.('[agent-runtime:transport] request.failed', { id: message.id, method: pending.method, message: message.error.message || 'Runtime request failed.' });
          pending.reject(runtimeError('ACP_PROTOCOL_INCOMPATIBLE', message.error.message || 'Runtime request failed.'));
        } else {
          this.logger?.debug?.('[agent-runtime:transport] request.completed', { id: message.id, method: pending.method });
          pending.resolve(message.result);
        }
      }
    }
  }

  #rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  #fail(error, details = {}) {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.lifecycleListeners) listener({ state: 'lost', code: error.code || 'ACP_RUNTIME_UNAVAILABLE', ...details });
    if (this.child && !this.child.killed) this.child.kill();
    this.#rejectPending(error);
  }
}

function normalizeAcpCapabilities(value = {}) {
  const sessions = value.sessionCapabilities || {};
  return {
    prompt: true,
    cancel: true,
    load: value.loadSession === true,
    resume: sessions.resume != null,
    close: sessions.close != null,
    mcpHttp: value.mcpCapabilities?.http === true,
    mcpSse: value.mcpCapabilities?.sse === true,
    modelSelection: Array.isArray(value.models) || Array.isArray(value.modelCapabilities?.models),
    raw: value,
  };
}

function normalizeModels(value) {
  const models = Array.isArray(value) ? value : [];
  return models.map(model => ({
    id: model?.id || model?.model || model?.name,
    isDefault: model?.isDefault === true,
  })).filter(model => typeof model.id === 'string' && model.id.trim()).slice(0, 100);
}

function requestedModel(profile, requested) {
  const model = requested || profile.modelPreference;
  return typeof model === 'string' && model.trim() ? model.trim() : undefined;
}

function assertAdvertisedModel(model, models) {
  if (!model) return;
  if (!models.some(candidate => candidate.id === model)) {
    throw runtimeError('ACP_MODEL_UNAVAILABLE', `Preferred model "${model}" is not advertised by the selected runtime.`);
  }
}

class AcpStdioClient {
  constructor(profile, options) {
    this.profile = profile;
    this.transport = new JsonLineTransport(profile.executablePath, profile.fixedArgs || [], { ...options, jsonRpc: true });
    this.workspacePath = validateWorkspacePath(options.workspacePath);
    this.capabilities = null;
  }

  onNotification(listener) { return this.transport.onNotification(listener); }
  onLifecycle(listener) { return this.transport.onLifecycle(listener); }
  isAlive() { return !this.transport.closed; }
  respond(id, result, error) { return this.transport.respond(id, result, error); }

  async initialize() {
    const result = await this.transport.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'omvra', title: 'Omvra', version: '1' },
    });
    if (!result || result.protocolVersion !== ACP_PROTOCOL_VERSION) {
      throw runtimeError('ACP_PROTOCOL_INCOMPATIBLE', `Unsupported ACP protocol version: ${result?.protocolVersion ?? 'missing'}.`);
    }
    this.capabilities = normalizeAcpCapabilities(result.agentCapabilities);
    this.models = normalizeModels(result.agentCapabilities?.models || result.agentCapabilities?.modelCapabilities?.models);
    return {
      implementationName: result.agentInfo?.title || result.agentInfo?.name || null,
      adapterVersion: result.agentInfo?.version || null,
      authentication: Array.isArray(result.authMethods) && result.authMethods.length ? 'required' : 'unknown',
      authMethods: Array.isArray(result.authMethods) ? result.authMethods : [],
      capabilities: this.capabilities,
      models: this.models,
    };
  }

  async startSession({ mcpServers = [], model } = {}) {
    const selectedModel = requestedModel(this.profile, model);
    assertAdvertisedModel(selectedModel, this.models || []);
    const result = await this.transport.request('session/new', { cwd: this.workspacePath, mcpServers: validateMcpServers(mcpServers), ...(selectedModel ? { model: selectedModel } : {}) });
    return { sessionId: validateSessionRef(result?.sessionId), configuration: result };
  }

  async resumeSession(sessionId, { mcpServers = [] } = {}) {
    const id = validateSessionRef(sessionId);
    const scopedMcpServers = validateMcpServers(mcpServers);
    if (this.capabilities?.resume) {
      await this.transport.request('session/resume', { sessionId: id, cwd: this.workspacePath, mcpServers: scopedMcpServers });
      return { sessionId: id, mode: 'resume' };
    }
    if (this.capabilities?.load) {
      await this.transport.request('session/load', { sessionId: id, cwd: this.workspacePath, mcpServers: scopedMcpServers });
      return { sessionId: id, mode: 'load' };
    }
    throw runtimeError('ACP_SESSION_RESUME_UNSUPPORTED', 'The ACP runtime does not advertise session resume or load.');
  }

  prompt(sessionId, text) {
    return this.transport.request('session/prompt', {
      sessionId: validateSessionRef(sessionId),
      prompt: [{ type: 'text', text: validateInputText(text) }],
    }, 0);
  }

  steer() {
    throw runtimeError('ACP_CAPABILITY_UNSUPPORTED', 'Generic ACP does not advertise a separate steering method.');
  }

  cancel(sessionId) {
    this.transport.notify('session/cancel', { sessionId: validateSessionRef(sessionId) });
    return { acknowledged: false };
  }

  async closeSession(sessionId) {
    if (!this.capabilities?.close) throw runtimeError('ACP_CAPABILITY_UNSUPPORTED', 'The ACP runtime does not advertise session close.');
    await this.transport.request('session/close', { sessionId: validateSessionRef(sessionId) });
    return { acknowledged: true };
  }

  close() { this.transport.close(); }
}

class CodexAppServerClient {
  constructor(profile, options) {
    this.profile = profile;
    // Do not inherit either desktop Omvra endpoint from ~/.codex/config.toml.
    // thread/start supplies the current app's scoped endpoint instead.
    this.transport = new JsonLineTransport(profile.executablePath, [
      ...(profile.fixedArgs || []),
      '-c', 'mcp_servers.omvra.enabled=false',
      '-c', 'mcp_servers.omvra_testing_mcp.enabled=false',
      'app-server', '--stdio',
    ], options);
    this.workspacePath = validateWorkspacePath(options.workspacePath);
    this.approvalPolicy = profile.approvalPolicy;
    this.activeTurns = new Map();
    this.transport.onNotification(message => {
      if (message.method === 'turn/started') {
        const threadId = message.params?.threadId;
        const turnId = message.params?.turn?.id || message.params?.turnId;
        if (threadId && turnId) this.activeTurns.set(threadId, turnId);
      }
      if (message.method === 'turn/completed' && message.params?.threadId) this.activeTurns.delete(message.params.threadId);
    });
  }

  onNotification(listener) { return this.transport.onNotification(listener); }
  onLifecycle(listener) { return this.transport.onLifecycle(listener); }
  isAlive() { return !this.transport.closed; }
  respond(id, result, error) { return this.transport.respond(id, result, error); }

  async initialize() {
    const result = await this.transport.request('initialize', { clientInfo: { name: 'omvra', title: 'Omvra', version: '1' } });
    this.transport.notify('initialized', {});
    const account = await this.transport.request('account/read', { refreshToken: false });
    const modelResult = await this.transport.request('model/list', { limit: 100, includeHidden: false });
    this.models = normalizeModels(modelResult?.data);
    const signedOut = account?.requiresOpenaiAuth === true && !account.account;
    return {
      implementationName: 'Codex app-server',
      adapterVersion: result?.userAgent || null,
      authentication: signedOut ? 'required' : account?.account ? 'authenticated' : 'not-required',
      accountType: account?.account?.type || null,
      models: this.models,
      capabilities: { threadStart: true, threadResume: true, prompt: true, steer: true, cancel: true, close: false, models: true, modelSelection: true },
    };
  }

  async startSession(configuration = {}) {
    const selectedModel = requestedModel(this.profile, configuration.model);
    assertAdvertisedModel(selectedModel, this.models || []);
    const result = await this.transport.request('thread/start', { ...configuration, ...(selectedModel ? { model: selectedModel } : {}), ...(this.approvalPolicy ? { approvalPolicy: this.approvalPolicy } : {}), cwd: this.workspacePath });
    return { sessionId: validateSessionRef(result?.thread?.id), configuration: result };
  }

  async resumeSession(sessionId, configuration = {}) {
    const id = validateSessionRef(sessionId);
    const result = await this.transport.request('thread/resume', { ...configuration, ...(this.approvalPolicy ? { approvalPolicy: this.approvalPolicy } : {}), threadId: id });
    return { sessionId: validateSessionRef(result?.thread?.id || id), configuration: result };
  }

  async prompt(sessionId, text) {
    const threadId = validateSessionRef(sessionId);
    const result = await this.transport.request('turn/start', { threadId, input: [{ type: 'text', text: validateInputText(text) }], ...(this.approvalPolicy ? { approvalPolicy: this.approvalPolicy } : {}) }, 0);
    const turnId = validateSessionRef(result?.turn?.id);
    this.activeTurns.set(threadId, turnId);
    return { turnId, result };
  }

  steer(sessionId, text) {
    const threadId = validateSessionRef(sessionId);
    const turnId = this.activeTurns.get(threadId);
    if (!turnId) throw runtimeError('ACP_CAPABILITY_UNSUPPORTED', 'Codex has no active turn to steer.');
    return this.transport.request('turn/steer', { threadId, expectedTurnId: turnId, input: [{ type: 'text', text: validateInputText(text) }] }, 0);
  }

  async cancel(sessionId) {
    const threadId = validateSessionRef(sessionId);
    const turnId = this.activeTurns.get(threadId);
    if (!turnId) throw runtimeError('ACP_CAPABILITY_UNSUPPORTED', 'Codex has no active turn to interrupt.');
    await this.transport.request('turn/interrupt', { threadId, turnId });
    return { acknowledged: true };
  }

  closeSession() {
    throw runtimeError('ACP_CAPABILITY_UNSUPPORTED', 'Codex app-server does not expose an active-thread close operation.');
  }

  close() { this.transport.close(); }
}

class ClaudeStreamJsonClient {
  constructor(profile, options) {
    this.profile = profile;
    this.options = options;
    this.workspacePath = validateWorkspacePath(options.workspacePath);
    this.sessionId = null;
    this.transport = null;
  }

  initialize() {
    return Promise.resolve({
      implementationName: 'Claude Code', adapterVersion: null, authentication: 'unknown',
      capabilities: { prompt: true, resume: true, steer: true, cancel: true, close: true, mcpConfigPath: true, modelSelection: true },
    });
  }

  createMcpConfigPath(mcpServers) {
    if (!mcpServers || typeof mcpServers !== 'object') return null;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-mcp-'));
    const configPath = path.join(directory, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers }), { encoding: 'utf8', mode: 0o600 });
    this.mcpConfigDirectory = directory;
    return configPath;
  }

  startSession({ sessionId = randomUUID(), mcpConfigPath, mcpServers, model } = {}) {
    this.sessionId = validateSessionRef(sessionId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.sessionId)) {
      throw runtimeError('ACP_SESSION_NOT_FOUND', 'Claude session ID must be a UUID.');
    }
    const selectedModel = requestedModel(this.profile, model);
    const args = [...(this.profile.fixedArgs || []), '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--session-id', this.sessionId, ...(selectedModel ? ['--model', selectedModel] : [])];
    const configPath = mcpConfigPath || this.createMcpConfigPath(mcpServers);
    if (configPath) args.push('--mcp-config', validateWorkspacePath(configPath));
    this.transport = new JsonLineTransport(this.profile.executablePath, args, { ...this.options, workspacePath: this.workspacePath });
    return Promise.resolve({ sessionId: this.sessionId });
  }

  resumeSession(sessionId, { mcpConfigPath, mcpServers } = {}) {
    this.sessionId = validateSessionRef(sessionId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.sessionId)) {
      throw runtimeError('ACP_SESSION_NOT_FOUND', 'Claude session ID must be a UUID.');
    }
    const args = [...(this.profile.fixedArgs || []), '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--resume', this.sessionId];
    const configPath = mcpConfigPath || this.createMcpConfigPath(mcpServers);
    if (configPath) args.push('--mcp-config', validateWorkspacePath(configPath));
    this.transport = new JsonLineTransport(this.profile.executablePath, args, { ...this.options, workspacePath: this.workspacePath });
    return Promise.resolve({ sessionId: this.sessionId });
  }

  onNotification(listener) {
    if (!this.transport) throw runtimeError('ACP_SESSION_NOT_FOUND', 'Claude session has not started.');
    return this.transport.onNotification(listener);
  }

  onLifecycle(listener) {
    if (!this.transport) throw runtimeError('ACP_SESSION_NOT_FOUND', 'Claude session has not started.');
    return this.transport.onLifecycle(listener);
  }

  isAlive() { return Boolean(this.transport && !this.transport.closed); }

  prompt(_sessionId, text) {
    if (!this.transport) throw runtimeError('ACP_SESSION_NOT_FOUND', 'Claude session has not started.');
    this.transport.send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: validateInputText(text) }] } });
    return Promise.resolve({ accepted: true });
  }

  steer(sessionId, text) { return this.prompt(sessionId, text); }
  cancel() { this.close(); return Promise.resolve({ acknowledged: false }); }
  closeSession() { this.close(); return Promise.resolve({ acknowledged: true }); }
  close() {
    this.transport?.close();
    if (this.mcpConfigDirectory) {
      fs.rmSync(this.mcpConfigDirectory, { recursive: true, force: true });
      this.mcpConfigDirectory = null;
    }
  }
}

function createNativeRuntimeClient(profile, options = {}) {
  if (!profile || typeof profile !== 'object') throw runtimeError('ACP_RUNTIME_NOT_CONFIGURED', 'Runtime profile is required.');
  validateProfileLaunch(profile);
  if (profile.integrationMode === 'acp-local-stdio') return new AcpStdioClient(profile, options);
  if (profile.integrationMode === 'codex-app-server-stdio') return new CodexAppServerClient(profile, options);
  if (profile.integrationMode === 'claude-stream-json-stdio') return new ClaudeStreamJsonClient(profile, options);
  throw runtimeError('ACP_CAPABILITY_UNSUPPORTED', 'The selected runtime profile is not a managed local stdio integration.');
}

module.exports = {
  ACP_PROTOCOL_VERSION,
  MAX_LINE_BYTES,
  MAX_PENDING_REQUESTS,
  AcpStdioClient,
  ClaudeStreamJsonClient,
  CodexAppServerClient,
  JsonLineTransport,
  createNativeRuntimeClient,
};
