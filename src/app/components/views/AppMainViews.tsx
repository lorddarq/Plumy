import React, { type RefObject } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Task, TimelineSwimlane, Person, TaskStatus, StatusColumn, ProjectMilestone } from '../../types';
import { ViewType } from '../../hooks/useViewState';
import type { KanbanTaskFilters } from '../../utils/taskFilters';
import type { TimelineLayoutState } from '../../services/uiState';
import { buildWorkspaceReadModel } from '../../domain/workspaceReadModel';
import { useWorkspaceSelector } from '../../store/workspaceStore';
import { areShallowValuesEqual } from '../../store/workspaceSelectors.ts';
import { areAppMainViewsPropsEqual } from './appMainViewsMemo';

const TimelineView = React.lazy(() => import('./TimelineView').then(module => ({ default: module.TimelineView })));
const KanbanView = React.lazy(() => import('./KanbanView').then(module => ({ default: module.KanbanView })));
const RoadmapView = React.lazy(() => import('./RoadmapView').then(module => ({ default: module.RoadmapView })));
const GoalsView = React.lazy(() => import('./GoalsView').then(module => ({ default: module.GoalsView })));

export interface AppViewFrameProps {
  timelineContainerRef: RefObject<HTMLDivElement>;
  kanbanContainerRef: RefObject<HTMLDivElement>;
  viewRefreshKey: number;
}

export interface TimelineViewController {
  timelineInitialScrollLeft: number;
  timelineInitialLayoutState: TimelineLayoutState;
  onTimelineLayoutStateChange: (layout: TimelineLayoutState) => void;
  onTimelineTaskClick: (task: Task) => void;
  onTimelineTaskEdit: (task: Task) => void;
  onTimelineTaskDelete: (taskId: string) => void;
  onTimelineTaskDuplicate: (task: Task) => void;
  onTimelineAddTask: (date: Date, swimlaneId: string, endDate?: Date, mode?: 'projects' | 'people') => void;
  onTimelineUpdateTaskDates: (taskId: string, startDate: string, endDate: string) => void;
  onTimelineEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onTimelineAddSwimlane: () => void;
  onTimelineReorderSwimlanes: (swimlanes: TimelineSwimlane[]) => void;
  onTimelineReorderPeople: (people: Person[]) => void;
  onTimelineReorderTasks: (tasks: Task[]) => void;
  onTimelineScroll: (state: { scrollLeft: number; scrollTop: number }) => void;
}

