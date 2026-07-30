import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Filter, Flag, TriangleAlert } from 'lucide-react';
import { ProjectMilestone, StatusColumn, Task, TimelineSwimlane } from '../../types';
import { getProjectVisual } from '../../utils/projectVisual';
import {
  getStatusVisual,
  getMilestoneProjectIds,
  getTasksForMilestone,
  isMilestoneComplete,
  summarizeMilestone,
  type MilestoneHealth,
} from '../../utils/roadmap';
import { parseISODateLocal, toLocalISODate } from '../../utils/date';
import {
  addCalendarDays,
  buildDateRangeFromDates,
  buildDateSequence,
  daysBetweenLocal,
  getMonthKey,
  startOfLocalDay,
} from '../../utils/timeSurface';
import type { WorkspaceReadModel } from '../../domain/workspaceReadModel';
import { getRoadmapStage, getRoadmapStageProgress } from '../../utils/statusColumnSemantics';
import { useFixedTimeSurfaceNavigation } from '../../hooks/useFixedTimeSurfaceNavigation.ts';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyStateCard } from '../EmptyStateCard';
import {
  MilestoneStatusComposition,
} from '../MilestoneSections';
import { RoadmapMilestoneSidebar } from '../RoadmapMilestoneSidebar';
import { RoadmapToolbar, type RoadmapDateWindow } from '../RoadmapToolbar';
import { HorizontalScrollbar } from '../HorizontalScrollbar';

interface RoadmapViewProps {
  milestones: ProjectMilestone[];
  tasks: Task[];
  projects: TimelineSwimlane[];
  statusColumns: StatusColumn[];
  customScrollbarsEnabled?: boolean;
  condensedUI?: boolean;
  readModel?: WorkspaceReadModel;
  showCompleted: boolean;
  onAddMilestone: () => void;
  onMilestoneClick: (milestone: ProjectMilestone) => void;
  onTaskClick: (task: Task) => void;
}

interface RoadmapRow {
  milestone: ProjectMilestone;
  projects: TimelineSwimlane[];
  summary: ReturnType<typeof summarizeMilestone>;
  top: number;
  height: number;
}

const DAY_WIDTH = 52;
const LEFT_WIDTH = 280;
const HEADER_HEIGHT = 82;
const MILESTONE_ROW_HEIGHT = 52;
const TASK_ROW_HEIGHT = 48;
const MILESTONE_ROW_GAP = 0;
const MIN_ROADMAP_ROW_HEIGHT = 132;
const CHART_PADDING_BOTTOM = 24;

function isMilestoneInDateWindow(milestone: ProjectMilestone, dateWindow: RoadmapDateWindow): boolean {
  if (dateWindow === 'all') return true;
  const milestoneEnd = parseISODateLocal(milestone.endDate);
  if (!milestoneEnd) return false;

  const today = startOfLocalDay(new Date());

  if (dateWindow === 'overdue') {
    return milestoneEnd.getTime() < today.getTime();
  }

  const windowEnd = addCalendarDays(today, Number(dateWindow));
  return milestoneEnd.getTime() >= today.getTime() && milestoneEnd.getTime() <= windowEnd.getTime();
}

function getDateRange(milestones: ProjectMilestone[], tasks: Task[]): { start: Date; end: Date } {
  const dates: Date[] = [];

  milestones.forEach(milestone => {
    const start = milestone.startDate ? parseISODateLocal(milestone.startDate) : null;
    const end = parseISODateLocal(milestone.endDate);
    if (start) dates.push(start);
    if (end) dates.push(end);

    getTasksForMilestone(milestone, tasks).forEach(task => {
      const taskStart = task.startDate ? parseISODateLocal(task.startDate) : null;
      const taskEnd = task.endDate ? parseISODateLocal(task.endDate) : null;
      if (taskStart) dates.push(taskStart);
      if (taskEnd) dates.push(taskEnd);
    });
  });

  return buildDateRangeFromDates(dates, {
    includeToday: true,
    padStartDays: 7,
    padEndDays: 14,
    fallbackStartOffsetDays: -7,
    fallbackEndOffsetDays: 90,
  });
}

function getTaskLeft(task: Task, timelineStart: Date): number {
  const taskStart = task.startDate ? parseISODateLocal(task.startDate) : null;
  return Math.max(0, daysBetweenLocal(timelineStart, taskStart || timelineStart) * DAY_WIDTH);
}

