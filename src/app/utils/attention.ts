export type AttentionTone = 'success' | 'warning' | 'danger' | 'muted';

export type AttentionKind = 'blocked' | 'review' | 'active' | 'failed' | 'needs-input' | 'overdue' | 'ready' | 'complete';

export interface AttentionState {
  kind: AttentionKind;
  label: string;
  description: string;
  nextStep: string;
  tone: AttentionTone;
  symbol: string;
}

const ATTENTION_STATES: Record<AttentionKind, AttentionState> = {
  blocked: { kind: 'blocked', label: 'Blocked work', description: 'This work cannot continue until its blocking reason is resolved.', nextStep: 'Review dependencies or the blocking reason before starting work.', tone: 'danger', symbol: '!' },
  review: { kind: 'review', label: 'Pending review', description: 'Work is waiting for a person to inspect the outcome.', nextStep: 'Open the task or handoff details and review the outcome.', tone: 'warning', symbol: '?' },
  active: { kind: 'active', label: 'Active execution', description: 'An agent is currently working on this item.', nextStep: 'Open supervision to monitor progress or provide guidance.', tone: 'success', symbol: '▶' },
  failed: { kind: 'failed', label: 'Failed execution', description: 'The last execution failed and needs attention before it can continue.', nextStep: 'Review the runtime details, then retry or reset the execution.', tone: 'danger', symbol: '×' },
  'needs-input': { kind: 'needs-input', label: 'Human input required', description: 'The agent is waiting for a person before it can continue.', nextStep: 'Open supervision and answer the pending request.', tone: 'warning', symbol: '?' },
  overdue: { kind: 'overdue', label: 'Overdue', description: 'The planned date has passed while work remains unfinished.', nextStep: 'Review the schedule and remaining work, then update the plan.', tone: 'danger', symbol: '!' },
  ready: { kind: 'ready', label: 'Ready to start', description: 'The required context is prepared and no blocker is recorded.', nextStep: 'Start work when you are ready.', tone: 'muted', symbol: '○' },
  complete: { kind: 'complete', label: 'Complete', description: 'This work has reached its terminal state.', nextStep: 'No action is pending; reopen or reset only if more work is needed.', tone: 'success', symbol: '✓' },
};

export function getAttentionState(kind: AttentionKind): AttentionState {
  return ATTENTION_STATES[kind];
}
