import { useCallback } from 'react';
import type { Task, TaskStatus, StatusColumn } from '../types.ts';

interface UseStatusColumnActionsOptions {
  statusColumns: StatusColumn[];
  tasks: Task[];
  setStatusColumns: React.Dispatch<React.SetStateAction<StatusColumn[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export function useStatusColumnActions({
  statusColumns,
  tasks,
  setStatusColumns,
  setTasks,
}: UseStatusColumnActionsOptions) {
  const updateStatusColumn = useCallback((colId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => {
    setStatusColumns(cols => cols.map(c => c.id === colId ? { ...c, ...updates } : c));
  }, [setStatusColumns]);

  const reorderStatusColumns = useCallback((fromIndex: number, toIndex: number) => {
    setStatusColumns(cols => {
      const copy = [...cols];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
  }, [setStatusColumns]);

  const addStatusColumn = useCallback((col: { id?: string; title: string; color?: string; description?: string }) => {
    const newCol: StatusColumn = {
      id: col.id || Date.now().toString(),
      title: col.title,
      color: col.color || '#9ca3af',
      description: col.description,
      loadClassification: 'none',
      roadmapStage: 'excluded',
      aiAction: 'inspect_and_work',
    };
    setStatusColumns(cols => [...cols, newCol]);
  }, [setStatusColumns]);

  const deleteStatusColumn = useCallback((colId: string) => {
    const tasksUsingStatus = tasks.filter(t => t.status === colId);
    if (tasksUsingStatus.length > 0) {
      const remainingCols = statusColumns.filter(c => c.id !== colId);
      const fallbackStatus = remainingCols.length > 0 ? remainingCols[0].id : 'open';
      setTasks(prevTasks =>
        prevTasks.map(t =>
          t.status === colId ? { ...t, status: fallbackStatus as TaskStatus } : t
        )
      );
    }

    setStatusColumns(cols => cols.filter(c => c.id !== colId));
  }, [setStatusColumns, setTasks, statusColumns, tasks]);

  return {
    updateStatusColumn,
    reorderStatusColumns,
    addStatusColumn,
    deleteStatusColumn,
  };
}
