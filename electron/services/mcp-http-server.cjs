const http = require('http');
const { randomUUID } = require('crypto');
const {
  isMcpAgentAccessEnabled,
  getMcpServerConfig,
  getMcpCapabilityProfile,
  buildMcpCapabilitySnapshot,
  buildMcpInitializeResult,
  getMcpPrompt,
  isMcpAccessTokenExpired,
} = require('./workspace-service.cjs');
const {
  PUBLIC_READ_TOOL_DEFINITIONS,
  PUBLIC_WRITE_TOOL_DEFINITIONS,
  RESOURCE_DEFINITIONS,
  RESOURCE_TEMPLATE_DEFINITIONS,
  PROMPT_DEFINITIONS,
} = require('./mcp-registry.cjs');
const {
  JSON_RPC_ERROR,
  createJsonRpcError,
  makeJsonRpcResponse,
  makeResourceReadResult,
  normalizeObject,
  hasResponseId,
  isJsonRpcIdValid,
  invalidParams,
} = require('./mcp-response.cjs');
const {
  normalizeAuditString,
  getAuditTargetFromArgs,
  recordToolAttempt,
} = require('./mcp-audit-adapter.cjs');
const {
  getToolCallPayload,
  handleToolCall,
} = require('./mcp-handlers.cjs');
const { getResourceForUri } = require('./mcp-resource-handlers.cjs');
const { findScopedMcpGrant, isScopedToolCallAllowed } = require('./agent-runtime-mcp-grant.cjs');

const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_CORS_HEADERS = 'Content-Type, Accept, Authorization, X-MCP-Token, Mcp-Session-Id';
const ALLOWED_CORS_METHODS = 'POST, OPTIONS';

function extractBearerToken(req) {
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const fallbackToken = req.headers?.['x-mcp-token'];
  return typeof fallbackToken === 'string' ? fallbackToken.trim() : '';
}

function buildAuthErrorData(serverConfig, reason, req, extra = {}) {
  return {
    reason,
    authMode: serverConfig.accessToken ? 'token' : 'none',
    tokenConfigured: Boolean(serverConfig.accessToken),
    tokenStatus: serverConfig.accessToken
      ? (isMcpAccessTokenExpired(serverConfig) ? 'expired' : 'active')
      : 'none',
    endpoint: serverConfig.publicUrl,
    host: serverConfig.host,
    port: serverConfig.port,
    path: serverConfig.path,
    transport: req?.transport || 'http',
    ...extra,
  };
}

function createAuthError(serverConfig, req, reason, message, extra = {}) {
  return createJsonRpcError(
    JSON_RPC_ERROR.MCP_UNAUTHORIZED,
    message,
    buildAuthErrorData(serverConfig, reason, req, extra)
  );
}

function createAccessDisabledError(serverConfig, req) {
  return createJsonRpcError(
    JSON_RPC_ERROR.MCP_ACCESS_DISABLED,
    'MCP agent access is disabled. Enable mcpAgentAccessEnabled in Preferences.',
    buildAuthErrorData(serverConfig, 'access_disabled', req)
  );
}

