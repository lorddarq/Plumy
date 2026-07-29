const { spawn } = require('node:child_process');
const path = require('node:path');
const {
  HANDOFFS_STORE_KEY,
  OBSERVATIONS_STORE_KEY,
  PROFILE_SCHEMA_VERSION,
  getState,
  resolveProfile,
} = require('../domain/agent-runtime-profile-service.cjs');
const { createNativeRuntimeClient } = require('./agent-runtime-protocol-client.cjs');

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_PROMPT_LENGTH = 4_000;
const MAX_HANDOFF_RECORDS = 200;

function cleanWorkspacePath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('workspacePath is required.');
  const result = value.trim();
  if (!path.isAbsolute(result) || result.includes('\0')) throw new Error('workspacePath must be an absolute path.');
  return result;
}

function boundedText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  const result = value.trim();
  if (result.length > maxLength || result.includes('\0')) throw new Error(`${field} exceeds its allowed length.`);
  return result;
}

function persistObservation(store, profileId, observation) {
  const previous = store.get(OBSERVATIONS_STORE_KEY);
  const observations = previous?.observations && typeof previous.observations === 'object' ? previous.observations : {};
  store.set(OBSERVATIONS_STORE_KEY, {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    observations: { ...observations, [profileId]: observation },
  });
}

function observationFromError(error, observedAt) {
  const code = error?.code;
  const state = code === 'ENOENT' ? 'missing' : code === 'EACCES' ? 'unavailable' : error?.state || 'unavailable';
  return {
    availability: state === 'missing' ? 'unavailable' : 'unknown',
    authentication: 'unknown',
    capabilities: state === 'incompatible' ? 'unsupported' : 'unknown',
    observedAt,
    state,
    error: error?.message || String(error),
  };
}

function runBoundedCliProbe(spawnProcess, command, args, { workspacePath, timeoutMs, runtimeName }) {
  return new Promise((resolve, reject) => {
    let child;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child && !child.killed) child.kill();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error(`${runtimeName} probe timed out after ${timeoutMs} ms.`), { state: 'unavailable' })), timeoutMs);
    try {
      child = spawnProcess(command, args, { cwd: workspacePath, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      finish(error);
      return;
    }
    child.once('error', error => finish(error));
    child.stdout?.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-32768); });
    child.stderr?.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-2048); });
    child.once('exit', code => {
      if (code !== 0) return finish(Object.assign(new Error(`${runtimeName} probe exited (${code ?? 'unknown'}).${stderr.trim() ? ` ${stderr.trim()}` : ''}`), { state: 'unavailable' }));
      finish(null, stdout);
    });
  });
}

