const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentRuntimeContextPack } = require('./agent-runtime-context-pack.cjs');

test('builds a bounded provider-neutral pack without source bodies or transcripts', () => {
  const service = createAgentRuntimeContextPack({
    getEntry: (_store, { entryId }) => entryId === 'checkpoint-1'
      ? { ok: true, entry: { id: entryId, kind: 'context-checkpoint', fromRevision: 4, toRevision: 4, summary: 'Accepted checkpoint', markers: ['handoff'], provenance: 'human-authored', createdAt: '2026-08-02T00:00:00.000Z', sourceRefs: [{ type: 'comment', id: 'comment-1' }], body: 'must not leak' } }
      : { ok: false },
  });
  const result = service.build({}, { taskId: 'task-1', taskRevision: 4, taskTitle: 'Implement supervision', taskDescription: 'Show visible execution progress.', taskStatus: 'in-progress', contributionScope: 'Update the task execution panel.', contextEntryIds: ['checkpoint-1', 'older-1'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.pack.entries[0].sourceRefs, [{ type: 'comment', id: 'comment-1' }]);
  assert.equal(Object.hasOwn(result.pack.entries[0], 'body'), false);
  assert.match(result.text, /Accepted checkpoint/);
  assert.match(result.text, /Title: Implement supervision/);
  assert.match(result.text, /Description: Show visible execution progress\./);
  assert.match(result.text, /Assigned scope: Update the task execution panel\./);
  assert.match(result.text, /before ending each work run/i);
  assert.match(result.text, /tasks\.update_description/);
  assert.match(result.text, /Leave incomplete, blocked, or unverified todos unchecked/);
  assert.match(result.text, /Checklist progress and task completion are separate/);
  assert.match(result.text, /\[missing\] older-1/);
  assert.doesNotMatch(result.text, /must not leak/i);
});
