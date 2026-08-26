const { randomUUID } = require('crypto');
const { isDeepStrictEqual } = require('util');

const TASK_CONTEXT_ENTRIES_KEY = 'omvra.taskContextEntries.v1';
const TASK_CONTEXT_SCHEMA_VERSION = 1;
const TASK_CONTEXT_KINDS = new Set([
  'requirement-change',
  'decision',
  'implementation-attempt',
  'blocker',
  'review-feedback',
  'handoff',
  'evidence',
  'status-change',
  'context-checkpoint',
]);
const TASK_CONTEXT_PROVENANCE = new Set(['system-derived', 'human-authored', 'agent-authored']);
const TASK_CONTEXT_SOURCE_TYPES = new Set(['comment', 'activity', 'attachment', 'evidence', 'task-change']);
const FORBIDDEN_KEYS = new Set([
  'body',
  'chainOfThought',
  'currentTask',
  'hiddenReasoning',
  'messages',
  'prompt',
  'rawPrompt',
  'response',
  'snapshot',
  'sourceBody',
  'sourceContent',
  'task',
  'taskSnapshot',
  'toolPayload',
  'toolResponse',
  'transcript',
]);
const AGENT_FORBIDDEN_AUTHORITY_KEYS = new Set([
  'accepted',
  'acceptedBy',
  'approved',
  'approvedBy',
  'completed',
  'completedBy',
  'humanConfirmed',
]);
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_LIST_ITEMS = 50;
const MAX_MARKER_LENGTH = 80;
const MAX_FIELD_LENGTH = 160;
const MAX_SOURCE_ID_LENGTH = 512;
const MAX_ACTOR_LENGTH = 240;
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;

