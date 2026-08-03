import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Folder, Play, Server } from 'lucide-react';
import { toast } from 'sonner';
import type { Task } from '../types';
import { describeAgentRuntimeSession, summarizeAgentRuntimeActivity, type AgentRuntimeActivityEvent } from '../utils/agentRuntimeActivity';
import {
  agentRuntimeWorkspaceSourceLabel,
  resolveAgentRuntimeWorkspace,
  type AgentRuntimeWorkspaceResolution,
} from '../utils/agentRuntimeWorkspace';
import {
  ContextMenuItem,
} from './ui/context-menu';
import { TaskSessionComposer } from './TaskSessionComposer';
import { StateBadge } from './statuses/AppStatusBar';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';

interface RuntimeState {
  profiles?: Array<{ id: string; name: string; integrationMode: string; enabled: boolean }>;
  defaults?: { globalProfileId?: string | null; globalWorkspacePath?: string | null; projectProfileIds?: Record<string, string> };
  observations?: Record<string, { availability?: string; authentication?: string; state?: string; error?: string }>;
}

interface RuntimeResolution {
  ok: boolean;
  state?: string;
  source?: string;
  profile?: { id: string; name: string; integrationMode: string };
  error?: string;
}

interface ExecutionPreflight {
  blockers?: Array<{ code?: string; message: string }>;
  warnings?: Array<{ code?: string; message: string }>;
  model?: { requested?: string | null; effective?: string | null };
  contractDigest?: string;
  connection?: { ok?: boolean; error?: string; state?: string };
}

interface SessionBinding {
  id: string;
  state: string;
  revision: number;
  workspacePath?: string;
  opaqueSessionRef?: string;
  capabilities?: Array<{ id: string; support: string }>;
  scope?: { taskId?: string };
}

interface SessionEvent extends AgentRuntimeActivityEvent {
  requestId?: string | number;
}

interface PendingRuntimeRequest {
  bindingId: string;
  requestId: string | number;
  method: string;
  serverName: string;
  mode: string;
  message: string;
  fields: Array<{ name: string; type: string; title: string; description: string; required: boolean; defaultValue?: unknown; options?: unknown[] }>;
}

interface TaskExecutionActionProps {
  task: Task;
  repositoryFolder?: string;
  trigger?: ReactNode;
  openRequest?: number;
  onOpenRequestHandled?: () => void;
  startOnTrigger?: boolean;
  onOpen?: () => void;
}

function runtimeLabel(mode?: string) {
  if (mode === 'acp-local-stdio') return 'Native ACP';
  if (mode === 'codex-app-server-stdio') return 'Native Codex app-server';
  if (mode === 'claude-stream-json-stdio') return 'Native Claude stream-json';
  if (mode === 'external-handoff') return 'External handoff';
  return 'Not resolved';
}

function taskStatusLabel(status: Task['status']) {
  if (status === 'in-progress') return 'In progress';
  if (status === 'under-review') return 'Under review';
  if (status === 'done') return 'Done';
  return 'Open';
}

