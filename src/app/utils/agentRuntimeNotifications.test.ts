import test from 'node:test';
import assert from 'node:assert/strict';
import { findNewCompletedTaskRuns } from './agentRuntimeNotifications.ts';

test('returns each new successful task completion once', () => {
  const seen = new Set(['old-completion']);
  const bindings = [{ id: 'task-binding', scope: { kind: 'task', taskId: 'task-1' } }];
  const events = [
    { id: 'old-completion', bindingId: 'task-binding', nativeEventType: 'turn/completed', state: 'completed' },
    { id: 'new-completion', bindingId: 'task-binding', nativeEventType: 'turn/completed', state: 'completed' },
  ];

  assert.deepEqual(findNewCompletedTaskRuns(events, bindings, seen), [{ eventId: 'new-completion', taskId: 'task-1' }]);
  assert.deepEqual(findNewCompletedTaskRuns(events, bindings, seen), []);
});

test('ignores failed, interrupted, and non-task turns', () => {
  const seen = new Set<string>();
  const bindings = [
    { id: 'task-binding', scope: { kind: 'task', taskId: 'task-1' } },
    { id: 'goal-binding', scope: { kind: 'goal-node' } },
  ];
  const events = [
    { id: 'failed', bindingId: 'task-binding', nativeEventType: 'turn/completed', state: 'failed' },
    { id: 'interrupted', bindingId: 'task-binding', nativeEventType: 'turn/completed', state: 'interrupted' },
    { id: 'goal', bindingId: 'goal-binding', nativeEventType: 'turn/completed', state: 'completed' },
  ];

  assert.deepEqual(findNewCompletedTaskRuns(events, bindings, seen), []);
  assert.deepEqual([...seen], ['failed', 'interrupted', 'goal']);
});
