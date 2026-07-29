import { Fragment, useRef, useState, type RefObject } from 'react';
import { useDragLayer, useDrop } from 'react-dnd';
import { GripVertical } from 'lucide-react';
import { Person, Task, TaskStatus, StatusColumn } from '../types';
import { getStatusVisual } from '../utils/roadmap';
import {
  DraggableTaskCard,
  TASK_ITEM_TYPE,
  type TaskDragItem,
  type TaskDropIndicator,
} from '../components/DraggableTaskCard';
import { ColumnDialog } from '../components/dialogs/ColumnDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface DroppableColumnProps {
  swimlane: StatusColumn;
  tasks: Task[];
  swimlanes: StatusColumn[];
  people: Person[];
  columnDragHandleRef?: RefObject<HTMLButtonElement | null>;
  onTaskClick: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onDropTask: (draggedTask: Task, targetStatus: TaskStatus, targetIndex: number) => void;
  onUpdateColumn?: (colId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => void;
  onDeleteColumn?: (colId: string) => void;
}

function TaskInsertionMarker({
  indicator,
  onTaskDrop,
  onTaskDropIndicatorClear,
}: {
  indicator: TaskDropIndicator;
  onTaskDrop: (draggedTask: Task, targetStatus: TaskStatus, indicator: TaskDropIndicator) => void;
  onTaskDropIndicatorClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [, drop] = useDrop({
    accept: TASK_ITEM_TYPE,
    drop: (item: TaskDragItem) => {
      onTaskDrop(item.task, indicator.status, indicator);
      onTaskDropIndicatorClear();
    },
  });

  drop(ref);

  return (
    <div
      ref={ref}
      className="reserved-slot reserved-slot--interactive reserved-slot--kanban-task"
      style={{ height: `${indicator.draggedSize?.height ?? 92}px` }}
      aria-hidden="true"
    />
  );
}

interface KanbanColumnHeaderProps {
  swimlane: StatusColumn;
  accentClassName?: string;
  accentStyle?: React.CSSProperties;
  taskCount: number;
  columnDragHandleRef?: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
}

function KanbanColumnHeader({
  swimlane,
  accentClassName,
  accentStyle,
  taskCount,
  columnDragHandleRef,
  onEdit,
}: KanbanColumnHeaderProps) {
  return (
    <div className="kanban-column-header-ui">
      {columnDragHandleRef && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button ref={columnDragHandleRef} type="button" className="kanban-column-drag-handle" aria-label={`Drag ${swimlane.title || 'column'} column`}>
              <GripVertical className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Drag to reorder column</TooltipContent>
        </Tooltip>
      )}
      <div className={`kanban-column-accent ${accentClassName || ''}`} style={accentStyle} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="kanban-column-title-row">
          <span className="kanban-column-title-text">{swimlane.title}</span>
          <span className="kanban-column-count-pill">{taskCount}</span>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="kanban-column-edit-control" onClick={onEdit} aria-label={`Edit ${swimlane.title} column`} type="button">
            Edit
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Edit {swimlane.title} column</TooltipContent>
      </Tooltip>
    </div>
  );
}

interface KanbanAddTaskRowProps {
  onAddTask: () => void;
}

function KanbanAddTaskRow({ onAddTask }: KanbanAddTaskRowProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button onClick={onAddTask} className="kanban-add-task-row" type="button">
          <span>Add Task</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Add task to this column</TooltipContent>
    </Tooltip>
  );
}

