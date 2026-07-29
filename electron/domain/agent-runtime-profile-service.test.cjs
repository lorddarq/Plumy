const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULTS_STORE_KEY,
  PROFILE_STORE_KEY,
  deleteProfile,
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
});

test('runtime resolution is deterministic and never silently falls back', () => {
  const store = createStore();
  saveProfile(store, { id: 'global', name: 'Global', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/global', enabled: true });
  saveProfile(store, { id: 'project', name: 'Project', integrationMode: 'external-handoff', externalUrlScheme: 'codex', enabled: true });
  saveDefaults(store, { globalProfileId: 'global', projectProfileIds: { 'project-1': 'project' } });

  assert.equal(resolveProfile(store, { projectId: 'project-1' }).profile.id, 'project');
  assert.equal(resolveProfile(store, { projectId: 'project-1', executionProfileId: 'global' }).source, 'execution-override');
  assert.equal(resolveProfile(store, { executionProfileId: 'missing' }).state, 'missing');

  deleteProfile(store, 'project');
  assert.deepEqual(store.get(DEFAULTS_STORE_KEY).projectProfileIds, {});
});
