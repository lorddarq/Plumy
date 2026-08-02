const path = require('node:path');

const PROFILE_STORE_KEY = 'omvra.agentRuntimeProfiles.v1';
const DEFAULTS_STORE_KEY = 'omvra.agentRuntimeDefaults.v1';
const OBSERVATIONS_STORE_KEY = 'omvra.agentRuntimeObservations.v1';
const HANDOFFS_STORE_KEY = 'omvra.externalAgentHandoffs.v1';
const PROFILE_SCHEMA_VERSION = 1;
const ALLOWED_EXTERNAL_SCHEMES = new Set(['codex', 'cursor', 'vscode', 'vscode-insiders', 'zed']);
const CODEX_APPROVAL_POLICIES = new Set(['untrusted', 'on-request', 'never']);
const SENSITIVE_ARGUMENT = /(?:^|[-_])(api[-_]?key|access[-_]?token|auth[-_]?token|token|password|secret)(?:$|[=_-])/i;

function cleanString(value, field, maxLength = 512) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  const result = value.trim();
  if (result.length > maxLength || result.includes('\0')) throw new Error(`${field} is invalid.`);
  return result;
}

function validateFixedArgs(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error('fixedArgs must be an array of at most 64 arguments.');
  return value.map((argument) => {
    if (typeof argument !== 'string' || argument.length > 1024 || argument.includes('\0')) {
      throw new Error('Each fixed argument must be a valid string.');
    }
    if (SENSITIVE_ARGUMENT.test(argument)) throw new Error('Credentials must not be stored in runtime arguments.');
    return argument;
  });
}

function validateProfile(input, now = new Date().toISOString()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Runtime profile is required.');
  const integrationMode = input.integrationMode;
  if (!['acp-local-stdio', 'claude-stream-json-stdio', 'codex-app-server-stdio', 'external-handoff'].includes(integrationMode)) {
    throw new Error('integrationMode must be acp-local-stdio, claude-stream-json-stdio, codex-app-server-stdio, or external-handoff.');
  }

  const executablePath = input.executablePath ? cleanString(input.executablePath, 'executablePath', 2048) : undefined;
  const externalUrlScheme = input.externalUrlScheme
    ? cleanString(input.externalUrlScheme, 'externalUrlScheme', 64).replace(/:$/, '').toLowerCase()
    : undefined;
  if (executablePath && !path.isAbsolute(executablePath)) throw new Error('executablePath must be absolute.');
  if (['acp-local-stdio', 'claude-stream-json-stdio', 'codex-app-server-stdio'].includes(integrationMode) && !executablePath) {
    throw new Error('Local stdio profiles require an executablePath.');
  }
  if (integrationMode === 'external-handoff' && !executablePath && !externalUrlScheme) {
    throw new Error('External handoff profiles require an executablePath or approved URL scheme.');
  }
  if (externalUrlScheme && !ALLOWED_EXTERNAL_SCHEMES.has(externalUrlScheme)) {
    throw new Error(`Unsupported external URL scheme: ${externalUrlScheme}.`);
  }
  const approvalPolicy = input.approvalPolicy;
  if (approvalPolicy !== undefined && (integrationMode !== 'codex-app-server-stdio' || !CODEX_APPROVAL_POLICIES.has(approvalPolicy))) {
    throw new Error('approvalPolicy must be untrusted, on-request, or never for Codex app-server profiles.');
  }

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: cleanString(input.id, 'id', 128),
    name: cleanString(input.name, 'name', 128),
    integrationMode,
    ...(executablePath ? { executablePath } : {}),
    fixedArgs: validateFixedArgs(input.fixedArgs),
    ...(approvalPolicy ? { approvalPolicy } : {}),
    ...(externalUrlScheme ? { externalUrlScheme } : {}),
    enabled: input.enabled !== false,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,
  };
}

function readProfiles(store) {
  const value = store.get(PROFILE_STORE_KEY);
  return Array.isArray(value?.profiles) ? value.profiles : [];
}

function writeProfiles(store, profiles) {
  store.set(PROFILE_STORE_KEY, { schemaVersion: PROFILE_SCHEMA_VERSION, profiles });
}