export function DroppableColumn({
  swimlane,
  tasks: swimlaneTasks,
  swimlanes,
  people,
  columnDragHandleRef,
  onTaskClick,
  onEditTask,
  onAddTask,
  onMoveTask,
  onDropTask,
  onUpdateColumn,
  onDeleteColumn,
}: DroppableColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [taskDropIndicator, setTaskDropIndicator] = useState<TaskDropIndicator | null>(null);
  const isTaskDragging = useDragLayer((monitor) => (
    monitor.isDragging() && monitor.getItemType() === TASK_ITEM_TYPE
  ));
  const visibleTaskDropIndicator = isTaskDragging ? taskDropIndicator : null;

  const getDropIndex = (indicator: TaskDropIndicator): number => {
    const targetIndex = swimlaneTasks.findIndex(task => task.id === indicator.targetTaskId);
    if (targetIndex < 0) return swimlaneTasks.length;
    return indicator.position === 'before' ? targetIndex : targetIndex + 1;
  };

  const handleTaskDrop = (draggedTask: Task, targetStatus: TaskStatus, fallbackIndicator: TaskDropIndicator) => {
    const indicator = taskDropIndicator?.status === targetStatus ? taskDropIndicator : fallbackIndicator;
    let insertionIndex = getDropIndex(indicator);
    const dragIndex = swimlaneTasks.findIndex(task => task.id === draggedTask.id);
    if (draggedTask.status === targetStatus && dragIndex >= 0 && dragIndex < insertionIndex) {
      insertionIndex -= 1;
    }

    onDropTask(draggedTask, targetStatus, insertionIndex);
  };

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: TASK_ITEM_TYPE,
    drop: (item: TaskDragItem, monitor) => {
      if (monitor.didDrop()) return;

      onDropTask(item.task, swimlane.id as TaskStatus, swimlaneTasks.length);
      setTaskDropIndicator(null);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  drop(ref);

  // Column dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSaveColumn = (updates: Omit<StatusColumn, 'id'>) => onUpdateColumn?.(swimlane.id, updates);

  const handleDeleteColumn = () => {
    if (onDeleteColumn) onDeleteColumn(swimlane.id);
  };
  const statusVisual = getStatusVisual(swimlanes, swimlane.id);
  const accentStyle = statusVisual.backgroundStyle
    ? { '--kanban-column-accent': statusVisual.color } as React.CSSProperties
    : undefined;

  return (
    <div
      className="kanban-column-shell"
      style={accentStyle}
    >
      <KanbanColumnHeader
        swimlane={swimlane}
        accentClassName={statusVisual.backgroundClassName}
        accentStyle={accentStyle}
        taskCount={swimlaneTasks.length}
        columnDragHandleRef={columnDragHandleRef}
        onEdit={() => setIsDialogOpen(true)}
      />

      {/* Column Dialog */}
      <ColumnDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSaveColumn}
        onDelete={onDeleteColumn ? handleDeleteColumn : undefined}
        column={swimlane}
      />

      {/* Task cards */}
      <div
        ref={ref}
        className={`kanban-column-task-list ${isOver && canDrop ? 'is-over' : ''}`}
      >
        <KanbanAddTaskRow onAddTask={() => onAddTask(swimlane.id as TaskStatus)} />

        {swimlaneTasks.map((task, index) => (
          <Fragment key={task.id}>
            {visibleTaskDropIndicator?.targetTaskId === task.id && visibleTaskDropIndicator.position === 'before' && (
              <TaskInsertionMarker
                indicator={visibleTaskDropIndicator}
                onTaskDrop={handleTaskDrop}
                onTaskDropIndicatorClear={() => setTaskDropIndicator(null)}
              />
            )}
            <DraggableTaskCard
              task={task}
              index={index}
              onTaskClick={onTaskClick}
              onEditTask={onEditTask}
              onMoveTask={onMoveTask}
              onTaskDropIndicatorChange={setTaskDropIndicator}
              onTaskDropIndicatorClear={() => setTaskDropIndicator(null)}
              onTaskDrop={handleTaskDrop}
              swimlanes={swimlanes}
              people={people}
            />
            {visibleTaskDropIndicator?.targetTaskId === task.id && visibleTaskDropIndicator.position === 'after' && (
              <TaskInsertionMarker
                indicator={visibleTaskDropIndicator}
                onTaskDrop={handleTaskDrop}
                onTaskDropIndicatorClear={() => setTaskDropIndicator(null)}
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
