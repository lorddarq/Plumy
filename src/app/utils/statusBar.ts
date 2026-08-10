import type { Person, Task } from '../types.ts';
import { getAgentProvenanceBrand, type AgentProvenanceBrand } from './agentProvenance.ts';

export type AgentStatusTone = 'success' | 'warning' | 'danger' | 'unknown' | 'muted';
export type DerivedAgentStatusState = 'idle' | 'working' | 'writing' | 'unavailable';

export interface DerivedAgentStatus {
  personId: string;
  name: string;
  state: DerivedAgentStatusState;
  tone: AgentStatusTone;
  title: string;
  lastSignalAt?: string;
  provenance: AgentProvenanceBrand;
}

export interface AgentStatusRollup {
  total: number;
  counts: Record<DerivedAgentStatusState, number>;
  byState: Record<DerivedAgentStatusState, DerivedAgentStatus[]>;
  statuses: DerivedAgentStatus[];
}

export interface AgentProvenanceRollup {
  id: AgentProvenanceBrand['id'];
  label: string;
  count: number;
  people: string[];
  dotColor: string;
  badgeBackground: string;
  badgeTextColor: string;
}

export interface McpActivitySignal {
  isActive: boolean;
  timestamp?: string;
  title?: string;
  tone: AgentStatusTone;
  provenance?: AgentProvenanceBrand;
}

const WRITE_WINDOW_MS = 45_000;
const WORKING_WINDOW_MS = 2 * 60_000;
const MCP_ACTIVITY_PULSE_WINDOW_MS = 1_500;

function getAgeMs(timestamp?: string, now = Date.now()): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, now - parsed);
}

function isRecent(timestamp: string | undefined, maxAgeMs: number, now = Date.now()): boolean {
  const age = getAgeMs(timestamp, now);
  return age !== null && age <= maxAgeMs;
}

function isLikelyWriteTool(toolName?: string): boolean {
  if (!toolName) return false;
  return !(
    toolName.endsWith('.list')
    || toolName === 'workspace.get_snapshot'
    || toolName.startsWith('cards.')
  );
}

function getRecentAgentWriteEntry({
  person,
  mcpAuditLog,
  now,
}: {
  person: Person;
  mcpAuditLog: McpAuditEntry[];
  now: number;
}): McpAuditEntry | undefined {
  return mcpAuditLog.find(entry => {
    if (entry.outcome && entry.outcome !== 'allowed') return false;
    if (!isLikelyWriteTool(entry.toolName)) return false;
    if (!isRecent(entry.timestamp, WRITE_WINDOW_MS, now)) return false;
    return entry.assigneeId === person.id || entry.assigneeName === person.name;
  });
}

function getAuditEntryProvenance(entry: McpAuditEntry | undefined, fallbackName?: string) {
  return getAgentProvenanceBrand(
    typeof entry?.clientName === 'string' ? entry.clientName : undefined,
    typeof entry?.origin === 'string' ? entry.origin : undefined,
    typeof entry?.userAgent === 'string' ? entry.userAgent : undefined,
    fallbackName
  );
}

function getActivityToneFromAuditEntry(entry: McpAuditEntry): AgentStatusTone {
  if (entry.outcome === 'denied') return 'warning';
  if (entry.outcome === 'error' || entry.outcome === 'failed') return 'danger';
  return isLikelyWriteTool(entry.toolName) ? 'success' : 'muted';
}

const getRecentGenericTaskActivity = ({
  person,
  tasks,
  agenticPeople,
  now,
}: {
  person: Person;
  tasks: Task[];
  agenticPeople: Person[];
  now: number;
}): Task | undefined => {
  if (agenticPeople.length !== 1 || agenticPeople[0]?.id !== person.id) return undefined;

  return tasks.find(task => (
    typeof task.mcpLastActor === 'string'
    && task.mcpLastActor.trim().length > 0
    && isRecent(task.mcpUpdatedAt, WORKING_WINDOW_MS, now)
  ));
};

export function deriveAgentStatuses({
  people,
  tasks,
  mcpAuditLog,
  now = Date.now(),
}: {
  people: Person[];
  tasks: Task[];
  mcpAuditLog: McpAuditEntry[];
  now?: number;
}): DerivedAgentStatus[] {
  const agenticPeople = people.filter(person => person.kind === 'agentic');
  return agenticPeople
    .map(person => {
      const recentWriteEntry = getRecentAgentWriteEntry({ person, mcpAuditLog, now });
      const recentWriteAt = recentWriteEntry?.timestamp;
      const recentGenericTaskActivity = getRecentGenericTaskActivity({
        person,
        tasks,
        agenticPeople,
        now,
      });
      const recentGenericTaskActivityAt = recentGenericTaskActivity?.mcpUpdatedAt;
      const fallbackProvenance = getAgentProvenanceBrand(person.name);
      const hasFreshWrite = Boolean(recentWriteAt);

      if (hasFreshWrite) {
        return {
          personId: person.id,
          name: person.name,
          state: 'writing' as const,
          tone: 'warning' as const,
          title: `${person.name} is writing to MCP`,
          lastSignalAt: recentWriteAt,
          provenance: getAuditEntryProvenance(recentWriteEntry, person.name),
        };
      }

      if (recentGenericTaskActivityAt) {
        return {
          personId: person.id,
          name: person.name,
          state: 'working' as const,
          tone: 'success' as const,
          title: `${person.name} recently worked through MCP`,
          lastSignalAt: recentGenericTaskActivityAt,
          provenance: getAgentProvenanceBrand(recentGenericTaskActivity?.mcpLastActor, person.name),
        };
      }

      if (hasFreshRuntimeSignal) {
        return {
          personId: person.id,
          name: person.name,
          state: 'idle' as const,
          tone: 'muted' as const,
          title: `${person.name} is idle`,
          lastSignalAt: runtime?.lastCheckedAt,
          provenance: fallbackProvenance,
        };
      }

      return {
        personId: person.id,
        name: person.name,
        state: 'unavailable' as const,
        tone: hasRuntimeError ? 'danger' as const : 'unknown' as const,
        title: hasRuntimeError
          ? `${person.name} is unavailable`
          : `${person.name} has no trustworthy status signal`,
        lastSignalAt: runtime?.lastCheckedAt,
        provenance: fallbackProvenance,
      };
    });
}

