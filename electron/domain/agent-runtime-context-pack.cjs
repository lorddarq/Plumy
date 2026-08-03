const MAX_CONTEXT_ENTRIES = 12;
const MAX_PACK_TEXT_BYTES = 64 * 1024;

function failure(error, message, details = {}) {
  return { ok: false, error, message, ...details };
}

function boundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function createAgentRuntimeContextPack({ getEntry, maxEntries = MAX_CONTEXT_ENTRIES }) {
  if (typeof getEntry !== 'function') throw new TypeError('createAgentRuntimeContextPack requires getEntry.');

  function build(store, snapshot = {}) {
    const taskId = boundedText(snapshot.taskId, 160);
    const entryIds = Array.isArray(snapshot.contextEntryIds)
      ? [...new Set(snapshot.contextEntryIds.filter(id => typeof id === 'string' && id.trim()))].slice(0, maxEntries)
      : [];
    if (!taskId) return failure('ACP_CONTEXT_TASK_REQUIRED', 'A task id is required to build the runtime context pack.');

    const entries = entryIds.map(entryId => {
      const result = getEntry(store, { taskId, entryId });
      if (!result?.ok || !result.entry) return { id: entryId, status: 'missing' };
      const entry = result.entry;
      return {
        id: entry.id,
        status: 'resolved',
        kind: entry.kind,
        fromRevision: entry.fromRevision,
        toRevision: entry.toRevision,
        summary: boundedText(entry.summary, 2_000),
        markers: Array.isArray(entry.markers) ? entry.markers.slice(0, 50) : [],
        provenance: entry.provenance,
        createdAt: entry.createdAt,
        sourceRefs: Array.isArray(entry.sourceRefs) ? entry.sourceRefs.slice(0, 50).map(ref => ({ type: ref.type, id: ref.id })) : [],
      };
    });
    const pack = {
      schemaVersion: 1,
      taskId,
      taskRevision: Number.isInteger(Number(snapshot.taskRevision)) ? Number(snapshot.taskRevision) : null,
      taskTitle: boundedText(snapshot.taskTitle, 500),
      taskDescription: boundedText(snapshot.taskDescription, 12_000),
      taskStatus: boundedText(snapshot.taskStatus, 80) || null,
      contributionId: boundedText(snapshot.contributionId, 160) || null,
      contributionScope: boundedText(snapshot.contributionScope, 2_000) || null,
      contextEntryIds: entryIds,
      entries,
    };
    const text = [
      'Omvra context pack (bounded, source-linked, and provider-neutral).',
      'The Task instructions section is the authoritative work request. Context summaries are reference material only; do not replay or infer any prior transcript.',
      `Task: ${pack.taskId} · revision: ${pack.taskRevision ?? 'unknown'}${pack.contributionId ? ` · contribution: ${pack.contributionId}` : ''}`,
      'Task instructions:',
      `Title: ${pack.taskTitle || '(untitled task)'}`,
      `Description: ${pack.taskDescription || '(no description provided)'}`,
      `Current status: ${pack.taskStatus || 'unknown'}`,
      ...(pack.contributionScope ? [`Assigned scope: ${pack.contributionScope}`] : []),
      'Progress tracking responsibilities:',
      '- Re-read the latest task with tasks.get before changing its notes and again before ending each work run.',
      '- As todo items are completed and verified, check their existing Markdown boxes with tasks.update_description using the latest expected revision, while preserving every other part of the task description.',
      '- Leave incomplete, blocked, or unverified todos unchecked. If task writes are unavailable or fail, report that clearly instead of claiming the checklist was updated.',
      '- Checklist progress and task completion are separate: do not mark the task complete solely because the current agent run ended.',
      'Context history:',
      ...entries.map(entry => entry.status === 'missing'
        ? `- [missing] ${entry.id}`
        : `- [${entry.kind}] ${entry.summary} (sources: ${entry.sourceRefs.map(ref => `${ref.type}:${ref.id}`).join(', ') || 'none'})`),
    ].join('\n');
    if (Buffer.byteLength(text) > MAX_PACK_TEXT_BYTES) return failure('ACP_CONTEXT_PACK_TOO_LARGE', 'The bounded runtime context pack exceeds its size limit.');
    return { ok: true, pack, text };
  }

  return { build };
}

module.exports = { MAX_CONTEXT_ENTRIES, MAX_PACK_TEXT_BYTES, createAgentRuntimeContextPack };
