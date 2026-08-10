import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Context, type ReactNode } from 'react';
import type { Task, TimelineSwimlane } from '../types';
import { TaskExecutionAction } from './TaskExecutionAction';
import { agentRuntimeTurnState, isAgentRuntimeTurnInFlight, type AgentRuntimeTurnProjection } from '../utils/agentRuntimeActivity';
import { measurePerformanceOperation } from '../services/performanceLogging.ts';

export const CONNECTED_SESSION_STATES = new Set(['starting', 'ready']);
const HISTORY_SESSION_STATES = new Set(['interrupted', 'failed', 'closed', 'complete', 'completed']);

export interface SessionBinding {
  id: string;
  state: string;
  workspacePath?: string;
  scope?: { kind?: string; taskId?: string; goalId?: string; goalElementId?: string };
  taskExecution?: { state?: string; batchNumber?: number; reason?: string; updatedAt?: string };
  turn?: AgentRuntimeTurnProjection & { updatedAt?: string };
  updatedAt?: string;
}

export interface SessionDockItem {
  binding: SessionBinding;
  task?: Task;
  pendingRequest?: { requestId: string | number; message: string };
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
  state: 'none' | 'starting' | 'working' | 'hidden-active' | 'ready' | 'needs-input' | 'interrupted' | 'failed' | 'history' | 'blocked';
  binding?: SessionBinding;
  task?: Task;
  historyCount: number;
  items: SessionDockItem[];
  pendingRequest?: SessionDockItem['pendingRequest'];
}

type AgentSessionSupervisorGlobal = typeof globalThis & {
  __omvraAgentSessionSupervisorContext?: Context<AgentSessionSupervisorContextValue | null>;
};

// Vite can refresh this module while preserving mounted children. Keep the
// context identity stable so those children do not lose access to the provider.
const agentSessionSupervisorGlobal = globalThis as AgentSessionSupervisorGlobal;
const AgentSessionSupervisorContext = agentSessionSupervisorGlobal.__omvraAgentSessionSupervisorContext
  || (agentSessionSupervisorGlobal.__omvraAgentSessionSupervisorContext = createContext<AgentSessionSupervisorContextValue | null>(null));

export function useAgentSessionSupervisor() {
  const context = useContext(AgentSessionSupervisorContext);
  if (!context) throw new Error('AgentSessionSupervisor must be rendered above its launch surfaces.');
  return context;
}

export function AgentSessionSupervisorProvider({ children, tasks, projects }: { children: ReactNode; tasks: Task[]; projects: TimelineSwimlane[] }) {
  const [request, setRequest] = useState<AgentSessionRequest | null>(null);
  const [bindings, setBindings] = useState<SessionBinding[]>([]);
  const [pendingRequestsByBinding, setPendingRequestsByBinding] = useState<Record<string, SessionDockItem['pendingRequest']>>({});
  const [supervisionVisible, setSupervisionVisible] = useState(false);

  useEffect(() => {
    let disposed = false;
    let refreshRunning = false;
    const refresh = async () => {
      if (refreshRunning || disposed) return;
      refreshRunning = true;
      try {
        const result = await measurePerformanceOperation('acp', 'supervisor.sessions.list', async () => (
          window.electron?.agentRuntime?.sessions?.list?.({ limit: 100 })
        ));
        if (!result?.ok || !Array.isArray(result.bindings)) return;
        const nextBindings = result.bindings as SessionBinding[];
        const requestEntries = await Promise.all(nextBindings
          .filter(binding => agentRuntimeTurnState(binding) === 'waiting-input')
          .map(async binding => {
            const requests = await measurePerformanceOperation('acp', 'supervisor.requests.list', async () => (
              window.electron?.agentRuntime?.sessions?.requests?.(binding.id)
            ));
            const request = Array.isArray(requests) ? requests[0] : undefined;
            return [binding.id, request && typeof request.message === 'string' ? { requestId: request.requestId, message: request.message } : undefined] as const;
          }));
        if (!disposed) {
          setBindings(nextBindings);
          setPendingRequestsByBinding(Object.fromEntries(requestEntries));
        }
      } finally {
        refreshRunning = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    const unsubscribe = window.electron?.agentRuntime?.sessions?.onEvent?.((payload) => {
      if (payload?.binding) void refresh();
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
  const newestFirst = useCallback((items: SessionBinding[]) => [...items].sort((left, right) => Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || '')), []);
  const openBinding = useCallback((binding: SessionBinding) => {
    const task = binding.scope?.taskId ? tasks.find(candidate => candidate.id === binding.scope?.taskId) : undefined;
    if (!task) return;
    const currentBinding = newestFirst(bindings.filter(candidate => candidate.scope?.kind === 'task' && candidate.scope?.taskId === task.id && (isAgentRuntimeTurnInFlight(candidate) || CONNECTED_SESSION_STATES.has(candidate.state))))[0] || binding;
    const project = projects.find(candidate => task.projectIds?.includes(candidate.id) || candidate.id === task.swimlaneId);
    setRequest(current => ({
      task,
      repositoryFolder: currentBinding.workspacePath || task.repositoryFolder || project?.repositoryFolder,
      startOnRequest: false,
      requestId: (current?.requestId || 0) + 1,
    }));
  }, [bindings, newestFirst, projects, tasks]);
  const activeBinding = newestFirst(bindings.filter(isAgentRuntimeTurnInFlight))[0];
  const readyBinding = newestFirst(bindings.filter(binding => binding.state === 'ready' && !isAgentRuntimeTurnInFlight(binding)))[0];
  const historyBinding = [...bindings].reverse().find(binding => HISTORY_SESSION_STATES.has(binding.state));
  const dockBinding = activeBinding || readyBinding || historyBinding;
  const dockTask = dockBinding?.scope?.taskId ? tasks.find(task => task.id === dockBinding.scope?.taskId) : undefined;
  const dockItems = [...bindings]
    .filter(binding => binding.scope?.kind === 'task' && tasks.some(task => task.id === binding.scope?.taskId))
    .sort((left, right) => Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || ''))
    .slice(0, 8)
    .map(binding => ({ binding, task: tasks.find(task => task.id === binding.scope?.taskId), pendingRequest: pendingRequestsByBinding[binding.id] }));
  const blockedByActiveSession = Boolean(activeBinding && request && activeBinding.scope?.taskId !== request.task.id);
  const sessionDock = useMemo<SessionDockProjection>(() => ({
    state: blockedByActiveSession ? 'blocked' : activeBinding
      ? ['queued', 'starting'].includes(agentRuntimeTurnState(activeBinding) || '') ? 'starting' : agentRuntimeTurnState(activeBinding) === 'waiting-input' ? 'needs-input' : supervisionVisible ? 'working' : 'hidden-active'
      : readyBinding ? 'ready'
      : historyBinding?.state === 'interrupted' ? 'interrupted'
        : historyBinding?.state === 'failed' ? 'failed'
          : historyBinding ? 'history' : 'none',
    binding: dockBinding,
    task: dockTask,
    historyCount: bindings.filter(binding => HISTORY_SESSION_STATES.has(binding.state)).length,
    items: dockItems,
    pendingRequest: dockBinding ? pendingRequestsByBinding[dockBinding.id] : undefined,
  }), [activeBinding, bindings, blockedByActiveSession, dockBinding, dockItems, dockTask, historyBinding, pendingRequestsByBinding, readyBinding, supervisionVisible]);
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
          onBlockedByBinding={openBinding}
          trigger={null}
        />
      )}
    </AgentSessionSupervisorContext.Provider>
  );
}