function getTaskWidth(task: Task): number {
  const taskStart = task.startDate ? parseISODateLocal(task.startDate) : null;
  const taskEnd = task.endDate ? parseISODateLocal(task.endDate) : taskStart;
  if (!taskStart || !taskEnd) return DAY_WIDTH * 2;
  return Math.max(DAY_WIDTH * 1.5, (daysBetweenLocal(taskStart, taskEnd) + 1) * DAY_WIDTH);
}

function sortRoadmapTasks(tasks: Task[]): Task[] {
  const sortedByDate = [...tasks].sort((a, b) => {
    const dateCompare = (a.startDate || '').localeCompare(b.startDate || '');
    if (dateCompare !== 0) return dateCompare;
    return a.title.localeCompare(b.title);
  });
  const taskById = new Map(sortedByDate.map(task => [task.id, task]));
  const visitedTaskIds = new Set<string>();
  const visitingTaskIds = new Set<string>();
  const orderedTasks: Task[] = [];

  const visit = (task: Task) => {
    if (visitedTaskIds.has(task.id)) return;
    if (visitingTaskIds.has(task.id)) {
      orderedTasks.push(task);
      visitedTaskIds.add(task.id);
      return;
    }

    visitingTaskIds.add(task.id);
    (task.dependencyIds || []).forEach(dependencyId => {
      const dependencyTask = taskById.get(dependencyId);
      if (dependencyTask) visit(dependencyTask);
    });
    visitingTaskIds.delete(task.id);

    if (!visitedTaskIds.has(task.id)) {
      visitedTaskIds.add(task.id);
      orderedTasks.push(task);
    }
  };

  sortedByDate.forEach(visit);
  return orderedTasks;
}

function getRoadmapRowHeight(taskCount: number): number {
  return Math.max(
    MIN_ROADMAP_ROW_HEIGHT,
    MILESTONE_ROW_HEIGHT + Math.max(1, taskCount) * TASK_ROW_HEIGHT + MILESTONE_ROW_GAP
  );
}

