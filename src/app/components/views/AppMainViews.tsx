import React, { type RefObject } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Task, TimelineSwimlane, Person, TaskStatus, StatusColumn, ProjectMilestone } from '../../types';
import type { GoalPolicyV1 } from '../../utils/goalPolicy';
import { ViewType } from '../../hooks/useViewState';
import type { KanbanTaskFilters } from '../../utils/taskFilters';
import type { WorkspaceReadModel } from '../../domain/workspaceReadModel';
import type { TimelineLayoutState } from '../../services/uiState';
import { TimelineView } from './TimelineView';
import { KanbanView } from './KanbanView';
import { RoadmapView } from './RoadmapView';
import { GoalsView } from './GoalsView';

export interface AppViewFrameProps {
  timelineContainerRef: RefObject<HTMLDivElement>;
  kanbanContainerRef: RefObject<HTMLDivElement>;
  viewRefreshKey: number;
}

export interface AppViewDataProps {
  tasks: Task[];
  timelineSwimlanes: TimelineSwimlane[];
  people: Person[];
  statusColumns: StatusColumn[];
  milestones: ProjectMilestone[];
  goalPolicy: GoalPolicyV1;
  goalAuditArchiveDirectory: string;
  onGoalAuditArchiveDirectoryChange: (directory: string) => void;
  customScrollbarsEnabled: boolean;
  condensedUI: boolean;
  readModel: WorkspaceReadModel;
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
  data: AppViewDataProps;
  timeline: TimelineViewController;
  kanban: KanbanViewController;
  roadmap: RoadmapViewController;
}

export function AppMainViews({
  currentView,
  frame,
  data,
  timeline,
  kanban,
  roadmap,
}: AppMainViewsProps) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {currentView === 'timeline' && (
        <div key={`timeline-${frame.viewRefreshKey}`} ref={frame.timelineContainerRef} className="h-full w-full">
          <TimelineView
            tasks={data.tasks}
            swimlanes={data.timelineSwimlanes}
            people={data.people}
            statusColumns={data.statusColumns}
            customScrollbarsEnabled={data.customScrollbarsEnabled}
            condensedUI={data.condensedUI}
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
              tasks={data.tasks}
              swimlanes={data.statusColumns}
              projects={data.timelineSwimlanes}
              people={data.people}
              customScrollbarsEnabled={data.customScrollbarsEnabled}
              condensedUI={data.condensedUI}
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
            milestones={data.milestones}
            tasks={data.tasks}
            projects={data.timelineSwimlanes}
            statusColumns={data.statusColumns}
            customScrollbarsEnabled={data.customScrollbarsEnabled}
            condensedUI={data.condensedUI}
            readModel={data.readModel}
            showCompleted={roadmap.showCompleted}
            onAddMilestone={roadmap.onRoadmapAddMilestone}
            onMilestoneClick={roadmap.onRoadmapMilestoneClick}
            onTaskClick={roadmap.onRoadmapTaskClick}
          />
        </div>
      )}

      {currentView === 'loops' && <GoalsView people={data.people} tasks={data.tasks} milestones={data.milestones} projects={data.timelineSwimlanes} workspacePolicy={data.goalPolicy} goalAuditArchiveDirectory={data.goalAuditArchiveDirectory} onGoalAuditArchiveDirectoryChange={data.onGoalAuditArchiveDirectoryChange} />}
    </div>
  );
}
