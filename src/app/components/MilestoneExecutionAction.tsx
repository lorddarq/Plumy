import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Folder, Server } from 'lucide-react';
import type { ProjectMilestone, Task, TimelineSwimlane } from '../types';
import { getTasksForMilestone } from '../utils/roadmap';
import { agentRuntimeWorkspaceSourceLabel, resolveAgentRuntimeWorkspace } from '../utils/agentRuntimeWorkspace';
import { ContextMenuItem } from './ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { useAgentSessionSupervisor } from './AgentSessionSupervisor';
import { OverflowActionMenu } from './OverflowActionMenu';
import { ExecutionNotice } from './ExecutionNotice';
import { getAttentionState, getSessionAttentionState, type AttentionState } from '../utils/attention';
import { agentRuntimeTurnState, isAgentRuntimeTurnInFlight } from '../utils/agentRuntimeActivity';
import { measurePerformanceOperation } from '../services/performanceLogging.ts';

interface MilestoneExecutionActionProps {
  milestone: ProjectMilestone;
  tasks: Task[];
  projects: TimelineSwimlane[];
  trigger?: ReactNode;
  openRequest?: number;
}

interface PreflightRow {
  task: Task;
  folder: string;
  folderSource: string;
  runtime?: string;
  blockers: string[];
  active: boolean;
  sessionState?: string;
  attention: AttentionState;
  accepted: number;
  usage?: string;
}

function runtimeLabel(mode?: string) {
  if (mode === 'acp-local-stdio') return 'Native ACP';
  if (mode === 'codex-app-server-stdio') return 'Native Codex app-server';
  if (mode === 'claude-stream-json-stdio') return 'Native Claude stream-json';
  return mode === 'external-handoff' ? 'External handoff' : 'Not resolved';
}

