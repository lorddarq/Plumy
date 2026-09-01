import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentSessionSupervisorProvider } from '../../src/app/components/AgentSessionSupervisor.tsx';
import { TimelineView } from '../../src/app/components/views/TimelineView.tsx';
import type { Task, TimelineSwimlane } from '../../src/app/types.ts';
import '../../src/styles/index.css';
import {
  createBenchmarkMonthWidths,
  createTimelineBenchmarkFixture,
  getTimelineFixtureProfile,
  TIMELINE_FIXTURE_SEED,
} from './fixture.ts';

interface LongTaskSample {
  startTime: number;
  duration: number;
}

interface ScrollSample {
  axis: 'vertical' | 'horizontal';
  durationMs: number;
  frameCount: number;
  p95FrameMs: number;
  maxFrameMs: number;
  framesOver16_7ms: number;
  framesOver50ms: number;
  mountedRowsMin: number;
  mountedRowsMax: number;
  blankFrames: number;
  alignmentFailures: number;
}

interface InteractionSample {
  status: 'measured' | 'unavailable';
  latencyMs?: number;
  reason?: string;
}

interface RowRetentionSample {
  selection: boolean;
  focus: boolean;
  resize: boolean;
}

interface BenchmarkResult {
  fixture: { swimlaneCount: number; taskCount: number; seed: number };
  display: { weekends: 'visible' | 'hidden'; monthWidths: 'default' | 'resized' };
  initialRenderMs: number;
  scenarioReadyMs: number;
  paint: { firstPaintMs?: number; firstContentfulPaintMs?: number };
  dom: { totalNodes: number; authoredSwimlaneRows: number; swimlaneRows: number; renderedTaskBars: number };
  longTasks: { count: number; totalDurationMs: number; maxDurationMs: number; samples: LongTaskSample[] };
  memory: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number };
  scroll: ScrollSample[];
  interactions: { resizePreview: InteractionSample; rowRetention: RowRetentionSample; taskDrag: InteractionSample };
}

declare global {
  interface Window {
    __timelineBenchmark?: {
      ready: Promise<void>;
      run: () => Promise<BenchmarkResult>;
    };
  }
}

const query = new URLSearchParams(window.location.search);
const swimlaneCount = Number(query.get('swimlanes') || 100);
const taskCount = Number(query.get('tasks') || 1000);
const weekendMode = query.get('weekends') === 'hidden' ? 'hidden' : 'visible';
const widthMode = query.get('widths') === 'resized' ? 'resized' : 'default';
const parityMode = query.get('parity') === 'true';
const fixture = createTimelineBenchmarkFixture(getTimelineFixtureProfile(swimlaneCount, taskCount));
const renderStartedAt = performance.now();
const longTasks: LongTaskSample[] = [];
let firstRenderAt = 0;
let scenarioReadyAt = 0;

try {
  new PerformanceObserver(entries => {
    entries.getEntries().forEach(entry => longTasks.push({ startTime: entry.startTime, duration: entry.duration }));
  }).observe({ type: 'longtask', buffered: true });
} catch {
  // Older engines can still run the benchmark; the raw result will contain no long-task samples.
}

let resolveReady!: () => void;
const ready = new Promise<void>(resolve => { resolveReady = resolve; });

function nextFrame(): Promise<number> {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function waitFor(predicate: () => boolean, timeoutMs = 120_000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Timeline benchmark timed out waiting for the requested state');
    await nextFrame();
  }
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

async function measureScroll(axis: ScrollSample['axis']): Promise<ScrollSample> {
  const scroller = document.querySelector<HTMLElement>('.timeline-right-column');
  if (!scroller) throw new Error('Timeline scroll container was not rendered');
  const property = axis === 'vertical' ? 'scrollTop' : 'scrollLeft';
  const maximum = axis === 'vertical'
    ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    : Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const initialPosition = scroller[property];
  const frameDurations: number[] = [];
  const mountedRowCounts: number[] = [];
  let alignmentFailures = 0;
  const startedAt = performance.now();
  let previousAt = startedAt;
  scroller[property] = initialPosition;
  for (let frame = 1; frame <= 60; frame += 1) {
    scroller[property] = maximum * (frame / 60);
    const frameAt = await nextFrame();
    frameDurations.push(frameAt - previousAt);
    const leftRowIds = [...document.querySelectorAll<HTMLElement>('.timeline-left-list-content > [data-timeline-row-id]')]
      .map(row => row.dataset.timelineRowId);
    const rightRowIds = [...document.querySelectorAll<HTMLElement>('.timeline-rows-container > [data-timeline-row-id]')]
      .map(row => row.dataset.timelineRowId);
    mountedRowCounts.push(rightRowIds.length);
    if (leftRowIds.join('|') !== rightRowIds.join('|')) alignmentFailures += 1;
    previousAt = frameAt;
  }
  const sample = {
    axis,
    durationMs: performance.now() - startedAt,
    frameCount: frameDurations.length,
    p95FrameMs: percentile95(frameDurations),
    maxFrameMs: Math.max(...frameDurations),
    framesOver16_7ms: frameDurations.filter(duration => duration > 16.7).length,
    framesOver50ms: frameDurations.filter(duration => duration > 50).length,
    mountedRowsMin: Math.min(...mountedRowCounts),
    mountedRowsMax: Math.max(...mountedRowCounts),
    blankFrames: mountedRowCounts.filter(count => count === 0).length,
    alignmentFailures,
  };
  scroller[property] = 0;
  await nextFrame();
  await nextFrame();
  return sample;
}

async function measureResizePreview(): Promise<InteractionSample> {
  const bar = document.querySelector<HTMLElement>('.timeline-task-bar');
  const grip = bar?.querySelector<HTMLElement>('.timeline-task-resize-grip.right-0');
  if (!bar || !grip) return { status: 'unavailable', reason: 'No rendered task resize grip was available' };
  const beforeWidth = bar.getBoundingClientRect().width;
  const rect = grip.getBoundingClientRect();
  grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: rect.left + 1, clientY: rect.top + 1 }));
  await nextFrame();
  const startedAt = performance.now();
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: rect.left + 61, clientY: rect.top + 1 }));
  for (let frame = 0; frame < 10 && bar.getBoundingClientRect().width === beforeWidth; frame += 1) await nextFrame();
  const changed = bar.getBoundingClientRect().width !== beforeWidth;
  const latencyMs = performance.now() - startedAt;
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: rect.left + 61, clientY: rect.top + 1 }));
  return changed ? { status: 'measured', latencyMs } : { status: 'unavailable', reason: 'Synthetic resize did not produce a visible preview' };
}

