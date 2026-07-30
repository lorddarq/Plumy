import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Folder, Server } from 'lucide-react';
import type { ProjectMilestone, Task, TimelineSwimlane } from '../types';
import { getTasksForMilestone } from '../utils/roadmap';
import { ContextMenuItem } from './ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { TaskExecutionAction } from './TaskExecutionAction';
import { OverflowActionMenu } from './OverflowActionMenu';

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
  runtime?: string;
  blockers: string[];
  active: boolean;
  sessionState?: string;
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
        if (!runtime?.ok) throw new Error(runtime?.error || 'Runtime profiles could not be loaded.');
        const sessions = await window.electron?.agentRuntime?.sessions?.list?.({ limit: 100 });
          const activeBindings = sessions?.bindings || [];
          const sessionEvents = sessions?.events || [];
        const nextRows = await Promise.all(linkedTasks.map(async task => {
          const project = projects.find(candidate => task.projectIds?.includes(candidate.id));
          const folder = task.repositoryFolder?.trim() || project?.repositoryFolder?.trim() || '';
          const blockers = task.status === 'done' ? ['Task is already complete.'] : [];
          for (const dependencyId of task.dependencyIds || []) {
            const dependency = linkedTasks.find(candidate => candidate.id === dependencyId);
            if (dependency && dependency.status !== 'done') blockers.push(`Dependency pending: ${dependency.title}`);
          }
          if (!task.assigneeId) blockers.push('No assignee configured.');
          if (!folder) blockers.push('Repository folder is not configured.');
          const resolution = await window.electron?.agentRuntime?.resolve?.({ projectId: task.projectIds?.[0] || task.swimlaneId });
          if (!resolution?.ok || !resolution.profile) blockers.push(resolution?.error || 'Runtime is unavailable.');
          if (resolution?.profile?.integrationMode === 'external-handoff') blockers.push('External handoff requires a separate explicit action.');
          if (folder && resolution?.profile) {
            const prepared = await window.electron.agentRuntime.prepareExecution({ taskId: task.id, projectId: task.projectIds?.[0] || task.swimlaneId, workspacePath: folder, expectedRevision: task.__mcpRevision ?? 0 });
            blockers.push(...(prepared?.blockers || []).map((blocker: { message: string }) => blocker.message));
          }
          const binding = activeBindings.find((candidate: { id: string; scope?: { taskId?: string }; state?: string }) => candidate.scope?.taskId === task.id);
          const usageEvent = binding ? [...sessionEvents].reverse().find((event: { bindingId?: string; type?: string }) => event.bindingId === binding.id && event.type === 'usage-reported') : undefined;
          const accepted = task.collaboration?.contributions?.filter(contribution => contribution.state === 'accepted').length || 0;
          return { task, folder, runtime: runtimeLabel(resolution?.profile?.integrationMode), blockers: [...new Set(blockers)], active: Boolean(binding && ['starting', 'ready', 'active', 'needs-input', 'cancelling'].includes(binding.state || '')), sessionState: binding?.state, accepted, usage: usageEvent ? `${usageEvent.totalTokens ?? 'unknown'} tokens${usageEvent.cost !== undefined ? ` · ${usageEvent.cost} ${usageEvent.currency || ''}` : ''}` : undefined };
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{milestone.title} · Start work</DialogTitle>
          <DialogDescription>Review eligible task-scoped work before starting. This milestone never creates a shared provider conversation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {loading && <div className="rounded-md border border-slate-200 p-3 text-slate-500">Resolving tasks, dependencies, runtimes, and active sessions…</div>}
          {!loading && rows.length === 0 && <div className="rounded-md border border-slate-200 p-3 text-slate-500">No linked tasks are available.</div>}
          {rows.map(row => <div key={row.task.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="font-medium text-slate-900">{row.task.title}</div><div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Server className="size-3" />{row.runtime}{row.sessionState ? ` · ${row.sessionState}` : ''}</span><span className="inline-flex items-center gap-1"><Folder className="size-3" />{row.folder || 'No repository folder'}</span>{row.accepted > 0 && <span>{row.accepted} accepted contribution{row.accepted === 1 ? '' : 's'}</span>}{row.usage && <span>Usage {row.usage}</span>}</div></div>{row.active ? <span className="text-xs font-semibold text-blue-700">{row.sessionState === 'needs-input' ? 'Needs input' : 'Active session'}</span> : row.blockers.length ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="size-3" />Blocked</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-3" />Eligible</span>}</div>
            {row.blockers.length > 0 && <ul className="mt-2 space-y-1 text-xs text-amber-800">{row.blockers.map(blocker => <li key={blocker}>• {blocker}</li>)}</ul>}
            <div className="mt-2 flex justify-end"><TaskExecutionAction task={row.task} repositoryFolder={row.folder} trigger={<span className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">{row.active ? 'Open supervision' : 'Open task preflight'}</span>} /></div>
          </div>)}
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
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
