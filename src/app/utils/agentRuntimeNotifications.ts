interface RuntimeBinding {
  id: string;
  scope?: { kind?: string; taskId?: string };
}

export interface RuntimeEvent {
  id: string;
  bindingId: string;
  nativeEventType?: string;
  state?: string;
}

export function findNewCompletedTaskRuns(
  events: RuntimeEvent[],
  bindings: RuntimeBinding[],
  seenEventIds: Set<string>,
) {
  const taskIdByBinding = new Map(bindings
    .filter(binding => binding.scope?.kind === 'task' && binding.scope.taskId)
    .map(binding => [binding.id, binding.scope!.taskId!]));
  const completedRuns: Array<{ eventId: string; taskId: string }> = [];

  for (const event of events) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    const taskId = taskIdByBinding.get(event.bindingId);
    if (event.nativeEventType === 'turn/completed' && taskId && !['failed', 'interrupted'].includes(event.state || '')) {
      completedRuns.push({ eventId: event.id, taskId });
    }
  }

  return completedRuns;
}
