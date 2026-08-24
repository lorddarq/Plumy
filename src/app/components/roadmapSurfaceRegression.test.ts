import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const componentsDirectory = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(resolve(componentsDirectory, name), 'utf8');

test('[Roadmap] an empty roadmap explains the cause and offers the matching next action', () => {
  const source = readComponent('views/RoadmapView.tsx');
  assert.match(
    source,
    /milestones\.length === 0 \? \(\s*<EmptyStateCard\s*\n\s*icon=\{<Flag className="size-5" \/>\}\s*\n\s*title="No roadmap milestones yet"\s*\n\s*description="Create a milestone to group task work around a project delivery point, then track composition and date risk here\."\s*\n\s*action=\{<Button onClick=\{onAddMilestone\}>Create first milestone<\/Button>\}/,
    'A workspace with zero milestones must explain what a milestone is for and offer a "Create first milestone" action, not just an empty chart',
  );
  assert.match(
    source,
    /filteredMilestones\.length === 0 \? \(\s*<EmptyStateCard\s*\n\s*icon=\{<Filter className="size-5" \/>\}\s*\n\s*title="No milestones match these filters or visibility settings"\s*\n\s*description="Adjust the roadmap filters or enable completed work in Settings to bring milestones back into view\."\s*\n\s*action=\{<Button onClick=\{resetFilters\} variant="outline">Reset filters<\/Button>\}/,
    'When milestones exist but filters hide all of them, the empty state must name filtering as the cause and offer a "Reset filters" action, distinct from the zero-milestones case',
  );
});

test('[Roadmap] a milestone row with no linked tasks shows a named compact empty state rather than a blank row', () => {
  const source = readComponent('views/RoadmapView.tsx');
  assert.match(
    source,
    /sortedTasks\.length === 0 \? \(\s*<div className="absolute left-4 right-4 top-\[64px\]">\s*<EmptyStateCard\s*\n\s*compact\s*\n\s*icon=\{<Flag className="size-4" \/>\}\s*\n\s*title="No linked tasks yet"/,
    'A milestone row with zero linked tasks must render a compact "No linked tasks yet" empty state instead of leaving the row visually blank',
  );
});

test('[Roadmap] milestone start-work rows keep blocked tasks visible and disabled, naming the block explicitly', () => {
  const source = readComponent('MilestoneExecutionAction.tsx');
  assert.match(
    source,
    /disabled=\{row\.attention\.kind === 'blocked'\}/,
    'Blocked milestone task rows must disable their action rather than removing it, so the user still sees the task and knows work is blocked',
  );
  assert.match(
    source,
    /aria-label=\{row\.active \? `Open supervision for \$\{row\.task\.title\}` : row\.attention\.kind === 'blocked' \? `Work blocked for \$\{row\.task\.title\}` : `\$\{row\.attention\.nextStep\} for \$\{row\.task\.title\}`\}/,
    'The accessible label for a blocked row must explicitly say the task is blocked (not just show a generic disabled button) and otherwise names the concrete next step',
  );
  assert.match(
    source,
    /\{row\.blockers\.length > 0 && <ul className="mt-2 space-y-1 text-xs text-amber-800">\{row\.blockers\.map\(blocker => <li key=\{blocker\}>• \{blocker\}<\/li>\)\}<\/ul>\}/,
    'Each concrete blocking reason (missing assignee, pending dependency, unresolved runtime, etc.) must be listed on the row, not summarized away',
  );
});
