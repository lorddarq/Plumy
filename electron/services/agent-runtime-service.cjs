const { spawn } = require('node:child_process');
const path = require('node:path');
const {
  HANDOFFS_STORE_KEY,
  OBSERVATIONS_STORE_KEY,
  PROFILE_SCHEMA_VERSION,
  getState,
  resolveProfile,
} = require('../domain/agent-runtime-profile-service.cjs');

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

function testConnection(store, payload, options = {}) {
  const resolution = resolveProfile(store, payload);
  if (!resolution.ok) return Promise.resolve(resolution);
  const { profile } = resolution;
  if (!['acp-local-stdio', 'codex-app-server-stdio'].includes(profile.integrationMode)) {
    return Promise.resolve({ ok: false, state: 'unsupported', profile, error: 'Connection testing is only available for local stdio runtime profiles.' });
  }
  const isCodexAppServer = profile.integrationMode === 'codex-app-server-stdio';
  const workspacePath = cleanWorkspacePath(payload.workspacePath);
  const spawnProcess = options.spawnProcess || spawn;
  const now = options.now || (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const observedAt = now();
    let child;
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timer;
    let initializationResult;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child && !child.killed) child.kill();
      const observation = result.observation || observationFromError(result.errorObject || new Error(result.error), observedAt);
      persistObservation(store, profile.id, observation);
      resolve({ ...result, profile, source: resolution.source, observation });
    };

    try {
      const args = isCodexAppServer
        ? [...(profile.fixedArgs || []), 'app-server', '--stdio']
        : profile.fixedArgs || [];
      child = spawnProcess(profile.executablePath, args, {
        cwd: workspacePath,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      finish({ ok: false, state: error.code === 'ENOENT' ? 'missing' : 'unavailable', error: error.message, errorObject: error });
      return;
    }

    timer = setTimeout(() => finish({
      ok: false,
      state: 'unavailable',
      error: `${isCodexAppServer ? 'Codex app-server' : 'ACP'} initialization timed out after ${timeoutMs} ms.`,
    }), timeoutMs);

    child.once('error', error => finish({
      ok: false,
      state: error.code === 'ENOENT' ? 'missing' : 'unavailable',
      error: error.message,
      errorObject: error,
    }));
    child.stderr?.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-2048); });
    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (isCodexAppServer && message.id === 1) {
          if (message.error) {
            finish({ ok: false, state: 'unavailable', error: message.error.message || 'Codex authentication check failed.' });
            return;
          }
          const account = message.result?.account;
          const requiresAuthentication = message.result?.requiresOpenaiAuth === true;
          const signedOut = requiresAuthentication && !account;
          const observation = {
            availability: 'available',
            authentication: signedOut ? 'required' : account ? 'authenticated' : 'not-required',
            capabilities: 'supported',
            implementationName: 'Codex app-server',
            adapterVersion: initializationResult?.userAgent || null,
            providerName: account?.type || null,
            modelOrMode: null,
            agentCapabilities: { threadLifecycle: true },
            authMethodCount: requiresAuthentication ? 1 : 0,
            observedAt,
            state: signedOut ? 'signed-out' : 'ready',
          };
          finish({ ok: !signedOut, state: observation.state, error: signedOut ? 'Codex requires sign-in.' : undefined, observation });
          return;
        }
        if (message.id !== 0) continue;
        if (message.error) {
          finish({ ok: false, state: 'incompatible', error: message.error.message || `${isCodexAppServer ? 'Codex app-server' : 'ACP'} initialization failed.` });
          return;
        }
        const result = message.result;
        if (isCodexAppServer) {
          if (!result || typeof result !== 'object') {
            finish({ ok: false, state: 'incompatible', error: 'Codex app-server returned an invalid initialization response.' });
            return;
          }
          initializationResult = result;
          try {
            child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
            child.stdin.write(`${JSON.stringify({ method: 'account/read', id: 1, params: { refreshToken: false } })}\n`);
          } catch (error) {
            finish({ ok: false, state: 'unavailable', error: error.message, errorObject: error });
          }
          continue;
        }
        if (!result || result.protocolVersion !== ACP_PROTOCOL_VERSION) {
          finish({ ok: false, state: 'incompatible', error: `Unsupported ACP protocol version: ${result?.protocolVersion ?? 'missing'}.` });
          return;
        }
        const authMethods = Array.isArray(result.authMethods) ? result.authMethods : [];
        const observation = {
          availability: 'available',
          authentication: authMethods.length ? 'required' : 'unknown',
          capabilities: 'supported',
          implementationName: result.agentInfo?.title || result.agentInfo?.name || null,
          adapterVersion: result.agentInfo?.version || null,
          providerName: null,
          modelOrMode: null,
          agentCapabilities: result.agentCapabilities || {},
          authMethodCount: authMethods.length,
          observedAt,
          state: authMethods.length ? 'signed-out' : 'ready',
        };
        finish({ ok: authMethods.length === 0, state: observation.state, error: authMethods.length ? 'The ACP agent requires sign-in.' : undefined, observation });
      }
    });
    child.once('exit', (code) => {
      if (!settled) finish({ ok: false, state: 'unavailable', error: `${isCodexAppServer ? 'Codex app-server' : 'ACP agent'} exited before initialization (${code ?? 'unknown'}).${stderr ? ` ${stderr.trim()}` : ''}` });
    });

    try {
      child.stdin.write(`${JSON.stringify({
        ...(!isCodexAppServer && { jsonrpc: '2.0' }),
        id: 0,
        method: 'initialize',
        params: isCodexAppServer ? {
          clientInfo: { name: 'omvra', title: 'Omvra', version: '1' },
        } : {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
          clientInfo: { name: 'omvra', title: 'Omvra', version: '1' },
        },
      })}\n`);
    } catch (error) {
      finish({ ok: false, state: 'unavailable', error: error.message, errorObject: error });
    }
  });
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
