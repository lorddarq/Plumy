import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const componentsDirectory = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(resolve(componentsDirectory, name), 'utf8');

test('[Goals runtime status] the inspector names the execution state, its meaning, and the next step together', () => {
  const source = readComponent('goals/GoalsRuntimeStatus.tsx');
  assert.match(
    source,
    /\{attention\?\.description \?\? runtimeDescription\(executionState\)\}/,
    'The runtime status panel must explain what the execution state means, preferring the shared attention description',
  );
  assert.match(
    source,
    /\{attention && <span className="mt-2 block rounded-md border border-slate-200 bg-slate-50 px-2\.5 py-2 text-\[11px\] text-slate-600"><span className="font-semibold text-slate-700">Next step: <\/span>\{attention\.nextStep\}<\/span>\}/,
    'Whenever an attention state is known, the panel must render an explicit "Next step" line, not leave the state unexplained',
  );
  assert.match(
    source,
    /\{onResetExecution && <button type="button" onClick=\{onResetExecution\}/,
    'A reset-execution recovery action must be offered whenever the caller wired one up, so a stuck runtime state is never a dead end',
  );
});

test('[Goals runtime status] blocked worker delegation is called out separately from the general execution state', () => {
  const source = readComponent('goals/GoalsRuntimeStatus.tsx');
  assert.match(
    source,
    /if \(status === 'blocked'\) return 'Subagent recruitment failed or was unavailable\. The working agent must report a recovery decision before execution can continue\.';/,
    'A blocked subagent delegation must have its own explanatory copy distinct from a generic "blocked" execution message',
  );
  assert.match(
    source,
    /\{workerDelegationDescription\(runtimeProjection\?\.execution\?\.workerDelegationStatus\) && <span className="mt-2 block rounded-md border border-amber-100 bg-amber-50 px-2\.5 py-2 text-\[11px\] text-amber-800">/,
    'Worker delegation status must render in its own amber callout inside the execution block, not be folded silently into the main state description',
  );
});

test('[Goals canvas] the empty canvas explains what to do next instead of showing a blank surface', () => {
  const source = readComponent('goals/GoalsCanvasEmptyState.tsx');
  assert.match(source, /role="status" aria-live="polite"/, 'The empty canvas must announce itself to assistive tech as a live status region');
  assert.match(source, />Start with a Goal<\/h2>/, 'The empty canvas must name the concrete next action (starting a Goal)');
  assert.match(
    source,
    /<Button type="button" onClick=\{onNewGoal\} className="mt-4 text-xs"><Plus className="size-3\.5" \/> New goal<\/Button>/,
    'The empty canvas must offer a working "New goal" action rather than only descriptive text',
  );
});

test('[Goals canvas] an active execution banner keeps the reset action beside its named next step', () => {
  const source = readComponent('views/GoalsView.tsx');
  assert.match(
    source,
    /<span className="mt-1 block text-\[11px\] text-slate-600"><span className="font-semibold text-slate-700">Next step:<\/span> \{attention\.nextStep\}<\/span>/,
    'The canvas-level execution banner must render the same "Next step" contract as the inspector panel',
  );
  assert.match(
    source,
    /<button type="button" onClick=\{\(\) => setResetExecutionDialogOpen\(true\)\} className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-\[11px\] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50">Reset execution<\/button>/,
    'The banner must keep a working Reset execution action beside the next-step text so a blocked or failed run is always recoverable from the canvas',
  );
});
