import type React from 'react';
import { cn } from '../ui/utils';
import {
  deriveAgentStatuses,
  getMcpStatusSummary,
  getRecentMcpActivitySignal,
  rollupActiveAgentProvenance,
  rollupAgentStatuses,
  type AgentStatusTone,
} from '../../utils/statusBar';
import type { Person, Task } from '../../types';
import type { AgentWatchConfig } from '../../utils/workspaceSanitizers';
import type { AgentWatchRuntimeState } from '../../hooks/useAgentWatchRuntime';
import { AgentIcon } from '../icons/AgentIcon';
import { FiltersIcon } from '../SettingsPanel';

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
  const agents = rollupAgentStatuses(
    deriveAgentStatuses({ people, tasks, agentWatchConfigs, agentWatchRuntime, mcpAuditLog })
  );
  const activeProvenance = rollupActiveAgentProvenance(agents.statuses);
  const mcp = getMcpStatusSummary({ mcpAgentAccessEnabled, mcpListenerStatus, mcpRestartPending });
  const recentMcpActivity = getRecentMcpActivitySignal({ mcpAuditLog, tasks });
  const mcpValue = getMcpBadgeValue(mcp.label);

  const statusPills = [
    {
      key: 'writing',
      label: 'Writing',
      value: String(agents.counts.writing),
      tone: 'warning' as const,
      title: agents.byState.writing.map(agent => agent.name).join(', ') || 'No agents are writing to MCP',
    },
    {
      key: 'working',
      label: 'Working',
      value: String(agents.counts.working),
      tone: 'success' as const,
      title: agents.byState.working.map(agent => agent.name).join(', ') || 'No agents are actively working',
    },
    {
      key: 'idle',
      label: 'Idle',
      value: String(agents.counts.idle),
      tone: 'muted' as const,
      title: agents.byState.idle.map(agent => agent.name).join(', ') || 'No agents are idle',
    },
    {
      key: 'unavailable',
      label: 'Unavailable',
      value: String(agents.counts.unavailable),
      tone: 'unknown' as const,
      title: agents.byState.unavailable.map(agent => agent.name).join(', ') || 'No agents are unavailable',
    },
  ].filter(item => agents.total > 0 ? Number(item.value) > 0 : item.key === 'unavailable');

  return (
    <div
      className="flex min-h-8 items-center gap-3 border-t border-black/5 bg-gray-50 px-4 py-2 text-xs text-gray-600"
      aria-label={`Agent status: ${agents.counts.writing} writing to MCP, ${agents.counts.working} working, ${agents.counts.idle} idle, ${agents.counts.unavailable} unavailable. ${mcp.label}.`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-gray-500">
          <AgentIcon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="whitespace-nowrap text-center text-xs font-medium text-[#828282]">Agents:</span>
        {agents.total === 0 ? (
          <StateBadge label="No agents" value="0" tone="muted" title="No agentic teammates are configured" />
        ) : (
          statusPills.map(item => (
            <StateBadge
              key={item.key}
              label={item.label}
              value={item.value}
              tone={item.tone}
              title={item.title}
            />
          ))
        )}
        {activeProvenance.length > 0 ? (
          <>
            <span className="whitespace-nowrap text-center text-xs font-medium text-[#b0b0b7]">Via:</span>
            {activeProvenance.map(item => (
              <ProvenanceBadge
                key={item.id}
                label={item.label}
                value={String(item.count)}
                dotColor={item.dotColor}
                backgroundColor={item.badgeBackground}
                textColor={item.badgeTextColor}
                title={item.people.join(', ')}
              />
            ))}
          </>
        ) : null}
      </div>
      <StatusPill
        icon={<FiltersIcon className="size-3.5" aria-hidden="true" />}
        label="MCP:"
        value={mcpValue}
        tone={mcp.tone}
        title={recentMcpActivity.title ? `${mcp.label} • ${recentMcpActivity.title}` : mcp.label}
      />
    </div>
  );
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
