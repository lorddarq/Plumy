import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Folder, Info, MessageSquarePlus, Play, Server, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Task } from '../types';
import { agentRuntimeTurnState, describeAgentRuntimeSession, hasAgentRuntimeTaskStarted, isAgentRuntimeTurnInFlight, joinAgentMessageDeltas, selectCurrentAgentRuntimeTurnEvents, summarizeAgentRuntimeActivity, type AgentRuntimeActivityEvent, type AgentRuntimeTurnProjection } from '../utils/agentRuntimeActivity';
import {
  agentRuntimeWorkspaceSourceLabel,
  resolveAgentRuntimeWorkspace,
  type AgentRuntimeWorkspaceResolution,
} from '../utils/agentRuntimeWorkspace';
import {
  ContextMenuItem,
} from './ui/context-menu';
import { TaskSessionComposer } from './TaskSessionComposer';
import { ExecutionNotice } from './ExecutionNotice';
import { AgentLoadingState } from './AgentLoadingState';
import { StateBadge } from './statuses/AppStatusBar';
import { getAttentionState } from '../utils/attention';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { measurePerformanceOperation } from '../services/performanceLogging.ts';

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
  contractSnapshot?: { taskRevision?: number; contributionId?: string | null };
  connection?: { ok?: boolean; error?: string; state?: string };
}

interface SessionBinding {
  id: string;
  state: string;
  revision: number;
  workspacePath?: string;
  opaqueSessionRef?: string;
  capabilities?: Array<{ id: string; support: string }>;
  scope?: { kind?: string; taskId?: string };
  updatedAt?: string;
  lastObservedAt?: string;
  taskExecution?: { state?: string; batchNumber?: number; reason?: string; updatedAt?: string };
  turn?: AgentRuntimeTurnProjection & { updatedAt?: string };
}

interface SessionEvent extends AgentRuntimeActivityEvent {
  requestId?: string | number;
  bindingId?: string;
  workScope?: string;
}

interface PendingRuntimeRequest {
  bindingId: string;
  turnId?: string;
  requestId: string | number;
  method: string;
  responseKind?: 'elicitation' | 'codex-approval';
  serverName: string;
  mode: string;
  message: string;
  fields: Array<{ name: string; type: string; title: string; description: string; required: boolean; defaultValue?: unknown; options?: unknown[] }>;
}

const requestValueKey = (request: PendingRuntimeRequest, fieldName: string) => `${String(request.requestId)}:${fieldName}`;
const requestFieldValue = (request: PendingRuntimeRequest, field: PendingRuntimeRequest['fields'][number], values: Record<string, unknown>) =>
  values[requestValueKey(request, field.name)] ?? field.defaultValue ?? (field.type === 'boolean' ? false : '');
const requestFieldIsMissing = (request: PendingRuntimeRequest, field: PendingRuntimeRequest['fields'][number], values: Record<string, unknown>) => {
  if (!field.required) return false;
  const value = requestFieldValue(request, field, values);
  if (field.type === 'boolean') return typeof value !== 'boolean';
  if (field.type === 'number' || field.type === 'integer') return value === '' || !Number.isFinite(Number(value));
  return typeof value !== 'string' || value.trim() === '';
};

interface TaskExecutionActionProps {
  task: Task;
  repositoryFolder?: string;
  trigger?: ReactNode;
  openRequest?: number;
  onOpenRequestHandled?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
  onBlockedByBinding?: (binding: SessionBinding) => void;
  startOnTrigger?: boolean;
  startOnOpenRequest?: boolean;
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

function ExecutionHint({ tone, title, body }: { tone: 'info' | 'warning' | 'danger'; title: string; body: string }) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  const colorClass = tone === 'danger' ? 'text-red-700 hover:bg-red-50 focus-visible:ring-red-500' : tone === 'warning' ? 'text-amber-700 hover:bg-amber-50 focus-visible:ring-amber-500' : 'text-blue-700 hover:bg-blue-50 focus-visible:ring-blue-500';
  return <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" aria-label={`${title}: ${body}`} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${colorClass}`}>
        <Icon className="size-3.5" aria-hidden="true" />
        <span>{title}</span>
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" align="start" className="w-[min(360px,calc(100vw-2rem))] flex-col items-start whitespace-normal text-left">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 font-normal text-white/85">{body}</div>
    </TooltipContent>
  </Tooltip>;
}

