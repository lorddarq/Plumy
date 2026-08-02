export interface AgentRuntimeActivityEvent {
  id: string;
  type: string;
  state?: string;
  outcome?: string;
  nativeEventType?: string;
  observedAt?: string;
  toolName?: string;
  usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number; cost?: number; currency?: string };
}

export interface AgentRuntimeActivityItem {
  id: string;
  label: string;
  detail?: string;
  observedAt?: string;
  count: number;
  tone: 'neutral' | 'positive' | 'warning' | 'danger';
}

function describeEvent(event: AgentRuntimeActivityEvent): Omit<AgentRuntimeActivityItem, 'id' | 'observedAt' | 'count'> {
  const native = event.nativeEventType || '';
  const state = event.state || event.outcome || '';
  if (native === 'thread/started') return { label: 'Codex thread created', detail: 'The runtime opened a thread for this task.', tone: 'positive' };
  if (native === 'turn/started') return { label: 'Task instructions accepted', detail: 'Codex began working on the task.', tone: 'positive' };
  if (native === 'turn/completed') return state === 'failed'
    ? { label: 'Codex turn failed', detail: event.outcome, tone: 'danger' }
    : state === 'interrupted'
      ? { label: 'Codex work was interrupted', tone: 'warning' }
      : { label: 'Codex finished the latest turn', tone: 'positive' };
  if (native === 'item/agentMessage/delta') return { label: 'Codex streamed a response', tone: 'neutral' };
  if (native === 'item/started') {
    const labels: Record<string, string> = { reasoning: 'Thinking through the task', commandExecution: 'Running a command', fileSearch: 'Searching project files', fileChange: 'Editing files', mcpToolCall: 'Using a task tool', webSearch: 'Researching', agentMessage: 'Preparing an update' };
    return { label: labels[event.toolName || ''] || 'Working on a task step', tone: 'neutral' };
  }
  if (native === 'item/completed') {
    const labels: Record<string, string> = { reasoning: 'Task reasoning finished', commandExecution: 'Command finished', fileSearch: 'Project search finished', fileChange: 'File changes finished', mcpToolCall: 'Task tool finished', webSearch: 'Research finished', agentMessage: 'Update prepared' };
    return { label: labels[event.toolName || ''] || 'Task step finished', tone: 'positive' };
  }
  if (native === 'hook/started') return { label: 'Runtime hook started', tone: 'neutral' };
  if (native === 'hook/completed') return { label: 'Runtime hook completed', tone: 'positive' };
  if (native === 'mcpServer/startupStatus/updated') {
    const connection = event.toolName ? `: ${event.toolName}` : '';
    if (state === 'failed') {
      const detail = event.outcome === 'reauthenticationRequired'
        ? 'Authentication is required before this connection can start.'
        : event.toolName ? 'This configured connection did not start.' : 'Server names were not captured for these earlier events.';
      return { label: `MCP connection failed${connection}`, detail, tone: 'danger' };
    }
    if (state === 'ready') return { label: `MCP connection ready${connection}`, tone: 'positive' };
    return { label: `MCP connection starting${connection}`, tone: 'neutral' };
  }
  if (native === 'thread/tokenUsage/updated' || event.type === 'usage-reported') return { label: 'Provider usage updated', tone: 'neutral' };
  if (native === 'warning') return { label: 'Runtime warning reported', detail: 'The provider did not expose warning details to this view.', tone: 'warning' };
  if (native === 'error') return { label: 'Codex encountered an error', detail: event.outcome || 'The runtime reported an error.', tone: 'danger' };
  if (native === 'account/rateLimits/updated') return { label: 'Provider limits updated', tone: 'neutral' };
  if (native === 'thread/status/changed') return { label: 'Codex thread status changed', tone: 'neutral' };
  if (native === 'thread/goal/cleared') return { label: 'Codex cleared the active goal', tone: 'neutral' };
  if (event.type === 'permission-request') return { label: 'Permission requested', detail: event.toolName, tone: 'warning' };
  if (event.type === 'input-request') return { label: 'Codex needs input', tone: 'warning' };
  if (event.type === 'tool-state') return { label: event.toolName ? `Tool activity: ${event.toolName}` : 'Tool activity', tone: 'neutral' };
  if (event.type === 'turn-state') return { label: state ? `Codex turn: ${state}` : 'Codex turn updated', tone: state === 'failed' ? 'danger' : 'neutral' };
  if (event.type === 'session-state') return { label: state ? `Runtime session: ${state}` : 'Runtime session updated', tone: state === 'failed' ? 'danger' : state === 'ready' ? 'positive' : 'neutral' };
  return { label: 'Runtime activity observed', detail: native || event.type, tone: 'neutral' };
}

export function summarizeAgentRuntimeActivity(events: AgentRuntimeActivityEvent[]): AgentRuntimeActivityItem[] {
  const grouped = new Map<string, AgentRuntimeActivityItem>();
  for (const event of events) {
    const description = describeEvent(event);
    const key = [description.label, description.detail || '', event.toolName || ''].join('|');
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.observedAt = event.observedAt || existing.observedAt;
      continue;
    }
    grouped.set(key, { id: event.id, ...description, observedAt: event.observedAt, count: 1 });
  }
  return [...grouped.values()].sort((left, right) => (left.observedAt || '').localeCompare(right.observedAt || ''));
}

export function describeAgentRuntimeSession(bindingState: string, events: AgentRuntimeActivityEvent[]) {
  if (bindingState === 'failed') return { label: 'Work stopped unexpectedly', detail: 'The runtime process or protocol session failed.', tone: 'danger' as const, isTurnActive: false };
  if (bindingState === 'needs-input') return { label: 'Waiting for your input', detail: 'Codex cannot continue until you respond.', tone: 'warning' as const, isTurnActive: false };
  if (bindingState === 'interrupted') return { label: 'Work was interrupted', detail: 'Resume the session to continue this task.', tone: 'warning' as const, isTurnActive: false };
  const latestTurn = [...events].reverse().find(event => event.nativeEventType === 'turn/started' || event.nativeEventType === 'turn/completed');
  if (latestTurn?.nativeEventType === 'turn/started') return { label: 'Working now', detail: 'Codex is actively working on the task.', tone: 'positive' as const, isTurnActive: true };
  if (latestTurn?.nativeEventType === 'turn/completed') return { label: 'Latest work finished', detail: 'Codex is not working now. Finishing a run does not mark the task complete.', tone: 'positive' as const, isTurnActive: false };
  if (bindingState === 'starting') return { label: 'Starting work', detail: 'Omvra is connecting to Codex.', tone: 'neutral' as const, isTurnActive: false };
  return { label: 'No active run', detail: 'Start work to continue this task. Follow-up guidance is optional.', tone: 'neutral' as const, isTurnActive: false };
}
