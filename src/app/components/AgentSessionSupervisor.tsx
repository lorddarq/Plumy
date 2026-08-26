import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Task, TimelineSwimlane } from '../types';
import { TaskExecutionAction } from './TaskExecutionAction';
import { agentRuntimeTurnState, isAgentRuntimeTurnInFlight, projectAgentRuntimeSession, type AgentRuntimeDockState, type AgentRuntimeTurnProjection } from '../utils/agentRuntimeActivity';
import { measurePerformanceOperation } from '../services/performanceLogging.ts';
import { findNewCompletedTaskRuns, type RuntimeEvent } from '../utils/agentRuntimeNotifications.ts';
import { areSerializedValuesEqual } from '../store/workspaceSelectors.ts';

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

interface AgentSessionLauncherContextValue {
  requestTask: AgentSessionSupervisorContextValue['requestTask'];
}

export interface SessionDockProjection {
  state: AgentRuntimeDockState;
  binding?: SessionBinding;
  task?: Task;
  historyCount: number;
  items: SessionDockItem[];
  pendingRequest?: SessionDockItem['pendingRequest'];
}

type AgentSessionSupervisorGlobal = typeof globalThis & {
  __omvraAgentSessionSupervisorContext?: Context<AgentSessionSupervisorContextValue | null>;
  __omvraAgentSessionLauncherContext?: Context<AgentSessionLauncherContextValue | null>;
};

// Vite can refresh this module while preserving mounted children. Keep the
// context identity stable so those children do not lose access to the provider.
const agentSessionSupervisorGlobal = globalThis as AgentSessionSupervisorGlobal;
const AgentSessionSupervisorContext = agentSessionSupervisorGlobal.__omvraAgentSessionSupervisorContext
  || (agentSessionSupervisorGlobal.__omvraAgentSessionSupervisorContext = createContext<AgentSessionSupervisorContextValue | null>(null));
const AgentSessionLauncherContext = agentSessionSupervisorGlobal.__omvraAgentSessionLauncherContext
  || (agentSessionSupervisorGlobal.__omvraAgentSessionLauncherContext = createContext<AgentSessionLauncherContextValue | null>(null));

export function useAgentSessionSupervisor() {
  const context = useContext(AgentSessionSupervisorContext);
  if (!context) throw new Error('AgentSessionSupervisor must be rendered above its launch surfaces.');
  return context;
}

export function useAgentSessionLauncher() {
  const context = useContext(AgentSessionLauncherContext);
  if (!context) throw new Error('AgentSessionSupervisor must be rendered above its launch surfaces.');
  return context;
}

