import type { Person, TaskCollaborationV1, TaskContributionRole, TaskContributionState } from '../types.ts';

const ROLES = new Set<TaskContributionRole>(['contributor', 'subagent']);
const STATES = new Set<TaskContributionState>(['pending', 'working', 'submitted', 'revision-requested', 'accepted', 'blocked']);
const FORBIDDEN_KEYS = new Set(['auth', 'authToken', 'credentials', 'opaqueSessionRef', 'prompt', 'response', 'runtimeProfileId', 'sessionBinding', 'transcript', 'usage']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key) || containsForbiddenKey(child));
}

export function normalizeTaskCollaboration(
  value: unknown,
  people?: Person[],
): TaskCollaborationV1 | undefined {
  if (!isRecord(value) || containsForbiddenKey(value)) return undefined;
  const schemaVersion = value.schemaVersion === undefined ? 1 : Number(value.schemaVersion);
  const orchestratorId = typeof value.orchestratorId === 'string' ? value.orchestratorId.trim() : '';
  if (schemaVersion !== 1 || !orchestratorId || !Array.isArray(value.contributions) || value.contributions.length > 50) return undefined;

  const peopleById = people ? new Map(people.map(person => [person.id, person])) : null;
  if (peopleById && !peopleById.has(orchestratorId)) return undefined;
  const ids = new Set<string>();
  const personIds = new Set<string>();
  const contributions: TaskCollaborationV1['contributions'] = [];

  for (const item of value.contributions) {
    if (!isRecord(item) || 'contributions' in item || 'participants' in item) return undefined;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const personId = typeof item.personId === 'string' ? item.personId.trim() : '';
    const scope = typeof item.scope === 'string' ? item.scope.trim() : '';
    const role = item.role as TaskContributionRole;
    const state = item.state as TaskContributionState;
    if (!id || !personId || !scope || ids.has(id) || personIds.has(personId) || personId === orchestratorId || !ROLES.has(role) || !STATES.has(state)) return undefined;
    const person = peopleById?.get(personId);
    if (peopleById && !person) return undefined;
    if (peopleById && (role !== 'subagent' || person?.kind !== 'agentic' || person.availableForSubagentDelegation !== true)) return undefined;

    ids.add(id);
    personIds.add(personId);
    contributions.push({
      ...item,
      id,
      personId,
      role,
      scope,
      state,
      evidenceRefs: Array.isArray(item.evidenceRefs)
        ? Array.from(new Set(item.evidenceRefs.filter((ref): ref is string => typeof ref === 'string' && Boolean(ref.trim())).map(ref => ref.trim()))).slice(0, 50)
        : [],
    });
  }

  return { ...value, schemaVersion: 1, orchestratorId, contributions } as TaskCollaborationV1;
}
