const COLLABORATION_SCHEMA_VERSION = 1;
const CONTRIBUTION_ROLES = new Set(['contributor', 'subagent']);
const CONTRIBUTION_STATES = new Set([
  'pending',
  'working',
  'submitted',
  'revision-requested',
  'accepted',
  'blocked',
]);
const MAX_CONTRIBUTIONS = 50;
const MAX_EVIDENCE_REFS = 50;
const FORBIDDEN_KEYS = new Set([
  'auth',
  'authToken',
  'credentials',
  'opaqueSessionRef',
  'prompt',
  'response',
  'runtimeProfileId',
  'sessionBinding',
  'transcript',
  'usage',
]);

function createTaskCollaborationService({ findPersonById, normalizeString }) {
  if (typeof findPersonById !== 'function' || typeof normalizeString !== 'function') {
    throw new TypeError('createTaskCollaborationService requires findPersonById and normalizeString.');
  }

  function invalid(error, message) {
    return { ok: false, error, message };
  }

  function findForbiddenKey(value, path = 'collaboration') {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const found = findForbiddenKey(value[index], `${path}[${index}]`);
        if (found) return found;
      }
      return null;
    }
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
      const found = findForbiddenKey(child, `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }

  function normalizeEvidenceRefs(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const refs = [];
    for (const item of value) {
      const ref = normalizeString(item);
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      refs.push(ref);
    }
    return refs;
  }

  function validateValue(store, value, verifyPeople, options = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return invalid('INVALID_COLLABORATION', 'collaboration must be an object.');
    }
    const forbiddenPath = findForbiddenKey(value);
    if (forbiddenPath) {
      return invalid('COLLABORATION_RUNTIME_DATA_FORBIDDEN', `${forbiddenPath} is runtime or sensitive data and cannot be persisted on a task.`);
    }
    if (Number(value.schemaVersion) !== COLLABORATION_SCHEMA_VERSION) {
      return invalid('UNSUPPORTED_COLLABORATION_VERSION', `collaboration.schemaVersion must be ${COLLABORATION_SCHEMA_VERSION}.`);
    }

    const orchestratorId = normalizeString(value.orchestratorId);
    if (!orchestratorId || (verifyPeople && !findPersonById(store, orchestratorId))) {
      return invalid('COLLABORATION_ORCHESTRATOR_NOT_FOUND', 'collaboration.orchestratorId must reference an existing person.');
    }
    if (!Array.isArray(value.contributions)) {
      return invalid('INVALID_CONTRIBUTIONS', 'collaboration.contributions must be an array.');
    }
    if (value.contributions.length > MAX_CONTRIBUTIONS) {
      return invalid('TOO_MANY_CONTRIBUTIONS', `collaboration.contributions cannot exceed ${MAX_CONTRIBUTIONS} entries.`);
    }

    const contributionIds = new Set();
    const personIds = new Set();
    const contributions = [];
    for (const raw of value.contributions) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return invalid('INVALID_CONTRIBUTION', 'Every contribution must be an object.');
      }
      if (Object.prototype.hasOwnProperty.call(raw, 'contributions') || Object.prototype.hasOwnProperty.call(raw, 'participants')) {
        return invalid('RECURSIVE_COLLABORATION_FORBIDDEN', 'Contributions cannot contain nested contributors or participants.');
      }

      const id = normalizeString(raw.id);
      const personId = normalizeString(raw.personId);
      const scope = normalizeString(raw.scope);
      const role = normalizeString(raw.role);
      const state = normalizeString(raw.state);
      if (!id || !personId || !scope) {
        return invalid('INCOMPLETE_CONTRIBUTION', 'Each contribution requires stable id, personId, and scope values.');
      }
      if (contributionIds.has(id)) return invalid('DUPLICATE_CONTRIBUTION_ID', `Duplicate contribution id "${id}".`);
      if (personIds.has(personId)) return invalid('DUPLICATE_CONTRIBUTOR', `Person "${personId}" can appear only once as a contributor.`);
      if (personId === orchestratorId) return invalid('ORCHESTRATOR_CONTRIBUTOR_CONFLICT', 'The orchestrator cannot also be a contributor.');
      if (!CONTRIBUTION_ROLES.has(role)) return invalid('INVALID_CONTRIBUTION_ROLE', 'Contribution role must be contributor or subagent.');
      if (!CONTRIBUTION_STATES.has(state)) return invalid('INVALID_CONTRIBUTION_STATE', `Unsupported contribution state "${state}".`);

      const person = verifyPeople ? findPersonById(store, personId) : null;
      if (verifyPeople && !person) return invalid('CONTRIBUTOR_NOT_FOUND', `Contributor "${personId}" was not found.`);
      const preservesExistingContribution = options.allowIneligibleExistingContributionIds instanceof Set
        && options.allowIneligibleExistingContributionIds.has(id);
      if (verifyPeople && !preservesExistingContribution && person.kind !== 'agentic') {
        return invalid('CONTRIBUTOR_MUST_BE_AGENTIC', `Contributor "${personId}" must be an agentic person.`);
      }
      if (verifyPeople && !preservesExistingContribution && role !== 'subagent') {
        return invalid('INVALID_CONTRIBUTION_ROLE', 'Agentic task contributors must use the subagent role.');
      }
      if (verifyPeople && !preservesExistingContribution && person.availableForSubagentDelegation !== true) {
        return invalid('SUBAGENT_NOT_ELIGIBLE', `Contributor "${personId}" is not available for subagent delegation.`);
      }

      const evidenceRefs = normalizeEvidenceRefs(raw.evidenceRefs);
      if (evidenceRefs.length > MAX_EVIDENCE_REFS) {
        return invalid('TOO_MANY_EVIDENCE_REFS', `A contribution cannot exceed ${MAX_EVIDENCE_REFS} evidence references.`);
      }
      contributionIds.add(id);
      personIds.add(personId);
      contributions.push({
        ...raw,
        id,
        personId,
        role,
        scope,
        state,
        latestAttemptId: normalizeString(raw.latestAttemptId) || undefined,
        evidenceRefs,
        createdAt: normalizeString(raw.createdAt) || undefined,
        updatedAt: normalizeString(raw.updatedAt) || undefined,
      });
    }

    return {
      ok: true,
      collaboration: {
        ...value,
        schemaVersion: COLLABORATION_SCHEMA_VERSION,
        orchestratorId,
        contributions,
      },
    };
  }

  function validate(store, value, options) {
    return validateValue(store, value, true, options);
  }

  function normalizeStored(value) {
    if (value === undefined || value === null) return { ok: true, collaboration: undefined };
    const candidate = value && typeof value === 'object' && !Array.isArray(value) && value.schemaVersion === undefined
      ? { ...value, schemaVersion: COLLABORATION_SCHEMA_VERSION }
      : value;
    return validateValue(null, candidate, false);
  }

  return { normalizeStored, validate };
}

module.exports = {
  COLLABORATION_SCHEMA_VERSION,
  createTaskCollaborationService,
};
