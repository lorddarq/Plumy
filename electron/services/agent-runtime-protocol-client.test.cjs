const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const {
  MAX_PENDING_REQUESTS,
  JsonLineTransport,
  createNativeRuntimeClient,
} = require('./agent-runtime-protocol-client.cjs');

function createChild(onMessage) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = {
    write(value) {
      onMessage(JSON.parse(value), child);
      return true;
    },
  };
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

function respond(child, id, result) {
  queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id, result })}\n`));
}

test('generic ACP client negotiates exact capabilities and completes a bounded session lifecycle', async () => {
  const messages = [];
  const child = createChild((message, currentChild) => {
    messages.push(message);
    if (message.method === 'initialize') respond(currentChild, message.id, {
      protocolVersion: 1,
      agentInfo: { name: 'fixture-acp', version: '1.2.3' },
      authMethods: [],
      agentCapabilities: {
        loadSession: false,
        mcpCapabilities: { http: true },
        sessionCapabilities: { resume: {}, close: {} },
      },
    });
    if (message.method === 'session/new') respond(currentChild, message.id, { sessionId: 'session-1' });
    if (message.method === 'session/prompt') respond(currentChild, message.id, { stopReason: 'end_turn' });
    if (message.method === 'session/close') respond(currentChild, message.id, {});
  });
  const client = createNativeRuntimeClient({
    integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/fixture', fixedArgs: ['acp'],
  }, { workspacePath: '/tmp/workspace', spawnProcess: (command, args, options) => {
    assert.equal(command, '/usr/bin/fixture');
    assert.deepEqual(args, ['acp']);
    assert.equal(options.shell, false);
    assert.equal(typeof options.env.PATH, 'string');
    return child;
  }, timeoutMs: 100 });

  const observation = await client.initialize();
  assert.equal(messages[0].jsonrpc, '2.0');
  assert.equal(observation.capabilities.resume, true);
  assert.equal(observation.capabilities.load, false);
  assert.equal(observation.capabilities.mcpHttp, true);
  const session = await client.startSession({ mcpServers: [{ name: 'omvra', url: 'http://127.0.0.1:3456/mcp' }] });
  assert.equal(session.sessionId, 'session-1');
  assert.deepEqual(await client.prompt(session.sessionId, 'Do bounded work'), { stopReason: 'end_turn' });
  assert.deepEqual(client.cancel(session.sessionId), { acknowledged: false });
  await client.closeSession(session.sessionId);
  assert.deepEqual(messages.map(message => message.method), ['initialize', 'session/new', 'session/prompt', 'session/cancel', 'session/close']);
  client.close();
});

test('generic ACP refuses unadvertised resume and close rather than emulating them', async () => {
  const child = createChild((message, currentChild) => {
    if (message.method === 'initialize') respond(currentChild, message.id, { protocolVersion: 1, authMethods: [], agentCapabilities: {} });
  });
  const client = createNativeRuntimeClient({ integrationMode: 'acp-local-stdio', executablePath: '/usr/bin/fixture' }, {
    workspacePath: '/tmp/workspace', spawnProcess: () => child, timeoutMs: 100,
  });
  await client.initialize();
  await assert.rejects(() => client.resumeSession('session-1'), error => error.code === 'ACP_SESSION_RESUME_UNSUPPORTED');
  await assert.rejects(() => client.closeSession('session-1'), error => error.code === 'ACP_CAPABILITY_UNSUPPORTED');
  client.close();
});

test('runtime profiles reject directory paths before spawning', () => {
  assert.throws(() => createNativeRuntimeClient({
    integrationMode: 'codex-app-server-stdio', executablePath: '/tmp',
  }, { workspacePath: '/tmp/workspace', spawnProcess: () => { throw new Error('must not spawn'); } }), error => {
    assert.equal(error.code, 'ACP_RUNTIME_UNAVAILABLE');
    assert.match(error.message, /must point to an executable file/);
    return true;
  });
});

test('Codex client uses native thread and turn methods for start, resume, steer, and cancellation', async () => {
  const methods = [];
  const requests = [];
  const child = createChild((message, currentChild) => {
    methods.push(message.method);
    requests.push(message);
    if (message.method === 'initialize') respond(currentChild, message.id, { userAgent: 'codex-cli/1.0' });
    if (message.method === 'account/read') respond(currentChild, message.id, { account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
    if (message.method === 'model/list') respond(currentChild, message.id, { data: [{ id: 'gpt', isDefault: true }] });
    if (message.method === 'thread/start') respond(currentChild, message.id, { thread: { id: 'thread-1' } });
    if (message.method === 'thread/resume') respond(currentChild, message.id, { thread: { id: 'thread-1' } });
    if (message.method === 'turn/start') respond(currentChild, message.id, { turn: { id: 'turn-1', status: 'inProgress' } });
    if (message.method === 'turn/steer') respond(currentChild, message.id, { turnId: 'turn-1' });
    if (message.method === 'turn/interrupt') respond(currentChild, message.id, {});
  });
  const client = createNativeRuntimeClient({
    integrationMode: 'codex-app-server-stdio', executablePath: '/usr/bin/codex', fixedArgs: ['-c', 'model="gpt"'], approvalPolicy: 'never',
  }, { workspacePath: '/tmp/workspace', spawnProcess: (_command, args) => {
    assert.deepEqual(args, ['-c', 'model="gpt"', 'app-server', '--stdio']);
    return child;
  }, timeoutMs: 100 });

  const observation = await client.initialize();
  assert.equal('jsonrpc' in requests[0], false);
  assert.equal(observation.authentication, 'authenticated');
  assert.equal(observation.models[0].id, 'gpt');
  assert.equal(observation.capabilities.close, false);
  const session = await client.startSession({ model: 'gpt', cwd: '/tmp/untrusted' });
  await client.resumeSession(session.sessionId, { threadId: 'untrusted' });
  await client.prompt(session.sessionId, 'Start');
  await client.steer(session.sessionId, 'Focus on tests');
  await client.cancel(session.sessionId);
  assert.throws(() => client.closeSession(session.sessionId), error => error.code === 'ACP_CAPABILITY_UNSUPPORTED');
  assert.equal(requests.find(message => message.method === 'thread/start').params.cwd, '/tmp/workspace');
  assert.equal(requests.find(message => message.method === 'thread/start').params.approvalPolicy, 'never');
  assert.equal(requests.find(message => message.method === 'thread/resume').params.threadId, 'thread-1');
  assert.equal(requests.find(message => message.method === 'thread/resume').params.approvalPolicy, 'never');
  assert.equal(requests.find(message => message.method === 'turn/start').params.approvalPolicy, 'never');
  assert.deepEqual(methods, ['initialize', 'initialized', 'account/read', 'model/list', 'thread/start', 'thread/resume', 'turn/start', 'turn/steer', 'turn/interrupt']);
  client.close();
});

test('Claude client launches the exact native stream-json contract and writes raw user messages', async () => {
  const launches = [];
  const messages = [];
  const profile = { integrationMode: 'claude-stream-json-stdio', executablePath: '/usr/bin/claude', fixedArgs: ['--setting-sources', 'user'] };
  const client = createNativeRuntimeClient(profile, {
    workspacePath: '/tmp/workspace',
    spawnProcess: (command, args, options) => {
      launches.push({ command, args, options });
      return createChild(message => messages.push(message));
    },
  });
  const observation = await client.initialize();
  assert.equal(observation.authentication, 'unknown');
  await client.startSession({ sessionId: '00000000-0000-4000-8000-000000000001', mcpConfigPath: '/tmp/omvra-mcp.json' });
  await client.prompt('00000000-0000-4000-8000-000000000001', 'Continue');
  assert.equal(launches[0].command, '/usr/bin/claude');
  assert.equal(launches[0].options.shell, false);
  assert.deepEqual(launches[0].args, [
    '--setting-sources', 'user', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--session-id', '00000000-0000-4000-8000-000000000001', '--mcp-config', '/tmp/omvra-mcp.json',
  ]);
  assert.deepEqual(messages[0], { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Continue' }] } });
  await client.closeSession();
});

test('transport rejects malformed runtime messages and bounds pending requests', async () => {
  const child = createChild(() => {});
  const transport = new JsonLineTransport('/usr/bin/fixture', [], {
    workspacePath: '/tmp/workspace', spawnProcess: () => child, timeoutMs: 1_000,
  });
  const malformed = transport.request('initialize').catch(error => error);
  child.stdout.write('{not-json}\n');
  assert.equal((await malformed).code, 'ACP_PROTOCOL_INCOMPATIBLE');

  const queueChild = createChild(() => {});
  const queue = new JsonLineTransport('/usr/bin/fixture', [], {
    workspacePath: '/tmp/workspace', spawnProcess: () => queueChild, timeoutMs: 1_000,
  });
  const pending = Array.from({ length: MAX_PENDING_REQUESTS }, () => queue.request('pending').catch(error => error));
  await assert.rejects(() => queue.request('overflow'), error => error.code === 'ACP_QUEUE_FULL');
  queue.close();
  await Promise.all(pending);
});

test('runtime process exit rejects active requests instead of leaving a falsely active client', async () => {
  const child = createChild(() => {});
  const logs = [];
  const transport = new JsonLineTransport('/usr/bin/fixture', [], {
    workspacePath: '/tmp/workspace', spawnProcess: () => child, timeoutMs: 1_000,
    logger: { info: (message, details) => logs.push({ message, details }), debug: () => {}, error: (message, details) => logs.push({ message, details }) },
  });
  const pending = transport.request('session/prompt').catch(error => error);
  child.emit('exit', 9);
  assert.equal((await pending).code, 'ACP_SESSION_INTERRUPTED');
  assert.equal(logs.some(entry => entry.message === '[agent-runtime:transport] process.exited' && entry.details.code === 9), true);
});

test('bidirectional request IDs cannot resolve an unrelated client request', async () => {
  const outgoing = [];
  const child = createChild(message => outgoing.push(message));
  const transport = new JsonLineTransport('/usr/bin/fixture', [], {
    workspacePath: '/tmp/workspace', spawnProcess: () => child, timeoutMs: 100, jsonRpc: true,
  });
  const serverRequests = [];
  transport.onNotification(message => {
    serverRequests.push(message);
    transport.respond(message.id, { outcome: 'cancelled' });
  });
  const pending = transport.request('initialize');
  child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'session/request_permission', params: {} })}\n`);
  respond(child, 0, { protocolVersion: 1 });
  assert.deepEqual(await pending, { protocolVersion: 1 });
  assert.equal(serverRequests[0].method, 'session/request_permission');
  assert.deepEqual(outgoing[1], { jsonrpc: '2.0', id: 0, result: { outcome: 'cancelled' } });
  transport.close();
});
