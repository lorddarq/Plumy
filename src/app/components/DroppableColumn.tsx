import { useRef } from 'react';
import { useDrop } from 'react-dnd';
import { Plus } from 'lucide-react';
import { Task, TaskStatus, Swimlane } from '../types';
import { getIcon } from '../constants/swimlanes';
import { DraggableTaskCard } from '../components/DraggableTaskCard';

interface DroppableColumnProps {
  swimlane: Swimlane;
  tasks: Task[];
  swimlanes: Array<{ id: TaskStatus; title: string }>;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTask: (dragIndex: number, hoverIndex: number, status: TaskStatus) => void;
}

export function DroppableColumn({
  swimlane,
  tasks: swimlaneTasks,
  swimlanes,
  onTaskClick,
  onAddTask,
  onMoveTask,
  onReorderTask,
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

  return (
    <div
      className="flex-1 min-w-[280px] bg-gray-100 rounded-lg flex flex-col"
    >
      {/* Swimlane header */}
      <div className={`${swimlane.color} text-white p-3 rounded-t-lg flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          {swimlane.icon && (
            <span className="w-4 h-4 flex items-center justify-center">
              {getIcon(swimlane.icon)}
            </span>
          )}
          <span className="font-medium">{swimlane.title}</span>
        </div>
        <span className="text-white/80 text-sm">{swimlaneTasks.length}</span>
      </div>

      {/* Task cards */}
      <div
        ref={ref}
        className={`flex-1 p-3 space-y-2 min-h-[400px] transition-colors ${
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
            swimlanes={swimlanes}
          />
        ))}
      </div>
    </div>
  );
}