export function MilestoneExecutionAction({ milestone, tasks, projects, trigger, openRequest }: MilestoneExecutionActionProps) {
  const { requestTask } = useAgentSessionSupervisor();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PreflightRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const linkedTasks = useMemo(() => getTasksForMilestone(milestone, tasks), [milestone, tasks]);

  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const runtime = await window.electron?.agentRuntime?.getState?.();
        if (!runtime?.ok || !runtime.value) throw new Error(runtime?.error || 'Runtime profiles could not be loaded.');
        const sessions = await measurePerformanceOperation('acp', 'milestone.sessions.list', async () => (
          window.electron?.agentRuntime?.sessions?.list?.({ limit: 100 })
        ));
          const activeBindings = sessions?.bindings || [];
          const sessionEvents = sessions?.events || [];
        const nextRows = await Promise.all(linkedTasks.map(async task => {
          const project = projects.find(candidate => task.projectIds?.includes(candidate.id));
          const blockers = task.status === 'done' ? ['Task is already complete.'] : [];
          let workspace;
          try {
            workspace = await resolveAgentRuntimeWorkspace(
              task.id,
              task.repositoryFolder,
              project?.repositoryFolder,
              runtime.value.defaults.globalWorkspacePath,
              taskId => window.electron.agentRuntime.resolveManagedWorkspace(taskId),
            );
          } catch (caught) {
            blockers.push(caught instanceof Error ? caught.message : 'A scratch workspace could not be prepared.');
          }
          const folder = workspace?.workspacePath || '';
          for (const dependencyId of task.dependencyIds || []) {
            const dependency = linkedTasks.find(candidate => candidate.id === dependencyId);
            if (dependency && dependency.status !== 'done') blockers.push(`Dependency pending: ${dependency.title}`);
          }
          if (!task.assigneeId) blockers.push('No assignee configured.');
          const contributionId = task.collaboration?.contributions?.find(contribution => contribution.state === 'pending' || contribution.state === 'revision-requested')?.id;
          const resolutionResult = await window.electron?.agentRuntime?.resolve?.({ projectId: task.projectIds?.[0] || task.swimlaneId });
          const resolution = resolutionResult?.value;
          if (!resolutionResult?.ok || !resolution?.ok || !resolution.profile) blockers.push(resolutionResult?.error || resolution?.error || 'Runtime is unavailable.');
          if (resolution?.profile?.integrationMode === 'external-handoff') blockers.push('External handoff requires a separate explicit action.');
          if (folder && resolution?.profile) {
            const prepared = await window.electron.agentRuntime.prepareExecution({ taskId: task.id, contributionId, projectId: task.projectIds?.[0] || task.swimlaneId, executionProfileId: resolution.profile.id, workspacePath: folder, expectedRevision: task.__mcpRevision ?? 0 });
            blockers.push(...(prepared?.blockers || []).map((blocker: { message: string }) => blocker.message));
          }
          const binding = activeBindings.find((candidate: { id: string; scope?: { taskId?: string }; state?: string }) => candidate.scope?.taskId === task.id);
          const usageEvent = binding ? [...sessionEvents].reverse().find((event: { bindingId?: string; type?: string }) => event.bindingId === binding.id && event.type === 'usage-reported') : undefined;
          const accepted = task.collaboration?.contributions?.filter(contribution => contribution.state === 'accepted').length || 0;
          const attention = getSessionAttentionState({ bindingState: binding?.state, turnState: agentRuntimeTurnState(binding), executionState: binding?.taskExecution?.state, taskStatus: task.status })
            || (blockers.length > 0 ? getAttentionState('blocked') : getAttentionState('ready'));
          return { task, folder, folderSource: agentRuntimeWorkspaceSourceLabel(workspace?.source), runtime: runtimeLabel(resolution?.profile?.integrationMode), blockers: [...new Set(blockers)], active: isAgentRuntimeTurnInFlight(binding), sessionState: binding?.state, attention, accepted, usage: usageEvent ? `${usageEvent.totalTokens ?? 'unknown'} tokens${usageEvent.cost !== undefined ? ` · ${usageEvent.cost} ${usageEvent.currency || ''}` : ''}` : undefined };
        }));
        if (!cancelled) setRows(nextRows);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Milestone preflight failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [linkedTasks, open, projects]);

  const content = trigger !== undefined ? (trigger ? <button type="button" onClick={() => setOpen(true)} className="text-left">{trigger}</button> : null) : <ContextMenuItem onSelect={() => setOpen(true)}>Start work</ContextMenuItem>;
  return <>
    {content}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="z-[100] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{milestone.title} · Start work</DialogTitle>
          <DialogDescription>Review eligible task-scoped work before starting. This milestone never creates a shared provider conversation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {loading && <div className="rounded-md border border-slate-200 p-3 text-slate-500">Resolving tasks, dependencies, runtimes, and active sessions…</div>}
          {!loading && rows.length === 0 && <div className="rounded-md border border-slate-200 p-3 text-slate-500">No linked tasks are available.</div>}
          {rows.map(row => <div key={row.task.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="font-medium text-slate-900">{row.task.title}</div><div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Server className="size-3" />{row.runtime}{row.sessionState ? ` · ${row.sessionState}` : ''}</span><span className="inline-flex items-center gap-1"><Folder className="size-3" />{row.folderSource}: {row.folder || 'Unavailable'}</span>{row.accepted > 0 && <span>{row.accepted} accepted contribution{row.accepted === 1 ? '' : 's'}</span>}{row.usage && <span>Usage {row.usage}</span>}</div></div><span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.attention.tone === 'danger' ? 'text-red-700' : row.attention.tone === 'warning' ? 'text-amber-700' : row.attention.tone === 'success' ? 'text-emerald-700' : 'text-slate-600'}`} aria-label={`${row.attention.label}. ${row.attention.nextStep}`}><span aria-hidden="true">{row.attention.symbol}</span>{row.attention.label}</span></div>
            {row.blockers.length > 0 && <ul className="mt-2 space-y-1 text-xs text-amber-800">{row.blockers.map(blocker => <li key={blocker}>• {blocker}</li>)}</ul>}
            <div className="mt-2 flex justify-end"><button type="button" onClick={() => { const opensExistingSession = row.attention.kind !== 'ready' && row.attention.kind !== 'starting'; requestTask(row.task, { repositoryFolder: projects.find(project => row.task.projectIds?.includes(project.id))?.repositoryFolder, startOnRequest: row.active ? false : !opensExistingSession }); setOpen(false); }} disabled={row.attention.kind === 'blocked'} aria-label={row.active ? `Open supervision for ${row.task.title}` : row.attention.kind === 'blocked' ? `Work blocked for ${row.task.title}` : `${row.attention.nextStep} for ${row.task.title}`} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">{row.active ? 'Open supervision' : row.attention.kind === 'blocked' ? 'Blocked' : ['review', 'outcome-review'].includes(row.attention.kind) ? 'Review task' : ['failed', 'interrupted'].includes(row.attention.kind) ? 'Open supervision' : row.attention.kind === 'batch-finished' ? 'Continue task' : 'Start work'}</button></div>
          </div>)}
          {error && <ExecutionNotice tone="danger" title="Milestone preflight could not complete">{error}</ExecutionNotice>}
        </div>
        <DialogFooter><button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600">Close</button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function MilestoneExecutionOverflowAction({ milestone, tasks, projects }: Omit<MilestoneExecutionActionProps, 'trigger' | 'openRequest'>) {
  const [request, setRequest] = useState(0);
  return <>
    <OverflowActionMenu menuLabel={`Actions for ${milestone.title}`} items={[{ label: 'Start work', onSelect: () => setRequest(value => value + 1) }]} />
    <MilestoneExecutionAction milestone={milestone} tasks={tasks} projects={projects} trigger={null} openRequest={request} />
  </>;
}