function createTaskContextLedgerService({
  getTaskById,
  readEntries,
  writeEntries,
  normalizeString,
  resolveSourceRef = () => null,
  now = () => new Date().toISOString(),
  createId = () => `task-context-${randomUUID()}`,
}) {
  const required = { getTaskById, readEntries, writeEntries, normalizeString, resolveSourceRef, now, createId };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== 'function') throw new TypeError(`createTaskContextLedgerService requires ${name}.`);
  }

  function failure(error, message, details = {}) {
    return { ok: false, error, message, ...details };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function findForbiddenKey(value, path = 'entry') {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const found = findForbiddenKey(value[index], `${path}[${index}]`);
        if (found) return found;
      }
      return null;
    }
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
      const found = findForbiddenKey(child, `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }

  function findAgentAuthorityKey(value, path = 'entry') {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const found = findAgentAuthorityKey(value[index], `${path}[${index}]`);
        if (found) return found;
      }
      return null;
    }
    for (const [key, child] of Object.entries(value)) {
      if (AGENT_FORBIDDEN_AUTHORITY_KEYS.has(key)) return `${path}.${key}`;
      const found = findAgentAuthorityKey(child, `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }

  function normalizeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && Math.floor(number) === number ? number : null;
  }

  function normalizeStringList(value, { field, maxLength, lowerCase = false, optional = false }) {
    if (value === undefined && optional) return { ok: true, value: undefined };
    if (!Array.isArray(value)) return failure('INVALID_TASK_CONTEXT_ENTRY', `${field} must be an array.`);
    if (value.length > MAX_LIST_ITEMS) return failure('TASK_CONTEXT_LIMIT_EXCEEDED', `${field} cannot exceed ${MAX_LIST_ITEMS} entries.`);
    const seen = new Set();
    const items = [];
    for (const raw of value) {
      let item = normalizeString(raw);
      if (!item) return failure('INVALID_TASK_CONTEXT_ENTRY', `${field} cannot contain empty values.`);
      if (lowerCase) item = item.toLowerCase();
      if (item.length > maxLength) return failure('TASK_CONTEXT_LIMIT_EXCEEDED', `${field} values cannot exceed ${maxLength} characters.`);
      if (seen.has(item)) continue;
      seen.add(item);
      items.push(item);
    }
    return { ok: true, value: items };
  }

  function normalizeSourceRefs(value) {
    if (!Array.isArray(value) || value.length === 0) {
      return failure('TASK_CONTEXT_SOURCE_REQUIRED', 'sourceRefs must contain at least one source reference.');
    }
    if (value.length > MAX_LIST_ITEMS) {
      return failure('TASK_CONTEXT_LIMIT_EXCEEDED', `sourceRefs cannot exceed ${MAX_LIST_ITEMS} entries.`);
    }
    const seen = new Set();
    const refs = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return failure('INVALID_TASK_CONTEXT_SOURCE', 'Every source reference must be an object.');
      }
      const type = normalizeString(raw.type);
      const id = normalizeString(raw.id);
      if (!TASK_CONTEXT_SOURCE_TYPES.has(type)) {
        return failure('INVALID_TASK_CONTEXT_SOURCE', `Unsupported task context source type "${type}".`);
      }
      if (!id || id.length > MAX_SOURCE_ID_LENGTH) {
        return failure('INVALID_TASK_CONTEXT_SOURCE', `Source reference ids must contain 1-${MAX_SOURCE_ID_LENGTH} characters.`);
      }
      const key = `${type}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ ...raw, type, id });
    }
    return { ok: true, value: refs };
  }

  function normalizeEntry(value, { requireIdempotencyKey = false } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return failure('INVALID_TASK_CONTEXT_ENTRY', 'Task context entry must be an object.');
    }
    const forbiddenPath = findForbiddenKey(value);
    if (forbiddenPath) {
      return failure('TASK_CONTEXT_SENSITIVE_DATA_FORBIDDEN', `${forbiddenPath} cannot be stored in task context.`);
    }
    if (Number(value.schemaVersion) !== TASK_CONTEXT_SCHEMA_VERSION) {
      return failure('UNSUPPORTED_TASK_CONTEXT_VERSION', `schemaVersion must be ${TASK_CONTEXT_SCHEMA_VERSION}.`);
    }

    const id = normalizeString(value.id);
    const taskId = normalizeString(value.taskId);
    const kind = normalizeString(value.kind);
    const summary = normalizeString(value.summary);
    const provenance = normalizeString(value.provenance);
    const actor = normalizeString(value.actor);
    const createdAt = normalizeString(value.createdAt);
    const fromRevision = normalizeInteger(value.fromRevision);
    const toRevision = normalizeInteger(value.toRevision);
    const idempotencyKey = normalizeString(value.idempotencyKey);
    if (!id || !taskId) return failure('INVALID_TASK_CONTEXT_ENTRY', 'Task context entries require stable id and taskId values.');
    if (!TASK_CONTEXT_KINDS.has(kind)) return failure('INVALID_TASK_CONTEXT_KIND', `Unsupported task context kind "${kind}".`);
    if (fromRevision === null || toRevision === null || fromRevision > toRevision) {
      return failure('INVALID_TASK_CONTEXT_REVISION_RANGE', 'fromRevision and toRevision must be non-negative integers in ascending order.');
    }
    if (!summary || summary.length > MAX_SUMMARY_LENGTH) {
      return failure('INVALID_TASK_CONTEXT_SUMMARY', `summary must contain 1-${MAX_SUMMARY_LENGTH} characters.`);
    }
    if (!TASK_CONTEXT_PROVENANCE.has(provenance)) {
      return failure('INVALID_TASK_CONTEXT_PROVENANCE', `Unsupported task context provenance "${provenance}".`);
    }
    const authorityPath = provenance === 'agent-authored' ? findAgentAuthorityKey(value) : null;
    if (authorityPath) {
      return failure('TASK_CONTEXT_AGENT_AUTHORITY_FORBIDDEN', `${authorityPath} cannot represent human approval, acceptance, or completion.`);
    }
    if (!actor || actor.length > MAX_ACTOR_LENGTH) {
      return failure('INVALID_TASK_CONTEXT_ACTOR', `actor must contain 1-${MAX_ACTOR_LENGTH} characters.`);
    }
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
      return failure('INVALID_TASK_CONTEXT_TIMESTAMP', 'createdAt must be a valid timestamp.');
    }
    if ((requireIdempotencyKey || value.idempotencyKey !== undefined)
      && (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH)) {
      return failure('INVALID_TASK_CONTEXT_IDEMPOTENCY_KEY', `idempotencyKey must contain 1-${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`);
    }

    const markers = normalizeStringList(value.markers, {
      field: 'markers',
      maxLength: MAX_MARKER_LENGTH,
      lowerCase: true,
    });
    if (!markers.ok) return markers;
    const changedFields = normalizeStringList(value.changedFields, {
      field: 'changedFields',
      maxLength: MAX_FIELD_LENGTH,
      optional: true,
    });
    if (!changedFields.ok) return changedFields;
    const sourceRefs = normalizeSourceRefs(value.sourceRefs);
    if (!sourceRefs.ok) return sourceRefs;

    return {
      ok: true,
      entry: {
        ...value,
        schemaVersion: TASK_CONTEXT_SCHEMA_VERSION,
        id,
        taskId,
        kind,
        fromRevision,
        toRevision,
        summary,
        markers: markers.value,
        changedFields: changedFields.value,
        provenance,
        actor,
        sourceRefs: sourceRefs.value,
        createdAt,
        idempotencyKey: idempotencyKey || undefined,
      },
    };
  }

  function readValidatedEntries(store) {
    const storedValue = readEntries(store);
    const rawEntries = storedValue === undefined || storedValue === null ? [] : storedValue;
    if (!Array.isArray(rawEntries)) {
      return failure('INVALID_TASK_CONTEXT_STORE', 'Task context storage must be an array.');
    }
    const entries = [];
    const ids = new Set();
    const idempotencyKeys = new Set();
    for (let index = 0; index < rawEntries.length; index += 1) {
      const normalized = normalizeEntry(rawEntries[index]);
      if (!normalized.ok) return { ...normalized, entryIndex: index };
      if (ids.has(normalized.entry.id)) {
        return failure('DUPLICATE_TASK_CONTEXT_ENTRY_ID', `Duplicate task context entry id "${normalized.entry.id}".`, { entryIndex: index });
      }
      ids.add(normalized.entry.id);
      if (normalized.entry.idempotencyKey) {
        const scopedKey = `${normalized.entry.taskId}:${normalized.entry.idempotencyKey}`;
        if (idempotencyKeys.has(scopedKey)) {
          return failure('DUPLICATE_TASK_CONTEXT_IDEMPOTENCY_KEY', 'Duplicate task-scoped idempotency key.', { entryIndex: index });
        }
        idempotencyKeys.add(scopedKey);
      }
      entries.push(normalized.entry);
    }
    return { ok: true, entries, rawEntries };
  }

  function indexEntriesByTaskId(entries) {
    const index = new Map();
    for (const entry of entries) {
      const taskEntries = index.get(entry.taskId) || [];
      taskEntries.push(entry);
      index.set(entry.taskId, taskEntries);
    }
    return index;
  }

  function list(store, options = {}) {
    const taskId = normalizeString(options.taskId);
    if (!taskId) return failure('TASK_ID_REQUIRED', 'taskId is required.');
    const task = getTaskById(store, taskId);
    if (!task) return failure('TASK_NOT_FOUND', `Task "${taskId}" not found.`);
    const stored = readValidatedEntries(store);
    if (!stored.ok) return stored;
    const kinds = new Set(Array.isArray(options.kinds) ? options.kinds.map(normalizeString).filter(Boolean) : []);
    const markers = new Set(Array.isArray(options.markers) ? options.markers.map(value => normalizeString(value).toLowerCase()).filter(Boolean) : []);
    const search = normalizeString(options.search).toLowerCase();
    const fromRevision = options.fromRevision === undefined ? null : normalizeInteger(options.fromRevision);
    const toRevision = options.toRevision === undefined ? null : normalizeInteger(options.toRevision);
    if (options.fromRevision !== undefined && fromRevision === null) return failure('INVALID_TASK_CONTEXT_REVISION_RANGE', 'fromRevision must be a non-negative integer.');
    if (options.toRevision !== undefined && toRevision === null) return failure('INVALID_TASK_CONTEXT_REVISION_RANGE', 'toRevision must be a non-negative integer.');
    const limit = Number.isFinite(Number(options.limit))
      ? Math.max(1, Math.min(MAX_LIST_ITEMS, Math.floor(Number(options.limit))))
      : 12;
    const taskEntries = indexEntriesByTaskId(stored.entries).get(taskId) || [];
    const filtered = taskEntries.filter(entry => {
      if (kinds.size && !kinds.has(entry.kind)) return false;
      if (markers.size && !entry.markers.some(marker => markers.has(marker))) return false;
      if (search && !entry.summary.toLowerCase().includes(search)) return false;
      if (fromRevision !== null && entry.toRevision < fromRevision) return false;
      if (toRevision !== null && entry.fromRevision > toRevision) return false;
      return true;
    });
    return {
      ok: true,
      taskId,
      entries: filtered.slice(-limit).map(toIndexEntry),
      hasMore: filtered.length > limit,
    };
  }

  function get(store, { taskId, entryId } = {}) {
    const normalizedTaskId = normalizeString(taskId);
    const normalizedEntryId = normalizeString(entryId);
    if (!normalizedTaskId) return failure('TASK_ID_REQUIRED', 'taskId is required.');
    if (!normalizedEntryId) return failure('TASK_CONTEXT_ENTRY_ID_REQUIRED', 'entryId is required.');
    const task = getTaskById(store, normalizedTaskId);
    if (!task) return failure('TASK_NOT_FOUND', `Task "${normalizedTaskId}" not found.`);
    const stored = readValidatedEntries(store);
    if (!stored.ok) return stored;
    const entry = (indexEntriesByTaskId(stored.entries).get(normalizedTaskId) || [])
      .find(item => item.id === normalizedEntryId);
    return entry
      ? {
          ok: true,
          entry: clone(entry),
          sources: entry.sourceRefs.map(ref => {
            const resolved = resolveSourceRef(store, task, ref);
            return resolved
              ? { ref: clone(ref), status: 'resolved', record: clone(resolved) }
              : { ref: clone(ref), status: 'missing' };
          }),
        }
      : failure('TASK_CONTEXT_ENTRY_NOT_FOUND', `Task context entry "${normalizedEntryId}" not found.`);
  }

  function toIndexEntry(entry) {
    return {
      id: entry.id,
      kind: entry.kind,
      fromRevision: entry.fromRevision,
      toRevision: entry.toRevision,
      summary: entry.summary,
      markers: clone(entry.markers),
      provenance: entry.provenance,
      createdAt: entry.createdAt,
    };
  }

  function project(store, { taskId, limit = 12 } = {}) {
    const normalizedTaskId = normalizeString(taskId);
    if (!normalizedTaskId) return failure('TASK_ID_REQUIRED', 'taskId is required.');
    if (!getTaskById(store, normalizedTaskId)) return failure('TASK_NOT_FOUND', `Task "${normalizedTaskId}" not found.`);
    const stored = readValidatedEntries(store);
    if (!stored.ok) return stored;

    const taskEntries = indexEntriesByTaskId(stored.entries).get(normalizedTaskId) || [];
    const boundedLimit = Math.max(1, Math.min(12, Math.floor(Number(limit)) || 12));
    const checkpointIndex = taskEntries.findLastIndex(entry => entry.kind === 'context-checkpoint');
    const checkpoint = checkpointIndex >= 0 ? taskEntries[checkpointIndex] : null;
    const later = checkpoint ? taskEntries.slice(checkpointIndex + 1) : taskEntries;
    const selectedLater = later.slice(-(boundedLimit - (checkpoint ? 1 : 0)));
    const remaining = boundedLimit - selectedLater.length - (checkpoint ? 1 : 0);
    const earlier = checkpoint ? taskEntries.slice(0, checkpointIndex) : [];
    const selectedEarlier = remaining > 0 ? earlier.slice(-remaining) : [];
    const includedCount = selectedLater.length + selectedEarlier.length + (checkpoint ? 1 : 0);

    return {
      ok: true,
      taskContext: {
        latestCheckpoint: checkpoint ? toIndexEntry(checkpoint) : null,
        entriesSinceCheckpoint: selectedLater.map(toIndexEntry),
        recentHistory: selectedEarlier.map(toIndexEntry),
        hasMore: taskEntries.length > includedCount,
      },
    };
  }

  function comparable(entry) {
    const value = clone(entry);
    delete value.id;
    delete value.createdAt;
    delete value.idempotencyKey;
    return value;
  }

  function append(store, options = {}) {
    const taskId = normalizeString(options.taskId);
    const idempotencyKey = normalizeString(options.idempotencyKey);
    if (!taskId) return failure('TASK_ID_REQUIRED', 'taskId is required.');
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return failure('INVALID_TASK_CONTEXT_IDEMPOTENCY_KEY', `idempotencyKey must contain 1-${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`);
    }
    const task = getTaskById(store, taskId);
    if (!task) return failure('TASK_NOT_FOUND', `Task "${taskId}" not found.`);
    const stored = readValidatedEntries(store);
    if (!stored.ok) return stored;
    const taskEntries = indexEntriesByTaskId(stored.entries).get(taskId) || [];
    const existing = taskEntries.find(entry => entry.idempotencyKey === idempotencyKey);
    const currentRevision = normalizeInteger(task.__mcpRevision) ?? 0;
    const firstCheckpoint = normalizeString(options.kind) === 'context-checkpoint'
      && (taskEntries.length === 0 || taskEntries[0]?.id === existing?.id);
    const fromRevision = options.fromRevision === undefined && firstCheckpoint
      ? (existing?.fromRevision ?? currentRevision)
      : options.fromRevision;
    const toRevision = options.toRevision === undefined && firstCheckpoint
      ? (existing?.toRevision ?? currentRevision)
      : options.toRevision;
    const extension = { ...options };
    delete extension.expectedRevision;
    delete extension.idempotencyKey;
    delete extension.id;
    delete extension.createdAt;
    const candidate = normalizeEntry({
      ...extension,
      schemaVersion: TASK_CONTEXT_SCHEMA_VERSION,
      id: existing?.id || createId(),
      taskId,
      fromRevision,
      toRevision,
      createdAt: existing?.createdAt || now(),
      idempotencyKey,
    }, { requireIdempotencyKey: true });
    if (!candidate.ok) return candidate;

    if (existing) {
      if (!isDeepStrictEqual(comparable(existing), comparable(candidate.entry))) {
        return failure('IDEMPOTENCY_CONFLICT', 'idempotencyKey was already used for a different task context entry.');
      }
      return { ok: true, idempotent: true, entry: clone(existing), currentRevision };
    }

    const expectedRevision = normalizeInteger(options.expectedRevision);
    if (expectedRevision === null) {
      return failure('EXPECTED_REVISION_REQUIRED', 'expectedRevision is required and must be a non-negative integer.', { currentRevision });
    }
    if (expectedRevision !== currentRevision) {
      return failure('REVISION_MISMATCH', 'Task revision mismatch.', { currentRevision, expectedRevision });
    }
    if (candidate.entry.toRevision > currentRevision) {
      return failure('INVALID_TASK_CONTEXT_REVISION_RANGE', 'Task context cannot reference a future task revision.', { currentRevision });
    }
    if (firstCheckpoint && (candidate.entry.fromRevision !== currentRevision || candidate.entry.toRevision !== currentRevision)) {
      return failure('INVALID_BASELINE_REVISION', 'The first context checkpoint can cover only the current known task revision.', { currentRevision });
    }

    const persisted = clone(candidate.entry);
    writeEntries(store, stored.rawEntries.concat(persisted));
    return { ok: true, idempotent: false, entry: clone(persisted), currentRevision };
  }

  return { append, get, indexEntriesByTaskId, list, normalizeEntry, project };
}

module.exports = {
  TASK_CONTEXT_ENTRIES_KEY,
  TASK_CONTEXT_SCHEMA_VERSION,
  TASK_CONTEXT_KINDS,
  TASK_CONTEXT_PROVENANCE,
  TASK_CONTEXT_SOURCE_TYPES,
  createTaskContextLedgerService,
};
