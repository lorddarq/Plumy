import type { Person, StatusColumn, Task, TimelineSwimlane } from '../../src/app/types.ts';

export interface TimelineFixtureProfile {
  id: 'small' | 'medium' | 'large';
  swimlaneCount: 100 | 500 | 1000;
  taskCount: 1000 | 5000 | 10000;
}

export interface TimelineBenchmarkFixture {
  profile: TimelineFixtureProfile;
  seed: number;
  swimlanes: TimelineSwimlane[];
  tasks: Task[];
  people: Person[];
  statusColumns: StatusColumn[];
}

export const TIMELINE_FIXTURE_SEED = 0x4f4d5652;

export const TIMELINE_FIXTURE_PROFILES: readonly TimelineFixtureProfile[] = [
  { id: 'small', swimlaneCount: 100, taskCount: 1000 },
  { id: 'medium', swimlaneCount: 500, taskCount: 5000 },
  { id: 'large', swimlaneCount: 1000, taskCount: 10000 },
] as const;

const STATUS_COLUMNS: StatusColumn[] = [
  { id: 'status-open', title: 'Open Tasks', color: 'bg-slate-500', loadClassification: 'open-tasks' },
  { id: 'status-progress', title: 'In Progress', color: 'bg-blue-500', loadClassification: 'in-progress' },
  { id: 'status-review', title: 'Under Review', color: 'bg-amber-500', loadClassification: 'in-review' },
];

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getTimelineFixtureProfile(swimlaneCount: number, taskCount: number): TimelineFixtureProfile {
  const profile = TIMELINE_FIXTURE_PROFILES.find(
    candidate => candidate.swimlaneCount === swimlaneCount && candidate.taskCount === taskCount,
  );
  if (!profile) throw new Error(`Unsupported Timeline fixture: ${swimlaneCount} swimlanes / ${taskCount} tasks`);
  return profile;
}

export function createTimelineBenchmarkFixture(
  profile: TimelineFixtureProfile,
  seed = TIMELINE_FIXTURE_SEED,
): TimelineBenchmarkFixture {
  if (profile.taskCount !== profile.swimlaneCount * 10) {
    throw new Error('Timeline benchmark profiles must contain exactly 10 tasks per swimlane');
  }

  const random = seededRandom(seed ^ profile.swimlaneCount ^ profile.taskCount);
  const statuses: Task['status'][] = ['open', 'in-progress', 'under-review'];
  const priorities: NonNullable<Task['priority']>[] = ['urgent', 'moderate', 'normal', 'low'];
  const base = new Date('2026-01-05T00:00:00.000Z');

  const swimlanes = Array.from({ length: profile.swimlaneCount }, (_, index): TimelineSwimlane => ({
    id: `benchmark-lane-${String(index + 1).padStart(4, '0')}`,
    name: `Benchmark swimlane ${String(index + 1).padStart(4, '0')}`,
    color: ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500'][index % 4],
  }));

  const people = swimlanes.map((swimlane, index): Person => ({
    id: `benchmark-person-${String(index + 1).padStart(4, '0')}`,
    name: `Benchmark person ${String(index + 1).padStart(4, '0')}`,
    role: 'Synthetic fixture owner',
    kind: 'human',
    color: swimlane.color,
  }));

  const tasks: Task[] = [];
  swimlanes.forEach((swimlane, laneIndex) => {
    // Ten tasks per row. Groups of three deliberately overlap; the remaining tasks
    // spread across the full window so horizontal windowing is exercised as well.
    const denseStart = addDays(base, (laneIndex % 24) * 7 - 84);
    for (let taskIndex = 0; taskIndex < 10; taskIndex += 1) {
      const globalIndex = laneIndex * 10 + taskIndex;
      let start = taskIndex < 3
        ? addDays(denseStart, taskIndex * 2)
        : addDays(new Date('2019-01-01T00:00:00.000Z'), Math.floor(random() * 5478));
      let duration = taskIndex < 3 ? 35 + taskIndex * 14 : 7 + Math.floor(random() * 120);

      if (globalIndex === 0) {
        start = new Date('2019-01-07T00:00:00.000Z');
        duration = 81;
      } else if (globalIndex === profile.taskCount - 1) {
        start = new Date('2033-10-02T00:00:00.000Z');
        duration = 74;
      }

      tasks.push({
        id: `benchmark-task-${String(globalIndex + 1).padStart(5, '0')}`,
        title: `Benchmark task ${String(globalIndex + 1).padStart(5, '0')}`,
        status: statuses[globalIndex % statuses.length],
        priority: priorities[globalIndex % priorities.length],
        startDate: isoDate(start),
        endDate: isoDate(addDays(start, duration)),
        swimlaneId: swimlane.id,
        projectIds: [swimlane.id],
        assigneeId: people[laneIndex].id,
      });
    }
  });

  return {
    profile,
    seed,
    swimlanes,
    tasks,
    people,
    statusColumns: STATUS_COLUMNS.map(column => ({ ...column })),
  };
}

export function createBenchmarkMonthWidths(mode: 'default' | 'resized'): Record<string, number> {
  if (mode === 'default') return {};
  const widths: Record<string, number> = {};
  for (let year = 2019; year <= 2033; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      widths[`${year}-${month}`] = [1320, 1860, 2280][(year + month) % 3];
    }
  }
  return widths;
}