export function AgentSessionSupervisorProvider({ children, tasks, projects }: { children: ReactNode; tasks: Task[]; projects: TimelineSwimlane[] }) {
  const [request, setRequest] = useState<AgentSessionRequest | null>(null);
  const [bindings, setBindings] = useState<SessionBinding[]>([]);
  const [pendingRequestsByBinding, setPendingRequestsByBinding] = useState<Record<string, SessionDockItem['pendingRequest']>>({});
  const [supervisionVisible, setSupervisionVisible] = useState(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    let disposed = false;
    let refreshRunning = false;
    let notificationsInitialized = false;
    const seenEventIds = new Set<string>();
    const notifyCompletedRuns = (events: RuntimeEvent[], nextBindings: SessionBinding[], initialize = false) => {
      if (!notificationsInitialized) {
        events.forEach(event => {
          const eventId = event && typeof event === 'object' && 'id' in event ? String(event.id || '') : '';
          if (eventId) seenEventIds.add(eventId);
        });
        if (initialize) notificationsInitialized = true;
        return;
      }
      const completedRuns = findNewCompletedTaskRuns(events, nextBindings, seenEventIds);
      for (const run of completedRuns) {
        const task = tasksRef.current.find(candidate => candidate.id === run.taskId);
        toast.success('Agent run finished', { id: run.eventId, description: task?.title || run.taskId });
      }
    };
    const readPendingRequest = async (binding: SessionBinding) => {
      const requests = await measurePerformanceOperation('acp', 'supervisor.requests.list', async () => (
        window.electron?.agentRuntime?.sessions?.requests?.(binding.id)
      ));
      const request = Array.isArray(requests) ? requests[0] : undefined;
      return request && typeof request.message === 'string' ? { requestId: request.requestId, message: request.message } : undefined;
    };
    const refreshPendingRequest = async (binding: SessionBinding) => {
      if (agentRuntimeTurnState(binding) !== 'waiting-input') {
        if (!disposed) setPendingRequestsByBinding(current => {
          if (!(binding.id in current)) return current;
          const next = { ...current };
          delete next[binding.id];
          return next;
        });
        return;
      }
      const nextRequest = await readPendingRequest(binding);
      if (!disposed) setPendingRequestsByBinding(current => {
        if (areSerializedValuesEqual(current[binding.id], nextRequest)) return current;
        const next = { ...current };
        if (nextRequest) next[binding.id] = nextRequest;
        else delete next[binding.id];
        return next;
      });
    };
    const refresh = async () => {
      if (refreshRunning || disposed) return;
      refreshRunning = true;
      try {
        const runtimeState = await window.electron?.agentRuntime?.getState?.();
        if (runtimeState?.ok && runtimeState.value?.defaults?.acpRuntimeAccessEnabled === false) return;
        const result = await measurePerformanceOperation('acp', 'supervisor.sessions.list', async () => (
          window.electron?.agentRuntime?.sessions?.list?.({ limit: 100, includeEvents: !notificationsInitialized })
        ));
        if (!result?.ok || !Array.isArray(result.bindings)) return;
        const nextBindings = result.bindings as SessionBinding[];
        notifyCompletedRuns(Array.isArray(result.events) ? result.events as RuntimeEvent[] : [], nextBindings, true);
        const requestEntries = await Promise.all(nextBindings
          .filter(binding => agentRuntimeTurnState(binding) === 'waiting-input')
          .map(async binding => {
            return [binding.id, await readPendingRequest(binding)] as const;
          }));
        if (!disposed) {
          setBindings(current => areSerializedValuesEqual(current, nextBindings) ? current : nextBindings);
          const nextRequests = Object.fromEntries(requestEntries);
          setPendingRequestsByBinding(current => areSerializedValuesEqual(current, nextRequests) ? current : nextRequests);
        }
      } finally {
        refreshRunning = false;
      }
    };
    void refresh();
    // Keep a bounded recovery poll for missed runtime events; live events update only their binding/request below.
    const timer = window.setInterval(() => void refresh(), 10000);
    const unsubscribe = window.electron?.agentRuntime?.sessions?.onEvent?.((payload) => {
      if (!payload?.binding) return;
      const nextBinding = payload.binding as SessionBinding;
      if (payload.kind === 'event' && payload.event) notifyCompletedRuns([payload.event as RuntimeEvent], [nextBinding]);
      setBindings(current => {
        const index = current.findIndex(binding => binding.id === nextBinding.id);
        const next = index < 0 ? [...current, nextBinding] : current.map(binding => binding.id === nextBinding.id ? nextBinding : binding);
        return areSerializedValuesEqual(current, next) ? current : next;
      });
      void refreshPendingRequest(nextBinding);
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
  const activeSessionProjection = projectAgentRuntimeSession(activeBinding, [], {
    blocked: blockedByActiveSession,
    supervisionVisible,
  });
  const sessionDock = useMemo<SessionDockProjection>(() => ({
    state: activeBinding ? activeSessionProjection.dockState : projectAgentRuntimeSession(readyBinding || historyBinding).dockState,
    binding: dockBinding,
    task: dockTask,
    historyCount: bindings.filter(binding => HISTORY_SESSION_STATES.has(binding.state)).length,
    items: dockItems,
    pendingRequest: dockBinding ? pendingRequestsByBinding[dockBinding.id] : undefined,
  }), [activeBinding, activeSessionProjection.dockState, bindings, dockBinding, dockItems, dockTask, historyBinding, pendingRequestsByBinding, readyBinding]);
  const value = useMemo(() => ({ requestTask, sessionDock, openSession: openBinding }), [openBinding, requestTask, sessionDock]);
  const launcherValue = useMemo(() => ({ requestTask }), [requestTask]);
  return (
    <AgentSessionLauncherContext.Provider value={launcherValue}>
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
    </AgentSessionLauncherContext.Provider>
  );
}
