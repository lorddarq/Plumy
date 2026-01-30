import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Plus, GripVertical } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { DroppableColumn } from './DroppableColumn';

const SWIMLANE_COLUMN = 'SWIMLANE_COLUMN';

// Small component to encapsulate per-column hooks safely (prevents hook-order mismatches)
function ColumnDraggable<T extends { id: string; title?: string; color?: string }>({
  swimlane,
  index,
  swimlaneTasks,
  swimlanes,
  onTaskClick,
  onAddTask,
  onMoveTask,
  onReorderTask,
  onRenameTask,
  onRenameColumn,
  onChangeColumnColor,
  onDeleteColumn,
  onReorderColumns,
}: {
  swimlane: T;
  index: number;
  swimlaneTasks: Task[];
  swimlanes: Array<{ id: TaskStatus; title: string; color?: string }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTask: (dragIndex: number, hoverIndex: number, status: TaskStatus) => void;
  onRenameTask?: (taskId: string, newTitle: string) => void;
  onRenameColumn?: (colId: string, newTitle: string) => void;
  onChangeColumnColor?: (colId: string, newColor: string) => void;
  onDeleteColumn?: (colId: string) => void;
  onReorderColumns?: (fromIndex: number, toIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [{ isDragging }, drag] = useDrag({
    type: SWIMLANE_COLUMN,
    item: { id: swimlane.id, index },
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: SWIMLANE_COLUMN,
    hover: (item: { id: string; index: number }, monitor) => {
      if (item.index === index) return;
      if (!ref.current) return;
      onReorderColumns && onReorderColumns(item.index, index);
      item.index = index;
    },
  });

  drag(drop(ref));

  return (
    <div key={swimlane.id} ref={ref} className={`${isDragging ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-2 cursor-grab select-none">
        <div className="p-1 text-gray-500"><GripVertical className="w-4 h-4" /></div>
      </div>

      <DroppableColumn
        swimlane={swimlane as any}
        tasks={swimlaneTasks}
        swimlanes={swimlanes}
        onTaskClick={onTaskClick}
        onAddTask={onAddTask}
        onMoveTask={onMoveTask}
        onReorderTask={onReorderTask}
        onRenameTask={onRenameTask}
        onRenameColumn={onRenameColumn}
        onChangeColumnColor={onChangeColumnColor}
        onDeleteColumn={onDeleteColumn}
      />
    </div>
  );
}

interface SwimlanesViewProps {
  tasks: Task[];
  swimlanes: Array<{ id: TaskStatus; title: string; color?: string }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTasks: (tasks: Task[]) => void;
  onReorderColumns?: (fromIndex: number, toIndex: number) => void;
  onRenameTask?: (taskId: string, newTitle: string) => void;
  onRenameColumn?: (colId: string, newTitle: string) => void;
  onChangeColumnColor?: (colId: string, newColor: string) => void;
  onAddColumn?: (col: { id?: string; title: string; color?: string }) => void;
  onDeleteColumn?: (colId: string) => void;
}
export function SwimlanesView({
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
}: SwimlanesViewProps) {
  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter(task => task.status === status);
  };

  const handleReorderTask = (dragIndex: number, hoverIndex: number, status: TaskStatus) => {
    const statusTasks = getTasksByStatus(status);
    const reorderedTasks = [...statusTasks];
    const [draggedTask] = reorderedTasks.splice(dragIndex, 1);
    reorderedTasks.splice(hoverIndex, 0, draggedTask);

    // Merge reordered tasks with tasks from other statuses
    const otherTasks = tasks.filter(task => task.status !== status);
    onReorderTasks([...otherTasks, ...reorderedTasks]);
  };

  // Defensive: ensure we have an array to map over
  const cols = Array.isArray(swimlanes) ? swimlanes : [];
  if (!Array.isArray(swimlanes)) {
    // eslint-disable-next-line no-console
    console.warn('[SwimlanesView] expected `swimlanes` array but got:', swimlanes);
  }

  return (
      <div className="flex-1 bg-gray-50 p-6 overflow-x-auto">
        <div className="flex gap-4 min-w-max">
        {cols.map((swimlane, index) => {
            const swimlaneTasks = getTasksByStatus(swimlane.id);
            return (
              <ColumnDraggable
                key={swimlane.id}
                swimlane={swimlane}
                index={index}
                swimlaneTasks={swimlaneTasks}
                swimlanes={swimlanes}
                onTaskClick={onTaskClick}
                onAddTask={onAddTask}
                onMoveTask={onMoveTask}
                onReorderTask={handleReorderTask}
                onRenameTask={onRenameTask}
                onRenameColumn={onRenameColumn}
                onChangeColumnColor={onChangeColumnColor}
                onDeleteColumn={onDeleteColumn}
                onReorderColumns={onReorderColumns}
              />
            );
          })}

          {/* Add column button */}
          <button onClick={() => onAddColumn && onAddColumn({ title: 'New Column' })} className="min-w-[60px] bg-gray-100/50 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-400 hover:text-gray-600">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>
  );
}
