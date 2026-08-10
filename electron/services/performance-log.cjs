const fs = require('fs');
const path = require('path');

const LOG_PREFIX = 'omvra-performance-';
const LOG_LIMIT = 10;

function sanitizePerformanceEvent(value = {}) {
  const event = value && typeof value === 'object' ? value : {};
  return {
    occurredAt: typeof event.occurredAt === 'string' ? event.occurredAt : new Date().toISOString(),
    category: typeof event.category === 'string' ? event.category.slice(0, 40) : 'unknown',
    operation: typeof event.operation === 'string' ? event.operation.slice(0, 120) : 'unknown',
    correlationId: typeof event.correlationId === 'string' ? event.correlationId.slice(0, 80) : null,
    durationMs: Number.isFinite(event.durationMs) ? Math.max(0, Math.round(event.durationMs * 100) / 100) : null,
    detail: typeof event.detail === 'string' ? event.detail.slice(0, 120) : null,
  };
}

function createPerformanceLogService({ logsDirectory, shell, now = () => new Date() }) {
  const runStamp = now().toISOString().replace(/[:.]/g, '-');
  const runPath = path.join(logsDirectory, `${LOG_PREFIX}${runStamp}.jsonl`);
  let writeQueue = Promise.resolve();
  let initialized = false;

  function ensureDirectory() {
    fs.mkdirSync(logsDirectory, { recursive: true });
  }

  function initializeRun() {
    if (initialized) return;
    ensureDirectory();
    const entries = fs.readdirSync(logsDirectory)
      .filter(name => name.startsWith(LOG_PREFIX) && name.endsWith('.jsonl'))
      .map(name => ({ name, modifiedAt: fs.statSync(path.join(logsDirectory, name)).mtimeMs }))
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
    entries.slice(LOG_LIMIT - 1).forEach(entry => fs.unlinkSync(path.join(logsDirectory, entry.name)));
    initialized = true;
  }

  function record(event) {
    return recordMany([event]);
  }

  function recordMany(events) {
    initializeRun();
    const lines = (Array.isArray(events) ? events : [])
      .map(event => JSON.stringify(sanitizePerformanceEvent({ occurredAt: now().toISOString(), ...event })))
      .join('\n');
    if (!lines) return Promise.resolve({ ok: true, path: runPath });
    writeQueue = writeQueue.then(() => fs.promises.appendFile(runPath, `${lines}\n`, 'utf8'));
    return writeQueue.then(() => ({ ok: true, path: runPath }));
  }

  async function openFolder() {
    ensureDirectory();
    const error = await shell.openPath(logsDirectory);
    return error ? { ok: false, error } : { ok: true };
  }

  async function clear() {
    await writeQueue;
    ensureDirectory();
    fs.readdirSync(logsDirectory)
      .filter(name => name.startsWith(LOG_PREFIX) && name.endsWith('.jsonl'))
      .forEach(name => fs.unlinkSync(path.join(logsDirectory, name)));
    initialized = false;
    return { ok: true };
  }

  return { clear, openFolder, record, recordMany, runPath };
}

module.exports = { createPerformanceLogService, sanitizePerformanceEvent };
