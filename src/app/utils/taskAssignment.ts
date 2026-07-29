import type { Person, Task, TaskCollaborationV1 } from '../types.ts';

export interface TaskAssignmentValue {
  assigneeId?: string;
  collaboration?: TaskCollaborationV1;
}

export function getEffectiveTaskOrchestratorId(task: TaskAssignmentValue): string | undefined {
  return task.collaboration?.orchestratorId || task.assigneeId;
}

export function isEligibleTaskContributor(person: Person): boolean {
  return person.kind === 'agentic' && person.availableForSubagentDelegation === true;
}

export function getDefaultTaskContributionScope(person: Person): string {
  return person.kind === 'agentic' ? person.role.trim() : '';
}

export function buildTaskAssignmentValue(
  orchestratorId: string | undefined,
  contributions: TaskCollaborationV1['contributions'],
): TaskAssignmentValue {
  if (!orchestratorId) return { assigneeId: undefined, collaboration: undefined };
  if (contributions.length === 0) return { assigneeId: orchestratorId, collaboration: undefined };

  return {
    assigneeId: orchestratorId,
    collaboration: {
      schemaVersion: 1,
      orchestratorId,
      contributions: contributions.map(contribution => ({
        ...contribution,
        scope: contribution.scope.trim(),
      })),
    },
  };
}

export function getTaskAssignmentSummary(task: TaskAssignmentValue, people: Person[]) {
  const orchestratorId = getEffectiveTaskOrchestratorId(task);
  const orchestratorName = orchestratorId
    ? people.find(person => person.id === orchestratorId)?.name ?? 'Unavailable person'
    : 'Unassigned';
  const contributorCount = task.collaboration?.contributions.length ?? 0;

  return {
    orchestratorName,
    contributorCount,
    label: contributorCount > 0 ? `${orchestratorName} + ${contributorCount}` : orchestratorName,
    accessibleLabel: contributorCount > 0
      ? `${orchestratorName}, orchestrator, plus ${contributorCount} ${contributorCount === 1 ? 'contributor' : 'contributors'}`
      : orchestratorId
        ? `${orchestratorName}, orchestrator`
        : 'Unassigned',
  };
}
