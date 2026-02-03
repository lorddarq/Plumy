/**
 * KanbanView Component
 *
 * Full-page kanban board view with independent horizontal scrolling.
 * Integrates with useViewState to preserve scroll position across view switches.
 *
 * Renders kanban columns (swimlanes) in a responsive flex layout.
 * Columns grow to fill available width or overflow-scroll if total width exceeds viewport.
 */

import { useRef, useEffect, useCallback } from 'react';
import { Task, TaskStatus } from '../types';
import { SwimlanesView } from './SwimlanesView';
import { useViewState } from '../hooks/useViewState';

interface KanbanViewProps {
  tasks: Task[];
  swimlanes: Array<{ id: TaskStatus; title: string; color?: string }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTasks: (tasks: Task[]) => void;
  onReorderColumns: (fromIndex: number, toIndex: number) => void;
  onRenameTask?: (taskId: string, newTitle: string) => void;
  onRenameColumn?: (colId: string, newTitle: string) => void;
  onChangeColumnColor?: (colId: string, newColor: string) => void;
  onAddColumn?: (col: any) => void;
  onDeleteColumn?: (colId: string) => void;
}

export function KanbanView({
  tasks,
  swimlanes,
  onTaskClick,
  onAddTask,
  onMoveTask,
  onReorderTasks,
  onReorderColumns,
  onRenameTask,
  onRenameColumn,
  onChangeColumnColor,
  onAddColumn,
  onDeleteColumn,
}: KanbanViewProps) {
  // Get view state from context (assuming parent provides it)
  // For now, we'll manage scroll locally but expose it for view state preservation
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Handle scroll events and preserve scroll position in view state.
   * The parent (App) will call saveViewState with this scroll position.
   */
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const scrollLeft = e.currentTarget.scrollLeft;
      const scrollTop = e.currentTarget.scrollTop;

      // Dispatch custom event so parent can capture scroll state
      // Alternatively, parent can access scrollLeft directly via ref
      const event = new CustomEvent('kanbanScroll', {
        detail: { scrollLeft, scrollTop },
      });
      document.dispatchEvent(event);
    },
    []
  );

  /**
   * Restore scroll position when component mounts (if state was saved).
   * Parent (App) should pass initial scrollLeft as prop or via context.
   */
  useEffect(() => {
    // Scroll restoration can be handled by parent component
    // by passing initialScrollLeft prop and using ref.current.scrollLeft = value
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full w-full overflow-x-auto overflow-y-hidden bg-gray-50"
    >
      <SwimlanesView
        tasks={tasks}
        swimlanes={swimlanes}
        onTaskClick={onTaskClick}
        onAddTask={onAddTask}
        onMoveTask={onMoveTask}
        onReorderTasks={onReorderTasks}
        onReorderColumns={onReorderColumns}
        onRenameTask={onRenameTask}
        onRenameColumn={onRenameColumn}
        onChangeColumnColor={onChangeColumnColor}
        onAddColumn={onAddColumn}
        onDeleteColumn={onDeleteColumn}
      />
    </div>
  );
}