async function measureRowRetention(): Promise<RowRetentionSample> {
  const scroller = document.querySelector<HTMLElement>('.timeline-right-column');
  const rowsContainer = document.querySelector<HTMLElement>('.timeline-rows-container');
  if (!scroller) return { selection: false, focus: false, resize: false };
  const waitForPin = async (source: HTMLElement) => {
    const rowId = source.closest<HTMLElement>('[data-timeline-row-id]')?.dataset.timelineRowId;
    if (!rowId || !rowsContainer) return false;
    for (let frame = 0; frame < 10; frame += 1) {
      if ((rowsContainer.dataset.timelinePinnedRows || '').split(',').includes(rowId)) return true;
      await nextFrame();
    }
    return false;
  };
  const scrollAway = async (source: HTMLElement) => {
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    await nextFrame();
    await nextFrame();
    const retained = source.isConnected;
    scroller.scrollTop = 0;
    await nextFrame();
    await nextFrame();
    return retained;
  };

  const selectionCell = document.querySelector<HTMLElement>('.day-click-cell:not(.weekend)');
  selectionCell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
  const selectionPinned = selectionCell ? await waitForPin(selectionCell) : false;
  const selection = selectionCell && selectionPinned ? await scrollAway(selectionCell) : false;
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await nextFrame();

  const focusBar = document.querySelector<HTMLElement>('.timeline-task-bar');
  focusBar?.focus();
  const focus = focusBar ? await scrollAway(focusBar) : false;
  focusBar?.blur();
  await nextFrame();

  const resizeBar = document.querySelector<HTMLElement>('.timeline-task-bar');
  const resizeGrip = resizeBar?.querySelector<HTMLElement>('.timeline-task-resize-grip.right-0');
  const resizeRect = resizeGrip?.getBoundingClientRect();
  if (resizeGrip && resizeRect) {
    resizeGrip.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: resizeRect.left + 1,
      clientY: resizeRect.top + 1,
    }));
  }
  const resizePinned = resizeBar ? await waitForPin(resizeBar) : false;
  const resize = resizeBar && resizeGrip && resizePinned ? await scrollAway(resizeBar) : false;
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  await nextFrame();

  return { selection, focus, resize };
}

async function runBenchmark(): Promise<BenchmarkResult> {
  await ready;
  const scroll = [await measureScroll('vertical'), await measureScroll('horizontal')];
  const rowRetention = await measureRowRetention();
  const interactions = {
    resizePreview: await measureResizePreview(),
    rowRetention,
    taskDrag: { status: 'unavailable', reason: 'Requires a trusted pointer/CDP gesture; DOM-synthesized HTML5 drag is rejected by React DnD' } as InteractionSample,
  };
  const memory = (performance as Performance & { memory?: BenchmarkResult['memory'] }).memory ?? {};
  const paintEntries = performance.getEntriesByType('paint');
  const paintTime = (name: string) => paintEntries.find(entry => entry.name === name)?.startTime;
  const samples = longTasks.map(sample => ({ ...sample }));
  return {
    fixture: { swimlaneCount, taskCount, seed: TIMELINE_FIXTURE_SEED },
    display: { weekends: weekendMode, monthWidths: widthMode },
    initialRenderMs: firstRenderAt - renderStartedAt,
    scenarioReadyMs: scenarioReadyAt - renderStartedAt,
    paint: {
      firstPaintMs: paintTime('first-paint'),
      firstContentfulPaintMs: paintTime('first-contentful-paint'),
    },
    dom: {
      totalNodes: document.getElementsByTagName('*').length,
      authoredSwimlaneRows: swimlaneCount,
      swimlaneRows: document.querySelectorAll('.swimlane-row-timeline').length,
      renderedTaskBars: document.querySelectorAll('.timeline-task-bar').length,
    },
    longTasks: {
      count: samples.length,
      totalDurationMs: samples.reduce((sum, sample) => sum + sample.duration, 0),
      maxDurationMs: Math.max(0, ...samples.map(sample => sample.duration)),
      samples,
    },
    memory: {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    },
    scroll,
    interactions,
  };
}

