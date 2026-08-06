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
  assert.match(app, /<AgentSessionSupervisorProvider\b/);
  assert.match(app, /projects=\{timelineSwimlanes\}/);
});

test('the supervisor owns a live session registry and a reopenable active-session dock', () => {
  const source = readComponent('AgentSessionSupervisor.tsx');
  assert.match(source, /sessions\?\.list/);
  assert.match(source, /setInterval\(\(\) => void refresh\(\), 10000\)/);
  assert.match(source, /sessions\?\.onEvent/);
  assert.match(source, /openSession/);
  const execution = readComponent('TaskExecutionAction.tsx');
  assert.match(execution, /showClose=\{false\}/);
  assert.match(execution, /Minimize supervision/);
  assert.match(execution, /Preparing your work session/);
  assert.match(execution, /Ready to start/);
  assert.ok(execution.indexOf('{error && <ExecutionNotice') < execution.indexOf('{binding && ('));
  assert.match(execution, /TASK_ALREADY_COMPLETE/);
  assert.match(execution, /Reopen it before starting new work/);
  assert.match(execution, /new Set\(\[/);
  assert.match(source, /workspacePath \|\| task\.repositoryFolder \|\| project\?\.repositoryFolder/);
  assert.match(execution, /result\.error === 'ACP_SESSION_NOT_FOUND'/);
  assert.match(execution, /onOpenChange=\{nextOpen => \{ setOpen\(nextOpen\); if \(!nextOpen\) setStartRequested\(false\); \}\}/);
  assert.match(execution, /onVisibilityChange\?\.\(open\)/);
  assert.match(execution, /if \(!open \|\| !startRequested \|\| loading \|\| !sessionLoaded \|\| operationBusy\) return/);
  const milestone = readComponent('MilestoneExecutionAction.tsx');
  assert.match(milestone, /disabled=\{!row\.active && row\.blockers\.length > 0\}/);
  assert.match(milestone, /Work blocked for/);
  assert.match(source, /startOnRequest: false/);
  assert.match(source, /'interrupted', 'failed'/);
  assert.match(source, /HISTORY_SESSION_STATES/);
  assert.match(source, /sessionDock/);
  const statusBar = readComponent('statuses/AppStatusBar.tsx');
  assert.match(statusBar, /useAgentSessionSupervisor/);
  assert.match(statusBar, /No active work/);
  assert.match(statusBar, /getAttentionState\('needs-input'\)/);
  assert.match(statusBar, /getAttentionState\('active'\)/);
  assert.match(statusBar, /Completed session/);
  assert.match(statusBar, /getAttentionState\('blocked'\)/);
  assert.match(statusBar, /Open supervision:/);
});

test('task supervision prefers a live binding over a newer closed historical binding', () => {
  const execution = readComponent('TaskExecutionAction.tsx');
  assert.match(execution, /const ACTIVE_SESSION_STATES = new Set\(\['starting', 'ready', 'active', 'needs-input', 'cancelling'\]\)/);
  assert.match(execution, /taskBindings\.filter\(candidate => ACTIVE_SESSION_STATES\.has\(candidate\.state\)\)/);
  assert.match(execution, /newestFirst\(taskBindings\.filter/);
  assert.match(execution, /const refreshSequence = useRef\(0\)/);
  assert.match(execution, /if \(sequence !== refreshSequence\.current\) return null/);
});
