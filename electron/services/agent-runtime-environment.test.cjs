const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRuntimeEnvironment } = require('./agent-runtime-environment.cjs');

test('runtime environment preserves the app environment and adds installed Node locations', () => {
  const result = buildRuntimeEnvironment({ PATH: '/custom/bin:/opt/homebrew/bin', RUNTIME_FLAG: '1' }, {
    candidatePaths: ['/tmp/node/bin', '/custom/bin', '/tmp/node/bin'],
    filesystem: { existsSync: value => value !== '/missing', readdirSync: () => [] },
  });

  assert.equal(result.RUNTIME_FLAG, '1');
  assert.deepEqual(result.PATH.split(':'), ['/custom/bin', '/opt/homebrew/bin', '/tmp/node/bin']);

  const localNodeEnvironment = buildRuntimeEnvironment({ PATH: '/usr/bin:/bin' }, {
    homeDirectory: '/home/test',
    filesystem: { existsSync: value => value === '/home/test/.local/bin', readdirSync: () => [] },
  });
  assert.equal(localNodeEnvironment.PATH, '/usr/bin:/bin:/home/test/.local/bin');
  assert.equal(localNodeEnvironment.HOME, '/home/test');

  const packagedEnvironment = buildRuntimeEnvironment({ PATH: '/usr/bin' }, {
    homeDirectory: '/Users/tester',
    candidatePaths: [],
    filesystem: { existsSync: () => false, readdirSync: () => [] },
  });
  assert.equal(packagedEnvironment.HOME, '/Users/tester');
});
