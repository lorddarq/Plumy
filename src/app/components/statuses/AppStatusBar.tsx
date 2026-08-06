import type React from 'react';
import { useState } from 'react';
import { cn } from '../ui/utils';
import { getMcpStatusSummary, getRecentMcpActivitySignal, type AgentStatusTone } from '../../utils/statusBar';
import type { Person, Task } from '../../types';
import type { AgentWatchConfig } from '../../utils/workspaceSanitizers';
import type { AgentWatchRuntimeState } from '../../hooks/useAgentWatchRuntime';
import { FiltersIcon } from '../SettingsPanel';
import { useAgentSessionSupervisor } from '../AgentSessionSupervisor';
import { getAttentionState, getSessionAttentionState } from '../../utils/attention';
import { ChevronDown } from 'lucide-react';

export interface AppStatusBarProps {
  tasks: Task[];
  people: Person[];
  agentWatchConfigs: AgentWatchConfig[];
  agentWatchRuntime: Record<string, AgentWatchRuntimeState>;
  mcpAuditLog: McpAuditEntry[];
  mcpAgentAccessEnabled: boolean;
  mcpListenerStatus: McpListenerStatus | null;
  mcpRestartPending: boolean;
}

export function AppStatusBar({
  tasks,
  people,
  agentWatchConfigs,
  agentWatchRuntime,
  mcpAuditLog,
  mcpAgentAccessEnabled,
  mcpListenerStatus,
  mcpRestartPending,
}: AppStatusBarProps) {
  const { sessionDock, openSession } = useAgentSessionSupervisor();
  const mcp = getMcpStatusSummary({ mcpAgentAccessEnabled, mcpListenerStatus, mcpRestartPending });
  const recentMcpActivity = getRecentMcpActivitySignal({ mcpAuditLog, tasks });
  const mcpValue = getMcpBadgeValue(mcp.label);

  return (
    <div
      className="flex min-h-8 items-center gap-3 border-t border-black/5 bg-gray-50 px-4 py-2 text-xs text-gray-600"
      aria-label={`Work status: ${getSessionDockLabel(sessionDock)}. ${mcp.label}.`}
    >
      <StatusPill
        icon={<FiltersIcon className="size-3.5" aria-hidden="true" />}
        label="MCP:"
        value={mcpValue}
        tone={mcp.tone}
        title={recentMcpActivity.title ? `${mcp.label} • ${recentMcpActivity.title}` : mcp.label}
      />
      <div className="ml-auto min-w-0">
        <SessionDockStatus sessionDock={sessionDock} onOpen={openSession} />
      </div>
    </div>
  );
}