export function RoadmapView({
  milestones,
  tasks,
  projects,
  statusColumns,
  customScrollbarsEnabled = true,
  condensedUI = false,
  readModel,
  showCompleted,
  onAddMilestone,
  onMilestoneClick,
  onTaskClick,
}: RoadmapViewProps) {
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState<MilestoneHealth | 'all'>('all');
  const [dateWindow, setDateWindow] = useState<RoadmapDateWindow>('all');
  const [chartViewportHeight, setChartViewportHeight] = useState(0);
  const enrichedMilestoneById = readModel?.milestonesById;

  const filteredMilestones = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return milestones
      .filter(milestone => showCompleted || !isMilestoneComplete(milestone, tasks, statusColumns))
      .filter(milestone => {
        if (!normalizedSearch) return true;
        const enrichedMilestone = enrichedMilestoneById?.get(milestone.id);
        const milestoneProjects = enrichedMilestone?.projects
          ?? projects.filter(project => getMilestoneProjectIds(milestone).includes(project.id));
        const summary = enrichedMilestone?.summary ?? summarizeMilestone(milestone, tasks, statusColumns);
        const searchableText = [
          milestone.title,
          milestone.notes,
          ...milestoneProjects.map(project => project.name),
          ...summary.linkedTasks.map(task => `${task.title} ${task.notes || ''}`),
        ].join(' ').toLowerCase();
        return searchableText.includes(normalizedSearch);
      })
      .filter(milestone => {
        if (projectFilter === 'all') return true;
        const enrichedMilestone = enrichedMilestoneById?.get(milestone.id);
        return enrichedMilestone
          ? enrichedMilestone.projects.some(project => project.id === projectFilter)
          : getMilestoneProjectIds(milestone).includes(projectFilter);
      })
      .filter(milestone => {
        const summary = enrichedMilestoneById?.get(milestone.id)?.summary ?? summarizeMilestone(milestone, tasks, statusColumns);
        return healthFilter === 'all' || summary.health === healthFilter;
      })
      .filter(milestone => isMilestoneInDateWindow(milestone, dateWindow))
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
  }, [dateWindow, enrichedMilestoneById, healthFilter, milestones, projectFilter, projects, searchQuery, showCompleted, statusColumns, tasks]);

  const hasActiveFilters = searchQuery.trim() !== '' || projectFilter !== 'all' || healthFilter !== 'all' || dateWindow !== 'all';
  const range = useMemo(() => getDateRange(filteredMilestones, tasks), [filteredMilestones, tasks]);
  const allDates = useMemo(() => buildDateSequence(range), [range]);
  const monthGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; startIndex: number; days: number }> = [];
    allDates.forEach((date, index) => {
      const key = getMonthKey(date);
      const existing = groups[groups.length - 1];
      if (existing?.key === key) {
        existing.days += 1;
        return;
      }
      groups.push({
        key,
        label: date.toLocaleString(undefined, { month: 'long' }),
        startIndex: index,
        days: 1,
      });
    });
    return groups;
  }, [allDates]);
  const rowSummaries = useMemo(() => {
    return filteredMilestones.map(milestone => {
      const enrichedMilestone = enrichedMilestoneById?.get(milestone.id);
      const summary = enrichedMilestone?.summary ?? summarizeMilestone(milestone, tasks, statusColumns);
      return {
        milestone,
        projects: enrichedMilestone?.projects
          ?? projects.filter(project => getMilestoneProjectIds(milestone).includes(project.id)),
        summary,
      };
    });
  }, [enrichedMilestoneById, filteredMilestones, projects, statusColumns, tasks]);
  const rows = useMemo<RoadmapRow[]>(() => {
    const availableRowsHeight = Math.max(0, chartViewportHeight - HEADER_HEIGHT);
    const baseHeights = rowSummaries.map(row => getRoadmapRowHeight(row.summary.linkedTasks.length));
    const totalBaseHeight = baseHeights.reduce((total, height) => total + height, 0);
    const extraHeightPerRow = rowSummaries.length > 0 && totalBaseHeight < availableRowsHeight
      ? (availableRowsHeight - totalBaseHeight) / rowSummaries.length
      : 0;
    let top = HEADER_HEIGHT;

    return rowSummaries.map((row, index) => {
      const height = baseHeights[index] + extraHeightPerRow;
      const positionedRow = {
        ...row,
        top,
        height,
      };
      top += height;
      return positionedRow;
    });
  }, [chartViewportHeight, rowSummaries]);
  const timelineWidth = allDates.length * DAY_WIDTH;
  const chartContentHeight = rows.length === 0
    ? 360
    : rows[rows.length - 1].top + rows[rows.length - 1].height;
  const chartHeight = rows.length === 0
    ? 360
    : Math.max(
        chartViewportHeight,
        chartContentHeight + (chartContentHeight > chartViewportHeight ? CHART_PADDING_BOTTOM : 0)
      );
  const navigation = useFixedTimeSurfaceNavigation({
    scrollRef: chartScrollRef,
    rangeStart: range.start,
    dayCount: allDates.length,
    dayWidth: DAY_WIDTH,
    autoScrollKey: `${toLocalISODate(range.start)}:${toLocalISODate(range.end)}:${timelineWidth}`,
  });
  const todayIndex = navigation.todayMarker?.index ?? -1;
  const todayLeft = navigation.todayMarker?.center ?? null;

  const resetFilters = () => {
    setSearchQuery('');
    setProjectFilter('all');
    setHealthFilter('all');
    setDateWindow('all');
  };

  useLayoutEffect(() => {
    const viewportNode = chartViewportRef.current;
    if (!viewportNode) return;

    const updateViewportHeight = () => {
      setChartViewportHeight(viewportNode.clientHeight);
    };
    updateViewportHeight();

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(viewportNode);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-gray-50">
      <RoadmapToolbar
        searchQuery={searchQuery}
        projectFilter={projectFilter}
        healthFilter={healthFilter}
        dateWindow={dateWindow}
        condensedUI={condensedUI}
        hasActiveFilters={hasActiveFilters}
        projects={projects}
        showTimelineNavigation={todayLeft !== null}
        onSearchQueryChange={setSearchQuery}
        onProjectFilterChange={setProjectFilter}
        onHealthFilterChange={setHealthFilter}
        onDateWindowChange={setDateWindow}
        onResetFilters={resetFilters}
        onAddMilestone={onAddMilestone}
        onScrollTimelineLeft={navigation.scrollLeftByStep}
        onScrollTimelineRight={navigation.scrollRightByStep}
        onScrollToToday={() => {
          navigation.scrollToToday();
        }}
      />

      <div className="min-h-0 flex-1 overflow-hidden">

        {milestones.length === 0 ? (
          <EmptyStateCard
            icon={<Flag className="size-5" />}
            title="No roadmap milestones yet"
            description="Create a milestone to group task work around a project delivery point, then track composition and date risk here."
            action={<Button onClick={onAddMilestone}>Create first milestone</Button>}
          />
        ) : filteredMilestones.length === 0 ? (
          <EmptyStateCard
            icon={<Filter className="size-5" />}
            title="No milestones match these filters or visibility settings"
            description="Adjust the roadmap filters or enable completed work in Settings to bring milestones back into view."
            action={<Button onClick={resetFilters} variant="outline">Reset filters</Button>}
          />
        ) : (
          <section className="flex h-full min-h-0 flex-col overflow-hidden border-t border-gray-200 bg-white">
            <div ref={chartViewportRef} className="relative min-h-0 flex-1 overflow-hidden">
              <RoadmapMilestoneSidebar
                rows={rows}
                leftWidth={LEFT_WIDTH}
                headerHeight={HEADER_HEIGHT}
                chartHeight={chartHeight}
                chartScrollTop={navigation.scrollTop}
                statusColumns={statusColumns}
                onAddMilestone={onAddMilestone}
                onMilestoneClick={onMilestoneClick}
                renderRollupBar={summary => (
                  <MilestoneStatusComposition
                    counts={summary.counts}
                    totalTasks={summary.totalTasks}
                    statusColumns={statusColumns}
                  />
                )}
              />
              <div
                className={`absolute inset-x-0 top-0 z-50 h-[82px] select-none border-b border-gray-200 bg-white ${
                  navigation.isHeaderScrubbing ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                onMouseDown={navigation.handleHeaderScrubStart}
              >
                <div
                  className="absolute top-0"
                  style={{
                    left: LEFT_WIDTH,
                    width: timelineWidth,
                    height: HEADER_HEIGHT,
                    transform: `translate3d(${-navigation.scrollLeft}px, 0, 0)`,
                  }}
                >
                  {monthGroups.map(month => (
                    <div
                      key={month.key}
                      className="absolute top-0 flex h-10 items-center border-r border-gray-100 px-3 text-sm font-semibold text-gray-900"
                      style={{
                        left: month.startIndex * DAY_WIDTH,
                        width: month.days * DAY_WIDTH,
                      }}
                    >
                      {month.label}
                    </div>
                  ))}
                  {allDates.map((date, index) => {
                    const isToday = todayLeft !== null && index === todayIndex;
                    return (
                      <div
                        key={date.toISOString()}
                        className="absolute top-10 flex h-10 items-center justify-center border-r border-gray-100 text-xs text-gray-500"
                        style={{ left: index * DAY_WIDTH, width: DAY_WIDTH }}
                      >
                        <span className={isToday ? 'rounded-md bg-gray-900 px-2 py-1 font-medium text-white' : ''}>
                          {String(date.getDate()).padStart(2, '0')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div ref={chartScrollRef} className={`${customScrollbarsEnabled ? 'roadmap-native-horizontal-scrollbar-hidden ' : ''}absolute bottom-0 right-0 top-0 overflow-auto`} style={{ left: LEFT_WIDTH }} onScroll={navigation.handleScroll}>
                <div
                  className="relative"
                  style={{
                    width: timelineWidth,
                    height: chartHeight,
                  }}
                >
                <div
                  className="absolute"
                  style={{ left: 0, top: HEADER_HEIGHT, width: timelineWidth, height: chartHeight - HEADER_HEIGHT }}
                >
                  {allDates.map((date, index) => (
                    <div
                      key={date.toISOString()}
                      className={date.getDay() === 0 || date.getDay() === 6 ? 'absolute top-0 h-full bg-gray-50' : 'absolute top-0 h-full border-r border-gray-100'}
                      style={{ left: index * DAY_WIDTH, width: DAY_WIDTH }}
                    />
                  ))}
                </div>

                {todayLeft !== null && (
                  <div
                    className="absolute z-10 w-px bg-gray-900"
                    style={{ left: todayLeft, top: HEADER_HEIGHT, height: chartHeight - HEADER_HEIGHT }}
                  >
                    <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-gray-900" />
                  </div>
                )}

                <svg
                  className="pointer-events-none absolute z-10"
                  style={{ left: 0, top: HEADER_HEIGHT, width: timelineWidth, height: chartHeight - HEADER_HEIGHT }}
                >
                  <defs>
                    <marker id="roadmap-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 Z" fill="#4b5563" />
                    </marker>
                  </defs>
                  {rows.flatMap(row => {
                    const sortedTasks = sortRoadmapTasks(row.summary.linkedTasks);
                    const taskById = new Map(sortedTasks.map(task => [task.id, task]));
                    const taskIndexById = new Map(sortedTasks.map((task, index) => [task.id, index]));
                    return sortedTasks.flatMap(task =>
                      (task.dependencyIds || [])
                        .filter(dependencyId => taskById.has(dependencyId))
                        .map(dependencyId => {
                      const dependencyTask = taskById.get(dependencyId) as Task;
                      const dependencyIndex = taskIndexById.get(dependencyId) || 0;
                      const taskIndex = taskIndexById.get(task.id) || 0;
                      const fromX = getTaskLeft(dependencyTask, range.start) + getTaskWidth(dependencyTask);
                      const toX = getTaskLeft(task, range.start);
                      const fromY = row.top - HEADER_HEIGHT + MILESTONE_ROW_HEIGHT + dependencyIndex * TASK_ROW_HEIGHT + 23;
                      const toY = row.top - HEADER_HEIGHT + MILESTONE_ROW_HEIGHT + taskIndex * TASK_ROW_HEIGHT + 23;
                      const elbowX = Math.max(fromX + 12, Math.min(toX - 12, fromX + 36));
                      return (
                        <path
                          key={`${row.milestone.id}-${dependencyId}-${task.id}`}
                          d={`M ${fromX} ${fromY} H ${elbowX} V ${toY} H ${toX - 8}`}
                          fill="none"
                          stroke="#4b5563"
                          strokeWidth="1.5"
                          markerEnd="url(#roadmap-arrow)"
                        />
                      );
                        })
                    );
                  })}
                </svg>

                {rows.map(row => {
                  const milestoneLeft = daysBetweenLocal(range.start, parseISODateLocal(row.milestone.endDate) || range.start) * DAY_WIDTH + DAY_WIDTH / 2;
                  const lateTaskIds = new Set(row.summary.lateTasks.map(task => task.id));
                  const sortedTasks = sortRoadmapTasks(row.summary.linkedTasks);
                  const milestoneProjectVisual = getProjectVisual(row.projects[0], {
                    explicitColor: row.milestone.color,
                  });

                  return (
                    <div key={row.milestone.id}>
                      <div
                        className="absolute border-t border-gray-200"
                        style={{ left: 0, top: row.top, width: timelineWidth, height: row.height }}
                      >
                        <button
                          type="button"
                          onClick={() => onMilestoneClick(row.milestone)}
                          className="absolute top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
                          style={{ left: milestoneLeft }}
                        >
                          <span className="size-2 rotate-45" style={milestoneProjectVisual.markerStyle} />
                          {row.milestone.title}
                        </button>

                        {sortedTasks.length === 0 ? (
                          <div className="absolute left-4 right-4 top-[64px]">
                            <EmptyStateCard
                              compact
                              icon={<Flag className="size-4" />}
                              title="No linked tasks yet"
                              description="Link tasks to this milestone to show delivery progress and dependency context."
                            />
                          </div>
                        ) : sortedTasks.map((task, index) => {
                          const left = getTaskLeft(task, range.start);
                          const width = getTaskWidth(task);
                          const isLate = lateTaskIds.has(task.id);
                          const statusVisual = getStatusVisual(statusColumns, task.status);
                          const roadmapProgress = getRoadmapStageProgress(getRoadmapStage(statusColumns, task.status));
                          return (
                            <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => onTaskClick(task)}
                                  className={`absolute z-20 flex h-8 items-center overflow-hidden rounded-md border bg-white text-left text-sm shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 ${
                                isLate ? 'border-red-300' : 'border-gray-300'
                                  }`}
                                  style={{
                                    left,
                                    top: MILESTONE_ROW_HEIGHT + index * TASK_ROW_HEIGHT + 9,
                                    width,
                                  }}
                                  title={`${task.title} - ${statusVisual.label}`}
                                >
                              <span
                                className={`absolute inset-y-0 left-0 opacity-45 ${statusVisual.backgroundClassName || ''}`}
                                style={{
                                  ...statusVisual.backgroundStyle,
                                  width: `${roadmapProgress}%`,
                                }}
                                aria-hidden="true"
                              />
                              <span className="relative z-10 truncate px-3 text-gray-900">{task.title}</span>
                              {isLate && (
                                <span className="relative z-10 ml-auto pr-2 text-red-700">
                                  <TriangleAlert className="size-3.5" />
                                </span>
                              )}
                                </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
            <HorizontalScrollbar
              scrollContainerRef={chartScrollRef}
              ariaLabel="Milestone timeline horizontal scroll"
              enabled={customScrollbarsEnabled}
            />
          </section>
        )}
      </div>
    </div>
  );
}
