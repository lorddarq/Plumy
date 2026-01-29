import { useState } from 'react';
import { Task, TaskStatus, TimelineSwimlane } from './types';
import { initialTasks, initialTimelineSwimlanes } from './data/sampleData';
import { TimelineView } from './components/TimelineView';
import { SwimlanesView } from './components/SwimlanesView';
import { TaskDialog } from './components/TaskDialog';
import { SwimlaneDialog } from './components/SwimlaneDialog';
import { Button } from './components/ui/button';
import { Menu, Plus, Bell, CheckCircle, User } from 'lucide-react';
import { Agentation } from 'agentation';

function App() {
  
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [timelineSwimlanes, setTimelineSwimlanes] = useState<TimelineSwimlane[]>(initialTimelineSwimlanes);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isSwimlaneDialogOpen, setIsSwimlaneDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedSwimlane, setSelectedSwimlane] = useState<TimelineSwimlane | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('open');
  const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);
  const [defaultSwimlaneId, setDefaultSwimlaneId] = useState<string | undefined>(undefined);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDefaultStatus(task.status);
    setDefaultDate(undefined);
    setDefaultSwimlaneId(task.swimlaneId);
    setIsTaskDialogOpen(true);
  };

  const handleAddTaskFromTimeline = (date: Date, swimlaneId: string) => {
    setSelectedTask(null);
    setDefaultStatus('open');
    setDefaultDate(date);
    setDefaultSwimlaneId(swimlaneId);
    setIsTaskDialogOpen(true);
  };

  const handleAddTaskFromSwimlane = (status: TaskStatus) => {
    setSelectedTask(null);
    setDefaultStatus(status);
    setDefaultDate(undefined);
    setDefaultSwimlaneId(undefined);
    setIsTaskDialogOpen(true);
  };

  const handleSaveTask = (taskData: Partial<Task>) => {
    if (taskData.id) {
      // Update existing task
      setTasks(tasks.map(t => (t.id === taskData.id ? { ...t, ...taskData } : t)));
    } else {
      // Create new task
      const newTask: Task = {
        id: Date.now().toString(),
        title: taskData.title!,
        status: taskData.status || 'open',
        notes: taskData.notes,
        startDate: taskData.startDate,
        endDate: taskData.endDate,
        swimlaneOnly: taskData.swimlaneOnly,
        swimlaneId: taskData.swimlaneId,
      };
      setTasks([...tasks, newTask]);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const handleMoveTask = (taskId: string, newStatus: TaskStatus) => {
    setTasks(tasks.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)));
  };

  const handleUpdateTaskDates = (taskId: string, startDate: string, endDate: string) => {
    setTasks(tasks.map(t => (t.id === taskId ? { ...t, startDate, endDate } : t)));
  };

  const handleCloseTaskDialog = () => {
    setIsTaskDialogOpen(false);
    setSelectedTask(null);
    setDefaultDate(undefined);
    setDefaultSwimlaneId(undefined);
  };

  const handleEditSwimlane = (swimlane: TimelineSwimlane) => {
    setSelectedSwimlane(swimlane);
    setIsSwimlaneDialogOpen(true);
  };

  const handleAddSwimlane = () => {
    setSelectedSwimlane(null);
    setIsSwimlaneDialogOpen(true);
  };

  const handleSaveSwimlane = (swimlaneData: Partial<TimelineSwimlane>) => {
    if (swimlaneData.id) {
      // Update existing swimlane
      setTimelineSwimlanes(
        timelineSwimlanes.map(s => (s.id === swimlaneData.id ? { ...s, ...swimlaneData } : s))
      );
    } else {
      // Create new swimlane
      const newSwimlane: TimelineSwimlane = {
        id: Date.now().toString(),
        name: swimlaneData.name!,
      };
      setTimelineSwimlanes([...timelineSwimlanes, newSwimlane]);
    }
  };

  const handleDeleteSwimlane = (swimlaneId: string) => {
    // Remove swimlane
    setTimelineSwimlanes(timelineSwimlanes.filter(s => s.id !== swimlaneId));
    // Update tasks to remove swimlane reference
    setTasks(
      tasks.map(t => (t.swimlaneId === swimlaneId ? { ...t, swimlaneId: undefined } : t))
    );
  };

  const handleCloseSwimlaneDialog = () => {
    setIsSwimlaneDialogOpen(false);
    setSelectedSwimlane(null);
  };

  const handleReorderSwimlanes = (reorderedSwimlanes: TimelineSwimlane[]) => {
    setTimelineSwimlanes(reorderedSwimlanes);
  };

  const handleReorderTasks = (reorderedTasks: Task[]) => {
    setTasks(reorderedTasks);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {process.env.NODE_ENV === "development" && <Agentation />}
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-gray-900">plumy</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Bell className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <CheckCircle className="w-5 h-5" />
          </Button>
          {/* <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </Button> */}
          <Button variant="ghost" size="icon">
            <User className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Timeline View */}
      <TimelineView
        tasks={tasks}
        swimlanes={timelineSwimlanes}
        onTaskClick={handleTaskClick}
        onAddTask={handleAddTaskFromTimeline}
        onUpdateTaskDates={handleUpdateTaskDates}
        onEditSwimlane={handleEditSwimlane}
        onAddSwimlane={handleAddSwimlane}
        onReorderSwimlanes={handleReorderSwimlanes}
        onReorderTasks={handleReorderTasks}
      />

      {/* Swimlanes View */}
      <SwimlanesView
        tasks={tasks}
        onTaskClick={handleTaskClick}
        onAddTask={handleAddTaskFromSwimlane}
        onMoveTask={handleMoveTask}
        onReorderTasks={handleReorderTasks}
      />

      {/* Task Dialog */}
      <TaskDialog
        isOpen={isTaskDialogOpen}
        onClose={handleCloseTaskDialog}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        task={selectedTask}
        defaultStatus={defaultStatus}
        defaultDate={defaultDate}
        defaultSwimlaneId={defaultSwimlaneId}
        swimlanes={timelineSwimlanes}
      />

      {/* Swimlane Dialog */}
      <SwimlaneDialog
        isOpen={isSwimlaneDialogOpen}
        onClose={handleCloseSwimlaneDialog}
        onSave={handleSaveSwimlane}
        onDelete={handleDeleteSwimlane}
        swimlane={selectedSwimlane}
      />
    </div>
  );
}

export default App;