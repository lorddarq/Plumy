import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Folder, Play, Send, Server, Square, X } from 'lucide-react';
import type { Task } from '../types';
import {
  ContextMenuItem,
} from './ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface RuntimeState {
  profiles?: Array<{ id: string; name: string; integrationMode: string; enabled: boolean }>;
  defaults?: { globalProfileId?: string | null; projectProfileIds?: Record<string, string> };
  observations?: Record<string, { availability?: string; authentication?: string; state?: string }>;
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
}

interface SessionBinding {
  id: string;
  state: string;
  revision: number;
  opaqueSessionRef?: string;
  capabilities?: Array<{ id: string; support: string }>;
  scope?: { taskId?: string };
}

interface SessionEvent {
  id: string;
  type: string;
  state?: string;
  toolName?: string;
  requestId?: string | number;
  cost?: number;
  currency?: string;
  totalTokens?: number;
}

interface TaskExecutionActionProps {
  task: Task;
  repositoryFolder?: string;
  trigger?: ReactNode;
  openRequest?: number;
}

function runtimeLabel(mode?: string) {
  if (mode === 'acp-local-stdio') return 'Native ACP';
  if (mode === 'codex-app-server-stdio') return 'Native Codex app-server';
  if (mode === 'claude-stream-json-stdio') return 'Native Claude stream-json';
  if (mode === 'external-handoff') return 'External handoff';
  return 'Not resolved';
}

