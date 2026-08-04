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
  if (native === 'thread/started') return { label: 'Work session created', detail: 'The agent opened a session for this task.', tone: 'positive' };
  if (native === 'turn/started') return { label: 'Task instructions accepted', detail: 'The agent began working on the task.', tone: 'positive' };
  if (native === 'turn/completed') return state === 'failed'
    ? { label: 'Agent run failed', detail: event.outcome, tone: 'danger' }
    : state === 'interrupted'
      ? { label: 'Agent work was interrupted', tone: 'warning' }
      : { label: 'Agent finished the latest run', tone: 'positive' };
  if (native === 'item/agentMessage/delta') return { label: 'Agent shared an update', tone: 'neutral' };
  if (native === 'item/started') {
    const labels: Record<string, string> = { reasoning: 'Thinking through the task', commandExecution: 'Running a command', fileSearch: 'Searching project files', fileChange: 'Editing files', mcpToolCall: 'Using a task tool', webSearch: 'Researching', agentMessage: 'Preparing an update' };
    return { label: labels[event.toolName || ''] || 'Working on a task step', tone: 'neutral' };
  }
  if (native === 'item/completed') {
    const labels: Record<string, string> = { reasoning: 'Task reasoning finished', commandExecution: 'Command finished', fileSearch: 'Project search finished', fileChange: 'File changes finished', mcpToolCall: 'Task tool finished', webSearch: 'Research finished', agentMessage: 'Update prepared' };
    return { label: labels[event.toolName || ''] || 'Task step finished', tone: 'positive' };
  }
  if (native === 'hook/started') return { label: 'Agent setup step started', tone: 'neutral' };
  if (native === 'hook/completed') return { label: 'Agent setup step finished', tone: 'positive' };
  if (native === 'mcpServer/startupStatus/updated') {
    const connection = event.toolName ? `: ${event.toolName}` : '';
    if (state === 'failed') {
      const detail = event.outcome === 'reauthenticationRequired'
        ? 'Authentication is required before this connection can start.'
        : event.toolName ? 'This configured connection did not start.' : 'Server names were not captured for these earlier events.';
      return { label: `Tool connection failed${connection}`, detail, tone: 'danger' };
    }
    if (state === 'ready') return { label: `Tool connection ready${connection}`, tone: 'positive' };
    return { label: `Tool connection starting${connection}`, tone: 'neutral' };
  }
  if (native === 'thread/tokenUsage/updated' || event.type === 'usage-reported') return { label: 'Provider usage updated', tone: 'neutral' };
  if (native === 'warning') return { label: 'Agent warning reported', detail: 'The agent did not expose warning details to this view.', tone: 'warning' };
  if (native === 'error') return { label: 'Agent encountered an error', detail: event.outcome || 'The agent reported an error.', tone: 'danger' };
  if (native === 'account/rateLimits/updated') return { label: 'Provider limits updated', tone: 'neutral' };
  if (native === 'thread/status/changed') return { label: 'Work session status changed', tone: 'neutral' };
  if (native === 'thread/goal/cleared') return { label: 'Agent cleared the active goal', tone: 'neutral' };
  if (event.type === 'permission-request') return { label: 'Permission requested', detail: event.toolName, tone: 'warning' };
  if (event.type === 'input-request') return { label: 'Agent needs input', tone: 'warning' };
  if (event.type === 'tool-state') return { label: event.toolName ? `Tool activity: ${event.toolName}` : 'Tool activity', tone: 'neutral' };
  if (event.type === 'turn-state') return { label: state ? `Agent run: ${state}` : 'Agent run updated', tone: state === 'failed' ? 'danger' : 'neutral' };
  if (event.type === 'session-state') return { label: state ? `Work session: ${state}` : 'Work session updated', tone: state === 'failed' ? 'danger' : state === 'ready' ? 'positive' : 'neutral' };
  return { label: 'Agent activity observed', detail: native || event.type, tone: 'neutral' };
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
  if (bindingState === 'failed') return { label: 'Previous runtime unavailable', detail: 'This provider session is no longer connected to Omvra. Start a new session; the current task context is preserved.', tone: 'danger' as const, isTurnActive: false };
  if (bindingState === 'needs-input') return { label: 'Agent is waiting for you', detail: 'The agent cannot continue until you respond.', tone: 'warning' as const, isTurnActive: false };
  if (bindingState === 'interrupted') return { label: 'Work was interrupted', detail: 'The previous runtime may belong to another app process. Resume if available, or start a new session; task context is preserved.', tone: 'warning' as const, isTurnActive: false };
  if (bindingState === 'active') return { label: 'Agent is working', detail: 'The agent is actively working on the task.', tone: 'positive' as const, isTurnActive: true };
  if (bindingState === 'cancelling') return { label: 'Agent is stopping', detail: 'The agent is stopping the current run.', tone: 'warning' as const, isTurnActive: false };
  if (bindingState === 'starting') return { label: 'Agent is starting', detail: 'Omvra is connecting to the assigned agent.', tone: 'neutral' as const, isTurnActive: false };
  if (bindingState === 'closed') return { label: 'Work session closed', detail: 'The agent is not working on this task.', tone: 'neutral' as const, isTurnActive: false };
  const latestTurn = [...events].reverse().find(event => event.nativeEventType === 'turn/started' || event.nativeEventType === 'turn/completed');
  if (latestTurn?.nativeEventType === 'turn/completed') return { label: 'Agent is idle', detail: 'The latest run ended. This does not mean the task is complete.', tone: 'neutral' as const, isTurnActive: false };
  return { label: 'Agent is idle', detail: 'The work session is connected, but no run is active.', tone: 'neutral' as const, isTurnActive: false };
}