export function rollupAgentStatuses(statuses: DerivedAgentStatus[]): AgentStatusRollup {
  const emptyStateGroups: Record<DerivedAgentStatusState, DerivedAgentStatus[]> = {
    idle: [],
    working: [],
    writing: [],
    unavailable: [],
  };

  const byState = statuses.reduce<Record<DerivedAgentStatusState, DerivedAgentStatus[]>>((groups, status) => {
    groups[status.state].push(status);
    return groups;
  }, emptyStateGroups);

  return {
    total: statuses.length,
    counts: {
      idle: byState.idle.length,
      working: byState.working.length,
      writing: byState.writing.length,
      unavailable: byState.unavailable.length,
    },
    byState,
    statuses,
  };
}

export function rollupActiveAgentProvenance(statuses: DerivedAgentStatus[]): AgentProvenanceRollup[] {
  const grouped = new Map<AgentProvenanceBrand['id'], AgentProvenanceRollup>();

  statuses
    .filter(status => status.state === 'working' || status.state === 'writing')
    .forEach(status => {
      const existing = grouped.get(status.provenance.id);
      if (existing) {
        existing.count += 1;
        existing.people.push(status.name);
        return;
      }

      grouped.set(status.provenance.id, {
        id: status.provenance.id,
        label: status.provenance.label,
        count: 1,
        people: [status.name],
        dotColor: status.provenance.dotColor,
        badgeBackground: status.provenance.badgeBackground,
        badgeTextColor: status.provenance.badgeTextColor,
      });
    });

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.label.localeCompare(right.label);
  });
}

export function getRecentMcpActivitySignal({
  mcpAuditLog,
  tasks,
  now = Date.now(),
}: {
  mcpAuditLog: McpAuditEntry[];
  tasks: Task[];
  now?: number;
}): McpActivitySignal {
  const recentAuditEntry = mcpAuditLog.find(entry => isRecent(entry.timestamp, MCP_ACTIVITY_PULSE_WINDOW_MS, now));
  if (recentAuditEntry) {
    const provenance = getAuditEntryProvenance(recentAuditEntry);
    const activityLabel = recentAuditEntry.toolName || recentAuditEntry.method || recentAuditEntry.type || 'MCP activity';
    return {
      isActive: true,
      timestamp: recentAuditEntry.timestamp,
      tone: getActivityToneFromAuditEntry(recentAuditEntry),
      provenance,
      title: `${provenance.label} • ${activityLabel}`,
    };
  }

  const recentTaskActivity = tasks.find(task => isRecent(task.mcpUpdatedAt, MCP_ACTIVITY_PULSE_WINDOW_MS, now));
  if (recentTaskActivity?.mcpUpdatedAt) {
    const provenance = getAgentProvenanceBrand(recentTaskActivity.mcpLastActor);
    return {
      isActive: true,
      timestamp: recentTaskActivity.mcpUpdatedAt,
      tone: 'success',
      provenance,
      title: `${provenance.label} • task activity`,
    };
  }

  return {
    isActive: false,
    tone: 'muted',
  };
}

export function getMcpStatusSummary({
  mcpAgentAccessEnabled,
  mcpListenerStatus,
  mcpRestartPending,
}: {
  mcpAgentAccessEnabled: boolean;
  mcpListenerStatus: McpListenerStatus | null;
  mcpRestartPending: boolean;
}) {
  if (!mcpAgentAccessEnabled) {
    return {
      label: 'MCP offline',
      tone: 'muted' as const,
    };
  }

  if (mcpRestartPending || mcpListenerStatus?.restartRequired) {
    return {
      label: 'MCP restart needed',
      tone: 'warning' as const,
    };
  }

  if (!mcpListenerStatus) {
    return {
      label: 'MCP unknown',
      tone: 'unknown' as const,
    };
  }

  if (mcpListenerStatus.status === 'running' && mcpListenerStatus.listening) {
    return {
      label: 'MCP running',
      tone: 'success' as const,
    };
  }

  if (mcpListenerStatus.status === 'starting') {
    return {
      label: 'MCP starting',
      tone: 'unknown' as const,
    };
  }

  if (mcpListenerStatus.status === 'error') {
    return {
      label: 'MCP error',
      tone: 'danger' as const,
    };
  }

  return {
    label: 'MCP offline',
    tone: 'muted' as const,
  };
}
