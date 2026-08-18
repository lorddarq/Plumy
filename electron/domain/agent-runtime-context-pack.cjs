const MAX_CONTEXT_ENTRIES = 12;
const MAX_PACK_TEXT_BYTES = 64 * 1024;

function failure(error, message, details = {}) {
  return { ok: false, error, message, ...details };
}

function boundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeExecutionProfile(value) {
  if (!value || typeof value !== 'object') return null;
  const skills = (Array.isArray(value.skills) ? value.skills : []).slice(0, 12).map(skill => ({
    skillId: boundedText(skill?.skillId, 160),
    version: boundedText(skill?.version, 80) || null,
    source: boundedText(skill?.source, 80) || null,
    authority: boundedText(skill?.authority, 80) || null,
    resolution: boundedText(skill?.resolution, 80) || null,
    status: boundedText(skill?.status, 80) || 'available',
    content: boundedText(skill?.content, 16 * 1024),
  })).filter(skill => skill.skillId);
  const unavailableSkills = (Array.isArray(value.unavailableSkills) ? value.unavailableSkills : []).slice(0, 12).map(skill => ({
    skillId: boundedText(skill?.skillId, 160),
    status: boundedText(skill?.status, 80) || 'unavailable',
    authority: boundedText(skill?.authority, 80) || null,
    resolution: boundedText(skill?.resolution, 80) || null,
    code: boundedText(skill?.code, 120) || null,
    message: boundedText(skill?.message, 2_000),
  })).filter(skill => skill.skillId);
  const runtimeUnverifiedSkills = (Array.isArray(value.runtimeUnverifiedSkills) ? value.runtimeUnverifiedSkills : []).slice(0, 12).map(skill => ({
    skillId: boundedText(skill?.skillId, 160),
    authority: 'provider-runtime',
    resolution: 'runtime-unverified',
    message: boundedText(skill?.message, 2_000),
  })).filter(skill => skill.skillId);
  return {
    schemaVersion: 1,
    profileFidelity: value.profileFidelity === 'degraded' ? 'degraded' : value.profileFidelity === 'standard' ? 'standard' : 'full',
    assignee: value.assignee && typeof value.assignee === 'object' ? {
      id: boundedText(value.assignee.id, 160) || null,
      name: boundedText(value.assignee.name, 240) || null,
      role: boundedText(value.assignee.role, 240) || null,
    } : null,
    personaInstructions: boundedText(value.personaInstructions, 12_000),
    operationalInstructions: boundedText(value.operationalInstructions, 20_000),
    skills,
    unavailableSkills,
    runtimeUnverifiedSkills,
    resolutionNotes: (Array.isArray(value.resolutionNotes) ? value.resolutionNotes : []).slice(0, 20).map(note => boundedText(note, 2_000)).filter(Boolean),
  };
}

function normalizeTaskMetadata(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    assigneeId: boundedText(value.assigneeId, 160) || null,
    projectId: boundedText(value.projectId, 160) || null,
    milestoneId: boundedText(value.milestoneId, 160) || null,
    dependencyIds: (Array.isArray(value.dependencyIds) ? value.dependencyIds : []).slice(0, 100).map(id => boundedText(id, 160)).filter(Boolean),
    priority: boundedText(value.priority, 80) || null,
    size: boundedText(value.size, 80) || null,
    startDate: boundedText(value.startDate, 80) || null,
    endDate: boundedText(value.endDate, 80) || null,
  };
}