async function testConnection(store, payload, options = {}) {
  const resolution = resolveProfile(store, payload);
  if (!resolution.ok) return resolution;
  const { profile } = resolution;
  if (!['acp-local-stdio', 'claude-stream-json-stdio', 'codex-app-server-stdio'].includes(profile.integrationMode)) {
    return { ok: false, state: 'unsupported', profile, error: 'Connection testing is only available for local stdio runtime profiles.' };
  }
  const isClaudeStreamJson = profile.integrationMode === 'claude-stream-json-stdio';
  const workspacePath = cleanWorkspacePath(payload.workspacePath);
  const spawnProcess = options.spawnProcess || spawn;
  const now = options.now || (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const observedAt = now();
  if (isClaudeStreamJson) {
    try {
      const versionOutput = await runBoundedCliProbe(spawnProcess, profile.executablePath, [...(profile.fixedArgs || []), '--version'], { workspacePath, timeoutMs, runtimeName: 'Claude Code' });
      const helpOutput = await runBoundedCliProbe(spawnProcess, profile.executablePath, [...(profile.fixedArgs || []), '--help'], { workspacePath, timeoutMs, runtimeName: 'Claude Code' });
      const supported = ['--print', '--input-format', '--output-format', 'stream-json'].every(value => helpOutput.includes(value));
      if (!supported) throw Object.assign(new Error('Claude Code does not advertise the required stream-json stdio interface.'), { state: 'incompatible' });
      const observation = {
        availability: 'available', authentication: 'unknown', capabilities: 'supported', implementationName: 'Claude Code',
        adapterVersion: versionOutput.trim().slice(0, 128) || null, providerName: 'anthropic', modelOrMode: null,
        agentCapabilities: { streamJson: true, sessionResume: true }, authMethodCount: 0, observedAt, state: 'ready',
      };
      persistObservation(store, profile.id, observation);
      return { ok: true, state: 'ready', profile, source: resolution.source, observation };
    } catch (error) {
      const state = error.code === 'ENOENT' ? 'missing' : error.state || 'unavailable';
      const observation = observationFromError(Object.assign(error, { state }), observedAt);
      persistObservation(store, profile.id, observation);
      return { ok: false, state, error: error.message, profile, source: resolution.source, observation };
    }
  }

  let client;
  try {
    client = createNativeRuntimeClient(profile, { workspacePath, spawnProcess, timeoutMs });
    const negotiated = await client.initialize();
    const signedOut = negotiated.authentication === 'required';
    const observation = {
      availability: 'available', authentication: negotiated.authentication, capabilities: 'supported',
      implementationName: negotiated.implementationName, adapterVersion: negotiated.adapterVersion,
      providerName: negotiated.accountType || null,
      modelOrMode: negotiated.models?.find(model => model?.isDefault)?.id || negotiated.models?.find(model => model?.isDefault)?.model || null,
      agentCapabilities: negotiated.capabilities?.raw || negotiated.capabilities || {},
      models: Array.isArray(negotiated.models) ? negotiated.models.slice(0, 100).map(model => ({
        id: model?.id || model?.model,
        isDefault: model?.isDefault === true,
      })).filter(model => typeof model.id === 'string' && model.id) : [],
      authMethodCount: negotiated.authMethods?.length || (signedOut ? 1 : 0), observedAt,
      state: signedOut ? 'signed-out' : 'ready',
    };
    persistObservation(store, profile.id, observation);
    return { ok: !signedOut, state: observation.state, ...(signedOut ? { error: profile.integrationMode === 'codex-app-server-stdio' ? 'Codex requires sign-in.' : 'The ACP agent requires sign-in.' } : {}), profile, source: resolution.source, observation };
  } catch (error) {
    const state = error.code === 'ACP_RUNTIME_MISSING' ? 'missing' : error.code === 'ACP_PROTOCOL_INCOMPATIBLE' ? 'incompatible' : 'unavailable';
    const observation = observationFromError(Object.assign(error, { state }), observedAt);
    persistObservation(store, profile.id, observation);
    return { ok: false, state, error: error.message, profile, source: resolution.source, observation };
  } finally {
    client?.close();
  }
}

async function openExternalHandoff(store, payload, options = {}) {
  const resolution = resolveProfile(store, payload);
  if (!resolution.ok) return resolution;
  const { profile } = resolution;
  if (profile.integrationMode !== 'external-handoff') {
    return { ok: false, state: 'unsupported', profile, error: 'The resolved runtime does not support external handoff.' };
  }
  const workspacePath = cleanWorkspacePath(payload.workspacePath);
  const taskId = boundedText(payload.taskId, 'taskId', 128);
  const contextReference = boundedText(payload.contextReference, 'contextReference', 1024);
  const prompt = boundedText(payload.prompt, 'prompt', MAX_PROMPT_LENGTH);
  const now = options.now || (() => new Date().toISOString());

  if (profile.externalUrlScheme) {
    if (!options.shell?.openExternal) throw new Error('External link service is unavailable.');
    const url = new URL(`${profile.externalUrlScheme}://omvra/handoff`);
    url.searchParams.set('workspace', workspacePath);
    url.searchParams.set('task', taskId);
    url.searchParams.set('context', contextReference);
    url.searchParams.set('prompt', prompt);
    await options.shell.openExternal(url.toString());
  } else {
    const spawnProcess = options.spawnProcess || spawn;
    await new Promise((resolve, reject) => {
      const child = spawnProcess(profile.executablePath, [
        ...(profile.fixedArgs || []),
        '--workspace', workspacePath,
        '--task', taskId,
        '--context', contextReference,
        '--prompt', prompt,
      ], { cwd: workspacePath, detached: true, shell: false, stdio: 'ignore', windowsHide: true });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }

  const handoff = {
    id: options.createId ? options.createId() : `handoff-${Date.now()}`,
    profileId: profile.id,
    taskId,
    contextReference,
    workspacePath,
    promptLength: prompt.length,
    requestedAt: now(),
    outcome: 'intent-recorded',
  };
  const previous = store.get(HANDOFFS_STORE_KEY);
  const handoffs = Array.isArray(previous?.handoffs) ? previous.handoffs : [];
  store.set(HANDOFFS_STORE_KEY, { schemaVersion: PROFILE_SCHEMA_VERSION, handoffs: [...handoffs, handoff].slice(-MAX_HANDOFF_RECORDS) });
  return { ok: true, state: 'handoff-opened', profile, source: resolution.source, handoff };
}

module.exports = { ACP_PROTOCOL_VERSION, MAX_PROMPT_LENGTH, getState, openExternalHandoff, testConnection };
