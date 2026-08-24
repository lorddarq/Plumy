import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const componentsDirectory = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(resolve(componentsDirectory, name), 'utf8');

test('[Shared: EmptyStateCard] both the compact and full variants support a title, an explanatory description, and an action', () => {
  const source = readComponent('EmptyStateCard.tsx');
  assert.match(
    source,
    /interface EmptyStateCardProps \{\s*icon\?: ReactNode;\s*title: string;\s*description\?: string;\s*action\?: ReactNode;\s*compact\?: boolean;\s*className\?: string;\s*\}/,
    'EmptyStateCard must keep title required and description/action available, so every call site can explain the cause and offer a next action',
  );
  assert.match(
    source,
    /\{description \? \(\s*<p className="mt-0\.5 text-xs leading-4 text-\[#6a7282\]">\{description\}<\/p>\s*\) : null\}/,
    'The compact variant must render the description when provided, not silently drop it for space',
  );
  assert.match(
    source,
    /\{action \? <div className="mt-5 flex justify-center">\{action\}<\/div> : null\}/,
    'The full variant must render the provided action beneath the description so the empty state is never a dead end',
  );
});

test('[Shared: ExecutionNotice] danger and assertive notices use alert semantics; everything else uses status semantics', () => {
  const source = readComponent('ExecutionNotice.tsx');
  assert.match(
    source,
    /role=\{assertive \|\| tone === 'danger' \? 'alert' : 'status'\} aria-live=\{assertive \|\| tone === 'danger' \? 'assertive' : 'polite'\}/,
    'A blocking or danger-tone notice must be announced immediately (role="alert", aria-live="assertive"); non-blocking notices must not interrupt (role="status", aria-live="polite")',
  );
});

test('[Shared: ExecutionNotice] a notice can always name a concrete next step and an optional recovery action', () => {
  const source = readComponent('ExecutionNotice.tsx');
  assert.match(
    source,
    /\{nextStep && <div className="mt-2 border-t border-current\/10 pt-2 text-\[11px\]"><span className="font-semibold">Next step:<\/span> \{nextStep\}<\/div>\}/,
    'When a caller supplies nextStep, ExecutionNotice must render it as a visually distinct next-step line',
  );
  assert.match(
    source,
    /\{actionLabel && onAction && <button type="button" onClick=\{onAction\}/,
    'When a caller supplies both actionLabel and onAction, ExecutionNotice must render a working recovery action, not just descriptive text',
  );
});
