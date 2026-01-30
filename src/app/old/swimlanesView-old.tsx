import { useRef } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrop } from 'react-dnd';
import { Plus } from 'lucide-react';
import { Task, TaskStatus, Swimlane } from '@/app/types';
import { DraggableTaskCard } from '@/app/components/DraggableTaskCard';

interface SwimlanesViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTasks: (tasks: Task[]) => void;
}

const swimlanes: Swimlane[] = [
  { id: 'open', title: 'Open', color: 'bg-cyan-500' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-blue-500' },
  { id: 'under-review', title: 'Under Review', color: 'bg-pink-500' },
  { id: 'done', title: 'Done', color: 'bg-purple-500' },
];



interface DroppableColumnProps {
  swimlane: Swimlane;
  tasks: Task[];
  allTasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTask: (dragIndex: number, hoverIndex: number, status: TaskStatus) => void;
}

function DroppableColumn({
  swimlane,
  tasks: swimlaneTasks,
  allTasks,
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
      key={swimlane.id}
      className="flex-1 min-w-[280px] bg-gray-100 rounded-lg flex flex-col"
    >
      {/* Swimlane header */}
      <div className={`${swimlane.color} text-white p-3 rounded-t-lg flex items-center justify-between`}>
        <div className="flex items-center gap-2">
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
                allTasks={tasks}
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