function SessionDockStatus({ sessionDock, onOpen }: { sessionDock: ReturnType<typeof useAgentSessionSupervisor>['sessionDock']; onOpen: ReturnType<typeof useAgentSessionSupervisor>['openSession'] }) {
  const [expanded, setExpanded] = useState(false);
  const label = getSessionDockLabel(sessionDock);
  const detail = sessionDock.task?.title
    ? sessionDock.task.title
    : (sessionDock.historyCount > 0 ? `${sessionDock.historyCount} session${sessionDock.historyCount === 1 ? '' : 's'} in history` : 'No session selected');
  const buttonLabel = sessionDock.binding && sessionDock.task ? `Open supervision: ${label} for ${sessionDock.task.title}` : undefined;
  const hasSessions = sessionDock.items.length > 0;
  const attention = sessionDock.state === 'blocked'
    ? getAttentionState('blocked')
    : getSessionAttentionState({
        bindingState: sessionDock.binding?.state,
        executionState: sessionDock.binding?.taskExecution?.state,
        taskStatus: sessionDock.task?.status,
      }) || null;
  const accessibleLabel = `${buttonLabel || `Work status: ${label}`}. ${attention ? `${attention.description} Next action: ${attention.nextStep}` : 'No attention action is pending.'}`;
  const attentionClass = sessionDock.state === 'needs-input' || sessionDock.state === 'blocked' || attention?.tone === 'warning'
    ? 'bg-amber-50 text-amber-900'
    : sessionDock.state === 'failed' || attention?.tone === 'danger'
      ? 'bg-red-50 text-red-900'
      : sessionDock.state === 'working' || sessionDock.state === 'hidden-active' || attention?.tone === 'success'
        ? 'bg-blue-50 text-blue-900'
        : '';
  return (
    <div className="relative min-w-0 shrink">
      <button
        type="button"
        onClick={() => hasSessions && setExpanded(current => !current)}
        aria-expanded={expanded}
        aria-label={accessibleLabel}
        className={`group flex min-h-8 min-w-0 max-w-[min(560px,calc(100vw-8rem))] items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-left transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${attentionClass}`}
      >
        <span className={`size-2 shrink-0 rounded-full ${sessionDock.state === 'working' || sessionDock.state === 'hidden-active' || sessionDock.state === 'ready' ? 'bg-emerald-500' : sessionDock.state === 'needs-input' ? 'bg-amber-500' : sessionDock.state === 'failed' ? 'bg-red-500' : 'bg-slate-300'}`} aria-hidden="true" />
        <span className="whitespace-nowrap text-xs font-semibold text-slate-500">Work</span>
        <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{label}</span>
        <span className="max-w-44 truncate text-[11px] text-slate-400" title={detail}>{detail}</span>
        {hasSessions && <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors group-hover:bg-white group-hover:text-slate-700" aria-hidden="true"><ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} strokeWidth={2.25} /></span>}
      </button>

      {expanded && hasSessions && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div>
              <div className="text-xs font-semibold text-slate-800">Agent work</div>
              <div className="mt-0.5 text-[11px] text-slate-400">Latest and recent task sessions</div>
            </div>
            <span className="text-[11px] text-slate-400">{sessionDock.items.length} shown</span>
          </div>
          {sessionDock.items.map(({ binding, task }, index) => {
            const state = getSessionItemState(binding, task);
            const isLatest = index === 0;
            const showAttention = state.attention && !['complete', 'ready'].includes(state.attention.kind);
            return (
              <div key={binding.id} className={`border-b border-slate-100 last:border-0 ${isLatest ? 'bg-slate-50/80' : 'bg-white'}`}>
                <button type="button" onClick={() => { setExpanded(false); onOpen(binding); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${state.className}`}>{state.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-slate-700">{task?.title || 'Untitled task'}</span>
                      {isLatest && <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Latest</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">{state.label}{task?.status === 'done' ? ' · Task complete' : ''}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-slate-500">Open</span>
                </button>
                {isLatest && showAttention && state.attention && (
                  <div className={`mx-3 mb-3 rounded-lg border px-2.5 py-2 ${state.attention.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-900' : state.attention.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
                    <div className="text-[11px] font-semibold">{state.attention.label}</div>
                    <div className="mt-0.5 text-[11px] leading-4 opacity-90">{state.attention.description}</div>
                    <div className="mt-1 text-[11px] leading-4"><span className="font-semibold">Next step:</span> {state.attention.nextStep}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getSessionItemState(binding: { state: string; taskExecution?: { state?: string } }, task?: Task) {
  const attention = getSessionAttentionState({ bindingState: binding.state, executionState: binding.taskExecution?.state, taskStatus: task?.status });
  if (!attention) return { label: 'Session status unavailable', icon: '?', className: 'bg-slate-100 text-slate-700', attention };
  const suffix = attention.kind === 'active' ? ' · Open to monitor'
    : attention.kind === 'needs-input' ? ' · Review request'
      : attention.kind === 'failed' ? ' · Review needed'
        : ['review', 'outcome-review'].includes(attention.kind) ? ' · Review task'
          : ['batch-finished', 'interrupted', 'closed', 'ready'].includes(attention.kind) ? attention.kind === 'interrupted' ? ' · Resume available' : ' · Continue available'
            : attention.kind === 'complete' ? ' · No action pending' : '';
  const className = attention.tone === 'danger' ? 'bg-red-100 text-red-700' : attention.tone === 'warning' ? 'bg-amber-100 text-amber-700' : attention.tone === 'success' ? 'bg-emerald-100 text-emerald-700' : attention.kind === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700';
  return { label: `${attention.label}${suffix}`, icon: attention.symbol, className, attention };
}

function getSessionDockLabel(sessionDock: ReturnType<typeof useAgentSessionSupervisor>['sessionDock']): string {
  if (sessionDock.state === 'none') return 'No active work';
  if (sessionDock.state === 'blocked') return `${getAttentionState('blocked').label} · Another session is active`;
  const attention = getSessionAttentionState({ bindingState: sessionDock.binding?.state, executionState: sessionDock.binding?.taskExecution?.state, taskStatus: sessionDock.task?.status });
  if (!attention) return 'Session status unavailable';
  if (attention.kind === 'active') return `${attention.label} · Open to monitor`;
  if (attention.kind === 'needs-input') return `${attention.label} · Review request`;
  if (attention.kind === 'failed') return `${attention.label} · Review needed`;
  if (['review', 'outcome-review'].includes(attention.kind)) return `${attention.label} · Review task`;
  if (attention.kind === 'interrupted') return `${attention.label} · Resume available`;
  if (['batch-finished', 'ready', 'closed'].includes(attention.kind)) return `${attention.label} · Continue available`;
  return attention.label;
}

function getMcpBadgeValue(label: string): string {
  const state = label.replace(/^MCP\s+/i, '').toUpperCase();
  return state === 'OFFLINE' ? 'OFF' : state;
}

interface StatusPillProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: AgentStatusTone;
  title?: string;
}

function StatusPill({
  icon,
  label,
  value,
  tone = 'muted',
  title,
}: StatusPillProps) {
  const ledColor = tone === 'success'
    ? '#2ea147'
    : tone === 'warning'
      ? '#f59e0b'
      : tone === 'danger'
        ? '#da0004'
        : tone === 'unknown'
          ? '#94a3b8'
          : '#d1d5db';

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1" title={title}>
      <span className="shrink-0 text-gray-500">{icon}</span>
      <span className="whitespace-nowrap text-center text-xs font-medium text-[#828282]">{label}</span>
      <span className="flex min-h-[17px] shrink-0 items-center justify-center gap-1 rounded-full border border-black/10 px-1.5 py-0.5">
        <span className="relative flex size-2 shrink-0 items-center justify-center" aria-hidden="true">
          <span
            className={cn(
              'relative size-2 rounded-full',
              tone === 'success' && 'bg-[#2ea147]',
              tone === 'warning' && 'bg-amber-500',
              tone === 'danger' && 'bg-[#da0004]',
              tone === 'unknown' && 'bg-slate-400',
              tone === 'muted' && 'bg-gray-300'
            )}
            style={{ backgroundColor: ledColor }}
          />
        </span>
        <span className="whitespace-nowrap text-[11px] font-semibold leading-none text-[#a8a8a8]">{value}</span>
      </span>
    </div>
  );
}

interface StateBadgeProps {
  label: string;
  value: string;
  tone: AgentStatusTone;
  title?: string;
}

export function StateBadge({ label, value, tone, title }: StateBadgeProps) {
  return (
    <span
      className="flex min-h-[17px] shrink-0 items-center justify-center gap-1 rounded-full border border-black/10 px-1.5 py-0.5"
      title={title}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          tone === 'success' && 'bg-[#2ea147]',
          tone === 'warning' && 'bg-amber-500',
          tone === 'danger' && 'bg-[#da0004]',
          tone === 'unknown' && 'bg-slate-400',
          tone === 'muted' && 'bg-gray-300'
        )}
        aria-hidden="true"
      />
      <span className="whitespace-nowrap text-[11px] font-medium leading-none text-[#8b8b93]">
        {label} {value}
      </span>
    </span>
  );
}

interface ProvenanceBadgeProps {
  label: string;
  value: string;
  dotColor: string;
  backgroundColor: string;
  textColor: string;
  title?: string;
}

function ProvenanceBadge({
  label,
  value,
  dotColor,
  backgroundColor,
  textColor,
  title,
}: ProvenanceBadgeProps) {
  return (
    <span
      className="flex min-h-[17px] shrink-0 items-center justify-center gap-1 rounded-full border border-black/5 px-1.5 py-0.5"
      style={{ backgroundColor, color: textColor }}
      title={title}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" />
      <span className="whitespace-nowrap text-[11px] font-medium leading-none">
        {label} {value}
      </span>
    </span>
  );
}