export function TaskExecutionAction({ task, repositoryFolder, trigger, openRequest, onOpenRequestHandled, startOnTrigger = false, onOpen }: TaskExecutionActionProps) {
  const [open, setOpen] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [workspace, setWorkspace] = useState<AgentRuntimeWorkspaceResolution | null>(null);
  const [resolution, setResolution] = useState<RuntimeResolution | null>(null);
  const [preflight, setPreflight] = useState<ExecutionPreflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [binding, setBinding] = useState<SessionBinding | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRuntimeRequest[]>([]);
  const [requestValues, setRequestValues] = useState<Record<string, unknown>>({});
  const [mcpReadOnly, setMcpReadOnly] = useState<boolean | null>(null);
  const [, setHasMoreEvents] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [steerText, setSteerText] = useState('');

  const activeContribution = task.collaboration?.contributions?.find(contribution => contribution.state === 'working');
  const startableContribution = task.collaboration?.contributions?.find(contribution =>
    contribution.state === 'pending' || contribution.state === 'revision-requested'
  );
  const activeAttempt = Boolean(activeContribution?.latestAttemptId);
  const resolvedRepositoryFolder = workspace?.workspacePath || '';
  const repositorySource = agentRuntimeWorkspaceSourceLabel(workspace?.source);
  const reportRuntimeError = (operation: string, caught: unknown, fallback: string) => {
    const message = caught instanceof Error ? caught.message : fallback;
    console.error(`[agent-runtime:ui] ${operation}.failed`, { taskId: task.id, bindingId: binding?.id || null, message, error: caught });
    setError(message);
    toast.error(message);
  };

  useEffect(() => {
    if (openRequest) {
      setStartRequested(true);
      setOpen(true);
      onOpenRequestHandled?.();
    }
  }, [onOpenRequestHandled, openRequest]);

  useEffect(() => {
    if (!open || !window.electron?.agentRuntime) return;
    let cancelled = false;
    setLoading(true);
    setSessionLoaded(false);
    setError(null);
    setWorkspace(null);
    setResolution(null);
    setPreflight(null);
    void (async () => {
      try {
        const stateResult = await window.electron.agentRuntime.getState();
        if (cancelled) return;
        if (!stateResult.ok || !stateResult.value) throw new Error(stateResult.error || 'Runtime profiles could not be loaded.');
        const state = stateResult.value as RuntimeState;
        setRuntimeState(state);
        const mcpCapabilities = await window.electron.mcp.getCapabilities();
        if (!cancelled) setMcpReadOnly(mcpCapabilities.ok ? Boolean(mcpCapabilities.data?.readOnly) : null);
        const resolvedWorkspace = resolveAgentRuntimeWorkspace(
          task.repositoryFolder,
          repositoryFolder,
          state.defaults?.globalWorkspacePath,
        );
        if (!cancelled) setWorkspace(resolvedWorkspace);
        const projectId = task.projectIds?.[0] || task.swimlaneId;
        const resolutionResult = await window.electron.agentRuntime.resolve({ projectId });
        if (!resolutionResult.ok || !resolutionResult.value) throw new Error(resolutionResult.error || 'The selected runtime is unavailable.');
        const resolved = resolutionResult.value as RuntimeResolution;
        if (!cancelled) setResolution(resolved);
        const prepared = await window.electron.agentRuntime.prepareExecution({
          taskId: task.id,
          contributionId: startableContribution?.id,
          projectId,
          executionProfileId: resolved.profile?.id,
          workspacePath: resolvedWorkspace.workspacePath,
          expectedRevision: task.__mcpRevision ?? 0,
        });
        if (!cancelled) setPreflight(prepared as ExecutionPreflight);
      } catch (caught) {
        if (!cancelled) reportRuntimeError('preflight', caught, 'Runtime preflight failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, repositoryFolder, startableContribution?.id, task.__mcpRevision, task.id, task.projectIds, task.repositoryFolder, task.swimlaneId]);

  useEffect(() => {
    if (!open) return;
    void refreshSession();
    const timer = window.setInterval(() => void refreshSession(), 2500);
    return () => window.clearInterval(timer);
  }, [open, task.id]);

  const observation = resolution?.profile ? runtimeState?.observations?.[resolution.profile.id] : undefined;
  const blockers = [
    ...(!resolvedRepositoryFolder && !loading ? ['A working directory could not be resolved.'] : []),
    ...(resolution?.profile?.integrationMode === 'external-handoff' ? ['The selected profile supports external handoff, not a managed session.'] : []),
    ...(resolution && !resolution.ok ? [resolution.error || 'The selected runtime is unavailable.'] : []),
    ...(preflight?.connection?.ok === false ? [preflight.connection.error || `Runtime connection is ${preflight.connection.state || 'unavailable'}.`] : []),
    ...(preflight?.blockers || []).map(blocker => blocker.message),
  ];
  const warnings = preflight?.warnings || [];
  const hasCapability = (id: string) => binding?.capabilities?.some(capability => capability.id === id && capability.support === 'supported') ?? false;
  const sessionSummary = binding ? describeAgentRuntimeSession(binding.state, events) : null;
  const latestTurnStartIndex = events.findLastIndex(event => event.nativeEventType === 'turn/started');
  const latestRunEvents = latestTurnStartIndex < 0 ? [] : events.slice(latestTurnStartIndex).filter(event =>
    ['turn/started', 'turn/completed', 'item/started', 'item/completed', 'warning', 'error'].includes(event.nativeEventType || '')
  );
  const activity = summarizeAgentRuntimeActivity(latestRunEvents);
  const visibleActivity = activity.length > 0 ? activity : binding?.state === 'interrupted'
    ? [{ id: `${binding.id}-interrupted`, label: 'Work was interrupted', detail: 'Start work again to reconnect and continue with the task instructions.', count: 1, tone: 'warning' as const }]
    : binding?.state === 'failed'
      ? [{ id: `${binding.id}-failed`, label: 'Work stopped unexpectedly', detail: 'The runtime session failed before completing the task.', count: 1, tone: 'danger' as const }]
      : [];
  const isTurnActive = sessionSummary?.isTurnActive === true;
  const agentStatusTone = sessionSummary?.tone === 'positive' ? 'success'
    : sessionSummary?.tone === 'warning' ? 'warning'
      : sessionSummary?.tone === 'danger' ? 'danger' : 'muted';
  const instructionsSent = latestTurnStartIndex >= 0 || events.some(event => event.nativeEventType === 'omvra/taskInstructions/sent');
  const latestTurnCompleted = latestRunEvents.some(event => event.nativeEventType === 'turn/completed');

  const refreshSession = async () => {
    const index = await window.electron?.agentRuntime?.sessions?.list?.({ limit: 100 });
    if (!index?.ok) {
      console.warn('[agent-runtime:ui] session-refresh.rejected', { taskId: task.id, error: index?.error || 'Session list unavailable.' });
      setSessionLoaded(true);
      return;
    }
    const nextBinding = (index.bindings || []).findLast((candidate: SessionBinding) => candidate.scope?.taskId === task.id) || null;
    if (!nextBinding) {
      setBinding(null);
      setEvents([]);
      setPendingRequests([]);
      setHasMoreEvents(false);
      setSessionLoaded(true);
      return;
    }
    const detail = await window.electron?.agentRuntime?.sessions?.list?.({ bindingId: nextBinding.id, limit: 100 });
    const requests = await window.electron?.agentRuntime?.sessions?.requests?.(nextBinding.id);
    setBinding((detail?.bindings || [nextBinding])[0] || nextBinding);
    setEvents((detail?.events || []) as SessionEvent[]);
    setPendingRequests(Array.isArray(requests) ? requests as PendingRuntimeRequest[] : []);
    setHasMoreEvents(Boolean(detail?.hasMore));
    setSessionLoaded(true);
  };

  const startWork = async (replaceBinding = false) => {
    if (!resolvedRepositoryFolder || !resolution?.profile || blockers.length > 0 || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    console.info('[agent-runtime:ui] session-start.requested', { taskId: task.id, executionProfileId: resolution.profile.id });
    try {
      if (replaceBinding && binding) {
        const closed = await window.electron?.agentRuntime?.sessions?.close?.(binding.id);
        if (!closed?.ok) throw new Error(closed?.message || closed?.error || 'The stale runtime session could not be replaced.');
      }
      const result = await window.electron?.agentRuntime?.sessions?.start?.({
        confirmed: true,
        taskId: task.id,
        contributionId: startableContribution?.id,
        actorPersonId: task.assigneeId,
        projectId: task.projectIds?.[0] || task.swimlaneId,
        executionProfileId: resolution.profile.id,
        workspacePath: resolvedRepositoryFolder,
        expectedRevision: task.__mcpRevision ?? 0,
        expectedContractDigest: preflight?.contractDigest,
        idempotencyKey: `renderer-start-${task.id}-${Date.now()}`,
      });
      if (!result?.ok) throw new Error(result?.message || result?.blockers?.[0]?.message || result?.error || 'The runtime session could not be started.');
      setBinding(result.binding as SessionBinding);
      await refreshSession();
      toast.success('Codex started working', { description: task.title });
      console.info('[agent-runtime:ui] session-start.completed', { taskId: task.id, bindingId: result.binding?.id || null });
    } catch (caught) {
      reportRuntimeError('session-start', caught, 'The runtime session could not be started.');
    } finally {
      setOperationBusy(false);
    }
  };

  const runSessionOperation = async (operation: 'prompt' | 'steer' | 'cancel' | 'close') => {
    if (!binding || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
      if (operation === 'close') {
        const result = await window.electron?.agentRuntime?.sessions?.close?.(binding.id);
        if (!result?.ok) throw new Error(result?.message || result?.error || 'The session could not be closed.');
      } else {
        const text = operation === 'cancel' ? undefined : steerText.trim();
        if (operation !== 'cancel' && !text) return;
        const result = await window.electron?.agentRuntime?.sessions?.[operation]?.({ bindingId: binding.id, ...(text ? { text } : {}) });
        if (!result?.ok) throw new Error(result?.message || result?.error || 'The session operation failed.');
        setSteerText('');
      }
      await refreshSession();
    } catch (caught) {
      reportRuntimeError(`session-${operation}`, caught, 'The session operation failed.');
    } finally {
      setOperationBusy(false);
    }
  };

  const respondToRequest = async (request: PendingRuntimeRequest, action: 'accept' | 'decline') => {
    if (!binding || requestBusy) return;
    setRequestBusy(true);
    setError(null);
    try {
      const content = action === 'accept'
        ? Object.fromEntries(request.fields.map(field => [field.name, requestValues[field.name] ?? field.defaultValue ?? (field.type === 'boolean' ? false : '')]))
        : null;
      const result = await window.electron?.agentRuntime?.sessions?.respond?.({
        bindingId: binding.id,
        requestId: request.requestId,
        result: { action, content, _meta: null },
      });
      if (!result?.ok) throw new Error(result?.message || result?.error || 'The runtime input could not be submitted.');
      setRequestValues({});
      await refreshSession();
    } catch (caught) {
      reportRuntimeError('request-response', caught, 'The runtime input could not be submitted.');
    } finally {
      setRequestBusy(false);
    }
  };

  const resumeSession = async () => {
    if (!binding || !resolvedRepositoryFolder || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
      const result = await window.electron?.agentRuntime?.sessions?.resume?.({ bindingId: binding.id, workspacePath: resolvedRepositoryFolder });
      if (!result?.ok) throw new Error(result?.message || result?.error || 'The runtime session could not be resumed.');
      await refreshSession();
      toast.success('Codex resumed work', { description: task.title });
    } catch (caught) {
      reportRuntimeError('session-resume', caught, 'The runtime session could not be resumed.');
    } finally {
      setOperationBusy(false);
    }
  };

  const continueTaskSession = async () => {
    if (!binding || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
      const result = await window.electron?.agentRuntime?.sessions?.continueTask?.(binding.id);
      if (!result?.ok) throw new Error(result?.message || result?.error || 'The runtime session could not be continued.');
      await refreshSession();
      toast.success('Codex continued work', { description: task.title });
    } catch (caught) {
      reportRuntimeError('session-continue-task', caught, 'The runtime session could not be continued.');
    } finally {
      setOperationBusy(false);
    }
  };

  const openExternal = async () => {
    if (!resolution?.profile || !resolvedRepositoryFolder || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
      const result = await window.electron?.agentRuntime?.openExternal?.({
        executionProfileId: resolution.profile.id,
        projectId: task.projectIds?.[0] || task.swimlaneId,
        workspacePath: resolvedRepositoryFolder,
        taskId: task.id,
        contextReference: `omvra://task/${task.id}`,
        prompt: `Review task ${task.title} in Omvra before starting work.`,
      });
      if (!result?.ok) throw new Error(result?.error || 'The external handoff could not be opened.');
    } catch (caught) {
      reportRuntimeError('external-handoff', caught, 'The external handoff could not be opened.');
    } finally {
      setOperationBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !startRequested || loading || !sessionLoaded || operationBusy) return;
    if (binding) {
      setStartRequested(false);
      if (binding.workspacePath !== resolvedRepositoryFolder && !activeAttempt && ['ready', 'interrupted'].includes(binding.state)) {
        void startWork(true);
        return;
      }
      if (binding.state === 'interrupted') void resumeSession();
      else if (binding.state === 'ready') void continueTaskSession();
      return;
    }
    if (!preflight || !resolution?.profile || !workspace) return;
    setStartRequested(false);
    if (blockers.length > 0) {
      toast.error('Codex could not start work', { description: blockers[0] });
      return;
    }
    void startWork();
  }, [activeAttempt, binding?.id, binding?.state, binding?.workspacePath, loading, open, operationBusy, preflight, resolution?.profile?.id, resolvedRepositoryFolder, sessionLoaded, startRequested, workspace]);

  return (
    <>
      {trigger !== undefined ? (trigger ? <button type="button" onClick={() => { onOpen?.(); if (startOnTrigger) setStartRequested(true); setOpen(true); }} className="text-left">{trigger}</button> : null) : <ContextMenuItem onSelect={() => { onOpen?.(); setStartRequested(true); setOpen(true); }}>
        <Play />
        {activeAttempt ? 'Open supervision' : 'Start work'}
      </ContextMenuItem>}
      <Sheet open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) setStartRequested(false); }}>
        <SheetContent
          className="omvra-settings-sheet !bottom-2 !left-auto !right-2 !top-2 !h-auto !w-[min(640px,calc(100vw-16px))] !translate-x-0 !translate-y-0 gap-0 overflow-hidden rounded-[24px] border-0 bg-white p-0 shadow-[0_2px_8px_rgba(0,0,0,0.10),0_-6px_12px_rgba(0,0,0,0.10),0_14px_28px_rgba(0,0,0,0.10)] sm:max-w-none"
          overlayClassName="omvra-settings-overlay"
        >
          <SheetHeader className="shrink-0 border-b border-black/6 px-6 py-5 pr-14 text-left">
            <SheetTitle className="text-lg">{activeAttempt ? 'Open supervision' : 'Start work'}</SheetTitle>
            <SheetDescription>{binding ? 'Follow the agent’s task progress, blockers, and outcome. Guidance is optional.' : 'Omvra is resolving the task context and starting the assigned work.'}</SheetDescription>
          </SheetHeader>

          <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm ${binding ? 'flex flex-col' : 'space-y-3'}`}>
            {mcpReadOnly && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><div className="font-semibold">Omvra task updates are disabled</div><div className="mt-1">MCP access is set to Read Only. Codex can inspect this task but cannot change its description or status. Select Task Write under Settings → MCP Access and restart the listener to allow task updates.</div></div>}
            {!binding && <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Server className="size-3.5" />Runtime</div>
                <div className="mt-1 font-medium text-slate-900">{loading ? 'Resolving…' : runtimeLabel(resolution?.profile?.integrationMode)}</div>
                {resolution?.profile && <div className="text-xs text-slate-500">{resolution.profile.name} · {resolution.source}</div>}
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Folder className="size-3.5" />Working directory</div>
                <div className={`mt-1 truncate font-medium ${resolvedRepositoryFolder ? 'text-slate-900' : 'text-amber-700'}`} title={resolvedRepositoryFolder || undefined}>{resolvedRepositoryFolder || 'Resolving…'}</div>
                <div className="text-xs text-slate-500">{repositorySource}</div>
              </div>
            </div>}
            {!binding && observation && (
              <div className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                <p>Runtime observation: {observation.availability || 'unknown'} · authentication {observation.authentication || 'unknown'} · {observation.state || 'unknown'}.</p>
                {observation.error && <p className="mt-1 text-rose-700">Last probe: {observation.error}</p>}
              </div>
            )}
            {!binding && preflight?.model && (preflight.model.requested || preflight.model.effective) && (
              <div className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                Model: requested {preflight.model.requested || 'runtime default'} · effective {preflight.model.effective || 'runtime default'}.
              </div>
            )}
            {!binding && warnings.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                <div className="font-semibold">Preflight warnings</div>
                <ul className="mt-1 space-y-1">{warnings.map(warning => <li key={`${warning.code || 'warning'}-${warning.message}`}>• {warning.message}</li>)}</ul>
              </div>
            )}
            {binding && (
              <div className="flex min-h-0 flex-1 flex-col rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">Agent status <StateBadge label={sessionSummary?.label || 'Unavailable'} value="" tone={agentStatusTone} title={sessionSummary?.detail} /></div>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">Task status <StateBadge label={taskStatusLabel(task.status)} value="" tone={task.status === 'done' ? 'success' : task.status === 'under-review' ? 'warning' : task.status === 'in-progress' ? 'success' : 'muted'} /></div>
                </div>
                {pendingRequests.map(request => {
                  const missingRequired = request.fields.some(field => field.required && (requestValues[field.name] ?? field.defaultValue ?? '') === '');
                  return <div key={`${request.method}-${request.requestId}`} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-xs font-semibold text-amber-900">Codex needs your input</div>
                    <div className="mt-1 text-xs leading-5 text-amber-800">{request.message}</div>
                    {request.serverName && <div className="mt-1 text-[11px] text-amber-700">Requested by {request.serverName}</div>}
                    {request.fields.length > 0 && <div className="mt-3 space-y-2">{request.fields.map(field => {
                      const value = requestValues[field.name] ?? field.defaultValue ?? (field.type === 'boolean' ? false : '');
                      return <label key={field.name} className="block text-xs text-slate-700"><span className="font-medium">{field.title}{field.required ? ' *' : ''}</span>{field.description && <span className="ml-1 text-slate-500">{field.description}</span>}
                        {field.type === 'boolean'
                          ? <input type="checkbox" checked={Boolean(value)} onChange={event => setRequestValues(current => ({ ...current, [field.name]: event.target.checked }))} className="ml-2 align-middle" />
                          : field.options?.length
                            ? <select value={String(value)} onChange={event => setRequestValues(current => ({ ...current, [field.name]: event.target.value }))} className="mt-1 block w-full rounded border border-amber-200 bg-white px-2 py-1.5"><option value="">Select…</option>{field.options.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select>
                            : <input type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} value={String(value)} onChange={event => setRequestValues(current => ({ ...current, [field.name]: field.type === 'number' || field.type === 'integer' ? Number(event.target.value) : event.target.value }))} className="mt-1 block w-full rounded border border-amber-200 bg-white px-2 py-1.5" />}
                      </label>;
                    })}</div>}
                    <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => void respondToRequest(request, 'decline')} disabled={requestBusy} className="rounded border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40">Decline</button><button type="button" onClick={() => void respondToRequest(request, 'accept')} disabled={requestBusy || missingRequired} className="rounded bg-amber-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Continue</button></div>
                  </div>;
                })}
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-700">Execution stages</div>
                  <div className="mt-3 grid gap-2 text-xs">
                    <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${binding.state === 'starting' ? 'bg-blue-500' : 'bg-emerald-500'}`} /><span className="font-medium text-slate-700">Codex runtime</span><span className="ml-auto text-slate-500">{binding.state === 'starting' ? 'Booting' : 'Started'}</span></div>
                    <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${instructionsSent ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="font-medium text-slate-700">Task instructions</span><span className="ml-auto text-slate-500">{instructionsSent ? 'Sent and accepted' : 'Not sent yet'}</span></div>
                    <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${isTurnActive ? 'bg-emerald-500' : latestTurnCompleted ? 'bg-slate-400' : 'bg-slate-300'}`} /><span className="font-medium text-slate-700">Agent work</span><span className="ml-auto text-slate-500">{isTurnActive ? 'In progress' : latestTurnCompleted ? 'Run finished' : 'Not started'}</span></div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">Agent activity</div><div className="text-[11px] text-slate-400">Task progress only</div></div>
                <div className="mt-2 min-h-24 flex-1 space-y-1 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600" aria-live="polite">
                  {visibleActivity.length ? visibleActivity.map(item => <div key={item.id} className="flex items-start gap-2 rounded px-1.5 py-1.5">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.tone === 'danger' ? 'bg-red-500' : item.tone === 'warning' ? 'bg-amber-500' : item.tone === 'positive' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <div className="min-w-0 flex-1"><div className="font-medium text-slate-700">{item.label}{item.count > 1 ? ` × ${item.count}` : ''}</div>{item.detail && <div className="mt-0.5 text-[11px] text-slate-500">{item.detail}</div>}</div>
                    {'observedAt' in item && item.observedAt && <time className="shrink-0 text-[10px] text-slate-400" dateTime={item.observedAt}>{new Date(item.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>}
                  </div>) : <div className="px-1.5 py-1">No Codex work has started for this session.</div>}
                </div>
                <div className="mt-3">
                  <TaskSessionComposer
                    value={steerText}
                    running={isTurnActive}
                    busy={operationBusy}
                    canSubmit={Boolean(steerText.trim()) && (isTurnActive ? hasCapability('steer') : hasCapability('prompt'))}
                    canStop={hasCapability('cancel')}
                    placeholder={isTurnActive ? 'Add optional guidance' : 'Start an optional follow-up'}
                    onChange={setSteerText}
                    onSubmit={() => void runSessionOperation(isTurnActive && hasCapability('steer') ? 'steer' : 'prompt')}
                    onStop={() => void runSessionOperation('cancel')}
                  />
                </div>
              </div>
            )}
            {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
            {!error && blockers.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900"><AlertTriangle className="size-3.5" />Blocked before confirmation</div>
                <ul className="mt-2 space-y-1 text-xs text-amber-800">{blockers.map(blocker => <li key={blocker}>• {blocker}</li>)}</ul>
              </div>
            )}
          </div>

          <SheetFooter className="sticky bottom-0 z-10 mt-0 shrink-0 border-t border-black/6 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-2 text-left text-xs text-slate-500">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              {binding
                ? sessionSummary?.detail
                : activeAttempt
                  ? 'An execution attempt is already active for this task.'
                  : 'No process, task attempt, or model turn is started by opening this preflight.'}
            </div>
            <div className="flex shrink-0 justify-end gap-2">
              <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" onClick={() => setOpen(false)}>Close</button>
              {resolution?.profile?.integrationMode === 'external-handoff' && <button type="button" onClick={() => void openExternal()} disabled={operationBusy || !resolvedRepositoryFolder} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Open externally</button>}
              {(binding?.state === 'interrupted' || !binding) && <button type="button" onClick={() => void (binding?.state === 'interrupted' ? resumeSession() : startWork())} disabled={operationBusy || (binding?.state === 'interrupted' ? !resolvedRepositoryFolder : loading || blockers.length > 0 || activeAttempt)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{binding?.state === 'interrupted' ? 'Resume work' : activeAttempt ? 'Execution active' : operationBusy ? 'Starting…' : 'Start work'}</button>}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