export interface KanbanViewController {
  kanbanInitialFilters: KanbanTaskFilters;
  kanbanInitialScrollLeft: number;
  kanbanInitialScrollTop: number;
  onKanbanTaskClick: (task: Task) => void;
  onKanbanEditTask: (task: Task) => void;
  onKanbanAddTask: (status: TaskStatus) => void;
  onKanbanMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onKanbanReorderTasks: (tasks: Task[]) => void;
  onKanbanReorderColumns: (fromIndex: number, toIndex: number) => void;
  onKanbanUpdateColumn: (colId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => void;
  onKanbanAddColumn: (col: any) => void;
  onKanbanDeleteColumn: (colId: string) => void;
}

export interface RoadmapViewController {
  showCompleted: boolean;
  onRoadmapAddMilestone: () => void;
  onRoadmapMilestoneClick: (milestone: ProjectMilestone) => void;
  onRoadmapTaskClick: (task: Task) => void;
}

export interface AppMainViewsProps {
  currentView: ViewType;
  frame: AppViewFrameProps;
  timeline: TimelineViewController;
  kanban: KanbanViewController;
  roadmap: RoadmapViewController;
}

export const AppMainViews = React.memo(function AppMainViews({
  currentView,
  frame,
  timeline,
  kanban,
  roadmap,
}: AppMainViewsProps) {
  const {
    tasks,
    timelineSwimlanes,
    people,
    statusColumns,
    milestones,
    goalPolicy,
    goalAuditArchiveDirectory,
    customScrollbarsEnabled,
    condensedUI,
    onGoalAuditArchiveDirectoryChange,
  } = useWorkspaceSelector(state => ({
    tasks: state.tasks,
    timelineSwimlanes: state.timelineSwimlanes,
    people: state.people,
    statusColumns: state.statusColumns,
    milestones: state.milestones,
    goalPolicy: state.goalPolicy,
    goalAuditArchiveDirectory: state.preferences.goalAuditArchiveDirectory,
    customScrollbarsEnabled: state.preferences.customScrollbarsEnabled,
    condensedUI: state.preferences.condensedUI,
    onGoalAuditArchiveDirectoryChange: state.setGoalAuditArchiveDirectory,
  }), areShallowValuesEqual);
  const readModel = React.useMemo(() => buildWorkspaceReadModel({
    tasks,
    milestones,
    projects: timelineSwimlanes,
    people,
    statusColumns,
  }), [milestones, people, statusColumns, tasks, timelineSwimlanes]);

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <React.Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-gray-500" role="status">Loading view...</div>}>
        {currentView === 'timeline' && (
          <div key={`timeline-${frame.viewRefreshKey}`} ref={frame.timelineContainerRef} className="h-full w-full">
            <TimelineView
              tasks={tasks}
              swimlanes={timelineSwimlanes}
              people={people}
              statusColumns={statusColumns}
              customScrollbarsEnabled={customScrollbarsEnabled}
              condensedUI={condensedUI}
              initialScrollLeft={timeline.timelineInitialScrollLeft}
              initialLayoutState={timeline.timelineInitialLayoutState}
              onLayoutStateChange={timeline.onTimelineLayoutStateChange}
              onTaskClick={timeline.onTimelineTaskClick}
              onTaskEdit={timeline.onTimelineTaskEdit}
              onTaskDelete={timeline.onTimelineTaskDelete}
              onTaskDuplicate={timeline.onTimelineTaskDuplicate}
              onAddTask={timeline.onTimelineAddTask}
              onUpdateTaskDates={timeline.onTimelineUpdateTaskDates}
              onEditSwimlane={timeline.onTimelineEditSwimlane}
              onAddSwimlane={timeline.onTimelineAddSwimlane}
              onReorderSwimlanes={timeline.onTimelineReorderSwimlanes}
              onReorderPeople={timeline.onTimelineReorderPeople}
              onReorderTasks={timeline.onTimelineReorderTasks}
              onTimelineScroll={timeline.onTimelineScroll}
            />
          </div>
        )}

        {currentView === 'kanban' && (
          <div key={`kanban-${frame.viewRefreshKey}`} className="flex h-full min-h-0 w-full">
            <DndProvider backend={HTML5Backend}>
              <KanbanView
                tasks={tasks}
                swimlanes={statusColumns}
                projects={timelineSwimlanes}
                people={people}
                customScrollbarsEnabled={customScrollbarsEnabled}
                condensedUI={condensedUI}
                initialFilters={kanban.kanbanInitialFilters}
                scrollContainerRef={frame.kanbanContainerRef}
                initialScrollLeft={kanban.kanbanInitialScrollLeft}
                initialScrollTop={kanban.kanbanInitialScrollTop}
                onTaskClick={kanban.onKanbanTaskClick}
                onEditTask={kanban.onKanbanEditTask}
                onAddTask={kanban.onKanbanAddTask}
                onMoveTask={kanban.onKanbanMoveTask}
                onReorderTasks={kanban.onKanbanReorderTasks}
                onReorderColumns={kanban.onKanbanReorderColumns}
                onUpdateColumn={kanban.onKanbanUpdateColumn}
                onAddColumn={kanban.onKanbanAddColumn}
                onDeleteColumn={kanban.onKanbanDeleteColumn}
              />
            </DndProvider>
          </div>
        )}

        {currentView === 'roadmap' && (
          <div key={`roadmap-${frame.viewRefreshKey}`} className="flex h-full min-h-0 w-full">
            <RoadmapView
              milestones={milestones}
              tasks={tasks}
              projects={timelineSwimlanes}
              statusColumns={statusColumns}
              customScrollbarsEnabled={customScrollbarsEnabled}
              condensedUI={condensedUI}
              readModel={readModel}
              showCompleted={roadmap.showCompleted}
              onAddMilestone={roadmap.onRoadmapAddMilestone}
              onMilestoneClick={roadmap.onRoadmapMilestoneClick}
              onTaskClick={roadmap.onRoadmapTaskClick}
            />
          </div>
        )}

        {currentView === 'loops' && <GoalsView people={people} tasks={tasks} milestones={milestones} projects={timelineSwimlanes} workspacePolicy={goalPolicy} goalAuditArchiveDirectory={goalAuditArchiveDirectory} onGoalAuditArchiveDirectoryChange={onGoalAuditArchiveDirectoryChange} />}
      </React.Suspense>
    </div>
  );
}, areAppMainViewsPropsEqual);
