import { useCallback } from 'react';
import { Task, TimelineSwimlane } from '../types';

interface UseProjectActionsOptions {
  timelineSwimlanes: TimelineSwimlane[];
  setTimelineSwimlanes: React.Dispatch<React.SetStateAction<TimelineSwimlane[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export function useProjectActions({
  timelineSwimlanes,
  setTimelineSwimlanes,
  setTasks,
}: UseProjectActionsOptions) {
  const saveSwimlane = useCallback((swimlaneData: Partial<TimelineSwimlane>) => {
    if (swimlaneData.id) {
      setTimelineSwimlanes(previousSwimlanes =>
        previousSwimlanes.map(s => (s.id === swimlaneData.id ? { ...s, ...swimlaneData } : s))
      );
      return;
    }

    const newSwimlane: TimelineSwimlane = {
      id: Date.now().toString(),
      name: swimlaneData.name!,
      description: swimlaneData.description,
      color: swimlaneData.color,
      repositoryFolder: swimlaneData.repositoryFolder,
    };
    setTimelineSwimlanes(previousSwimlanes => [...previousSwimlanes, newSwimlane]);
  }, [setTimelineSwimlanes]);

  const deleteSwimlane = useCallback((swimlaneId: string) => {
    const remainingSwimlanes = timelineSwimlanes.filter(s => s.id !== swimlaneId);
    setTimelineSwimlanes(remainingSwimlanes);

    setTasks(prevTasks => prevTasks.map(task => {
      const nextProjectIds = (task.projectIds || []).filter(id => id !== swimlaneId);
      const nextProject = nextProjectIds
        .map(projectId => remainingSwimlanes.find(s => s.id === projectId)?.name)
        .filter(Boolean)
        .join(', ') || undefined;

      return {
        ...task,
        swimlaneId: task.swimlaneId === swimlaneId ? undefined : task.swimlaneId,
        projectIds: nextProjectIds,
        project: nextProject,
        swimlaneOnly: nextProjectIds.length === 0 || !task.swimlaneId || task.swimlaneId === swimlaneId,
      };
    }));
  }, [setTasks, setTimelineSwimlanes, timelineSwimlanes]);

  const reorderSwimlanes = useCallback((reorderedSwimlanes: TimelineSwimlane[]) => {
    setTimelineSwimlanes(reorderedSwimlanes);
  }, [setTimelineSwimlanes]);

  return {
    saveSwimlane,
    deleteSwimlane,
    reorderSwimlanes,
  };
}