function BenchmarkApp() {
  const [tasks, setTasks] = useState(fixture.tasks);
  const [swimlanes, setSwimlanes] = useState(fixture.swimlanes);
  const [parityEvent, setParityEvent] = useState('');
  const layoutState = useMemo(() => ({
    leftColWidth: 282,
    monthWidths: createBenchmarkMonthWidths(widthMode),
    showCompleted: false,
  }), []);
  const handleReorder = useCallback((nextTasks: Task[]) => {
    if (parityMode) {
      const changedTask = nextTasks.find(nextTask => {
        const previousTask = tasks.find(task => task.id === nextTask.id);
        return previousTask && (
          previousTask.startDate !== nextTask.startDate
          || previousTask.endDate !== nextTask.endDate
          || previousTask.swimlaneId !== nextTask.swimlaneId
          || previousTask.assigneeId !== nextTask.assigneeId
        );
      });
      if (changedTask) {
        setParityEvent(JSON.stringify({
          type: 'move-task',
          taskId: changedTask.id,
          startDate: changedTask.startDate,
          endDate: changedTask.endDate,
          swimlaneId: changedTask.swimlaneId,
          assigneeId: changedTask.assigneeId,
        }));
      }
    }
    setTasks(nextTasks);
  }, [tasks]);
  const handleReorderSwimlanes = useCallback((nextSwimlanes: TimelineSwimlane[]) => {
    setSwimlanes(nextSwimlanes);
    if (parityMode) {
      setParityEvent(JSON.stringify({
        type: 'reorder-swimlanes',
        swimlaneIds: nextSwimlanes.map(swimlane => swimlane.id),
      }));
    }
  }, []);
  const handleUpdateTaskDates = useCallback((taskId: string, startDate: string, endDate: string) => {
    if (!parityMode) return;
    setTasks(current => current.map(task => task.id === taskId ? { ...task, startDate, endDate } : task));
  }, []);

  useEffect(() => {
    void (async () => {
      await waitFor(() => {
        const rowsContainer = document.querySelector<HTMLElement>('.timeline-rows-container');
        const mountedRows = document.querySelectorAll('.swimlane-row-timeline').length;
        return mountedRows === swimlaneCount || (
          rowsContainer?.dataset.timelineAuthoredRows === String(swimlaneCount)
          && mountedRows > 0
          && mountedRows < swimlaneCount
        );
      });
      await nextFrame();
      firstRenderAt = performance.now();
      if (weekendMode === 'hidden') {
        const toggle = document.querySelector<HTMLButtonElement>('.timeline-week-toggle');
        if (!toggle) throw new Error('Weekend toggle was not rendered');
        toggle.click();
        await waitFor(() => toggle.textContent?.trim() === '5 days');
      }
      await nextFrame();
      await nextFrame();
      scenarioReadyAt = performance.now();
      document.documentElement.dataset.timelineBenchmarkReady = 'true';
      resolveReady();
    })();
  }, []);

  return (
    <AgentSessionSupervisorProvider tasks={tasks} projects={swimlanes}>
      <output className="sr-only" data-timeline-parity-event={parityEvent} aria-hidden="true" />
      <TimelineView
        tasks={tasks}
        swimlanes={swimlanes}
        people={fixture.people}
        statusColumns={fixture.statusColumns}
        initialLayoutState={layoutState}
        onTaskClick={() => {}}
        onTaskEdit={() => {}}
        onTaskDelete={() => {}}
        onTaskDuplicate={() => {}}
        onAddTask={(date, swimlaneId, endDate, mode) => {
          if (parityMode) setParityEvent(JSON.stringify({
            type: 'add-task',
            startDate: date.toISOString().slice(0, 10),
            endDate: endDate?.toISOString().slice(0, 10),
            swimlaneId,
            mode,
          }));
        }}
        onUpdateTaskDates={handleUpdateTaskDates}
        onEditSwimlane={() => {}}
        onAddSwimlane={() => {}}
        onReorderSwimlanes={handleReorderSwimlanes}
        onReorderTasks={handleReorder}
      />
    </AgentSessionSupervisorProvider>
  );
}

window.__timelineBenchmark = { ready, run: runBenchmark };
createRoot(document.getElementById('root')!).render(<BenchmarkApp />);
