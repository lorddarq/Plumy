import { Fragment, useRef, useState } from 'react';
import { useDrag, useDragLayer, useDrop } from 'react-dnd';
import { Person, Task, TaskStatus, StatusColumn } from '../../types';
import { EmptyStateCard } from '../EmptyStateCard';
import { DroppableColumn } from '../DroppableColumn';

const SWIMLANE_COLUMN = 'SWIMLANE_COLUMN';
const COLUMN_REORDER_EDGE_RATIO = 0.25;

interface ColumnDragItem {
  id: string;
  index: number;
}

interface ColumnDropIndicator {
  targetId: string;
  position: 'before' | 'after';
}

function ColumnInsertionMarker({
  indicator,
  onColumnDragHover,
  onColumnDrop,
  onColumnDropIndicatorClear,
}: {
  indicator: ColumnDropIndicator;
  onColumnDragHover?: (clientX: number) => void;
  onColumnDrop: (draggedId: string, indicator: ColumnDropIndicator) => void;
  onColumnDropIndicatorClear: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [, drop] = useDrop({
    accept: SWIMLANE_COLUMN,
    hover: (_item: ColumnDragItem, monitor) => {
      const clientOffset = monitor.getClientOffset();
      if (clientOffset) {
        onColumnDragHover?.(clientOffset.x);
      }
    },
    drop: (item: ColumnDragItem) => {
      onColumnDrop(item.id, indicator);
      onColumnDropIndicatorClear();
    },
  });

  drop(ref);

  return (
    <div
      ref={ref}
      className="reserved-slot reserved-slot--interactive reserved-slot--kanban-column"
      aria-hidden="true"
    />
  );
}

// Small component to encapsulate per-column hooks safely (prevents hook-order mismatches)
function ColumnDraggable<T extends { id: string; title?: string; color?: string }>({
  swimlane,
  index,
  swimlaneTasks,
  swimlanes,
  people,
  onTaskClick,
  onEditTask,
  onAddTask,
  onMoveTask,
  onDropTask,
  onUpdateColumn,
  onDeleteColumn,
  onReorderColumns,
  onColumnDragHover,
  onColumnDropIndicatorChange,
  onColumnDropIndicatorClear,
  onColumnDrop,
}: {
  swimlane: T;
  index: number;
  swimlaneTasks: Task[];
  swimlanes: StatusColumn[];
  people: Person[];
  onTaskClick: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onDropTask: (draggedTask: Task, targetStatus: TaskStatus, targetIndex: number) => void;
  onUpdateColumn?: (colId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => void;
  onDeleteColumn?: (colId: string) => void;
  onReorderColumns?: (fromIndex: number, toIndex: number) => void;
  onColumnDragHover?: (clientX: number) => void;
  onColumnDropIndicatorChange: (indicator: ColumnDropIndicator) => void;
  onColumnDropIndicatorClear: () => void;
  onColumnDrop: (draggedId: string, indicator: ColumnDropIndicator) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const [{ isDragging }, drag, preview] = useDrag({
    type: SWIMLANE_COLUMN,
    item: () => {
      onColumnDropIndicatorClear();
      return { id: swimlane.id, index };
    },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: () => {
      onColumnDropIndicatorClear();
    },
  });

  const [, drop] = useDrop({
    accept: SWIMLANE_COLUMN,
    hover: (item: ColumnDragItem, monitor) => {
      const clientOffset = monitor.getClientOffset();
      if (clientOffset) {
        onColumnDragHover?.(clientOffset.x);
      }

      const dragIndex = swimlanes.findIndex(column => column.id === item.id);
      const resolvedDragIndex = dragIndex >= 0 ? dragIndex : item.index;
      if (resolvedDragIndex === index) return;
      if (!ref.current) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      if (!clientOffset) return;

      const hoverClientX = clientOffset.x - hoverBoundingRect.left;
      const columnWidth = hoverBoundingRect.right - hoverBoundingRect.left;
      const forwardTriggerX = columnWidth * COLUMN_REORDER_EDGE_RATIO;
      const backwardTriggerX = columnWidth * (1 - COLUMN_REORDER_EDGE_RATIO);
      const isMovingForward = resolvedDragIndex < index;

      onColumnDropIndicatorChange({
        targetId: swimlane.id,
        position: isMovingForward ? 'after' : 'before',
      });

      if (isMovingForward && hoverClientX < forwardTriggerX) return;
      if (!isMovingForward && hoverClientX > backwardTriggerX) return;

      onReorderColumns && onReorderColumns(resolvedDragIndex, index);
      item.index = index;
    },
    drop: (item: ColumnDragItem, monitor) => {
      const clientOffset = monitor.getClientOffset();
      if (ref.current && clientOffset) {
        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const dragIndex = swimlanes.findIndex(column => column.id === item.id);
        const targetIndex = swimlanes.findIndex(column => column.id === swimlane.id);
        const hoverClientX = clientOffset.x - hoverBoundingRect.left;
        const isMovingForward = dragIndex < targetIndex;
        const fallbackIndicator = {
          targetId: swimlane.id,
          position: isMovingForward || hoverClientX > hoverBoundingRect.width / 2 ? 'after' : 'before',
        } satisfies ColumnDropIndicator;

        onColumnDrop(item.id, fallbackIndicator);
      }

      onColumnDropIndicatorClear();
    },
  });

  drag(dragHandleRef);
  preview(drop(ref));

  return (
    <div
      key={swimlane.id}
      ref={ref}
      data-kanban-column-id={swimlane.id}
      className={`kanban-column-frame ${
        isDragging ? 'is-dragging' : ''
      }`}
    >
      <DroppableColumn
        swimlane={swimlane as any}
        tasks={swimlaneTasks}
        swimlanes={swimlanes}
        people={people}
        columnDragHandleRef={dragHandleRef}
        onTaskClick={onTaskClick}
        onEditTask={onEditTask}
        onAddTask={onAddTask}
        onMoveTask={onMoveTask}
        onDropTask={onDropTask}
        onUpdateColumn={onUpdateColumn}
        onDeleteColumn={onDeleteColumn}
      />
    </div>
  );
}

interface SwimlanesViewProps {
  tasks: Task[];
  swimlanes: StatusColumn[];
  people: Person[];
  isFilterActive?: boolean;
  onTaskClick: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTasks: (tasks: Task[]) => void;
  onReorderColumns?: (fromIndex: number, toIndex: number) => void;
  onUpdateColumn?: (colId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => void;
  onAddColumn?: (col: { id?: string; title: string; color?: string }) => void;
  onDeleteColumn?: (colId: string) => void;
  onColumnDragHover?: (clientX: number) => void;
}
export function SwimlanesView({
  tasks,
  swimlanes,
  people,
  isFilterActive = false,
  onTaskClick,
  onEditTask,
  onAddTask,
  onMoveTask,
  onReorderTasks,
  onReorderColumns,
  onUpdateColumn,
  onAddColumn,
  onDeleteColumn,
  onColumnDragHover,
}: SwimlanesViewProps) {
  const [columnDropIndicator, setColumnDropIndicator] = useState<ColumnDropIndicator | null>(null);
  const isColumnDragging = useDragLayer((monitor) => (
    monitor.isDragging() && monitor.getItemType() === SWIMLANE_COLUMN
  ));
  const visibleColumnDropIndicator = isColumnDragging ? columnDropIndicator : null;

  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  const handleDropTask = (draggedTask: Task, targetStatus: TaskStatus, targetIndex: number) => {
    if (isFilterActive) {
      onMoveTask(draggedTask.id, targetStatus);
      return;
    }

    const targetTasksWithoutDragged = tasks.filter(task => (
      task.status === targetStatus && task.id !== draggedTask.id
    ));
    const insertionIndex = Math.max(0, Math.min(targetIndex, targetTasksWithoutDragged.length));
    const movedTask = { ...draggedTask, status: targetStatus };
    const reorderedTargetTasks = [...targetTasksWithoutDragged];
    reorderedTargetTasks.splice(insertionIndex, 0, movedTask);

    const otherTasks = tasks.filter(task => task.status !== targetStatus && task.id !== draggedTask.id);
    onReorderTasks([...otherTasks, ...reorderedTargetTasks]);
  };

  const handleColumnDrop = (draggedId: string, fallbackIndicator: ColumnDropIndicator) => {
    if (!onReorderColumns) return;

    const indicator = columnDropIndicator ?? fallbackIndicator;
    const dragIndex = cols.findIndex(column => column.id === draggedId);
    const targetIndex = cols.findIndex(column => column.id === indicator.targetId);
    if (dragIndex < 0 || targetIndex < 0) return;

    let insertionIndex = indicator.position === 'before' ? targetIndex : targetIndex + 1;
    if (dragIndex < insertionIndex) {
      insertionIndex -= 1;
    }

    const toIndex = Math.max(0, Math.min(cols.length - 1, insertionIndex));
    if (dragIndex !== toIndex) {
      onReorderColumns(dragIndex, toIndex);
    }
  };

  // Defensive: ensure we have an array to map over
  const cols = Array.isArray(swimlanes) ? swimlanes : [];
  if (!Array.isArray(swimlanes)) {
    // eslint-disable-next-line no-console
    console.warn('[SwimlanesView] expected `swimlanes` array but got:', swimlanes);
  }

  return (
      <div className="kanban-board-surface">
        {isFilterActive && tasks.length === 0 && (
          <div className="p-6">
            <EmptyStateCard
              compact
              title="No tasks match the current filters"
              description="Clear or adjust the active filters to bring matching Kanban work back into view."
            />
          </div>
        )}
        <div className="kanban-columns-track">
        {cols.map((swimlane, index) => {
            const swimlaneTasks = getTasksByStatus(swimlane.id);
            return (
              <Fragment key={swimlane.id}>
                {visibleColumnDropIndicator?.targetId === swimlane.id && visibleColumnDropIndicator.position === 'before' && (
                  <ColumnInsertionMarker
                    indicator={visibleColumnDropIndicator}
                    onColumnDragHover={onColumnDragHover}
                    onColumnDrop={handleColumnDrop}
                    onColumnDropIndicatorClear={() => setColumnDropIndicator(null)}
                  />
                )}
                <ColumnDraggable
                  swimlane={swimlane}
                  index={index}
                  swimlaneTasks={swimlaneTasks}
                  swimlanes={swimlanes}
                  people={people}
                  onTaskClick={onTaskClick}
                  onEditTask={onEditTask}
                  onAddTask={onAddTask}
                  onMoveTask={onMoveTask}
                  onDropTask={handleDropTask}
                  onUpdateColumn={onUpdateColumn}
                  onDeleteColumn={onDeleteColumn}
                  onReorderColumns={onReorderColumns}
                  onColumnDragHover={onColumnDragHover}
                  onColumnDropIndicatorChange={setColumnDropIndicator}
                  onColumnDropIndicatorClear={() => setColumnDropIndicator(null)}
                  onColumnDrop={handleColumnDrop}
                />
                {visibleColumnDropIndicator?.targetId === swimlane.id && visibleColumnDropIndicator.position === 'after' && (
                  <ColumnInsertionMarker
                    indicator={visibleColumnDropIndicator}
                    onColumnDragHover={onColumnDragHover}
                    onColumnDrop={handleColumnDrop}
                    onColumnDropIndicatorClear={() => setColumnDropIndicator(null)}
                  />
                )}
              </Fragment>
            );
          })}

        </div>
      </div>
  );
}
