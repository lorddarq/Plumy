import assert from 'node:assert/strict';
import test from 'node:test';
import { describeAgentRuntimeSession, summarizeAgentRuntimeActivity } from './agentRuntimeActivity.ts';

test('runtime activity collapses noisy MCP updates and preserves Codex turn milestones', () => {
  const events = [
    { id: '1', type: 'session-state', nativeEventType: 'thread/started', observedAt: '2026-08-02T12:00:00.000Z' },
    { id: '2', type: 'session-state', nativeEventType: 'mcpServer/startupStatus/updated', state: 'starting', observedAt: '2026-08-02T12:00:01.000Z' },
    { id: '3', type: 'session-state', nativeEventType: 'mcpServer/startupStatus/updated', state: 'starting', observedAt: '2026-08-02T12:00:02.000Z' },
    { id: '4', type: 'turn-state', nativeEventType: 'turn/started', observedAt: '2026-08-02T12:00:03.000Z' },
    { id: '5', type: 'turn-state', nativeEventType: 'turn/completed', observedAt: '2026-08-02T12:00:04.000Z' },
  ];
  const activity = summarizeAgentRuntimeActivity(events);
  assert.equal(activity.find(item => item.label === 'MCP connection starting')?.count, 2);
  assert.equal(activity.some(item => item.label === 'Task instructions accepted'), true);
  assert.equal(activity.some(item => item.label === 'Codex finished the latest turn'), true);
  assert.equal(describeAgentRuntimeSession('ready', events).label, 'Agent is idle');
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
  assert.equal(idle.label, 'Agent is idle');
  assert.match(idle.detail, /no run is active/i);

  const stopping = describeAgentRuntimeSession('cancelling', []);
  assert.equal(stopping.label, 'Agent is stopping');
  assert.equal(stopping.isTurnActive, false);
});

test('runtime activity identifies MCP connections when the provider reports their names', () => {
  const activity = summarizeAgentRuntimeActivity([
    { id: '1', type: 'session-state', nativeEventType: 'mcpServer/startupStatus/updated', state: 'failed', outcome: 'reauthenticationRequired', toolName: 'figma', observedAt: '2026-08-02T12:00:00.000Z' },
  ]);
  assert.equal(activity[0].label, 'MCP connection failed: figma');
  assert.equal(activity[0].detail, 'Authentication is required before this connection can start.');
});

test('runtime activity exposes bounded reasoning progress and actionable errors', () => {
  const activity = summarizeAgentRuntimeActivity([
    { id: '1', type: 'tool-state', nativeEventType: 'item/started', toolName: 'reasoning' },
    { id: '2', type: 'session-state', nativeEventType: 'error', outcome: 'Task tool failed.' },
  ]);
  assert.equal(activity[0].label, 'Thinking through the task');
  assert.equal(activity[1].label, 'Codex encountered an error');
  assert.equal(activity[1].detail, 'Task tool failed.');
});

test('runtime activity distinguishes interrupted and failed turn outcomes', () => {
  const activity = summarizeAgentRuntimeActivity([
    { id: '1', type: 'turn-state', nativeEventType: 'turn/completed', state: 'interrupted' },
    { id: '2', type: 'turn-state', nativeEventType: 'turn/completed', state: 'failed', outcome: 'Command failed.' },
  ]);
  assert.equal(activity[0].label, 'Codex work was interrupted');
  assert.equal(activity[1].label, 'Codex turn failed');
  assert.equal(activity[1].detail, 'Command failed.');
});
