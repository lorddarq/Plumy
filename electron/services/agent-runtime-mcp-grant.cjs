const { randomUUID } = require('node:crypto');

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const grants = new Map();

function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
  if (scope.kind === 'task' && typeof scope.taskId === 'string' && scope.taskId.trim()) {
    return { kind: 'task', taskId: scope.taskId.trim() };
  }
  if (scope.kind === 'goal-node' && typeof scope.goalId === 'string' && scope.goalId.trim()
    && typeof scope.goalElementId === 'string' && scope.goalElementId.trim()
    && typeof scope.goalExecutionId === 'string' && scope.goalExecutionId.trim()) {
    return {
      kind: 'goal-node',
      goalId: scope.goalId.trim(),
      goalElementId: scope.goalElementId.trim(),
      goalExecutionId: scope.goalExecutionId.trim(),
    };
  }
  return null;
}

function issueScopedMcpGrant({ endpoint, scope, capabilityProfile = 'read_only', ttlMs = DEFAULT_TTL_MS } = {}) {
  const normalizedScope = normalizeScope(scope);
  if (!normalizedScope || typeof endpoint !== 'string' || !endpoint.trim()) {
    return { ok: false, error: 'ACP_MCP_GRANT_FAILED', message: 'A scoped MCP endpoint and execution scope are required.' };
  }
  const ttl = Number(ttlMs);
  const expiresAt = Date.now() + (Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, DEFAULT_TTL_MS) : DEFAULT_TTL_MS);
  const grant = {
    grantId: `mcp-grant-${randomUUID()}`,
    token: `omvra-runtime-${randomUUID()}`,
    endpoint: endpoint.trim(),
    scope: normalizedScope,
    capabilityProfile: ['read_only', 'task_write', 'admin'].includes(capabilityProfile) ? capabilityProfile : 'read_only',
    expiresAt,
  };
  grants.set(grant.grantId, grant);
  return { ok: true, ...grant };
}

function revokeScopedMcpGrant(grantId) {
  if (typeof grantId !== 'string' || !grantId.trim()) return false;
  return grants.delete(grantId.trim());
}

function findScopedMcpGrant(token) {
  if (typeof token !== 'string' || !token.trim()) return null;
  for (const [grantId, grant] of grants) {
    if (grant.expiresAt <= Date.now()) {
      grants.delete(grantId);
      continue;
    }
    if (grant.token === token.trim()) return { ...grant };
  }
  return null;
}

function isScopedToolCallAllowed(grant, toolName, args = {}) {
  if (!grant || typeof toolName !== 'string') return false;
  const canWrite = grant.capabilityProfile === 'task_write' || grant.capabilityProfile === 'admin';
  if (toolName === 'tasks.create_follow_up') {
    return canWrite
      && grant.scope.kind === 'task'
      && typeof args?.parentTaskId === 'string'
      && args.parentTaskId.trim() === grant.scope.taskId;
  }
  const taskId = args && typeof args === 'object' ? (args.taskId || args.id) : null;
  if (grant.scope.kind !== 'task') return false;
  if (typeof taskId !== 'string' || taskId.trim() !== grant.scope.taskId) return false;
  return toolName === 'tasks.get'
    || toolName === 'tasks.context.list'
    || toolName === 'tasks.context.get'
    || toolName === 'tasks.collaboration_history'
    || toolName === 'agent.resolve_task_context'
    || canWrite;
}

function buildProviderMcpConfiguration(grant, provider) {
  if (!grant) return {};
  const server = {
    name: 'omvra',
    url: grant.endpoint,
    headers: { Authorization: `Bearer ${grant.token}` },
  };
  if (provider === 'acp' || provider === 'acp-local-stdio') return { mcpServers: [server] };
  if (provider === 'codex-app-server' || provider === 'codex-app-server-stdio') {
    return {
      config: {
        mcp_servers: {
          omvra: {
            url: server.url,
            http_headers: server.headers,
            enabled: true,
          },
        },
      },
    };
  }
  if (provider === 'claude-stream-json' || provider === 'claude-stream-json-stdio') return { mcpServers: { omvra: server } };
  return {};
}

function _resetForTests() {
  grants.clear();
}

module.exports = {
  buildProviderMcpConfiguration,
  findScopedMcpGrant,
  issueScopedMcpGrant,
  isScopedToolCallAllowed,
  normalizeScope,
  revokeScopedMcpGrant,
  _resetForTests,
};