function readDefaults(store) {
  const value = store.get(DEFAULTS_STORE_KEY);
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    globalProfileId: typeof value?.globalProfileId === 'string' ? value.globalProfileId : null,
    globalWorkspacePath: typeof value?.globalWorkspacePath === 'string' && path.isAbsolute(value.globalWorkspacePath)
      ? value.globalWorkspacePath
      : null,
    projectProfileIds: value?.projectProfileIds && typeof value.projectProfileIds === 'object' && !Array.isArray(value.projectProfileIds)
      ? value.projectProfileIds
      : {},
  };
}

function saveDefaults(store, input) {
  const profiles = readProfiles(store);
  const profileIds = new Set(profiles.map(profile => profile.id));
  const globalProfileId = input?.globalProfileId || null;
  const globalWorkspacePath = input?.globalWorkspacePath
    ? cleanString(input.globalWorkspacePath, 'globalWorkspacePath', 2048)
    : null;
  if (globalProfileId && !profileIds.has(globalProfileId)) throw new Error('Global default profile does not exist.');
  if (globalWorkspacePath && !path.isAbsolute(globalWorkspacePath)) throw new Error('globalWorkspacePath must be absolute.');
  const projectProfileIds = {};
  for (const [projectId, profileId] of Object.entries(input?.projectProfileIds || {})) {
    const cleanProjectId = cleanString(projectId, 'projectId', 128);
    if (['__proto__', 'constructor', 'prototype'].includes(cleanProjectId)) throw new Error('projectId is invalid.');
    if (!profileIds.has(profileId)) throw new Error(`Project default profile does not exist: ${profileId}.`);
    projectProfileIds[cleanProjectId] = profileId;
  }
  const defaults = { schemaVersion: PROFILE_SCHEMA_VERSION, globalProfileId, globalWorkspacePath, projectProfileIds };
  store.set(DEFAULTS_STORE_KEY, defaults);
  return defaults;
}

function saveProfile(store, input, now) {
  const profiles = readProfiles(store);
  const existing = profiles.find(profile => profile.id === input?.id);
  const profile = validateProfile({ ...input, createdAt: existing?.createdAt || input?.createdAt }, now);
  writeProfiles(store, existing ? profiles.map(item => item.id === profile.id ? profile : item) : [...profiles, profile]);
  return profile;
}

function deleteProfile(store, profileId) {
  const id = cleanString(profileId, 'profileId', 128);
  const profiles = readProfiles(store);
  if (!profiles.some(profile => profile.id === id)) return false;
  writeProfiles(store, profiles.filter(profile => profile.id !== id));
  const defaults = readDefaults(store);
  saveDefaults(store, {
    globalProfileId: defaults.globalProfileId === id ? null : defaults.globalProfileId,
    globalWorkspacePath: defaults.globalWorkspacePath,
    projectProfileIds: Object.fromEntries(Object.entries(defaults.projectProfileIds).filter(([, value]) => value !== id)),
  });
  return true;
}

function resolveProfile(store, { executionProfileId, projectId } = {}) {
  const profiles = readProfiles(store);
  const defaults = readDefaults(store);
  const selectedId = executionProfileId || (projectId ? defaults.projectProfileIds[projectId] : null) || defaults.globalProfileId;
  const source = executionProfileId ? 'execution-override' : projectId && defaults.projectProfileIds[projectId] ? 'project-default' : 'global-default';
  if (!selectedId) return { ok: false, state: 'missing', source, error: 'No runtime profile is configured for this execution.' };
  const profile = profiles.find(item => item.id === selectedId);
  if (!profile) return { ok: false, state: 'missing', source, profileId: selectedId, error: 'The selected runtime profile is missing.' };
  if (!profile.enabled) return { ok: false, state: 'unavailable', source, profile, error: 'The selected runtime profile is disabled.' };
  try {
    return { ok: true, state: 'resolved', source, profile: validateProfile(profile, profile.updatedAt) };
  } catch (error) {
    return { ok: false, state: 'incompatible', source, profile, error: error.message };
  }
}

function getState(store) {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profiles: readProfiles(store),
    defaults: readDefaults(store),
    observations: store.get(OBSERVATIONS_STORE_KEY)?.observations || {},
  };
}

module.exports = {
  ALLOWED_EXTERNAL_SCHEMES,
  DEFAULTS_STORE_KEY,
  HANDOFFS_STORE_KEY,
  OBSERVATIONS_STORE_KEY,
  PROFILE_SCHEMA_VERSION,
  PROFILE_STORE_KEY,
  deleteProfile,
  getState,
  readDefaults,
  readProfiles,
  resolveProfile,
  saveDefaults,
  saveProfile,
  validateProfile,
};
