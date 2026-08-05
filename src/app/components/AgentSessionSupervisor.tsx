import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Task, TimelineSwimlane } from '../types';
import { AgentIcon } from './icons/AgentIcon';
import { TaskExecutionAction } from './TaskExecutionAction';

const ACTIVE_SESSION_STATES = new Set(['starting', 'ready', 'active', 'needs-input', 'cancelling']);
const RECOVERABLE_SESSION_STATES = new Set([...ACTIVE_SESSION_STATES, 'interrupted', 'failed']);

interface SessionBinding {
  id: string;
  state: string;
  workspacePath?: string;
  scope?: { kind?: string; taskId?: string; goalId?: string; goalElementId?: string };
}

interface AgentSessionRequest {
  task: Task;
  repositoryFolder?: string;
  startOnRequest: boolean;
  requestId: number;
}

interface AgentSessionSupervisorContextValue {
  requestTask: (task: Task, options?: { repositoryFolder?: string; startOnRequest?: boolean }) => void;
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
    const timer = window.setInterval(() => void refresh(), 2500);
    const unsubscribe = window.electron?.onStoreChanged?.(() => void refresh());
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
  const value = useMemo(() => ({ requestTask }), [requestTask]);
  const visibleBinding = [...bindings].reverse().find(binding => RECOVERABLE_SESSION_STATES.has(binding.state));
  const visibleTask = visibleBinding?.scope?.taskId ? tasks.find(task => task.id === visibleBinding.scope?.taskId) : undefined;
  const openBinding = (binding: SessionBinding) => {
    const task = binding.scope?.taskId ? tasks.find(candidate => candidate.id === binding.scope?.taskId) : undefined;
    if (!task) return;
    const project = projects.find(candidate => task.projectIds?.includes(candidate.id) || candidate.id === task.swimlaneId);
    setRequest(current => ({
      task,
      repositoryFolder: binding.workspacePath || task.repositoryFolder || project?.repositoryFolder,
      startOnRequest: false,
      requestId: (current?.requestId || 0) + 1,
    }));
  };
  const visibleStatusLabel = visibleBinding?.state === 'needs-input'
    ? 'Input needed'
    : visibleBinding?.state === 'interrupted'
      ? 'Session interrupted'
      : visibleBinding?.state === 'failed'
        ? 'Session failed'
        : 'Agent working';
  const visibleStatusClass = visibleBinding?.state === 'needs-input'
    ? 'text-amber-600'
    : visibleBinding?.state === 'failed'
      ? 'text-red-600'
      : visibleBinding?.state === 'interrupted'
        ? 'text-orange-600'
        : 'text-emerald-600';

  return (
    <AgentSessionSupervisorContext.Provider value={value}>
      {children}
      {visibleBinding && visibleTask && <button type="button" onClick={() => openBinding(visibleBinding)} className="fixed bottom-12 right-4 z-50 flex min-h-11 max-w-[min(320px,calc(100vw-2rem))] items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg shadow-slate-900/10 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label={`Reopen minimized supervision for ${visibleTask.title}`}>
        <AgentIcon className={`size-4 shrink-0 ${visibleStatusClass}`} aria-hidden="true" />
        <span className="min-w-0 text-left">
          <span className={`block truncate ${visibleStatusClass}`}>{visibleStatusLabel}</span>
          <span className="block truncate text-[11px] font-medium text-slate-500" title={visibleTask.title}>{visibleTask.title}</span>
        </span>
      </button>}
      {request && (
        <TaskExecutionAction
          key={request.requestId}
          task={request.task}
          repositoryFolder={request.repositoryFolder}
          openRequest={request.requestId}
          startOnOpenRequest={request.startOnRequest}
          trigger={null}
        />
      )}
    </AgentSessionSupervisorContext.Provider>
  );
}
