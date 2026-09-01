import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const componentsDirectory = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(resolve(componentsDirectory, name), 'utf8');

test('[Timeline task bar] a long task title truncates instead of clipping or overlapping the resize handles at narrow bar widths', () => {
  const source = readComponent('DraggableTimelineTask.tsx');
  assert.match(
    source,
    /<div ref=\{dragHandleRef\} className="flex min-w-0 flex-1 items-center gap-2 h-full">/,
    'The draggable content wrapper needs min-w-0 or a long title cannot shrink below its intrinsic width, forcing the bar to overflow',
  );
  assert.match(
    source,
    /<span className="truncate flex-1 text-left">\{task\.title\}<\/span>/,
    'The task title span must truncate so narrow bars show an ellipsis instead of overlapping the right resize grip',
  );
  assert.match(
    source,
    /timeline-task-priority shrink-0/,
    'The priority bullet must stay shrink-0 so a narrow bar squeezes the title, not the priority indicator, out of view',
  );
});

test('[Timeline] the swimlane label column cannot be resized narrower than its minimum readable width', () => {
  const source = readComponent('views/TimelineView.tsx');
  assert.match(source, /const MIN_LEFT_COL_WIDTH = 260;/, 'A minimum left-column width constant must exist to protect swimlane labels at narrow widths');
  assert.match(source, /const MAX_LEFT_COL_WIDTH = 420;/, 'A maximum left-column width constant must exist to keep the timeline chart usable when the column is widened');
  assert.match(
    source,
    /newWidth = Math\.max\(MIN_LEFT_COL_WIDTH, Math\.min\(MAX_LEFT_COL_WIDTH, newWidth\)\);/,
    'The column-resize handler must clamp between the min and max width constants on every drag frame, not just at drag start',
  );
});

test('[Timeline accessibility] dates, task state, keyboard date editing, and the custom scrollbar remain non-pointer-only', () => {
  const taskSource = readComponent('DraggableTimelineTask.tsx');
  const headerSource = readComponent('headers/TimelineHeader.tsx');
  const scrollbarSource = readComponent('HorizontalScrollbar.tsx');
  const timelineSource = readComponent('views/TimelineView.tsx');
  assert.match(taskSource, /Status: \$\{statusLabel\}\. Dates:/, 'Task bars must announce status and date state, not only their color and position');
  assert.match(taskSource, /e\.altKey[\s\S]*'resize-start'/, 'Alt plus Arrow must expose start-edge resizing from the focused task');
  assert.match(taskSource, /e\.shiftKey[\s\S]*'resize-end'/, 'Shift plus Arrow must expose end-edge resizing from the focused task');
  for (const action of ['Edit', 'Start work', 'Delete', 'Duplicate']) {
    assert.match(taskSource, new RegExp(`>${action}<|\\n\\s*${action}\\n`), `The task context menu must preserve ${action}`);
  }
  assert.match(headerSource, /weekday: 'long'[\s\S]*year: 'numeric'[\s\S]*month: 'long'/, 'Day headers must announce a complete calendar date');
  assert.match(scrollbarSource, /role="scrollbar"[\s\S]*tabIndex=\{0\}[\s\S]*onKeyDown=\{handleKeyDown\}/, 'The custom scrollbar must be focusable and keyboard operable');
  assert.match(timelineSource, /if \(e\.key !== 'Escape'\) return;[\s\S]*setTaskResizePreview\(null\);[\s\S]*setResizingTask\(null\);/, 'Escape must cancel an active pointer resize without committing dates');
  const timelineStyles = readFileSync(resolve(componentsDirectory, '../../styles/timeline.css'), 'utf8');
  assert.match(timelineStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none;[\s\S]*transition: none;[\s\S]*scroll-behavior: auto;/, 'Timeline motion must honor reduced-motion preferences');
});
