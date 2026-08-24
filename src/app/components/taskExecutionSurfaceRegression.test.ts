import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const componentsDirectory = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(resolve(componentsDirectory, name), 'utf8');

test('[Task Details dialog] the dialog stays within the viewport at narrow widths and reduced window heights', () => {
  const source = readComponent('dialogs/TaskDetailsDialog.tsx');
  assert.match(
    source,
    /h-\[min\(920px,calc\(100vh-2rem\)\)\]/,
    'Task Details must clamp its height to the viewport so a reduced-height window cannot push the footer/actions off-screen',
  );
  assert.match(
    source,
    /w-\[min\(837px,calc\(100vw-2rem\)\)\]/,
    'Task Details must clamp its width to the viewport so a narrow window cannot clip the dialog',
  );
  assert.match(
    source,
    /className="flex h-\[min\(920px,calc\(100vh-2rem\)\)\] min-h-0 w-\[min\(837px,calc\(100vw-2rem\)\)\]/,
    'The dialog frame needs min-h-0 alongside its clamped height, otherwise its flex children cannot shrink and content overflows instead of scrolling',
  );
  assert.match(
    source,
    /className="h-auto min-h-0 flex-1"/,
    'The scrollable body region must keep min-h-0/flex-1 so long task content scrolls internally rather than clipping or growing the dialog past the viewport',
  );
});

test('[Task Execution] a blocked task keeps its primary action visible and disabled with a named reason, instead of hiding it', () => {
  const source = readComponent('TaskExecutionAction.tsx');
  assert.match(
    source,
    /blockers\.length > 0 && <div className="mb-3"><ExecutionHint tone=\{taskAlreadyComplete \? 'warning' : 'danger'\} title=\{taskAlreadyComplete \? 'Task already complete' : 'Action needed before work starts'\}/,
    'Task Execution must surface a named blocking reason (task-already-complete vs. generic blocker) rather than a silent disabled control',
  );
  assert.match(
    source,
    /disabled=\{operationBusy \|\| \(binding\?\.state === 'interrupted' \? !resolvedRepositoryFolder : loading \|\| blockers\.length > 0 \|\| activeAttempt\)\}/,
    'The primary Start/Resume work button must stay rendered and only become disabled when blocked, so the user can still see and reason about the control',
  );
  assert.match(
    source,
    /disabled=\{operationBusy \|\| loading \|\| blockers\.length > 0 \|\| !resolvedRepositoryFolder\}/,
    'The Restart work button must remain visible and disable (not unmount) when blockers are present',
  );
});

test('[Task Execution] a failed run surfaces an explicit danger notice naming the next step', () => {
  const source = readComponent('TaskExecutionAction.tsx');
  assert.match(
    source,
    /\{error && <div className="mb-3"><ExecutionNotice tone="danger" title=\{getAttentionState\('failed'\)\.label\} nextStep=\{getAttentionState\('failed'\)\.nextStep\}>\{error\}<\/ExecutionNotice><\/div>\}/,
    'A failed execution must render a danger ExecutionNotice carrying both the failure label and an explicit next step, not just the raw error',
  );
});

test('[Task Execution] the ready state explains why work can start, not just that it can', () => {
  const source = readComponent('TaskExecutionAction.tsx');
  assert.match(
    source,
    /!binding && !loading && preflight && blockers\.length === 0 && <ExecutionNotice tone="info" title=\{getAttentionState\('ready'\)\.label\} nextStep=\{getAttentionState\('ready'\)\.nextStep\}>/,
    'The ready-to-start notice must include both the state label and its next step so the surface never shows a bare "ready" with no guidance',
  );
});
