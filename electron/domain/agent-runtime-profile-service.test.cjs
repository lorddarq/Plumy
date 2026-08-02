const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULTS_STORE_KEY,
  PROFILE_STORE_KEY,
  deleteProfile,
  readDefaults,
  resolveProfile,
  saveDefaults,
  saveProfile,
} = require('./agent-runtime-profile-service.cjs');

function createStore() {
  const values = new Map();
  return {
    get: key => values.get(key),
    set: (key, value) => values.set(key, value),
  };
}

test('runtime profiles validate executable paths, schemes, and credential-like arguments', () => {
  const store = createStore();
  assert.throws(() => saveProfile(store, {
    id: 'local', name: 'Local', integrationMode: 'acp-local-stdio', executablePath: 'agent', fixedArgs: [], enabled: true,
  }), /absolute/);
  assert.throws(() => saveProfile(store, {
    id: 'external', name: 'External', integrationMode: 'external-handoff', externalUrlScheme: 'file', fixedArgs: [], enabled: true,
  }), /Unsupported/);
  assert.throws(() => saveProfile(store, {
    id: 'local', name: 'Local', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/agent', fixedArgs: ['--api-key=secret'], enabled: true,
  }), /Credentials/);
  assert.throws(() => saveProfile(store, {
    id: 'local', name: 'Local', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/agent', fixedArgs: ['--token', 'secret'], enabled: true,
  }), /Credentials/);
  assert.equal(store.get(PROFILE_STORE_KEY), undefined);
  assert.equal(saveProfile(store, {
    id: 'codex', name: 'Codex', integrationMode: 'codex-app-server-stdio', executablePath: '/usr/bin/codex', approvalPolicy: 'never', enabled: true,
  }).approvalPolicy, 'never');
  assert.throws(() => saveProfile(store, {
    id: 'codex-invalid', name: 'Codex', integrationMode: 'codex-app-server-stdio', executablePath: '/usr/bin/codex', approvalPolicy: 'always', enabled: true,
  }), /approvalPolicy/);
  assert.equal(saveProfile(store, {
    id: 'claude', name: 'Claude', integrationMode: 'claude-stream-json-stdio', executablePath: '/usr/bin/claude', enabled: true,
  }).integrationMode, 'claude-stream-json-stdio');
});

test('runtime resolution is deterministic and never silently falls back', () => {
  const store = createStore();
  saveProfile(store, { id: 'global', name: 'Global', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/global', enabled: true });
  saveProfile(store, { id: 'project', name: 'Project', integrationMode: 'external-handoff', externalUrlScheme: 'codex', enabled: true });
  saveDefaults(store, { globalProfileId: 'global', globalWorkspacePath: '/tmp/global-workspace', projectProfileIds: { 'project-1': 'project' } });

  assert.equal(resolveProfile(store, { projectId: 'project-1' }).profile.id, 'project');
  assert.equal(resolveProfile(store, { projectId: 'project-1', executionProfileId: 'global' }).source, 'execution-override');
  assert.equal(resolveProfile(store, { executionProfileId: 'missing' }).state, 'missing');
  assert.equal(store.get(DEFAULTS_STORE_KEY).globalWorkspacePath, '/tmp/global-workspace');
  assert.throws(() => saveDefaults(store, { globalProfileId: 'global', globalWorkspacePath: 'relative/path', projectProfileIds: {} }), /absolute/);

  deleteProfile(store, 'project');
  assert.deepEqual(store.get(DEFAULTS_STORE_KEY).projectProfileIds, {});
  assert.equal(store.get(DEFAULTS_STORE_KEY).globalWorkspacePath, '/tmp/global-workspace');
});

test('legacy defaults enable ACP runtime access and the policy preserves profiles', () => {
  const store = createStore();
  saveProfile(store, { id: 'local', name: 'Local', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/local', enabled: true });

  assert.equal(readDefaults(store).acpRuntimeAccessEnabled, true);
  saveDefaults(store, { globalProfileId: 'local', projectProfileIds: {} });
  assert.equal(resolveProfile(store, {}).ok, true);

  const disabled = saveDefaults(store, { acpRuntimeAccessEnabled: false, globalProfileId: 'local', projectProfileIds: {} });
  assert.equal(disabled.acpRuntimeAccessEnabled, false);
  assert.equal(resolveProfile(store, {}).state, 'disabled');
  assert.equal(store.get(PROFILE_STORE_KEY).profiles[0].id, 'local');

  saveDefaults(store, { acpRuntimeAccessEnabled: true, globalProfileId: 'local', projectProfileIds: {} });
  assert.equal(resolveProfile(store, {}).profile.id, 'local');
});

test('model preference is optional profile configuration and does not persist credentials', () => {
  const store = createStore();
  const profile = saveProfile(store, {
    id: 'codex', name: 'Codex', integrationMode: 'codex-app-server-stdio', executablePath: '/usr/bin/codex',
    modelPreference: 'gpt-5', enabled: true,
  });
  assert.equal(profile.modelPreference, 'gpt-5');
  assert.equal(store.get(PROFILE_STORE_KEY).profiles[0].modelPreference, 'gpt-5');
  assert.throws(() => saveProfile(store, { ...profile, modelPreference: 'token=secret' }), /modelPreference is invalid|Credentials/);
});
