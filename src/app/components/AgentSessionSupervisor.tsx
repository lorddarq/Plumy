import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Task, TimelineSwimlane } from '../types';
import { TaskExecutionAction } from './TaskExecutionAction';

export const ACTIVE_SESSION_STATES = new Set(['starting', 'ready', 'active', 'needs-input', 'cancelling']);
const HISTORY_SESSION_STATES = new Set(['interrupted', 'failed', 'closed', 'complete', 'completed']);

export interface SessionBinding {
  id: string;
  state: string;
  workspacePath?: string;
  scope?: { kind?: string; taskId?: string; goalId?: string; goalElementId?: string };
}

export interface SessionDockItem {
  binding: SessionBinding;
  task?: Task;
}

interface AgentSessionRequest {
  task: Task;
  repositoryFolder?: string;
  startOnRequest: boolean;
  requestId: number;
}

interface AgentSessionSupervisorContextValue {
  requestTask: (task: Task, options?: { repositoryFolder?: string; startOnRequest?: boolean }) => void;
  sessionDock: SessionDockProjection;
  openSession: (binding: SessionBinding) => void;
}

export interface SessionDockProjection {
  state: 'none' | 'starting' | 'working' | 'hidden-active' | 'needs-input' | 'interrupted' | 'failed' | 'history' | 'blocked';
  binding?: SessionBinding;
  task?: Task;
  historyCount: number;
  items: SessionDockItem[];
}

const AgentSessionSupervisorContext = createContext<AgentSessionSupervisorContextValue | null>(null);

export function useAgentSessionSupervisor() {
  const context = useContext(AgentSessionSupervisorContext);
  if (!context) throw new Error('AgentSessionSupervisor must be rendered above its launch surfaces.');
  return context;
}

export function AgentSessionSupervisorProvider({ children, tasks, projects }: { children: ReactNode; tasks: Task[]; projects: TimelineSwimlane[] }) {
  const [request, setRequest] = useState<AgentSessionRequest | null>(null);
  const [bindings, setBindings] = useState<SessionBinding[]>([]);
  const [supervisionVisible, setSupervisionVisible] = useState(false);

  useEffect(() => {
    let disposed = false;
    let refreshRunning = false;
    const refresh = async () => {
      if (refreshRunning || disposed) return;
      refreshRunning = true;
      try {
        const result = await window.electron?.agentRuntime?.sessions?.list?.({ limit: 100 });
        if (!disposed && result?.ok && Array.isArray(result.bindings)) setBindings(result.bindings as SessionBinding[]);
      } finally {
        refreshRunning = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    const unsubscribe = window.electron?.agentRuntime?.sessions?.onEvent?.((payload) => {
      const nextBinding = payload?.binding as SessionBinding | undefined;
      if (!nextBinding) return;
      setBindings(current => [...current.filter(binding => binding.id !== nextBinding.id), nextBinding]);
    });
    return () => {
      disposed = true;
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, []);

  const requestTask = useCallback((task: Task, options: { repositoryFolder?: string; startOnRequest?: boolean } = {}) => {
    setRequest(current => ({
      task,
      repositoryFolder: options.repositoryFolder,
      startOnRequest: options.startOnRequest ?? true,
      requestId: (current?.requestId || 0) + 1,
    }));
  }, []);
  const openBinding = useCallback((binding: SessionBinding) => {
    const task = binding.scope?.taskId ? tasks.find(candidate => candidate.id === binding.scope?.taskId) : undefined;
    if (!task) return;
    const project = projects.find(candidate => task.projectIds?.includes(candidate.id) || candidate.id === task.swimlaneId);
    setRequest(current => ({
      task,
      repositoryFolder: binding.workspacePath || task.repositoryFolder || project?.repositoryFolder,
      startOnRequest: false,
      requestId: (current?.requestId || 0) + 1,
    }));
  }, [projects, tasks]);
  const activeBinding = [...bindings].reverse().find(binding => ACTIVE_SESSION_STATES.has(binding.state));
  const historyBinding = [...bindings].reverse().find(binding => HISTORY_SESSION_STATES.has(binding.state));
  const dockBinding = activeBinding || historyBinding;
  const dockTask = dockBinding?.scope?.taskId ? tasks.find(task => task.id === dockBinding.scope?.taskId) : undefined;
  const dockItems = [...bindings]
    .filter(binding => binding.scope?.kind === 'task' && tasks.some(task => task.id === binding.scope?.taskId))
    .sort((left, right) => Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || ''))
    .slice(0, 8)
    .map(binding => ({ binding, task: tasks.find(task => task.id === binding.scope?.taskId) }));
  const blockedByActiveSession = Boolean(activeBinding && request && activeBinding.scope?.taskId !== request.task.id);
  const sessionDock = useMemo<SessionDockProjection>(() => ({
    state: blockedByActiveSession ? 'blocked' : activeBinding
      ? activeBinding.state === 'starting' ? 'starting' : activeBinding.state === 'needs-input' ? 'needs-input' : supervisionVisible ? 'working' : 'hidden-active'
      : historyBinding?.state === 'interrupted' ? 'interrupted'
        : historyBinding?.state === 'failed' ? 'failed'
          : historyBinding ? 'history' : 'none',
    binding: dockBinding,
    task: dockTask,
    historyCount: bindings.filter(binding => HISTORY_SESSION_STATES.has(binding.state)).length,
    items: dockItems,
  }), [activeBinding, bindings, blockedByActiveSession, dockBinding, dockItems, dockTask, historyBinding, supervisionVisible]);
  const value = useMemo(() => ({ requestTask, sessionDock, openSession: openBinding }), [openBinding, requestTask, sessionDock]);
  return (
    <AgentSessionSupervisorContext.Provider value={value}>
      {children}
      {request && (
        <TaskExecutionAction
          key={request.requestId}
          task={request.task}
          repositoryFolder={request.repositoryFolder}
          openRequest={request.requestId}
          startOnOpenRequest={request.startOnRequest}
          onVisibilityChange={setSupervisionVisible}
          trigger={null}
        />
      )}
    </AgentSessionSupervisorContext.Provider>
  );
}
