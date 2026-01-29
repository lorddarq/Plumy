import { useRef } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { swimlanes } from '../constants/swimlanes';
import { DroppableColumn } from './DroppableColumn';

interface SwimlanesViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTasks: (tasks: Task[]) => void;
}

export function SwimlanesView({
  tasks,
  onTaskClick,
  onAddTask,
  onMoveTask,
  onReorderTasks,
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

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex-1 bg-gray-50 p-6 overflow-x-auto">
        <div className="flex gap-4 min-w-max">
        {swimlanes.map(swimlane => {
            const swimlaneTasks = getTasksByStatus(swimlane.id);

            return (
              <DroppableColumn
                key={swimlane.id}
                swimlane={swimlane}
                tasks={swimlaneTasks}
                swimlanes={swimlanes}
                onTaskClick={onTaskClick}
                onAddTask={onAddTask}
                onMoveTask={onMoveTask}
                onReorderTask={handleReorderTask}
              />
            );
          })}

          {/* Add column button */}
          <button className="min-w-[60px] bg-gray-100/50 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-400 hover:text-gray-600">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>
    </DndProvider>
  );
}
