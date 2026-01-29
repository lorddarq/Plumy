import { useState, useEffect, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Plus } from 'lucide-react';
import { Task, TimelineSwimlane } from '@/app/types';
import { DraggableSwimlaneRow } from '@/app/components/DraggableSwimlaneRow';

interface TimelineViewProps {
  tasks: Task[];
  swimlanes: TimelineSwimlane[];
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, swimlaneId: string) => void;
  onUpdateTaskDates: (taskId: string, startDate: string, endDate: string) => void;
  onEditSwimlane: (swimlane: TimelineSwimlane) => void;
  onAddSwimlane: () => void;
  onReorderSwimlanes: (swimlanes: TimelineSwimlane[]) => void;
  onReorderTasks: (tasks: Task[]) => void;
}

export function TimelineView({
  tasks,
  swimlanes,
  onTaskClick,
  onAddTask,
  onUpdateTaskDates,
  onEditSwimlane,
  onAddSwimlane,
  onReorderSwimlanes,
  onReorderTasks,
}: TimelineViewProps) {
  const [resizingTask, setResizingTask] = useState<{
    taskId: string;
    edge: 'start' | 'end';
    initialX: number;
    initialStartDate: string;
    initialEndDate: string;
  } | null>(null);

  // Generate dates for the timeline (30 days starting from today)
  const generateDates = () => {
    const dates = [];
    const today = new Date(2026, 1, 16); // Feb 16, 2026 as starting point
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const dates = generateDates();
  const dayWidth = 60;
  
  const getMonthLabel = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long' });
  };

  const getDayLabel = (date: Date) => {
    return date.getDate().toString().padStart(2, '0');
  };

  // Group dates by month
  const datesByMonth: { [key: string]: Date[] } = {};
  dates.forEach(date => {
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    if (!datesByMonth[monthKey]) {
      datesByMonth[monthKey] = [];
    }
    datesByMonth[monthKey].push(date);
  });

  // Get timeline tasks (tasks with dates)
  const timelineTasks = tasks.filter(task => task.startDate && task.endDate);

  // Calculate task position and width
  const getTaskPosition = useCallback((task: Task) => {
    if (!task.startDate || !task.endDate) return null;
    
    const startDate = new Date(task.startDate);
    const endDate = new Date(task.endDate);
    const firstDate = dates[0];
    
    const startDiff = Math.floor((startDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    return {
      left: startDiff * dayWidth,
      width: duration * dayWidth - 8,
    };
  }, [dates, dayWidth]);

  const getTaskColor = useCallback((status: string) => {
    switch (status) {
      case 'open':
        return 'bg-cyan-400 hover:bg-cyan-500';
      case 'in-progress':
        return 'bg-blue-400 hover:bg-blue-500';
      case 'under-review':
        return 'bg-pink-400 hover:bg-pink-500';
      case 'done':
        return 'bg-purple-400 hover:bg-purple-500';
      default:
        return 'bg-gray-400 hover:bg-gray-500';
    }
  }, []);

  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    task: Task,
    edge: 'start' | 'end'
  ) => {
    e.stopPropagation();
    if (!task.startDate || !task.endDate) return;

    setResizingTask({
      taskId: task.id,
      edge,
      initialX: e.clientX,
      initialStartDate: task.startDate,
      initialEndDate: task.endDate,
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingTask) return;

    const deltaX = e.clientX - resizingTask.initialX;
    const daysDelta = Math.round(deltaX / dayWidth);

    if (daysDelta === 0) return;

    const task = tasks.find(t => t.id === resizingTask.taskId);
    if (!task) return;

    const startDate = new Date(resizingTask.initialStartDate);
    const endDate = new Date(resizingTask.initialEndDate);

    if (resizingTask.edge === 'start') {
      startDate.setDate(startDate.getDate() + daysDelta);
      // Ensure start date doesn't go past end date
      if (startDate >= endDate) return;
    } else {
      endDate.setDate(endDate.getDate() + daysDelta);
      // Ensure end date doesn't go before start date
      if (endDate <= startDate) return;
    }

    onUpdateTaskDates(
      resizingTask.taskId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }, [resizingTask, tasks, dayWidth, onUpdateTaskDates]);

  const handleMouseUp = useCallback(() => {
    setResizingTask(null);
  }, []);

  // Add event listeners for resize
  useEffect(() => {
    if (resizingTask) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizingTask, handleMouseMove, handleMouseUp]);

  const handleMoveSwimlane = useCallback((dragIndex: number, hoverIndex: number) => {
    const updatedSwimlanes = [...swimlanes];
    const [removed] = updatedSwimlanes.splice(dragIndex, 1);
    updatedSwimlanes.splice(hoverIndex, 0, removed);
    onReorderSwimlanes(updatedSwimlanes);
  }, [swimlanes, onReorderSwimlanes]);

  const handleMoveTaskToSwimlane = useCallback((taskId: string, swimlaneId: string) => {
    const updatedTasks = tasks.map(task =>
      task.id === taskId ? { ...task, swimlaneId } : task
    );
    onReorderTasks(updatedTasks);
  }, [tasks, onReorderTasks]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="bg-white border-b">
        {/* Month headers */}
        <div className="flex border-b">
          <div className="w-[200px] border-r px-4 py-3 bg-gray-50">
            <span className="text-sm font-medium text-gray-700">Swimlanes</span>
          </div>
          {Object.entries(datesByMonth).map(([monthKey, monthDates]) => (
            <div
              key={monthKey}
              className="border-r last:border-r-0 px-6 py-3"
              style={{ width: `${monthDates.length * dayWidth}px` }}
            >
              <span className="text-sm text-gray-600">{getMonthLabel(monthDates[0])}</span>
            </div>
          ))}
        </div>

        {/* Day headers */}
        <div className="flex border-b relative">
          <div className="w-[200px] border-r bg-gray-50"></div>
          {dates.map((date, index) => {
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div
                key={index}
                className={`w-[60px] border-r last:border-r-0 px-3 py-2 text-center ${
                  isToday ? 'bg-cyan-50' : ''
                }`}
              >
                <div className={`text-xs ${isToday ? 'text-cyan-600 font-semibold' : 'text-gray-500'}`}>
                  {getDayLabel(date)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Swimlane rows */}
        {swimlanes.map((swimlane, index) => (
          <DraggableSwimlaneRow
            key={swimlane.id}
            swimlane={swimlane}
            index={index}
            tasks={timelineTasks}
            dates={dates}
            dayWidth={dayWidth}
            onTaskClick={onTaskClick}
            onAddTask={onAddTask}
            onEditSwimlane={onEditSwimlane}
            onMoveSwimlane={handleMoveSwimlane}
            onMoveTaskToSwimlane={handleMoveTaskToSwimlane}
            getTaskPosition={getTaskPosition}
            getTaskColor={getTaskColor}
            handleResizeStart={handleResizeStart}
            resizingTaskId={resizingTask?.taskId || null}
          />
        ))}

        {/* Add swimlane row */}
        <div className="flex border-b hover:bg-gray-50/50">
          <button
            onClick={onAddSwimlane}
            className="w-full py-3 flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add Swimlane</span>
          </button>
        </div>
      </div>
    </DndProvider>
  );
}