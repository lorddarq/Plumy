import { useCallback } from 'react';
import type { Person, Task, TaskAttachment, TaskComment, TaskStatus } from '../types.ts';

interface UseTaskActionsOptions {
  people: Person[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onTaskMilestoneChange?: (taskId: string, nextMilestoneId?: string) => void;
  onTaskDeleted?: (taskId: string) => void;
}

/**
 * Creates the standalone planning copy used by task surfaces.
 * History, roadmap relationships, and external metadata stay attached only to
 * the source task; the duplicate is a fresh piece of work.
 */
export function createDuplicatedTask(source: Task, taskId = `${Date.now()}-copy`): Task {
  return {
    id: taskId,
    createdAt: new Date().toISOString(),
    title: `${source.title} (copy)`,
    status: source.status,
    notes: source.notes,
    startDate: source.startDate,
    endDate: source.endDate,
    color: source.color,
    size: source.size,
    complexity: source.complexity,
    blocked: source.blocked,
    priority: source.priority,
    swimlaneOnly: source.swimlaneOnly,
    swimlaneId: source.swimlaneId,
    projectIds: source.projectIds ? [...source.projectIds] : undefined,
    assigneeId: source.assigneeId,
    project: source.project,
    // A duplicate starts a new roadmap and work history.
    milestoneId: undefined,
    dependencyIds: [],
    timeSpentMinutes: undefined,
    timeSpentNote: undefined,
    timeEntries: [],
    attachments: [],
    comments: [],
    mcpUpdatedAt: undefined,
    mcpLastActor: undefined,
  };
}

export function useTaskActions({
  people,
  setTasks,
  onTaskMilestoneChange,
  onTaskDeleted,
}: UseTaskActionsOptions) {
  const saveTask = useCallback((taskData: Partial<Task>) => {
    if (taskData.id) {
      setTasks(prevTasks => prevTasks.map(t => (t.id === taskData.id ? { ...t, ...taskData } : t)));
      onTaskMilestoneChange?.(taskData.id, taskData.milestoneId);
      return;
    }

    const taskId = Date.now().toString();
    const newTask: Task = {
      id: taskId,
      createdAt: new Date().toISOString(),
      title: taskData.title!,
      status: taskData.status || 'open',
      notes: taskData.notes,
      size: taskData.size || 'm',
      complexity: taskData.complexity || 'medium',
      blocked: Boolean(taskData.blocked),
      priority: taskData.priority || 'normal',
      startDate: taskData.startDate,
      endDate: taskData.endDate,
      projectIds: taskData.projectIds || [],
      project: taskData.project,
      swimlaneOnly: taskData.swimlaneOnly,
      swimlaneId: taskData.swimlaneId,
      assigneeId: taskData.assigneeId,
      milestoneId: taskData.milestoneId,
      dependencyIds: taskData.dependencyIds || [],
      attachments: taskData.attachments || [],
      comments: taskData.comments || [],
    };

    setTasks(prevTasks => [newTask, ...prevTasks]);
    onTaskMilestoneChange?.(taskId, newTask.milestoneId);
  }, [onTaskMilestoneChange, setTasks]);

  const addTaskComment = useCallback((taskId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const nextComment: TaskComment = {
      id: `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      author: 'You',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setTasks(prevTasks => prevTasks.map(task => (
      task.id === taskId
        ? { ...task, comments: [...(task.comments || []), nextComment] }
        : task
    )));
  }, [setTasks]);

  const updateTaskAttachments = useCallback((taskId: string, attachments: TaskAttachment[]) => {
    setTasks(prevTasks => prevTasks.map(task => (
      task.id === taskId ? { ...task, attachments } : task
    )));
  }, [setTasks]);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prevTasks =>
      prevTasks
        .filter(t => t.id !== taskId)
        .map(task => ({
          ...task,
          dependencyIds: (task.dependencyIds || []).filter(id => id !== taskId),
        }))
    );
    onTaskDeleted?.(taskId);
  }, [onTaskDeleted, setTasks]);

  const duplicateTask = useCallback((task: Task) => {
    const duplicate = createDuplicatedTask(task);
    setTasks(prevTasks => [duplicate, ...prevTasks]);
    return duplicate;
  }, [setTasks]);

  const moveTask = useCallback((taskId: string, newStatus: TaskStatus) => {
    setTasks(prevTasks => prevTasks.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)));
  }, [setTasks]);

  const moveAgentTaskToReview = useCallback((taskId: string) => {
    setTasks(prevTasks =>
      prevTasks.map(task => {
        if (task.id !== taskId) return task;
        if (task.status !== 'in-progress') return task;
        const assignee = task.assigneeId ? people.find(person => person.id === task.assigneeId) : null;
        if (!assignee || assignee.kind !== 'agentic') return task;
        return { ...task, status: 'under-review' };
      })
    );
  }, [people, setTasks]);

  const updateTaskDates = useCallback((taskId: string, startDate: string, endDate: string) => {
    setTasks(prevTasks => prevTasks.map(t => (t.id === taskId ? { ...t, startDate, endDate } : t)));
  }, [setTasks]);

  return {
    saveTask,
    addTaskComment,
    updateTaskAttachments,
    deleteTask,
    duplicateTask,
    moveTask,
    moveAgentTaskToReview,
    updateTaskDates,
  };
}
