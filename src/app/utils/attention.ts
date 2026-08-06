export type AttentionTone = 'success' | 'warning' | 'danger' | 'muted';

export type AttentionKind = 'blocked' | 'review' | 'active' | 'failed' | 'needs-input' | 'overdue' | 'ready' | 'complete' | 'batch-finished' | 'outcome-review' | 'interrupted' | 'closed' | 'starting' | 'stopping';

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
  'batch-finished': { kind: 'batch-finished', label: 'Last batch completed', description: 'The latest work batch finished, but that does not by itself mean the task is complete.', nextStep: 'Review the outcome, then continue the task or mark it complete.', tone: 'warning', symbol: '✓' },
  'outcome-review': { kind: 'outcome-review', label: 'Outcome needs review', description: 'The agent delivered an outcome, but the task status was not updated.', nextStep: 'Inspect the outcome and move the task to review or complete it when verified.', tone: 'warning', symbol: '?' },
  interrupted: { kind: 'interrupted', label: 'Interrupted work', description: 'The previous work session stopped before the task reached a terminal outcome.', nextStep: 'Resume the task or start a new session from the saved context.', tone: 'warning', symbol: '↻' },
  closed: { kind: 'closed', label: 'Session closed', description: 'No agent session is connected to this task right now.', nextStep: 'Open supervision and continue the task if more work is needed.', tone: 'warning', symbol: '○' },
  starting: { kind: 'starting', label: 'Starting work', description: 'Omvra is connecting the assigned agent and preparing the work session.', nextStep: 'Keep supervision open while the runtime connects.', tone: 'muted', symbol: '…' },
  stopping: { kind: 'stopping', label: 'Stopping work', description: 'The agent is stopping the current run.', nextStep: 'Wait for the stop to finish before starting another run.', tone: 'warning', symbol: 'Ⅱ' },
};

export function getAttentionState(kind: AttentionKind): AttentionState {
  return ATTENTION_STATES[kind];
}

export function getExecutionAttentionState(state: string): AttentionState | undefined {
  if (state === 'working') return getAttentionState('active');
  if (state === 'blocked' || state === 'permission-denied') return getAttentionState('blocked');
  if (state === 'failed') return getAttentionState('failed');
  if (state === 'approval-required' || state === 'evidence-required') return getAttentionState('needs-input');
  if (state === 'handoff-pending') return getAttentionState('review');
  if (state === 'ready-for-review') return getAttentionState('review');
  if (state === 'outcome-unreconciled') return getAttentionState('outcome-review');
  if (state === 'batch-finished') return getAttentionState('batch-finished');
  if (state === 'interrupted') return getAttentionState('interrupted');
  if (state === 'starting') return getAttentionState('starting');
  if (state === 'cancelling' || state === 'stopping') return getAttentionState('stopping');
  if (state === 'complete') return getAttentionState('complete');
  if (state === 'ready') return getAttentionState('ready');
  return undefined;
}

export function getSessionAttentionState({ bindingState, executionState, taskStatus }: { bindingState?: string; executionState?: string; taskStatus?: string }): AttentionState | undefined {
  if (taskStatus === 'done' || executionState === 'complete') return getAttentionState('complete');
  if (taskStatus === 'under-review' || executionState === 'ready-for-review') return getAttentionState('review');
  if (executionState) {
    const executionAttention = getExecutionAttentionState(executionState);
    if (executionAttention && !['ready', 'starting'].includes(executionAttention.kind)) return executionAttention;
  }
  if (bindingState === 'active') return getAttentionState('active');
  if (bindingState === 'needs-input') return getAttentionState('needs-input');
  if (bindingState === 'failed') return getAttentionState('failed');
  if (bindingState === 'interrupted') return getAttentionState('interrupted');
  if (bindingState === 'cancelling') return getAttentionState('stopping');
  if (bindingState === 'starting') return getAttentionState('starting');
  if (bindingState === 'closed') return getAttentionState('closed');
  if (bindingState === 'ready') return getAttentionState('ready');
  return undefined;
}
