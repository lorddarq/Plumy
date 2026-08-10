import type { TimelineSwimlane, Person } from '../types.ts';
import type { AllViewStates, ViewType } from '../hooks/useViewState.ts';
import {
  DEFAULT_STATES,
  type KanbanViewState,
  type RoadmapViewState,
  type LoopsViewState,
  type TimelineViewState,
} from '../hooks/useViewState.ts';
import {
  EMPTY_KANBAN_TASK_FILTERS,
  sanitizeKanbanTaskFilters,
  type KanbanTaskFilters,
} from '../utils/taskFilters.ts';
import { getJSONBatch, persistJSONBatchWithElectronMirror } from '../utils/storage.ts';

export const TIMELINE_VIEW_STATE_KEY = 'omvra_viewstate_timeline';
export const KANBAN_VIEW_STATE_KEY = 'omvra_viewstate_kanban';
export const ROADMAP_VIEW_STATE_KEY = 'omvra_viewstate_roadmap';
export const LOOPS_VIEW_STATE_KEY = 'omvra_viewstate_loops';
export const TIMELINE_MONTH_WIDTHS_KEY = 'omvra.monthWidths.v1';
export const TIMELINE_LEFT_COL_WIDTH_KEY = 'omvra.leftColWidth.v1';
export const TIMELINE_SHOW_COMPLETED_KEY = 'omvra.timelineShowCompleted.v1';

const DEFAULT_TIMELINE_LEFT_COL_WIDTH = 282;
const MIN_TIMELINE_LEFT_COL_WIDTH = 260;
const MAX_TIMELINE_LEFT_COL_WIDTH = 420;

export interface TimelineLayoutState {
  leftColWidth: number;
  monthWidths: Record<string, number>;
  showCompleted: boolean;
}

export interface UiStateSnapshot {
  viewStates: AllViewStates;
  timelineLayout: TimelineLayoutState;
  kanbanFilters: KanbanTaskFilters;
}

