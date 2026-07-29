const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { saveDefaults, saveProfile, HANDOFFS_STORE_KEY } = require('../domain/agent-runtime-profile-service.cjs');
const { openExternalHandoff, testConnection } = require('./agent-runtime-service.cjs');

function createStore() {
  const values = new Map();
  return { get: key => values.get(key), set: (key, value) => values.set(key, value) };
}

function createChild(onWrite) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { write: onWrite };
  child.killed = false;
  child.kill = () => { child.killed = true; };
  child.unref = () => {};
  return child;
}

test('connection test sends initialize only and records observations separately', async () => {
  const store = createStore();
  saveProfile(store, { id: 'local', name: 'Local', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/agent', fixedArgs: ['--acp'], enabled: true });
  saveDefaults(store, { globalProfileId: 'local', projectProfileIds: {} });
  let written = '';
  const child = createChild((value) => {
    written += value;
    queueMicrotask(() => child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 0, result: {
      protocolVersion: 1,
      agentCapabilities: { mcpCapabilities: { http: true } },
      authMethods: [],
      agentInfo: { name: 'test-agent', version: '1.2.3' },
    } })}\n`));
  });
  const result = await testConnection(store, { workspacePath: '/tmp/workspace' }, {
    spawnProcess: (command, args, options) => {
      assert.equal(command, '/usr/bin/agent');
      assert.deepEqual(args, ['--acp']);
      assert.equal(options.shell, false);
      return child;
    },
    timeoutMs: 100,
    now: () => '2026-07-29T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(JSON.parse(written).method, 'initialize');
  assert.equal(written.includes('session/'), false);
  assert.equal(result.observation.implementationName, 'test-agent');
  assert.equal(child.killed, true);
});

test('external handoff opens an approved scheme and records intent without prompt content', async () => {
  const store = createStore();
  saveProfile(store, { id: 'external', name: 'Codex', integrationMode: 'external-handoff', externalUrlScheme: 'codex', enabled: true });
  saveDefaults(store, { globalProfileId: 'external', projectProfileIds: {} });
  let openedUrl;
  const result = await openExternalHandoff(store, {
    workspacePath: '/tmp/workspace', taskId: 'task-1', contextReference: 'omvra://task/task-1', prompt: 'Review this task',
  }, {
    shell: { openExternal: async url => { openedUrl = url; } },
    createId: () => 'handoff-1',
    now: () => '2026-07-29T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(new URL(openedUrl).protocol, 'codex:');
  const persisted = store.get(HANDOFFS_STORE_KEY).handoffs[0];
  assert.equal(persisted.outcome, 'intent-recorded');
  assert.equal('prompt' in persisted, false);
});

test('connection test reports advertised authentication as a visible signed-out state', async () => {
  const store = createStore();
  saveProfile(store, { id: 'local', name: 'Local', integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/agent', enabled: true });
  saveDefaults(store, { globalProfileId: 'local', projectProfileIds: {} });
  const child = createChild(() => queueMicrotask(() => child.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0', id: 0, result: { protocolVersion: 1, authMethods: [{ id: 'login', name: 'Sign in' }] },
  })}\n`)));
  const result = await testConnection(store, { workspacePath: '/tmp/workspace' }, { spawnProcess: () => child, timeoutMs: 100 });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'signed-out');
  assert.equal(result.observation.authentication, 'required');
});

test('Codex connection test uses app-server directly and reuses its authenticated account', async () => {
  const store = createStore();
  saveProfile(store, { id: 'codex', name: 'Codex', integrationMode: 'codex-app-server-stdio', executablePath: '/usr/bin/codex', fixedArgs: ['-c', 'model="gpt-5"'], enabled: true });
  saveDefaults(store, { globalProfileId: 'codex', projectProfileIds: {} });
  const writes = [];
  const child = createChild((value) => {
    const message = JSON.parse(value);
    writes.push(message);
    if (message.id === 0) queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: 0, result: { userAgent: 'codex-cli/0.145.0', codexHome: '/tmp/codex' } })}\n`));
    if (message.id === 1) queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: 1, result: { account: { type: 'chatgpt' }, requiresOpenaiAuth: true } })}\n`));
  });
  const result = await testConnection(store, { workspacePath: '/tmp/workspace' }, {
    spawnProcess: (command, args) => {
      assert.equal(command, '/usr/bin/codex');
      assert.deepEqual(args, ['-c', 'model="gpt-5"', 'app-server', '--stdio']);
      return child;
    },
    timeoutMs: 100,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(writes.map(message => message.method), ['initialize', 'initialized', 'account/read']);
  assert.equal('jsonrpc' in writes[0], false);
  assert.equal(result.observation.authentication, 'authenticated');
  assert.equal(result.observation.implementationName, 'Codex app-server');
});

test('Codex connection test reports its native signed-out state without collecting credentials', async () => {
  const store = createStore();
  saveProfile(store, { id: 'codex', name: 'Codex', integrationMode: 'codex-app-server-stdio', executablePath: '/usr/bin/codex', enabled: true });
  saveDefaults(store, { globalProfileId: 'codex', projectProfileIds: {} });
  const child = createChild((value) => {
    const message = JSON.parse(value);
    if (message.id === 0) queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: 0, result: {} })}\n`));
    if (message.id === 1) queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: 1, result: { account: null, requiresOpenaiAuth: true } })}\n`));
  });
  const result = await testConnection(store, { workspacePath: '/tmp/workspace' }, { spawnProcess: () => child, timeoutMs: 100 });

  assert.equal(result.ok, false);
  assert.equal(result.state, 'signed-out');
  assert.equal(result.observation.authentication, 'required');
  assert.equal(JSON.stringify(store.get('omvra.agentRuntimeObservations.v1')).includes('credential'), false);
});

test('external executable handoff reports launch failures instead of leaving an unhandled process error', async () => {
  const store = createStore();
  saveProfile(store, { id: 'external', name: 'External', integrationMode: 'external-handoff', executablePath: '/missing/agent', enabled: true });
  saveDefaults(store, { globalProfileId: 'external', projectProfileIds: {} });
  const child = createChild(() => {});
  queueMicrotask(() => child.emit('error', new Error('not found')));
  await assert.rejects(() => openExternalHandoff(store, {
    workspacePath: '/tmp/workspace', taskId: 'task-1', contextReference: 'omvra://task/task-1', prompt: 'Continue task',
  }, { spawnProcess: () => child }), /not found/);
  assert.equal(store.get(HANDOFFS_STORE_KEY), undefined);
});
