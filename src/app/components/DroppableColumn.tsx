import { useRef, useState } from 'react';
import { useDrop } from 'react-dnd';
import { Plus, Edit2 } from 'lucide-react';
import { Task, TaskStatus, Swimlane } from '../types';
import { DraggableTaskCard } from '../components/DraggableTaskCard';
import { getReadableTextClassFor } from '../utils/contrast';
import { ColumnDialog } from '../components/ColumnDialog';

interface DroppableColumnProps {
  swimlane: Swimlane;
  tasks: Task[];
  swimlanes: Array<{ id: TaskStatus; title: string }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTask: (dragIndex: number, hoverIndex: number, status: TaskStatus) => void;
  onRenameTask?: (taskId: string, newTitle: string) => void;
  onRenameColumn?: (colId: string, newTitle: string) => void;
  onChangeColumnColor?: (colId: string, newColor: string) => void;
  onDeleteColumn?: (colId: string) => void;
}

export function DroppableColumn({
  swimlane,
  tasks: swimlaneTasks,
  swimlanes,
  onTaskClick,
  onAddTask,
  onMoveTask,
  onReorderTask,
  onRenameTask,
  onRenameColumn,
  onChangeColumnColor,
  onDeleteColumn,
}: DroppableColumnProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'TASK_CARD',
    drop: (item: { task: Task }) => {
      if (item.task.status !== swimlane.id) {
        onMoveTask(item.task.id, swimlane.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  drop(ref);

  // Column dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const headerStyle = (color: string | undefined) => {
    if (!color) return undefined;
    if (color.startsWith('#')) return { backgroundColor: color } as React.CSSProperties;
    return undefined;
  };

  const handleSaveColumn = (title: string, color: string) => {
    if (onRenameColumn && title.trim()) onRenameColumn(swimlane.id, title.trim());
    if (onChangeColumnColor && color) onChangeColumnColor(swimlane.id, color);
  };

  const handleDeleteColumn = () => {
    if (onDeleteColumn) onDeleteColumn(swimlane.id);
  };

  return (
    <div
      className="min-w-[280px] max-w-[320px] bg-gray-100 rounded-lg flex flex-col h-full"
    >
      {/* Swimlane header */}
      <div className={`${!swimlane.color?.startsWith('#') ? swimlane.color : ''} ${(() => {
        const key = swimlane.color || '';
        return key ? getReadableTextClassFor(key, key.startsWith('#') ? key : undefined) : 'text-white';
      })()} p-3 rounded-t-lg flex items-center justify-between`} style={headerStyle(swimlane.color)}>
        <div className="flex items-center gap-2">
          <span className="font-medium">{swimlane.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">{swimlaneTasks.length}</span>
          <button className="p-1 ml-2 hover:bg-white/10 rounded" onClick={() => setIsDialogOpen(true)} aria-label="Edit column">
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      </div>

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
        className={`flex-1 p-3 space-y-2 overflow-y-auto transition-colors ${
          isOver && canDrop ? 'bg-blue-50' : ''
        }`}
      >
        {/* Add task button */}
        <button
          onClick={() => onAddTask(swimlane.id)}
          className="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add task</span>
        </button>

        {swimlaneTasks.map((task, index) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            index={index}
            onTaskClick={onTaskClick}
            onMoveTask={onMoveTask}
            onReorderTask={onReorderTask}
            onRenameTask={onRenameTask}
            swimlanes={swimlanes}
          />
        ))}
      </div>
    </div>
  );
}