export const DEFAULT_TIMELINE_LAYOUT_STATE: TimelineLayoutState = {
  leftColWidth: DEFAULT_TIMELINE_LEFT_COL_WIDTH,
  monthWidths: {},
  showCompleted: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeTimelineViewState(value: unknown): TimelineViewState {
  if (!isRecord(value)) return { ...DEFAULT_STATES.timeline };
  return {
    ...DEFAULT_STATES.timeline,
    scrollLeft: Number.isFinite(Number(value.scrollLeft)) ? Number(value.scrollLeft) : DEFAULT_STATES.timeline.scrollLeft,
    collapsedSwimlanes: Array.isArray(value.collapsedSwimlanes) ? value.collapsedSwimlanes.map(String) : [],
    selectedTaskId: typeof value.selectedTaskId === 'string' ? value.selectedTaskId : undefined,
    selectedSwimlaneId: typeof value.selectedSwimlaneId === 'string' ? value.selectedSwimlaneId : undefined,
    mode: value.mode === 'people' ? 'people' : 'projects',
  };
}

function sanitizeKanbanViewState(value: unknown): KanbanViewState {
  if (!isRecord(value)) return { ...DEFAULT_STATES.kanban };
  return {
    ...DEFAULT_STATES.kanban,
    scrollLeft: Number.isFinite(Number(value.scrollLeft)) ? Number(value.scrollLeft) : DEFAULT_STATES.kanban.scrollLeft,
    scrollTop: Number.isFinite(Number(value.scrollTop)) ? Number(value.scrollTop) : DEFAULT_STATES.kanban.scrollTop,
    selectedTaskId: typeof value.selectedTaskId === 'string' ? value.selectedTaskId : undefined,
    filterStatus: typeof value.filterStatus === 'string' ? value.filterStatus : undefined,
  };
}

function sanitizeRoadmapViewState(value: unknown): RoadmapViewState {
  if (!isRecord(value)) return { ...DEFAULT_STATES.roadmap };
  return {
    ...DEFAULT_STATES.roadmap,
    scrollLeft: Number.isFinite(Number(value.scrollLeft)) ? Number(value.scrollLeft) : DEFAULT_STATES.roadmap.scrollLeft,
    scrollTop: Number.isFinite(Number(value.scrollTop)) ? Number(value.scrollTop) : DEFAULT_STATES.roadmap.scrollTop,
  };
}

function sanitizeLoopsViewState(value: unknown): LoopsViewState {
  if (!isRecord(value)) return { ...DEFAULT_STATES.loops };
  return {
    ...DEFAULT_STATES.loops,
    selectedGoalId: typeof value.selectedGoalId === 'string' ? value.selectedGoalId : undefined,
    zoom: Math.max(0.6, Math.min(1.4, Number(value.zoom) || DEFAULT_STATES.loops.zoom)),
    panX: Number.isFinite(Number(value.panX)) ? Number(value.panX) : 0,
    panY: Number.isFinite(Number(value.panY)) ? Number(value.panY) : 0,
  };
}

export function sanitizeViewStates(value: Partial<Record<ViewType, unknown>> | null | undefined): AllViewStates {
  return {
    timeline: sanitizeTimelineViewState(value?.timeline),
    kanban: sanitizeKanbanViewState(value?.kanban),
    roadmap: sanitizeRoadmapViewState(value?.roadmap),
    loops: sanitizeLoopsViewState(value?.loops),
  };
}

export function sanitizeTimelineLayoutState(value: unknown): TimelineLayoutState {
  if (!isRecord(value)) return { ...DEFAULT_TIMELINE_LAYOUT_STATE };

  const monthWidths = isRecord(value.monthWidths)
    ? Object.fromEntries(
        Object.entries(value.monthWidths).reduce<Array<[string, number]>>((acc, [key, width]) => {
          if (typeof key === 'string' && Number.isFinite(Number(width)) && Number(width) > 0) {
            acc.push([key, Number(width)]);
          }
          return acc;
        }, [])
      )
    : {};

  const rawLeftColWidth = Number(value.leftColWidth);
  const leftColWidth = Number.isFinite(rawLeftColWidth)
    ? Math.max(MIN_TIMELINE_LEFT_COL_WIDTH, Math.min(MAX_TIMELINE_LEFT_COL_WIDTH, rawLeftColWidth))
    : DEFAULT_TIMELINE_LAYOUT_STATE.leftColWidth;

  return {
    leftColWidth,
    monthWidths,
    showCompleted: value.showCompleted === true,
  };
}

export async function loadUiStateSnapshot(
  projects: TimelineSwimlane[],
  people: Person[]
): Promise<UiStateSnapshot> {
  const stored = await getJSONBatch([
    TIMELINE_VIEW_STATE_KEY,
    KANBAN_VIEW_STATE_KEY,
    ROADMAP_VIEW_STATE_KEY,
    LOOPS_VIEW_STATE_KEY,
    TIMELINE_LEFT_COL_WIDTH_KEY,
    TIMELINE_MONTH_WIDTHS_KEY,
    TIMELINE_SHOW_COMPLETED_KEY,
    'omvra.filters.v1',
  ]);
  const timelineState = stored[TIMELINE_VIEW_STATE_KEY] as Record<string, unknown> | null | undefined;
  const kanbanState = stored[KANBAN_VIEW_STATE_KEY] as Record<string, unknown> | null | undefined;
  const roadmapState = stored[ROADMAP_VIEW_STATE_KEY] as Record<string, unknown> | null | undefined;
  const loopsState = stored[LOOPS_VIEW_STATE_KEY] as Record<string, unknown> | null | undefined;
  const leftColWidth = stored[TIMELINE_LEFT_COL_WIDTH_KEY] as number | null | undefined;
  const monthWidths = stored[TIMELINE_MONTH_WIDTHS_KEY] as Record<string, number> | null | undefined;
  const showCompleted = stored[TIMELINE_SHOW_COMPLETED_KEY] as boolean | null | undefined;
  const kanbanFilters = stored['omvra.filters.v1'];

  return {
    viewStates: sanitizeViewStates({
      timeline: timelineState,
      kanban: kanbanState,
      roadmap: roadmapState,
      loops: loopsState,
    }),
    timelineLayout: sanitizeTimelineLayoutState({
      leftColWidth,
      monthWidths,
      showCompleted,
    }),
    kanbanFilters: sanitizeKanbanTaskFilters(kanbanFilters, projects, people),
  };
}

export function persistTimelineLayoutState(layout: TimelineLayoutState): void {
  void persistJSONBatchWithElectronMirror({
    [TIMELINE_LEFT_COL_WIDTH_KEY]: layout.leftColWidth,
    [TIMELINE_MONTH_WIDTHS_KEY]: layout.monthWidths,
    [TIMELINE_SHOW_COMPLETED_KEY]: layout.showCompleted,
  });
}
