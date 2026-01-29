import { useState } from 'react';
import { Task, TaskStatus, TimelineSwimlane } from '@/app/types';
import { TimelineView } from '@/app/components/TimelineView';
import { SwimlanesView } from '@/app/components/SwimlanesView';
import { TaskDialog } from '@/app/components/TaskDialog';
import { SwimlaneDialog } from '@/app/components/SwimlaneDialog';
import { Button } from '@/app/components/ui/button';
import { Menu, Plus, Bell, CheckCircle, User } from 'lucide-react';

// Sample timeline swimlanes
const initialTimelineSwimlanes: TimelineSwimlane[] = [
  { id: '1', name: 'Rocket Engineering Team' },
  { id: '2', name: 'Launch Operations' },
  { id: '3', name: 'Mission Control' },
];

// Sample data
const initialTasks: Task[] = [
  {
    id: '1',
    title: 'Design a Rocket',
    status: 'in-progress',
    notes: 'Create the initial rocket design with detailed specifications',
    startDate: '2026-02-22',
    endDate: '2026-02-26',
    swimlaneId: '1',
  },
  {
    id: '2',
    title: 'Look at the Mon...',
    status: 'in-progress',
    notes: 'Research moon observation techniques',
    startDate: '2026-02-24',
    endDate: '2026-02-28',
    swimlaneId: '3',
  },
  {
    id: '3',
    title: 'Do Moon Research...',
    status: 'done',
    notes: 'Complete comprehensive moon research',
    startDate: '2026-02-25',
    endDate: '2026-02-27',
    swimlaneId: '3',
  },
  {
    id: '4',
    title: 'Watch YouTube V...',
    status: 'under-review',
    notes: 'Review educational videos about rocket building',
    startDate: '2026-03-01',
    endDate: '2026-03-02',
    swimlaneId: '1',
  },
  {
    id: '5',
    title: 'Build Launch Pad',
    status: 'under-review',
    notes: 'Construct the launch pad infrastructure',
    startDate: '2026-03-03',
    endDate: '2026-03-05',
    swimlaneId: '2',
  },
  {
    id: '6',
    title: 'Design The Spac...',
    status: 'under-review',
    notes: 'Design spacesuits for the crew',
    startDate: '2026-03-05',
    endDate: '2026-03-07',
    swimlaneId: '1',
  },
  {
    id: '7',
    title: 'Moon Astronauts',
    status: 'done',
    notes: 'Select and train astronauts',
    startDate: '2026-03-02',
    endDate: '2026-03-03',
    swimlaneId: '2',
  },
  {
    id: '8',
    title: 'Build Launch Pad',
    status: 'open',
    notes: 'Initial planning for launch pad',
    swimlaneOnly: true,
  },
  {
    id: '9',
    title: 'Design The Spacesuits',
    status: 'open',
    notes: 'Brainstorm spacesuit design ideas',
    swimlaneOnly: true,
  },
  {
    id: '10',
    title: 'Look at the Moon Through a Telescope',
    status: 'open',
    notes: 'Set up telescope observation sessions',
    swimlaneOnly: true,
  },
  {
    id: '11',
    title: 'Watch YouTube Video On Rocket Building',
    status: 'under-review',
    notes: 'Compile learning resources',
    swimlaneOnly: true,
  },
  {
    id: '12',
    title: 'Meet Astronauts',
    status: 'in-progress',
    notes: 'Schedule meetings with potential crew',
    swimlaneOnly: true,
  },
];

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
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-600">PM</span>
            </div>
            <h1 className="font-semibold text-gray-900">Project Moon</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Plus className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Bell className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <CheckCircle className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </Button>
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