export function TaskExecutionAction({ task, repositoryFolder, trigger, openRequest }: TaskExecutionActionProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [resolution, setResolution] = useState<RuntimeResolution | null>(null);
  const [preflight, setPreflight] = useState<ExecutionPreflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [binding, setBinding] = useState<SessionBinding | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [steerText, setSteerText] = useState('');
  const [outcomeKind, setOutcomeKind] = useState<'decision' | 'blocker' | 'evidence' | 'context-checkpoint'>('context-checkpoint');
  const [outcomeSummary, setOutcomeSummary] = useState('');

  const activeContribution = task.collaboration?.contributions?.find(contribution => contribution.state === 'working');
  const startableContribution = task.collaboration?.contributions?.find(contribution =>
    contribution.state === 'pending' || contribution.state === 'revision-requested'
  );
  const activeAttempt = Boolean(activeContribution?.latestAttemptId);
  const resolvedRepositoryFolder = task.repositoryFolder?.trim() || repositoryFolder?.trim() || '';
  const repositorySource = task.repositoryFolder?.trim() ? 'Task override' : repositoryFolder?.trim() ? 'Swimlane default' : 'Not configured';

  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (!open || !window.electron?.agentRuntime) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const stateResult = await window.electron.agentRuntime.getState();
        if (cancelled) return;
        if (!stateResult.ok) throw new Error(stateResult.error || 'Runtime profiles could not be loaded.');
        const state = stateResult.value as RuntimeState;
        setRuntimeState(state);
        const projectId = task.projectIds?.[0] || task.swimlaneId;
        const resolved = await window.electron.agentRuntime.resolve({ projectId });
        if (!cancelled) setResolution(resolved as RuntimeResolution);
        const folder = task.repositoryFolder?.trim() || repositoryFolder?.trim();
        if (folder) {
          const prepared = await window.electron.agentRuntime.prepareExecution({
            taskId: task.id,
            projectId,
            workspacePath: folder,
            expectedRevision: task.__mcpRevision ?? 0,
          });
          if (!cancelled) setPreflight(prepared as ExecutionPreflight);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Runtime preflight failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, repositoryFolder, task.__mcpRevision, task.id, task.projectIds, task.repositoryFolder, task.swimlaneId]);

  useEffect(() => {
    if (!open) return;
    void refreshSession();
    const timer = window.setInterval(() => void refreshSession(), 2500);
    return () => window.clearInterval(timer);
  }, [open, task.id]);

  const observation = resolution?.profile ? runtimeState?.observations?.[resolution.profile.id] : undefined;
  const blockers = [
    ...(!resolvedRepositoryFolder ? ['Repository folder is not configured for this task or its project swimlane.'] : []),
    ...(resolution?.profile?.integrationMode === 'external-handoff' ? ['The selected profile supports external handoff, not a managed session.'] : []),
    ...(resolution && !resolution.ok ? [resolution.error || 'The selected runtime is unavailable.'] : []),
    ...(preflight?.blockers || []).map(blocker => blocker.message),
  ];
  const warnings = preflight?.warnings || [];
  const hasCapability = (id: string) => binding?.capabilities?.some(capability => capability.id === id && capability.support === 'supported') ?? false;
  const reportedUsage = events.filter(event => event.type === 'usage-reported').at(-1);

  const refreshSession = async () => {
    const result = await window.electron?.agentRuntime?.sessions?.list?.({ limit: 50 });
    if (!result?.ok) return;
    const nextBinding = (result.bindings || []).find((candidate: SessionBinding) => candidate.scope?.taskId === task.id) || null;
    setBinding(nextBinding);
    setEvents((result.events || []).filter((event: SessionEvent & { bindingId?: string }) => event.bindingId === nextBinding?.id).slice(-20));
    setHasMoreEvents(Boolean(result.hasMore));
  };

  const startWork = async () => {
    if (!resolvedRepositoryFolder || !resolution?.profile || blockers.length > 0 || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
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
      if (!result?.ok) throw new Error(result?.message || result?.error || 'The runtime session could not be started.');
      setBinding(result.binding as SessionBinding);
      await refreshSession();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The runtime session could not be started.');
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
      setError(caught instanceof Error ? caught.message : 'The session operation failed.');
    } finally {
      setOperationBusy(false);
    }
  };

  const saveOutcome = async () => {
    if (!binding || !outcomeSummary.trim() || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
      const result = await window.electron?.agentRuntime?.sessions?.appendOutcome?.({
        bindingId: binding.id,
        kind: outcomeKind,
        summary: outcomeSummary.trim(),
        expectedRevision: task.__mcpRevision ?? 0,
        idempotencyKey: `renderer-outcome-${binding.id}-${Date.now()}`,
        actor: task.assigneeId || 'renderer',
      });
      if (!result?.ok) throw new Error(result?.message || result?.error || 'The outcome could not be recorded.');
      setOutcomeSummary('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The outcome could not be recorded.');
    } finally {
      setOperationBusy(false);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The runtime session could not be resumed.');
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
      setError(caught instanceof Error ? caught.message : 'The external handoff could not be opened.');
    } finally {
      setOperationBusy(false);
    }
  };

  return (
    <>
      {trigger !== undefined ? (trigger ? <button type="button" onClick={() => setOpen(true)} className="text-left">{trigger}</button> : null) : <ContextMenuItem onSelect={() => setOpen(true)}>
        <Play />
        {activeAttempt ? 'Open supervision' : 'Start work'}
      </ContextMenuItem>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{activeAttempt ? 'Open supervision' : 'Start work'}</DialogTitle>
            <DialogDescription>
              Review the resolved execution context before any runtime session or model turn starts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="font-semibold text-slate-900">{task.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                {task.assigneeId ? `Assigned execution · ${task.assigneeId}` : 'No assignee configured'}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Server className="size-3.5" />Runtime</div>
                <div className="mt-1 font-medium text-slate-900">{loading ? 'Resolving…' : runtimeLabel(resolution?.profile?.integrationMode)}</div>
                {resolution?.profile && <div className="text-xs text-slate-500">{resolution.profile.name} · {resolution.source}</div>}
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Folder className="size-3.5" />Repository folder</div>
                <div className={`mt-1 truncate font-medium ${resolvedRepositoryFolder ? 'text-slate-900' : 'text-amber-700'}`} title={resolvedRepositoryFolder || undefined}>{resolvedRepositoryFolder || 'Not configured'}</div>
                <div className="text-xs text-slate-500">{repositorySource}</div>
              </div>
            </div>
            {observation && (
              <div className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                Runtime observation: {observation.availability || 'unknown'} · authentication {observation.authentication || 'unknown'} · {observation.state || 'unknown'}.
              </div>
            )}
            {preflight?.model && (preflight.model.requested || preflight.model.effective) && (
              <div className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                Model: requested {preflight.model.requested || 'runtime default'} · effective {preflight.model.effective || 'runtime default'}.
              </div>
            )}
            {warnings.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                <div className="font-semibold">Preflight warnings</div>
                <ul className="mt-1 space-y-1">{warnings.map(warning => <li key={`${warning.code || 'warning'}-${warning.message}`}>• {warning.message}</li>)}</ul>
              </div>
            )}
            {binding && (
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs font-semibold text-slate-500">Supervision session</div><div className="mt-1 font-medium capitalize text-slate-900">{binding.state}</div></div>
                  <span className="text-[11px] text-slate-500">{binding.opaqueSessionRef ? 'Runtime connected' : 'Connecting'}</span>
                </div>
                {binding.capabilities?.length ? <div className="mt-2 text-[11px] text-slate-500">Capabilities: {binding.capabilities.map(capability => `${capability.id} (${capability.support})`).join(', ')}</div> : null}
                <div className="mt-3 max-h-32 space-y-1 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-600">
                  {events.length ? events.map(event => <div key={event.id}>{event.type}{event.state ? ` · ${event.state}` : ''}{event.toolName ? ` · ${event.toolName}` : ''}{event.requestId !== undefined ? ` · request ${event.requestId}` : ''}</div>) : <div>No normalized runtime events yet.</div>}
                </div>
                {hasMoreEvents && <div className="mt-1 text-[11px] text-slate-500">Earlier normalized events are available but omitted from this bounded view.</div>}
                {reportedUsage && <div className="mt-2 text-[11px] text-slate-500">Provider-reported usage: {reportedUsage.totalTokens ?? 'unknown'} tokens{reportedUsage.cost !== undefined ? ` · ${reportedUsage.cost} ${reportedUsage.currency || ''}` : ''}. No cost is inferred when the runtime omits it.</div>}
                {binding.state === 'interrupted' && <button type="button" onClick={() => void resumeSession()} disabled={operationBusy || !resolvedRepositoryFolder} className="mt-2 rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold disabled:opacity-40">Resume session</button>}
                <div className="mt-3 flex gap-2">
                  <input value={steerText} onChange={event => setSteerText(event.target.value)} placeholder="Steer or send input" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs" aria-label="Steer runtime session" />
                  <button type="button" onClick={() => void runSessionOperation(hasCapability('steer') ? 'steer' : 'prompt')} disabled={operationBusy || !steerText.trim() || (!hasCapability('steer') && !hasCapability('prompt'))} className="rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold disabled:opacity-40" title="Send supported runtime input"><Send className="size-3.5" /></button>
                  <button type="button" onClick={() => void runSessionOperation('cancel')} disabled={operationBusy || !hasCapability('cancel')} className="rounded border border-amber-200 px-2 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-40" title="Cancel session"><Square className="size-3.5" /></button>
                  <button type="button" onClick={() => void runSessionOperation('close')} disabled={operationBusy || !hasCapability('close')} className="rounded border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40" title="Close session"><X className="size-3.5" /></button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
                  <select value={outcomeKind} onChange={event => setOutcomeKind(event.target.value as typeof outcomeKind)} className="rounded border border-slate-200 px-2 py-1.5 text-xs" aria-label="Outcome type"><option value="context-checkpoint">Checkpoint</option><option value="decision">Decision</option><option value="blocker">Blocker</option><option value="evidence">Evidence</option></select>
                  <input value={outcomeSummary} onChange={event => setOutcomeSummary(event.target.value)} placeholder="Record a bounded outcome" className="min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs" aria-label="Outcome summary" />
                  <button type="button" onClick={() => void saveOutcome()} disabled={operationBusy || !outcomeSummary.trim()} className="rounded border border-slate-200 px-2 py-1.5 text-xs font-semibold disabled:opacity-40">Record</button>
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
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              No process, task attempt, or model turn is started by opening this preflight.
            </div>
          </div>

          <DialogFooter>
            <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" onClick={() => setOpen(false)}>Close</button>
            {resolution?.profile?.integrationMode === 'external-handoff' && <button type="button" onClick={() => void openExternal()} disabled={operationBusy || !resolvedRepositoryFolder} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Open externally</button>}
            <button type="button" onClick={() => void startWork()} disabled={operationBusy || loading || blockers.length > 0 || Boolean(binding) || activeAttempt} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" title={binding || activeAttempt ? 'An active session already exists' : undefined}>{binding || activeAttempt ? 'Session active' : operationBusy ? 'Starting…' : 'Confirm and start'}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