function createAgentRuntimeContextPack({ getEntry, maxEntries = MAX_CONTEXT_ENTRIES }) {
  if (typeof getEntry !== 'function') throw new TypeError('createAgentRuntimeContextPack requires getEntry.');

  function build(store, snapshot = {}) {
    const taskId = boundedText(snapshot.taskId, 160);
    const entryIds = Array.isArray(snapshot.contextEntryIds)
      ? [...new Set(snapshot.contextEntryIds.filter(id => typeof id === 'string' && id.trim()))].slice(0, maxEntries)
      : [];
    if (!taskId) return failure('ACP_CONTEXT_TASK_REQUIRED', 'A task id is required to build the runtime context pack.');

    const entries = entryIds.map(entryId => {
      const result = getEntry(store, { taskId, entryId });
      if (!result?.ok || !result.entry) return { id: entryId, status: 'missing' };
      const entry = result.entry;
      return {
        id: entry.id,
        status: 'resolved',
        kind: entry.kind,
        fromRevision: entry.fromRevision,
        toRevision: entry.toRevision,
        summary: boundedText(entry.summary, 2_000),
        markers: Array.isArray(entry.markers) ? entry.markers.slice(0, 50) : [],
        provenance: entry.provenance,
        createdAt: entry.createdAt,
        sourceRefs: Array.isArray(entry.sourceRefs) ? entry.sourceRefs.slice(0, 50).map(ref => ({ type: ref.type, id: ref.id })) : [],
      };
    });
    const pack = {
      schemaVersion: 1,
      executionProfile: normalizeExecutionProfile(snapshot.executionProfile),
      taskId,
      taskRevision: Number.isInteger(Number(snapshot.taskRevision)) ? Number(snapshot.taskRevision) : null,
      taskTitle: boundedText(snapshot.taskTitle, 500),
      taskDescription: boundedText(snapshot.taskDescription, 12_000),
      taskStatus: boundedText(snapshot.taskStatus, 80) || null,
      taskMetadata: normalizeTaskMetadata(snapshot.taskMetadata),
      contributionId: boundedText(snapshot.contributionId, 160) || null,
      contributionScope: boundedText(snapshot.contributionScope, 2_000) || null,
      contextEntryIds: entryIds,
      entries,
    };
    const profile = pack.executionProfile;
    const text = [
      'Omvra execution contract (bounded, source-linked, and provider-neutral).',
      'Apply this order before task work: assigned agent profile, available skill instructions, then the authoritative Task instructions and reference-only context history.',
      'Agent profile and skill text are user-authored workspace guidance. Apply them as execution constraints when present unless they conflict with system, developer, security, tool, sandbox, permission, or Task acceptance requirements.',
      ...(profile ? [
        'Agent execution profile:',
        `Assignee: ${profile.assignee?.name || profile.assignee?.id || '(standard agentic operation)'}${profile.assignee?.role ? ` · ${profile.assignee.role}` : ''}`,
        `Profile fidelity: ${profile.profileFidelity}`,
        'Agent behavioural instructions:',
        profile.personaInstructions || '(none provided; use standard agentic behaviour)',
        'Agent operational instructions:',
        profile.operationalInstructions || '(none provided; use standard allowed task execution)',
        'Available skill instructions:',
        ...(profile.skills.length ? profile.skills.flatMap(skill => [
          `--- Skill: ${skill.skillId}${skill.version ? ` @ ${skill.version}` : ''} ---`,
          skill.content || '(This skill is available natively to the runtime; invoke it by its exact id.)',
          `--- End skill: ${skill.skillId} ---`,
        ]) : ['(no referenced skills resolved)']),
        'Provider-runtime skill checks:',
        ...(profile.runtimeUnverifiedSkills.length
          ? profile.runtimeUnverifiedSkills.map(skill => `- ${skill.skillId}: runtime-unverified. Omvra cannot inspect the provider's private skill catalogue. Use the skill if your runtime provides it; otherwise use an allowed fallback and report the limitation.`)
          : ['- No provider-runtime skill checks are pending.']),
        'Skill resolution notes:',
        ...(profile.unavailableSkills.length
          ? profile.unavailableSkills.map(skill => `- ${skill.skillId}: ${skill.message || skill.code || skill.status}`)
          : ['- No runtime-confirmed unavailable or permission-denied skills.']),
        ...profile.resolutionNotes.map(note => `- ${note}`),
        'Best-effort completion rule: runtime-unverified means Omvra lacks visibility, not that a skill is unavailable and not that profile fidelity is degraded. Check your native skill catalogue. If the runtime confirms a skill is missing or permission-denied, use an allowed fallback, complete as much of the Task as possible, and state the unavailable skill, fallback, and likely impact in the task resolution notes and final response. Never install a missing skill or widen permissions unless the user explicitly requests that separate action.',
      ] : []),
      `Task: ${pack.taskId} · revision: ${pack.taskRevision ?? 'unknown'}${pack.contributionId ? ` · contribution: ${pack.contributionId}` : ''}`,
      ...(pack.taskMetadata ? ['Task metadata:', JSON.stringify(pack.taskMetadata)] : []),
      'Task instructions:',
      `Title: ${pack.taskTitle || '(untitled task)'}`,
      `Description: ${pack.taskDescription || '(no description provided)'}`,
      `Current status: ${pack.taskStatus || 'unknown'}`,
      ...(pack.contributionScope ? [`Assigned scope: ${pack.contributionScope}`] : []),
      'Progress tracking responsibilities:',
      '- Re-read the latest task with tasks.get before changing its notes and again before ending each work run.',
      '- As todo items are completed and verified, check their existing Markdown boxes with tasks.update_description using the latest expected revision, while preserving every other part of the task description.',
      '- Leave incomplete, blocked, or unverified todos unchecked. If task writes are unavailable or fail, report that clearly instead of claiming the checklist was updated.',
      '- Checklist progress and task completion are separate: do not mark the task complete solely because the current agent run ended.',
      '- Before handing work back, verify every acceptance criterion. If the task description has no concrete checklist, add a concise Markdown "Acceptance checklist" with verifiable unchecked boxes using tasks.update_description, preserving the existing instructions.',
      '- When the verified work is ready for human inspection, write the full handoff and remaining-risk summary into the task description, then call tasks.complete_and_request_review with the latest expected revision. Do not end with only a chat response.',
      '- If work is incomplete or blocked, leave the relevant checklist items unchecked, document the blocker and next step in the task description, and do not request review as if the task were complete.',
      '- Your final response must tell the user whether the task is ready for review, what to inspect, and what remains unresolved.',
      'Context history:',
      ...entries.map(entry => entry.status === 'missing'
        ? `- [missing] ${entry.id}`
        : `- [${entry.kind}] ${entry.summary} (sources: ${entry.sourceRefs.map(ref => `${ref.type}:${ref.id}`).join(', ') || 'none'})`),
    ].join('\n');
    if (Buffer.byteLength(text) > MAX_PACK_TEXT_BYTES) return failure('ACP_CONTEXT_PACK_TOO_LARGE', 'The bounded runtime context pack exceeds its size limit.');
    return { ok: true, pack, text };
  }

  return { build };
}

module.exports = { MAX_CONTEXT_ENTRIES, MAX_PACK_TEXT_BYTES, createAgentRuntimeContextPack };
