const { appendMcpAuditLog } = require('./workspace-service.cjs');
const { normalizeObject } = require('./mcp-response.cjs');

function getRequestMeta(req) {
  const headers = req?.headers || {};
  const clientName = req?.mcpClientInfo?.name
    || headers['x-mcp-client']
    || headers['mcp-client']
    || null;
  const clientVersion = req?.mcpClientInfo?.version
    || headers['x-mcp-client-version']
    || headers['mcp-client-version']
    || null;

  return {
    transport: req?.transport || 'http',
    origin: normalizeAuditOrigin(headers.origin),
    agent: normalizeMcpAgent(clientName),
    clientName: normalizeAuditString(clientName),
    clientVersion: normalizeAuditString(clientVersion),
  };
}

const AUDIT_DETAIL_KEYS = [
  'outcome',
  'reason',
  'toolName',
  'command',
  'actor',
  'taskId',
  'projectId',
  'entityId',
  'nextRevision',
  'targetStatusId',
  'targetStatusTitle',
  'assigneeId',
  'assigneeName',
  'orchestratorId',
  'contributionId',
  'contributionIds',
  'attemptId',
  'previousState',
  'nextState',
  'eventType',
  'capabilityProfile',
  'revision',
  'expectedRevision',
  'currentRevision',
  'executionId',
  'executionState',
  'executionRevision',
  'goalRevision',
  'attempt',
  'contractRevision',
  'contractHash',
  'idempotent',
  'fields',
  'statusId',
  'statusTitle',
  'deletedTaskId',
  'milestoneId',
  'milestoneTitle',
  'target',
];

function normalizeAuditString(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null;
}

function normalizeAuditOrigin(value) {
  const origin = normalizeAuditString(value);
  if (!origin) return null;
  try {
    return new URL(origin).origin.slice(0, 160);
  } catch (_error) {
    return null;
  }
}

function normalizeMcpAgent(value) {
  const normalized = normalizeAuditString(value)?.toLowerCase() || '';
  if (normalized.includes('codex')) return 'codex';
  if (normalized.includes('copilot')) return 'copilot';
  if (normalized.includes('claude')) return 'claude';
  if (normalized.includes('opencode') || normalized.includes('open code')) return 'opencode';
  if (normalized.includes('openai')) return 'openai';
  return 'unknown';
}

function normalizeAuditOutcome(value, reason) {
  if (value === 'allowed' || value === 'success') return 'success';
  if (value === 'denied') {
    const normalizedReason = normalizeAuditString(reason)?.toLowerCase() || '';
    return ['access_disabled', 'unauthorized', 'token_expired', 'write_tools_unavailable'].includes(normalizedReason)
      ? 'denied'
      : 'failure';
  }
  return 'failure';
}

function normalizeFailureClass(reason, outcome) {
  if (outcome === 'success') return null;
  const normalized = normalizeAuditString(reason)?.toLowerCase() || '';
  if (normalized.includes('unauthor')) return 'unauthorized';
  if (normalized.includes('access_disabled') || normalized.includes('write_tools_unavailable')) return 'forbidden';
  if (normalized.includes('invalid') || normalized.includes('params')) return 'invalid_params';
  if (normalized.includes('not_found') || normalized.includes('not found')) return 'not_found';
  if (normalized.includes('conflict') || normalized.includes('revision')) return 'conflict';
  if (normalized.includes('internal') || normalized.includes('error')) return 'internal';
  return 'unknown';
}

function getAuditTarget(details = {}) {
  const target = details.target && typeof details.target === 'object' ? details.target : {};
  return {
    taskId: normalizeAuditString(details.taskId || target.taskId),
    projectId: normalizeAuditString(details.projectId || target.projectId),
    entityId: normalizeAuditString(details.entityId || target.entityId),
  };
}

function getAuditTargetFromArgs(args) {
  const normalized = normalizeObject(args);
  return {
    taskId: normalizeAuditString(normalized.taskId || normalized.id),
    projectId: normalizeAuditString(normalized.projectId),
    entityId: normalizeAuditString(normalized.entityId || normalized.milestoneId),
  };
}

function getSafeAuditDetails(details = {}) {
  const safeDetails = {};
  for (const key of AUDIT_DETAIL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(details, key)) {
      safeDetails[key] = sanitizeForAudit(details[key]);
    }
  }
  return safeDetails;
}

function appendNormalizedMcpAudit(store, req, details = {}) {
  const startedAt = req?._mcpTelemetryStartedAt || new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  const safeDetails = getSafeAuditDetails(details);
  const outcome = normalizeAuditOutcome(safeDetails.outcome, safeDetails.reason);
  const entry = {
    schemaVersion: 1,
    type: details.type || 'mcp_tool_call',
    ...getRequestMeta(req),
    ...safeDetails,
    outcome,
    failureClass: normalizeFailureClass(safeDetails.reason, outcome),
    startedAt,
    finishedAt,
    durationMs,
    target: getAuditTarget(safeDetails),
  };
  const audit = appendMcpAuditLog(store, entry);
  if (req && typeof req === 'object') req._mcpAuditRecorded = true;
  return audit;
}

function sanitizeForAudit(value, depth = 0) {
  if (depth > 2) return '[truncated]';
  if (typeof value === 'string') {
    return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => sanitizeForAudit(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, itemValue] of Object.entries(value).slice(0, 40)) {
      out[key] = sanitizeForAudit(itemValue, depth + 1);
    }
    return out;
  }
  return undefined;
}

function recordWriteAttempt(store, req, details) {
  return appendNormalizedMcpAudit(store, req, { type: 'mcp_write_attempt', ...details });
}

function recordToolAttempt(store, req, details) {
  return appendNormalizedMcpAudit(store, req, details);
}

module.exports = {
  normalizeAuditString,
  getAuditTargetFromArgs,
  recordWriteAttempt,
  recordToolAttempt,
};