function createRequestDispatcher(store, { skillsRoot, userSkillsRoot, emitRuntimeChange } = {}) {
  const clientProvenanceBySession = new Map();

  function getSessionKey(req) {
    const sessionId = normalizeAuditString(req?.headers?.['mcp-session-id']);
    if (sessionId) return `http:${sessionId}`;
    if (req?.transport === 'stdio') return 'stdio';
    return null;
  }

  function hydrateClientProvenance(req) {
    const sessionKey = getSessionKey(req);
    if (!sessionKey) return;
    const clientInfo = clientProvenanceBySession.get(sessionKey);
    if (clientInfo) req.mcpClientInfo = clientInfo;
  }

  function rememberClientProvenance(req, clientInfo) {
    let sessionId = normalizeAuditString(req?.headers?.['mcp-session-id']);
    if (!sessionId && req?.transport !== 'stdio') {
      sessionId = randomUUID();
      req._mcpSessionId = sessionId;
    }

    const sessionKey = req?.transport === 'stdio' ? 'stdio' : `http:${sessionId}`;
    clientProvenanceBySession.set(sessionKey, clientInfo);
    if (clientProvenanceBySession.size > 100) {
      clientProvenanceBySession.delete(clientProvenanceBySession.keys().next().value);
    }
  }

  return (request, req) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return makeJsonRpcResponse(
        null,
        { error: createJsonRpcError(JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request') }
      );
    }

    const { jsonrpc, id, method, params } = request;
    if (!isJsonRpcIdValid(id)) {
      return makeJsonRpcResponse(
        null,
        { error: createJsonRpcError(JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request: id must be string, number, null, or omitted.') }
      );
    }

    if (jsonrpc !== '2.0' || typeof method !== 'string' || !method.trim()) {
      return makeJsonRpcResponse(
        id,
        { error: createJsonRpcError(JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request') }
      );
    }

    const canRespond = hasResponseId(request);
    const respond = payload => (canRespond ? makeJsonRpcResponse(id, payload) : null);
    const normalizedMethod = method.trim();
    hydrateClientProvenance(req);
    if (normalizedMethod === 'tools/call' && req && typeof req === 'object') {
      req._mcpTelemetryStartedAt = new Date().toISOString();
      req._mcpAuditRecorded = false;
    }
    const toolPayload = normalizedMethod === 'tools/call' ? getToolCallPayload(params) : null;
    const currentServerConfig = getMcpServerConfig(store);

    if (normalizedMethod === 'notifications/initialized') {
      return null;
    }

    if (!isMcpAgentAccessEnabled(store)) {
      if (normalizedMethod === 'tools/call') {
        recordToolAttempt(store, req, {
          outcome: 'denied',
          reason: 'access_disabled',
          capabilityProfile: getMcpCapabilityProfile(store),
          toolName: toolPayload?.name || null,
          target: getAuditTargetFromArgs(toolPayload?.args),
        });
      }
      return respond({
        error: createAccessDisabledError(currentServerConfig, req),
      });
    }

    const providedToken = extractBearerToken(req);
    const scopedGrant = findScopedMcpGrant(providedToken);
    if (scopedGrant) req._mcpGrant = scopedGrant;
    const token = currentServerConfig.accessToken;
    const isStdioTransport = req?.transport === 'stdio';
    if (token && !isStdioTransport && !scopedGrant) {
      if (isMcpAccessTokenExpired(currentServerConfig)) {
        if (normalizedMethod === 'tools/call') {
          recordToolAttempt(store, req, {
            outcome: 'denied',
            reason: 'token_expired',
            toolName: toolPayload?.name || null,
            target: getAuditTargetFromArgs(toolPayload?.args),
          });
        }
        return respond({
          error: createAuthError(
            currentServerConfig,
            req,
            'token_expired',
            'MCP token expired. Rotate token in Preferences.'
          ),
        });
      }
      const providedToken = extractBearerToken(req);
      if (!providedToken || providedToken !== token) {
        if (normalizedMethod === 'tools/call') {
          recordToolAttempt(store, req, {
            outcome: 'denied',
            reason: 'unauthorized',
            capabilityProfile: getMcpCapabilityProfile(store),
            toolName: toolPayload?.name || null,
            target: getAuditTargetFromArgs(toolPayload?.args),
          });
        }
        return respond({
          error: createAuthError(
            currentServerConfig,
            req,
            'unauthorized',
            'Unauthorized MCP request. Provide a valid Bearer token.',
            {
              tokenProvided: Boolean(providedToken),
            }
          ),
        });
      }
    }

    if (normalizedMethod === 'initialize') {
      if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
        return respond({
          error: invalidParams('Invalid params: initialize expects an object when params are provided.'),
        });
      }
      const clientInfo = normalizeObject(params).clientInfo;
      if (req && clientInfo && typeof clientInfo === 'object') {
        req.mcpClientInfo = {
          name: normalizeAuditString(clientInfo.name),
          version: normalizeAuditString(clientInfo.version),
        };
        rememberClientProvenance(req, req.mcpClientInfo);
      }
      return respond({ result: buildMcpInitializeResult(store) });
    }

    if (normalizedMethod === 'mcp/capabilities') {
      return respond({ result: buildMcpCapabilitySnapshot(store) });
    }

    if (normalizedMethod === 'prompts/list') {
      if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
        return respond({
          error: invalidParams('Invalid params: prompts/list expects an object when params are provided.'),
        });
      }
      return respond({
        result: {
          prompts: PROMPT_DEFINITIONS,
        },
      });
    }

    if (normalizedMethod === 'prompts/get') {
      const normalized = normalizeObject(params);
      const name = typeof normalized.name === 'string' ? normalized.name.trim() : '';
      if (!name) {
        return respond({
          error: invalidParams('Invalid params: "name" is required for prompts/get.'),
        });
      }
      const prompt = getMcpPrompt(name, normalizeObject(normalized.arguments));
      if (!prompt) {
        return respond({
          error: createJsonRpcError(
            JSON_RPC_ERROR.INVALID_PARAMS,
            `Prompt "${name}" not found.`,
            { name }
          ),
        });
      }
      return respond({
        result: {
          description: prompt.description,
          messages: prompt.messages,
        },
      });
    }

    if (normalizedMethod === 'tools/list') {
      if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
        return respond({
          error: invalidParams('Invalid params: tools/list expects an object when params are provided.'),
        });
      }
      const profile = getMcpCapabilityProfile(store);
      const writeToolsEnabled = profile === 'task_write' || profile === 'admin';
      return respond({
        result: {
          tools: writeToolsEnabled
            ? [...PUBLIC_READ_TOOL_DEFINITIONS, ...PUBLIC_WRITE_TOOL_DEFINITIONS]
            : PUBLIC_READ_TOOL_DEFINITIONS,
        },
      });
    }

    if (normalizedMethod === 'tools/call') {
      if (scopedGrant && !isScopedToolCallAllowed(scopedGrant, toolPayload?.name, toolPayload?.args)) {
        recordToolAttempt(store, req, {
          outcome: 'denied',
          reason: 'scope_denied',
          capabilityProfile: scopedGrant.capabilityProfile,
          toolName: toolPayload?.name || null,
          target: getAuditTargetFromArgs(toolPayload?.args),
        });
        return respond({
          error: createJsonRpcError(JSON_RPC_ERROR.MCP_WRITE_FORBIDDEN, 'The runtime MCP grant does not permit this tool or task scope.', {
            reason: 'scope_denied',
            scope: scopedGrant.scope,
          }),
        });
      }
      let toolResponse;
      try {
        toolResponse = handleToolCall(store, req, params, { skillsRoot, userSkillsRoot, emitRuntimeChange });
      } catch (error) {
        recordToolAttempt(store, req, {
          outcome: 'failure',
          reason: 'internal_error',
          toolName: toolPayload?.name || null,
          target: getAuditTargetFromArgs(toolPayload?.args),
        });
        return respond({
          error: createJsonRpcError(JSON_RPC_ERROR.INTERNAL_ERROR, 'Internal error'),
        });
      }
      if (toolResponse.error) {
        if (!req?._mcpAuditRecorded) {
          recordToolAttempt(store, req, {
            outcome: 'failure',
            reason: toolResponse.error.data?.reason || 'invalid_params',
            toolName: toolPayload?.name || null,
            target: getAuditTargetFromArgs(toolPayload?.args),
          });
        }
        return respond({ error: toolResponse.error });
      }
      if (!req?._mcpAuditRecorded) {
        recordToolAttempt(store, req, {
          outcome: 'success',
          toolName: toolPayload?.name || null,
          target: getAuditTargetFromArgs(toolPayload?.args),
        });
      }
      return respond({ result: toolResponse.result });
    }

    if (normalizedMethod === 'resources/list') {
      if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
        return respond({
          error: invalidParams('Invalid params: resources/list expects an object when params are provided.'),
        });
      }
      return respond({
        result: {
          resources: RESOURCE_DEFINITIONS,
          resourceTemplates: RESOURCE_TEMPLATE_DEFINITIONS,
        },
      });
    }

    if (normalizedMethod === 'resources/templates/list') {
      if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
        return respond({
          error: invalidParams('Invalid params: resources/templates/list expects an object when params are provided.'),
        });
      }
      return respond({
        result: {
          resourceTemplates: RESOURCE_TEMPLATE_DEFINITIONS,
          templates: RESOURCE_TEMPLATE_DEFINITIONS,
        },
      });
    }

    if (normalizedMethod === 'resources/read') {
      const normalized = normalizeObject(params);
      const uri = typeof normalized.uri === 'string' ? normalized.uri.trim() : '';
      if (!uri) {
        return respond({
          error: invalidParams('Invalid params: "uri" is required for resources/read.'),
        });
      }

      const resourceResponse = getResourceForUri(store, uri, normalized);
      if (resourceResponse.error) {
        return respond({ error: resourceResponse.error });
      }

      return respond({
        result: makeResourceReadResult(resourceResponse.uri, resourceResponse.data),
      });
    }

    return respond({
      error: createJsonRpcError(JSON_RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${normalizedMethod}`),
    });
  };
}

function applyCorsHeaders(req, res) {
  const requestOrigin = typeof req?.headers?.origin === 'string' ? req.headers.origin.trim() : '';
  const allowOrigin = requestOrigin || '*';

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_CORS_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_CORS_HEADERS);
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.setHeader('Access-Control-Max-Age', '600');
}

function startMcpHttpServer(store, { logger = console, onStatusChange, skillsRoot, userSkillsRoot, emitRuntimeChange } = {}) {
  const dispatch = createRequestDispatcher(store, { skillsRoot, userSkillsRoot, emitRuntimeChange });
  const serverConfig = getMcpServerConfig(store);
  const emitStatus = (status) => {
    if (typeof onStatusChange !== 'function') return;
    onStatusChange({
      ...status,
      host: serverConfig.host,
      port: serverConfig.port,
      path: serverConfig.path,
      expectedAddress: serverConfig.publicUrl,
      capabilityProfile: getMcpCapabilityProfile(store),
      updatedAt: new Date().toISOString(),
    });
  };

  emitStatus({
    status: isMcpAgentAccessEnabled(store) ? 'starting' : 'disabled',
    listening: false,
    error: null,
    boundAddress: null,
    boundUrl: null,
    restartRequired: false,
  });

  const server = http.createServer((req, res) => {
    applyCorsHeaders(req, res);

    if (!req || req.url !== serverConfig.path) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    let requestBody = '';
    let receivedBytes = 0;

    req.setEncoding('utf8');

    req.on('data', chunk => {
      receivedBytes += Buffer.byteLength(chunk, 'utf8');
      if (receivedBytes > MAX_BODY_BYTES) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Payload Too Large' }));
        req.destroy();
        return;
      }
      requestBody += chunk;
    });

    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(requestBody || '{}');
      } catch (_error) {
        const response = makeJsonRpcResponse(
          null,
          { error: createJsonRpcError(JSON_RPC_ERROR.PARSE_ERROR, 'Parse error') }
        );
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(response));
        return;
      }

      let responsePayload;
      try {
        responsePayload = dispatch(payload, req);
      } catch (error) {
        logger.error('[mcp] Unexpected error while handling request:', error);
        responsePayload = makeJsonRpcResponse(
          payload && typeof payload === 'object' ? payload.id : null,
          {
            error: createJsonRpcError(
              JSON_RPC_ERROR.INTERNAL_ERROR,
              'Internal error'
            ),
          }
        );
      }

      if (responsePayload === null) {
        res.statusCode = 204;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end();
        return;
      }

      if (req._mcpSessionId) {
        res.setHeader('Mcp-Session-Id', req._mcpSessionId);
      }

      const responseCode = responsePayload?.error?.code;
      if (responseCode === JSON_RPC_ERROR.MCP_UNAUTHORIZED) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Bearer realm="Omvra MCP", error="invalid_token"');
      } else if (responseCode === JSON_RPC_ERROR.MCP_ACCESS_DISABLED) {
        res.statusCode = 403;
      } else {
        res.statusCode = 200;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(responsePayload));
    });

    req.on('error', error => {
      logger.error('[mcp] Request stream error:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: 'Request stream failure' }));
    });
  });

  server.on('error', error => {
    logger.error(`[mcp] HTTP server error on ${serverConfig.host}:${serverConfig.port}${serverConfig.path}:`, error);
    emitStatus({
      status: 'error',
      listening: false,
      error: error?.message || String(error),
      boundAddress: null,
      boundUrl: null,
      restartRequired: true,
    });
  });

  server.on('close', () => {
    emitStatus({
      status: 'stopped',
      listening: false,
      error: null,
      boundAddress: null,
      boundUrl: null,
      restartRequired: false,
    });
  });

  server.listen(serverConfig.port, serverConfig.host, () => {
    logger.info(`[mcp] Listening on http://${serverConfig.host}:${serverConfig.port}${serverConfig.path}`);
    emitStatus({
      status: 'running',
      listening: true,
      error: null,
      boundAddress: `${serverConfig.host}:${serverConfig.port}`,
      boundUrl: `http://${serverConfig.host}:${serverConfig.port}${serverConfig.path}`,
      lastStartedAt: new Date().toISOString(),
      restartRequired: false,
    });
    // TODO(next-phase): add client authentication and session binding before exposing beyond local development.
    // TODO(next-phase): enable write tools only after safe-write implementation is complete.
  });

  return server;
}

function waitForMcpHttpServerReady(server, { timeoutMs = 5_000 } = {}) {
  if (!server) return Promise.resolve({ ok: false, error: 'MCP_SERVER_UNAVAILABLE', message: 'The Omvra MCP server has not started.' });
  if (server.listening) return Promise.resolve({ ok: true });

  return new Promise(resolve => {
    let timer = null;
    const finish = result => {
      if (timer) clearTimeout(timer);
      server.off('listening', onListening);
      server.off('error', onError);
      server.off('close', onClose);
      resolve(result);
    };
    const onListening = () => finish({ ok: true });
    const onError = error => finish({ ok: false, error: 'MCP_SERVER_UNAVAILABLE', message: error?.message || String(error) });
    const onClose = () => finish({ ok: false, error: 'MCP_SERVER_UNAVAILABLE', message: 'The Omvra MCP server stopped before becoming ready.' });

    server.once('listening', onListening);
    server.once('error', onError);
    server.once('close', onClose);
    timer = setTimeout(() => finish({ ok: false, error: 'MCP_SERVER_START_TIMEOUT', message: 'Timed out waiting for the Omvra MCP server to start.' }), timeoutMs);
    if (server.listening) finish({ ok: true });
  });
}

module.exports = {
  startMcpHttpServer,
  waitForMcpHttpServerReady,
  createRequestDispatcher,
};
