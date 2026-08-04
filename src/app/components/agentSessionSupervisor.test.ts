import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const componentsDirectory = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(resolve(componentsDirectory, name), 'utf8');

test('Kanban task details routes before closing its source dialog', () => {
  const source = readComponent('dialogs/TaskDetailsDialog.tsx');
  const requestIndex = source.indexOf('requestTask(task');
  const closeIndex = source.indexOf('onClose();', requestIndex);

  assert.ok(requestIndex >= 0, 'Task details must request the app-level supervisor');
  assert.ok(closeIndex > requestIndex, 'The request must be published before the dialog closes');
  assert.doesNotMatch(source, /TaskExecutionAction/);
});

test('Roadmap task rows request the app-level supervisor before closing their sheet', () => {
  const source = readComponent('MilestoneExecutionAction.tsx');
  const requestIndex = source.indexOf('requestTask(row.task');
  const closeIndex = source.indexOf('setOpen(false)', requestIndex);

  assert.ok(requestIndex >= 0, 'Roadmap rows must request the app-level supervisor');
  assert.ok(closeIndex > requestIndex, 'The request must be published before the milestone sheet closes');
  assert.doesNotMatch(source, /TaskExecutionAction/);
});

test('Timeline uses the same request-only launch boundary', () => {
  const source = readComponent('DraggableTimelineTask.tsx');

  assert.match(source, /requestTask\(task/);
  assert.doesNotMatch(source, /TaskExecutionAction/);
});

test('the app-level supervisor is the only renderer owner of TaskExecutionAction', () => {
  const supervisor = readComponent('AgentSessionSupervisor.tsx');
  const app = readFileSync(resolve(componentsDirectory, '../App.tsx'), 'utf8');

  assert.match(supervisor, /<TaskExecutionAction/);
  assert.match(app, /<AgentSessionSupervisorProvider>/);
});
