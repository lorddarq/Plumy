import assert from 'node:assert/strict';
import test from 'node:test';
import { getAttentionState } from './attention.ts';

test('attention states always explain the state and next step', () => {
  for (const kind of ['blocked', 'review', 'active', 'failed', 'needs-input', 'overdue', 'ready', 'complete'] as const) {
    const state = getAttentionState(kind);
    assert.equal(state.kind, kind);
    assert.ok(state.label.length > 0);
    assert.ok(state.description.length > 0);
    assert.ok(state.nextStep.length > 0);
    assert.ok(state.symbol.length > 0);
  }
});
