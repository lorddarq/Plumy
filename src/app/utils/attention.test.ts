import assert from 'node:assert/strict';
import test from 'node:test';
import { getAttentionState, getExecutionAttentionState, getSessionAttentionState } from './attention.ts';

test('attention states always explain the state and next step', () => {
  for (const kind of ['blocked', 'review', 'active', 'failed', 'needs-input', 'overdue', 'ready', 'complete', 'batch-finished', 'outcome-review', 'interrupted', 'closed', 'starting', 'stopping'] as const) {
    const state = getAttentionState(kind);
    assert.equal(state.kind, kind);
    assert.ok(state.label.length > 0);
    assert.ok(state.description.length > 0);
    assert.ok(state.nextStep.length > 0);
    assert.ok(state.symbol.length > 0);
  }
});

test('execution states use one shared attention mapping', () => {
  assert.equal(getExecutionAttentionState('working')?.kind, 'active');
  assert.equal(getExecutionAttentionState('handoff-pending')?.kind, 'review');
  assert.equal(getExecutionAttentionState('outcome-unreconciled')?.kind, 'outcome-review');
  assert.equal(getExecutionAttentionState('batch-finished')?.kind, 'batch-finished');
  assert.equal(getExecutionAttentionState('interrupted')?.kind, 'interrupted');
  assert.equal(getExecutionAttentionState('permission-denied')?.kind, 'blocked');
  assert.equal(getExecutionAttentionState('unknown-state'), undefined);
});

test('session attention prioritizes task outcome over provider session metadata', () => {
  assert.equal(getSessionAttentionState({ bindingState: 'ready', executionState: 'outcome-unreconciled', taskStatus: 'in-progress' })?.kind, 'outcome-review');
  assert.equal(getSessionAttentionState({ bindingState: 'active', taskStatus: 'under-review' })?.kind, 'review');
  assert.equal(getSessionAttentionState({ bindingState: 'closed', taskStatus: 'in-progress' })?.kind, 'closed');
  assert.equal(getSessionAttentionState({ bindingState: 'active', taskStatus: 'done' })?.kind, 'complete');
  assert.equal(getSessionAttentionState({ bindingState: 'ready', turnState: 'active', taskStatus: 'in-progress' })?.kind, 'active');
  assert.equal(getSessionAttentionState({ bindingState: 'ready', turnState: 'waiting-input', taskStatus: 'in-progress' })?.kind, 'needs-input');
});
