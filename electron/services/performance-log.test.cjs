const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPerformanceLogService } = require('./performance-log.cjs');

test('performance log stores timing metadata without arbitrary content', async t => {
  const logsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-performance-'));
  t.after(() => fs.rmSync(logsDirectory, { recursive: true, force: true }));
  const service = createPerformanceLogService({
    logsDirectory,
    shell: { openPath: async () => '' },
    now: () => new Date('2026-08-10T12:00:00.000Z'),
  });

  await service.record({
    category: 'storage',
    operation: 'workspace.persist',
    correlationId: 'run-1',
    durationMs: 12.345,
    prompt: 'must not be recorded',
  });

  const line = fs.readFileSync(service.runPath, 'utf8').trim();
  assert.deepEqual(JSON.parse(line), {
    occurredAt: '2026-08-10T12:00:00.000Z',
    category: 'storage',
    operation: 'workspace.persist',
    correlationId: 'run-1',
    durationMs: 12.35,
    detail: null,
  });

  await service.recordMany([
    { category: 'render', operation: 'commit', durationMs: 2 },
    { category: 'browser', operation: 'long-task', durationMs: 51 },
  ]);
  assert.equal(fs.readFileSync(service.runPath, 'utf8').trim().split('\n').length, 3);
});
