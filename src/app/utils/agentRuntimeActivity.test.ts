import assert from 'node:assert/strict';
import test from 'node:test';
import { agentRuntimeTurnState, describeAgentRuntimeSession, hasAgentRuntimeTaskStarted, isAgentRuntimeTurnInFlight, joinAgentMessageDeltas, summarizeAgentRuntimeActivity } from './agentRuntimeActivity.ts';

test('agent message delta joining preserves normal boundaries and repairs compact legacy chunks', () => {
  assert.equal(joinAgentMessageDeltas(['Current ', 'implementation ', 'passes.']), 'Current implementation passes.');
  assert.equal(joinAgentMessageDeltas(['Current', 'implementation', 'passes', '.']), 'Current implementation passes.');
});

test('runtime activity collapses noisy tool updates and preserves agent run milestones', () => {
  const events = [
    { id: '1', type: 'session-state', nativeEventType: 'thread/started', observedAt: '2026-08-02T12:00:00.000Z' },
    { id: '2', type: 'session-state', nativeEventType: 'mcpServer/startupStatus/updated', state: 'starting', observedAt: '2026-08-02T12:00:01.000Z' },
    { id: '3', type: 'session-state', nativeEventType: 'mcpServer/startupStatus/updated', state: 'starting', observedAt: '2026-08-02T12:00:02.000Z' },
    { id: '4', type: 'turn-state', nativeEventType: 'turn/started', observedAt: '2026-08-02T12:00:03.000Z' },
    { id: '5', type: 'turn-state', nativeEventType: 'turn/completed', observedAt: '2026-08-02T12:00:04.000Z' },
  ];
  const activity = summarizeAgentRuntimeActivity(events);
  assert.equal(activity.find(item => item.label === 'Tool connection starting')?.count, 2);
  assert.equal(activity.some(item => item.label === 'Task instructions accepted'), true);
  assert.equal(activity.some(item => item.label === 'Agent finished the latest run'), true);
  assert.equal(describeAgentRuntimeSession('ready', events).label, 'Batch finished');
  assert.equal(describeAgentRuntimeSession('ready', events).isTurnActive, false);
});

test('runtime session summary trusts active binding state when the bounded event window is stale', () => {
  const working = describeAgentRuntimeSession('active', [
    { id: '1', type: 'turn-state', nativeEventType: 'turn/completed', observedAt: '2026-08-02T12:00:00.000Z' },
  ]);
  assert.equal(working.label, 'Agent is working');
  assert.equal(working.isTurnActive, true);
});

test('runtime session summary distinguishes connected idle and stopping states', () => {
  const idle = describeAgentRuntimeSession('ready', []);
  assert.equal(idle.label, 'Session connected, no run active');
  assert.match(idle.detail, /continue work/i);

  const stopping = describeAgentRuntimeSession('cancelling', []);
  assert.equal(stopping.label, 'Agent is stopping');
  assert.equal(stopping.isTurnActive, false);
});

test('a ready provider session reports work only from its canonical turn projection', () => {
  const idle = { state: 'ready', turn: { id: 'turn-1', state: 'completed' } };
  const working = { state: 'ready', turn: { id: 'turn-2', state: 'active' } };
  assert.equal(isAgentRuntimeTurnInFlight(idle), false);
  assert.equal(isAgentRuntimeTurnInFlight(working), true);
  assert.equal(agentRuntimeTurnState(working), 'active');
  assert.equal(describeAgentRuntimeSession('ready', [], undefined, agentRuntimeTurnState(working)).label, 'Agent is working');
});

test('an active turn proves task instructions were accepted before events arrive', () => {
  assert.equal(hasAgentRuntimeTaskStarted('active', []), true);
  assert.equal(hasAgentRuntimeTaskStarted('starting', []), false);
  assert.equal(hasAgentRuntimeTaskStarted(undefined, [{ id: 'event-1', type: 'turn-state', nativeEventType: 'turn/started' }]), true);
});

test('terminal provider sessions ignore stale in-flight turn projections', () => {
  for (const state of ['interrupted', 'closed', 'failed']) {
    const binding = { state, turn: { id: 'stale-turn', state: 'waiting-input' } };
    assert.equal(agentRuntimeTurnState(binding), undefined);
    assert.equal(isAgentRuntimeTurnInFlight(binding), false);
  }
});

test('runtime activity identifies tool connections when the provider reports their names', () => {
  const activity = summarizeAgentRuntimeActivity([
    { id: '1', type: 'session-state', nativeEventType: 'mcpServer/startupStatus/updated', state: 'failed', outcome: 'reauthenticationRequired', toolName: 'figma', observedAt: '2026-08-02T12:00:00.000Z' },
  ]);
  assert.equal(activity[0].label, 'Tool connection failed: figma');
  assert.equal(activity[0].detail, 'Authentication is required before this connection can start.');
});

test('runtime activity exposes bounded reasoning progress and actionable errors', () => {
  const activity = summarizeAgentRuntimeActivity([
    { id: '1', type: 'tool-state', nativeEventType: 'item/started', toolName: 'reasoning' },
    { id: '2', type: 'session-state', nativeEventType: 'error', outcome: 'Task tool failed.' },
  ]);
  assert.equal(activity[0].label, 'Thinking through the task');
  assert.equal(activity[1].label, 'Agent encountered an error');
  assert.equal(activity[1].detail, 'Task tool failed.');
});

test('runtime activity distinguishes interrupted and failed turn outcomes', () => {
  const activity = summarizeAgentRuntimeActivity([
    { id: '1', type: 'turn-state', nativeEventType: 'turn/completed', state: 'interrupted' },
    { id: '2', type: 'turn-state', nativeEventType: 'turn/completed', state: 'failed', outcome: 'Command failed.' },
  ]);
  assert.equal(activity[0].label, 'Agent work was interrupted');
  assert.equal(activity[1].label, 'Agent run failed');
  assert.equal(activity[1].detail, 'Command failed.');
});

test('closed sessions and finished batches explain that more work may remain', () => {
  assert.equal(describeAgentRuntimeSession('closed', []).label, 'No agent is working');
  assert.match(describeAgentRuntimeSession('closed', []).detail, /closed session/i);
  assert.equal(describeAgentRuntimeSession('ready', [{ id: '1', type: 'turn-state', nativeEventType: 'turn/completed' }]).label, 'Batch finished');
});