export function TaskExecutionAction({ task, repositoryFolder, trigger, openRequest, onOpenRequestHandled, onVisibilityChange, onBlockedByBinding, startOnTrigger = false, startOnOpenRequest = true, onOpen }: TaskExecutionActionProps) {
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
  const refreshSequence = useRef(0);
  const taskAlreadyComplete = task.status === 'done';

  const activeContribution = task.collaboration?.contributions?.find(contribution => contribution.state === 'working');
  const startableContribution = task.collaboration?.contributions?.find(contribution =>
    contribution.state === 'pending' || contribution.state === 'revision-requested'
  );
  const terminalBinding = binding?.state === 'closed' || binding?.state === 'failed';
  const activeAttempt = isAgentRuntimeTurnInFlight(binding || undefined) || (Boolean(activeContribution?.latestAttemptId) && (
    !preflight || preflight.blockers?.some(blocker => blocker.code === 'ACP_EXECUTION_ALREADY_ACTIVE') === true
  ));
  const executionContributionId = preflight?.contractSnapshot?.contributionId || startableContribution?.id;
  const resolvedRepositoryFolder = workspace?.workspacePath || '';
  const repositorySource = agentRuntimeWorkspaceSourceLabel(workspace?.source);
  const reportRuntimeError = (operation: string, caught: unknown, fallback: string) => {
    const message = caught instanceof Error ? caught.message : fallback;
    console.error(`[agent-runtime:ui] ${operation}.failed`, { taskId: task.id, bindingId: binding?.id || null, message, error: caught });
    setError(message);
  };

  useEffect(() => {
    onVisibilityChange?.(open);
  }, [onVisibilityChange, open]);

  useEffect(() => {
    if (openRequest) {
      setStartRequested(startOnOpenRequest);
      setOpen(true);
      onOpenRequestHandled?.();
    }
  }, [onOpenRequestHandled, openRequest, startOnOpenRequest]);

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
        if (taskAlreadyComplete) {
          setPreflight({ ok: false, blockers: [{ code: 'TASK_ALREADY_COMPLETE', message: 'This task is already complete. Reopen it or move it back to In progress before starting new work.' }] });
          return;
        }
        const stateResult = await window.electron.agentRuntime.getState();
        if (cancelled) return;
        if (!stateResult.ok || !stateResult.value) throw new Error(stateResult.error || 'Agent connections could not be loaded.');
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
        if (!resolutionResult.ok || !resolutionResult.value) throw new Error(resolutionResult.error || 'The selected agent connection is unavailable.');
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
        if (!cancelled) reportRuntimeError('preflight', caught, 'Checks before starting failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, repositoryFolder, startableContribution?.id, task.__mcpRevision, task.id, task.projectIds, task.repositoryFolder, task.swimlaneId, taskAlreadyComplete]);

  useEffect(() => {
    if (!open) return;
    void refreshSession();
    const unsubscribe = window.electron?.agentRuntime?.sessions?.onEvent?.((payload) => {
      const nextBinding = payload?.binding as SessionBinding | undefined;
      const nextEvent = payload?.event as SessionEvent | undefined;
      if (nextBinding?.scope?.taskId !== task.id && nextEvent?.workScope !== 'task') return;
      if (nextBinding?.scope?.taskId === task.id) {
        refreshSequence.current += 1;
        setBinding(nextBinding);
        if (['interrupted', 'closed', 'failed'].includes(nextBinding.state)) {
          setPendingRequests([]);
          setRequestValues({});
        }
        if (agentRuntimeTurnState(nextBinding) === 'waiting-input') void refreshSession();
      }
      if (nextEvent?.bindingId && (nextBinding?.scope?.taskId === task.id || binding?.id === nextEvent.bindingId)) {
        setEvents(current => current.some(event => event.id === nextEvent.id) ? current : [...current, nextEvent].slice(-100));
      }
    });
    return () => unsubscribe?.();
  }, [open, task.id, binding?.id]);

  const observation = resolution?.profile ? runtimeState?.observations?.[resolution.profile.id] : undefined;
  const blockers = [...new Set([
    ...(taskAlreadyComplete ? ['This task is already complete. Reopen it or move it back to In progress before starting new work.'] : []),
    ...(!resolvedRepositoryFolder && !loading ? ['A working directory could not be resolved.'] : []),
    ...(resolution?.profile?.integrationMode === 'external-handoff' ? ['The selected connection opens work externally and cannot be supervised in Omvra.'] : []),
    ...(resolution && !resolution.ok ? [resolution.error || 'The selected agent connection is unavailable.'] : []),
    ...(preflight?.connection?.ok === false ? [preflight.connection.error || `Agent connection is ${preflight.connection.state || 'unavailable'}.`] : []),
    ...(preflight?.blockers || []).map(blocker => blocker.message),
  ])];
  const warnings = preflight?.warnings || [];
  const hasCapability = (id: string) => binding?.capabilities?.some(capability => capability.id === id && capability.support === 'supported') ?? false;
  const taskExecutionState = binding?.taskExecution?.state;
  const lastBatchCompleted = taskExecutionState === 'batch-finished' || events.some(event => event.nativeEventType === 'turn/completed' && !['failed', 'interrupted'].includes(event.state || ''));
  const turnState = agentRuntimeTurnState(binding || undefined);
  const sessionSummary = binding ? describeAgentRuntimeSession(binding.state, events, lastBatchCompleted ? (taskExecutionState || 'batch-finished') : taskExecutionState, turnState) : null;
  const taskExecutionLabel: Record<string, string> = { starting: 'Starting', ready: 'Ready', working: 'Working', continuing: 'Continuing', waiting: 'Waiting for input', stopping: 'Stopping', 'batch-finished': 'Batch finished', interrupted: 'Interrupted', stopped: 'Stopped', failed: 'Failed', 'ready-for-review': 'Ready for review', 'outcome-unreconciled': 'Outcome needs review', complete: 'Complete' };
  const latestRunEvents = selectCurrentAgentRuntimeTurnEvents(events, binding?.turn?.id).filter(event =>
    ['turn/started', 'turn/completed', 'item/agentMessage/delta', 'item/started', 'item/completed', 'warning', 'error', 'omvra/taskBatch/automatic-continuing', 'omvra/taskBatch/automatic-limit-reached'].includes(event.nativeEventType || '')
  );
  const activity = summarizeAgentRuntimeActivity(latestRunEvents);
  const agentOutput = joinAgentMessageDeltas(latestRunEvents
    .filter(event => event.nativeEventType === 'item/agentMessage/delta' && event.messagePreview)
    .map(event => event.messagePreview || ''));
  const activityWithoutOutput = activity.filter(item => item.label !== 'Agent shared an update');
  const taskStarted = hasAgentRuntimeTaskStarted(turnState, events);
  const visibleActivity = activityWithoutOutput.length > 0 ? activityWithoutOutput : binding?.state === 'interrupted'
    ? [{ id: `${binding.id}-interrupted`, label: 'Work was interrupted', detail: 'Start work again to reconnect and continue with the task instructions.', count: 1, tone: 'warning' as const }]
    : binding?.state === 'failed'
      ? [{ id: `${binding.id}-failed`, label: 'Previous runtime unavailable', detail: 'Start a new session to reconnect; the current task context is preserved.', count: 1, tone: 'danger' as const }]
      : taskStarted && binding
        ? [{ id: `${binding.id}-working`, label: 'Agent work is in progress', detail: 'The runtime accepted the task instructions. Detailed activity will appear when it is reported.', count: 1, tone: 'neutral' as const }]
        : [];
  const isTurnActive = sessionSummary?.isTurnActive === true;
  const agentStatusTone = sessionSummary?.tone === 'positive' ? 'success'
    : sessionSummary?.tone === 'warning' ? 'warning'
      : sessionSummary?.tone === 'danger' ? 'danger' : 'muted';
  const instructionsSent = taskStarted;
  const latestTurnCompleted = latestRunEvents.some(event => event.nativeEventType === 'turn/completed');
  const lastObservedAt = binding?.lastObservedAt || binding?.updatedAt;
  const lastObservedLabel = lastObservedAt
    ? new Date(lastObservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;
  const executionNotice = task.status === 'under-review' || taskExecutionState === 'ready-for-review'
    ? { tone: 'warning' as const, title: 'Review the outcome', body: 'Inspect the completed work and acceptance checklist. Mark the task complete when the result is verified.' }
    : (binding?.state === 'failed' || taskExecutionState === 'failed')
    ? { tone: 'danger' as const, title: getAttentionState('failed').label, body: getAttentionState('failed').description }
    : taskExecutionState === 'outcome-unreconciled'
      ? { tone: 'warning' as const, title: 'Outcome needs review', body: 'The agent delivered an outcome, but the task status was not updated automatically. Review the result and move the task to Under Review when appropriate.' }
    : binding?.state === 'closed' && lastBatchCompleted
    ? { tone: 'info' as const, title: 'Last batch completed', body: 'The agent completed its latest work batch. The session is closed, but you can continue the task from its saved context.' }
    : binding?.state === 'closed'
      ? { tone: 'warning' as const, title: 'No agent is working right now', body: 'This task is still in progress, but the session shown here was closed. Start a new session to continue from the saved task context.' }
    : binding?.state === 'ready' && !isAgentRuntimeTurnInFlight(binding)
      ? { tone: 'info' as const, title: 'Last batch completed', body: 'The agent completed its latest work batch. Continue the task if more work is needed.' }
      : turnState === 'active'
        ? { tone: 'info' as const, title: 'Agent is working now', body: lastObservedLabel ? `The runtime last reported activity at ${lastObservedLabel}.` : 'The runtime is actively reporting work.' }
        : binding?.state === 'starting' || turnState === 'queued' || turnState === 'starting'
          ? { tone: 'info' as const, title: 'Connecting to the agent', body: 'The session is being created. Activity will appear here as soon as the runtime reports it.' }
          : turnState === 'waiting-input'
            ? { tone: 'warning' as const, title: 'Agent is waiting', body: 'The agent cannot continue until the pending request above is answered.' }
            : null;
  const copyAgentOutput = async () => {
    if (!agentOutput) return;
    try {
      await navigator.clipboard.writeText(agentOutput);
      toast.success('Agent output copied');
    } catch {
      toast.error('Could not copy agent output');
    }
  };
  const executionTitle = binding
    ? 'Open supervision'
    : loading
      ? 'Preparing work'
      : blockers.length > 0
        ? taskAlreadyComplete ? 'Task already complete' : 'Action needed before work starts'
        : preflight
          ? 'Ready to start'
          : 'Start work';
  const executionDescription = binding
    ? 'Follow the agent’s task progress, blockers, and outcome. Guidance is optional.'
    : loading
      ? 'Omvra is checking the assigned agent, working folder, model, and task instructions.'
      : blockers.length > 0
        ? taskAlreadyComplete ? 'Move the task back to In progress if more agent work is needed.' : 'Resolve the item below before Omvra can start the assigned work.'
        : 'Omvra has checked the task context and will open supervision when work begins.';

  const refreshSession = async () => {
    const sequence = ++refreshSequence.current;
    const index = await measurePerformanceOperation('acp', 'task-execution.sessions.index', async () => (
      window.electron?.agentRuntime?.sessions?.list?.({ limit: 100 })
    ));
    if (sequence !== refreshSequence.current) return null;
    if (!index?.ok) {
      console.warn('[agent-runtime:ui] session-refresh.rejected', { taskId: task.id, error: index?.error || 'Session list unavailable.' });
      setSessionLoaded(true);
      return null;
    }
    const taskBindings = (index.bindings || []).filter((candidate: SessionBinding) => candidate.scope?.kind === 'task' && candidate.scope?.taskId === task.id);
    const newestFirst = (items: SessionBinding[]) => [...items].sort((left, right) => Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || ''));
    const nextBinding = newestFirst(taskBindings.filter(candidate => isAgentRuntimeTurnInFlight(candidate) || candidate.state === 'ready' || candidate.state === 'starting'))[0]
      || newestFirst(taskBindings)[0]
      || null;
    if (!nextBinding) {
      setBinding(null);
      setEvents([]);
      setPendingRequests([]);
      setHasMoreEvents(false);
      setSessionLoaded(true);
      return null;
    }
    const detail = await measurePerformanceOperation('acp', 'task-execution.sessions.detail', async () => (
      window.electron?.agentRuntime?.sessions?.list?.({ bindingId: nextBinding.id, limit: 100 })
    ));
    const resolvedBinding = (detail?.bindings || [nextBinding])[0] || nextBinding;
    const requests = agentRuntimeTurnState(resolvedBinding) === 'waiting-input'
      ? await measurePerformanceOperation('acp', 'task-execution.requests.list', async () => (
          window.electron?.agentRuntime?.sessions?.requests?.(nextBinding.id)
        ))
      : [];
    if (sequence !== refreshSequence.current) return null;
    setBinding(resolvedBinding);
    setEvents((detail?.events || []) as SessionEvent[]);
    setPendingRequests(Array.isArray(requests) ? requests as PendingRuntimeRequest[] : []);
    setHasMoreEvents(Boolean(detail?.hasMore));
    setSessionLoaded(true);
    return resolvedBinding;
  };

  const recoverOrphanedSession = async (bindingId: string) => {
    const closed = await window.electron?.agentRuntime?.sessions?.close?.(bindingId);
    if (!closed?.ok) throw new Error(closed?.message || closed?.error || 'The unavailable runtime session could not be replaced.');
    setBinding(null);
    setEvents([]);
    setPendingRequests([]);
    const replacement = await refreshSession();
    // Re-enter the normal launch effect: it continues a recovered `ready`
    // session, leaves active/input sessions alone, and starts a new session
    // only when no usable replacement exists.
    setStartRequested(!replacement || replacement.state === 'ready' || replacement.state === 'starting' || isAgentRuntimeTurnInFlight(replacement));
    toast.info('Runtime session recovered', { description: 'The previous provider session was replaced while preserving your task context.' });
  };

  const startWork = async (replaceBinding = false) => {
    if (!resolvedRepositoryFolder || !resolution?.profile || blockers.length > 0 || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    console.info('[agent-runtime:ui] session-start.requested', { taskId: task.id, executionProfileId: resolution.profile.id });
    try {
      if (replaceBinding && binding) {
        const closed = await window.electron?.agentRuntime?.sessions?.close?.(binding.id);
        if (!closed?.ok) throw new Error(closed?.message || closed?.error || 'The previous work session could not be replaced.');
      }
      const result = await window.electron?.agentRuntime?.sessions?.start?.({
        confirmed: true,
        taskId: task.id,
        contributionId: executionContributionId,
        actorPersonId: task.assigneeId,
        projectId: task.projectIds?.[0] || task.swimlaneId,
        executionProfileId: resolution.profile.id,
        workspacePath: resolvedRepositoryFolder,
        expectedRevision: preflight?.contractSnapshot?.taskRevision ?? task.__mcpRevision ?? 0,
        expectedContractDigest: preflight?.contractDigest,
        idempotencyKey: `renderer-start-${task.id}-${Date.now()}`,
      });
      if (!result?.ok) {
        if (result.error === 'ACP_EXECUTION_ALREADY_ACTIVE') {
          if (result.binding && onBlockedByBinding) {
            onBlockedByBinding(result.binding as SessionBinding);
            toast.info('Opened the blocking task turn', { description: 'Omvra switched supervision to the exact task turn that is using execution capacity.' });
            return;
          }
          const current = await refreshSession();
          if (current && isAgentRuntimeTurnInFlight(current)) {
            setError(null);
            toast.info('This task is already open', { description: 'The active runtime session is now shown in this supervision window.' });
            return;
          }
        }
        throw new Error(result?.message || result?.blockers?.[0]?.message || result?.error || 'The work session could not be started.');
      }
      setBinding(result.binding as SessionBinding);
      await refreshSession();
      toast.success('Agent started working', { description: task.title });
      console.info('[agent-runtime:ui] session-start.completed', { taskId: task.id, bindingId: result.binding?.id || null });
    } catch (caught) {
      reportRuntimeError('session-start', caught, 'The work session could not be started.');
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
        if (!result?.ok) {
          if (result.error === 'ACP_SESSION_NOT_FOUND') {
            await recoverOrphanedSession(binding.id);
            return;
          }
          throw new Error(result?.message || result?.error || 'The requested action failed.');
        }
        setSteerText('');
      }
      await refreshSession();
    } catch (caught) {
      reportRuntimeError(`session-${operation}`, caught, 'The requested action failed.');
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
        ? Object.fromEntries(request.fields.map(field => [field.name, requestFieldValue(request, field, requestValues)]))
        : null;
      const response = request.responseKind === 'codex-approval'
        ? { decision: action === 'accept' ? 'accept' : 'decline' }
        : { action, content, _meta: null };
      const result = await window.electron?.agentRuntime?.sessions?.respond?.({
        bindingId: binding.id,
        requestId: request.requestId,
        result: response,
      });
      if (!result?.ok) {
        if (result.error === 'ACP_SESSION_NOT_FOUND') {
          setRequestValues({});
          await recoverOrphanedSession(binding.id);
          return;
        }
        throw new Error(result.message || result.error || 'Your response could not be submitted.');
      }
      setRequestValues({});
      await refreshSession();
    } catch (caught) {
      reportRuntimeError('request-response', caught, 'Your response could not be submitted.');
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
      if (!result?.ok) {
        if (result.error === 'ACP_SESSION_NOT_FOUND') {
          await recoverOrphanedSession(binding.id);
          return;
        }
        throw new Error(result?.message || result?.error || 'Work could not be resumed.');
      }
      await refreshSession();
      toast.success('Agent resumed work', { description: task.title });
    } catch (caught) {
      reportRuntimeError('session-resume', caught, 'Work could not be resumed.');
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
      if (!result?.ok) {
        if (result.error === 'ACP_SESSION_NOT_FOUND') {
          await recoverOrphanedSession(binding.id);
          return;
        }
        throw new Error(result.message || result.error || 'Work could not be continued.');
      }
      await refreshSession();
      toast.success('Agent continued work', { description: task.title });
    } catch (caught) {
      reportRuntimeError('session-continue-task', caught, 'Work could not be continued.');
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
          showClose={false}
        >
          <SheetHeader className="shrink-0 border-b border-black/6 px-6 py-5 pr-14 text-left">
            <SheetTitle className="text-lg">{executionTitle}</SheetTitle>
            <SheetDescription>{executionDescription}</SheetDescription>
            <SheetClose className="absolute right-5 top-5 rounded-md p-1.5 text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500">
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">{binding ? 'Minimize supervision' : 'Close'}</span>
            </SheetClose>
          </SheetHeader>

          <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm ${binding ? 'flex flex-col' : 'space-y-3'}`}>
            {mcpReadOnly && <ExecutionNotice tone="warning" title="Task access is read-only">The agent can inspect this task but cannot change its description or status. Select Task Write under Settings → MCP Access, then restart the listener.</ExecutionNotice>}
            {!binding && loading && <ExecutionNotice tone="info" title="Preparing your work session"><AgentLoadingState label="Checking the work session" variant="Drive" /><span className="mt-2 block">Omvra is verifying the task instructions, assigned agent, runtime connection, and working directory.</span></ExecutionNotice>}
            {!binding && !loading && preflight && blockers.length === 0 && <ExecutionNotice tone="info" title={getAttentionState('ready').label} nextStep={getAttentionState('ready').nextStep}>The task context is prepared. Omvra will keep this supervision view available while the agent works.</ExecutionNotice>}
            {error && <div className="mb-3"><ExecutionNotice tone="danger" title={getAttentionState('failed').label} nextStep={getAttentionState('failed').nextStep}>{error}</ExecutionNotice></div>}
            {!error && blockers.length > 0 && <div className="mb-3"><ExecutionHint tone={taskAlreadyComplete ? 'warning' : 'danger'} title={taskAlreadyComplete ? 'Task already complete' : 'Action needed before work starts'} body={`${blockers.join(' ')} ${taskAlreadyComplete ? 'Reopen or move the task to In progress, then start work.' : getAttentionState('blocked').nextStep}`} /></div>}
            {!binding && <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Server className="size-3.5" />Agent connection</div>
                <div className="mt-1 font-medium text-slate-900">{loading ? 'Checking…' : resolution?.profile?.name || 'Not configured'}</div>
                {resolution?.profile && <div className="text-xs text-slate-500">{runtimeLabel(resolution.profile.integrationMode)} · {resolution.source}</div>}
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Folder className="size-3.5" />Working directory</div>
                <div className={`mt-1 truncate font-medium ${resolvedRepositoryFolder ? 'text-slate-900' : 'text-amber-700'}`} title={resolvedRepositoryFolder || undefined}>{resolvedRepositoryFolder || 'Resolving…'}</div>
                <div className="text-xs text-slate-500">{repositorySource}</div>
              </div>
            </div>}
            {!binding && observation && (
              <ExecutionNotice tone={observation.error ? 'warning' : 'info'} title="Connection details">
                <span>{observation.availability || 'unknown'} · sign-in {observation.authentication || 'unknown'} · {observation.state || 'unknown'}.</span>
                {observation.error && <span className="mt-1 block text-rose-700">Last connection check: {observation.error}</span>}
              </ExecutionNotice>
            )}
            {!binding && preflight?.model && (preflight.model.requested || preflight.model.effective) && (
              <ExecutionNotice tone="info" title="Model">
                {preflight.model.effective || preflight.model.requested || 'Agent default'}{preflight.model.requested && preflight.model.effective && preflight.model.requested !== preflight.model.effective ? ` · requested ${preflight.model.requested}` : ''}.
              </ExecutionNotice>
            )}
            {!binding && warnings.length > 0 && (
              <ExecutionNotice tone="info" title="Check before starting">
                <ul className="space-y-1">{warnings.map(warning => <li key={`${warning.code || 'warning'}-${warning.message}`}>{warning.message}</li>)}</ul>
              </ExecutionNotice>
            )}
            {binding && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">Agent status <StateBadge label={sessionSummary?.label || 'Unavailable'} value="" tone={agentStatusTone} title={sessionSummary?.detail} /></div>
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">Execution status <StateBadge label={taskExecutionLabel[taskExecutionState || ''] || 'Synchronizing'} value={binding?.taskExecution?.batchNumber ? `Batch ${binding.taskExecution.batchNumber}` : ''} tone={taskExecutionState === 'working' || taskExecutionState === 'continuing' ? 'success' : taskExecutionState === 'failed' || taskExecutionState === 'interrupted' || taskExecutionState === 'outcome-unreconciled' ? 'danger' : taskExecutionState === 'waiting' || taskExecutionState === 'batch-finished' ? 'warning' : 'muted'} /></div>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">Task status <StateBadge label={taskStatusLabel(task.status)} value="" tone={task.status === 'done' ? 'success' : task.status === 'under-review' ? 'warning' : task.status === 'in-progress' ? 'success' : 'muted'} /></div>
                </div>
                {executionNotice && <div className="mt-2"><ExecutionHint tone={executionNotice.tone} title={executionNotice.title} body={executionNotice.body} /></div>}
                {!terminalBinding && turnState === 'waiting-input' && sessionLoaded && pendingRequests.length === 0 && (
                  <ExecutionNotice tone="warning" title="Input request unavailable" nextStep="Reconnect the session to continue." assertive>
                    <div>Omvra no longer has an answerable request for this session.</div>
                    <div className="mt-3 flex justify-end"><button type="button" onClick={() => void recoverOrphanedSession(binding.id)} disabled={operationBusy} className="rounded bg-amber-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Reconnect session</button></div>
                  </ExecutionNotice>
                )}
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-700">Work stages</div>
                  <div className="mt-3 grid gap-2 text-xs">
                    <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${binding.state === 'starting' ? 'bg-blue-500' : ['closed', 'failed', 'interrupted'].includes(binding.state) ? 'bg-slate-300' : 'bg-emerald-500'}`} /><span className="font-medium text-slate-700">Agent connection</span><span className="ml-auto text-slate-500">{binding.state === 'starting' ? 'Connecting' : ['closed', 'failed'].includes(binding.state) ? 'Closed' : binding.state === 'interrupted' ? 'Interrupted' : 'Connected'}</span></div>
                    <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${instructionsSent ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="font-medium text-slate-700">Task instructions</span><span className="ml-auto text-slate-500">{instructionsSent ? 'Sent and accepted' : 'Not sent yet'}</span></div>
                    <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${isTurnActive ? 'bg-emerald-500' : latestTurnCompleted ? 'bg-amber-400' : 'bg-slate-300'}`} /><span className="font-medium text-slate-700">Agent work</span><span className="ml-auto text-slate-500">{isTurnActive ? 'In progress' : latestTurnCompleted ? 'Batch finished' : binding.state === 'closed' ? 'Session closed' : 'Not started'}</span></div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">Agent activity</div>{isTurnActive ? <AgentLoadingState label="Thinking through the task" variant="Dots" /> : <div className="text-[11px] text-slate-400">Task progress only</div>}</div>
                <div className="mt-2 min-h-24 flex-1 space-y-1 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600" aria-live="polite">
                  {agentOutput && <div className="mb-2 rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agent output</div>
                      <div className="text-[10px] text-slate-400">{isTurnActive ? 'Streaming' : 'Latest response'}</div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-slate-700">{agentOutput}</p>
                    <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
                      <button type="button" onClick={() => void copyAgentOutput()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"><Copy className="size-3.5" aria-hidden="true" />Copy output</button>
                      <button type="button" onClick={() => { setSteerText(agentOutput); toast.success('Output added to the follow-up field'); }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"><MessageSquarePlus className="size-3.5" aria-hidden="true" />Use as follow-up</button>
                    </div>
                  </div>}
                  {visibleActivity.length ? visibleActivity.map(item => <div key={item.id} className="flex items-start gap-2 rounded px-1.5 py-1.5">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.tone === 'danger' ? 'bg-red-500' : item.tone === 'warning' ? 'bg-amber-500' : item.tone === 'positive' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <div className="min-w-0 flex-1"><div className="font-medium text-slate-700">{item.label}{item.count > 1 ? ` × ${item.count}` : ''}</div>{item.detail && <div className="mt-0.5 text-[11px] text-slate-500">{item.detail}</div>}</div>
                    {'observedAt' in item && item.observedAt && <time className="shrink-0 text-[10px] text-slate-400" dateTime={item.observedAt}>{new Date(item.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>}
                  </div>) : <div className="px-1.5 py-1">The agent has not started work yet.</div>}
                </div>
                <div className="mt-3">
                  {!terminalBinding && pendingRequests.length > 0 ? <div className="space-y-2">{pendingRequests.map(request => {
                    const missingRequired = request.fields.some(field => requestFieldIsMissing(request, field, requestValues));
                    return <ExecutionNotice key={`${request.method}-${request.requestId}`} tone="warning" title={getAttentionState('needs-input').label} nextStep={getAttentionState('needs-input').nextStep} assertive>
                      <div>{request.message}</div>
                      {request.serverName && <div className="mt-1 text-[11px] text-amber-700">Requested by {request.serverName}</div>}
                      {request.fields.length > 0 && <div className="mt-3 space-y-2">{request.fields.map(field => {
                        const key = requestValueKey(request, field.name);
                        const value = requestFieldValue(request, field, requestValues);
                        return <label key={field.name} className="block text-xs text-slate-700"><span className="font-medium">{field.title}{field.required ? ' *' : ''}</span>{field.description && <span className="ml-1 text-slate-500">{field.description}</span>}
                          {field.type === 'boolean'
                            ? <input type="checkbox" checked={Boolean(value)} onChange={event => setRequestValues(current => ({ ...current, [key]: event.target.checked }))} className="ml-2 align-middle" />
                            : field.options?.length
                              ? <select value={String(value)} onChange={event => setRequestValues(current => ({ ...current, [key]: event.target.value }))} className="mt-1 block w-full rounded border border-amber-200 bg-white px-2 py-1.5"><option value="">Select…</option>{field.options.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select>
                              : <input type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} value={String(value)} onChange={event => setRequestValues(current => ({ ...current, [key]: event.target.value }))} className="mt-1 block w-full rounded border border-amber-200 bg-white px-2 py-1.5" />}
                        </label>;
                      })}</div>}
                      <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void respondToRequest(request, 'decline')} disabled={requestBusy} className="rounded border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40">Decline</button><button type="button" onClick={() => void respondToRequest(request, 'accept')} disabled={requestBusy || missingRequired} className="rounded bg-amber-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{request.responseKind === 'codex-approval' ? 'Allow' : 'Continue'}</button></div>
                    </ExecutionNotice>;
                  })}</div> : <TaskSessionComposer
                    value={steerText}
                    running={isTurnActive}
                    busy={operationBusy}
                    canSubmit={!terminalBinding && Boolean(steerText.trim()) && (isTurnActive ? hasCapability('steer') : hasCapability('prompt'))}
                    canStop={!terminalBinding && isAgentRuntimeTurnInFlight(binding) && hasCapability('cancel')}
                    placeholder={isTurnActive ? 'Add optional guidance' : 'Start an optional follow-up'}
                    onChange={setSteerText}
                    onSubmit={() => void runSessionOperation(isTurnActive && hasCapability('steer') ? 'steer' : 'prompt')}
                    onStop={() => void runSessionOperation('cancel')}
                  />}
                </div>
              </div>
            )}
          </div>

          <SheetFooter className="sticky bottom-0 z-10 mt-0 shrink-0 flex-col gap-3 border-t border-black/6 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 w-full flex-1 items-start gap-2 text-left text-xs text-slate-500 sm:w-auto">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              {binding
                ? sessionSummary?.detail
                : activeAttempt
                  ? 'Work is already active for this task.'
                  : 'Omvra checks the agent, working directory, model, and task instructions before work starts.'}
            </div>
            <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto">
              <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1" onClick={() => setOpen(false)}>{binding ? 'Minimize supervision' : 'Close'}</button>
              {resolution?.profile?.integrationMode === 'external-handoff' && <button type="button" onClick={() => void openExternal()} disabled={operationBusy || !resolvedRepositoryFolder} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">Open externally</button>}
              {task.status !== 'done' && binding?.state === 'ready' && <button type="button" onClick={() => void continueTaskSession()} disabled={operationBusy} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">{operationBusy ? 'Continuing…' : 'Continue work'}</button>}
              {task.status !== 'done' && (binding?.state === 'interrupted' || binding?.state === 'failed' || binding?.state === 'closed' || !binding) && <button type="button" onClick={() => void (binding?.state === 'interrupted' && hasCapability('resume') ? resumeSession() : startWork(Boolean(binding && !terminalBinding)))} disabled={operationBusy || (binding?.state === 'interrupted' ? !resolvedRepositoryFolder : loading || blockers.length > 0 || activeAttempt)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">{binding?.state === 'interrupted' && hasCapability('resume') ? 'Resume task' : binding?.state === 'closed' ? 'Continue task' : binding?.state === 'failed' ? 'Reconnect and continue' : activeAttempt ? 'Work in progress' : operationBusy ? 'Starting…' : 'Start work'}</button>}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
