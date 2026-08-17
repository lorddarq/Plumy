import assert from 'node:assert/strict';
import test from 'node:test';
import type { GoalElement } from '../types.ts';
import { goalCanvasPanToCenterElement, isGoalElementConnected, isValidRetryTarget, wouldCreateGoalCycle } from './goalCanvas.ts';

const connector = (id: string, sourceId: string, targetId: string): GoalElement => ({
  id,
  type: 'connector',
  title: id,
  x: 0,
  y: 0,
  sourceId,
  targetId,
});

const graph: GoalElement[] = [
  { id: 'a', type: 'subgoal', title: 'A', x: 0, y: 0 },
  { id: 'b', type: 'subgoal', title: 'B', x: 0, y: 0 },
  { id: 'c', type: 'condition', title: 'C', x: 0, y: 0 },
  connector('a-b', 'a', 'b'),
  connector('b-c', 'b', 'c'),
];

test('goal canvas cycle guard rejects self links and directed cycles', () => {
  assert.equal(wouldCreateGoalCycle(graph, 'a', 'a'), true);
  assert.equal(wouldCreateGoalCycle(graph, 'c', 'a'), true);
  assert.equal(wouldCreateGoalCycle(graph, 'a', 'c'), false);
});

test('goal canvas cycle guard ignores the connector being rewired', () => {
  assert.equal(wouldCreateGoalCycle(graph, 'b', 'a', 'a-b'), false);
  assert.equal(wouldCreateGoalCycle(graph, 'c', 'a', 'b-c'), false);
});

test('goal canvas connected state is derived only from connector endpoints', () => {
  assert.equal(isGoalElementConnected(graph, 'a'), true);
  assert.equal(isGoalElementConnected(graph, 'c'), true);
  assert.equal(isGoalElementConnected(graph, 'missing'), false);
});

test('retry return edges are allowed only to an earlier node', () => {
  const retryGraph: GoalElement[] = [
    ...graph,
    { id: 'retry', type: 'retry', title: 'Retry', x: 0, y: 0 },
    connector('c-retry', 'c', 'retry'),
  ];
  assert.equal(isValidRetryTarget(retryGraph, 'retry', 'a'), true);
  assert.equal(isValidRetryTarget(retryGraph, 'retry', 'c'), true);
  assert.equal(isValidRetryTarget(retryGraph, 'retry', 'missing'), false);
});

test('goal canvas centers newly created elements using their rendered size', () => {
  assert.deepEqual(goalCanvasPanToCenterElement({ id: 'goal', type: 'goal', title: 'Goal', x: 420, y: 180, width: 250, height: 104 }), { x: -545, y: -232 });
  assert.deepEqual(goalCanvasPanToCenterElement({ id: 'subgoal', type: 'subgoal', title: 'Subgoal', x: 260, y: 560 }), { x: -370, y: -605 });
});
