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
