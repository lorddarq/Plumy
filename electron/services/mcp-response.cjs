const JSON_RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  MCP_ACCESS_DISABLED: -32001,
  MCP_UNAUTHORIZED: -32002,
  MCP_WRITE_FORBIDDEN: -32003,
};

function createJsonRpcError(code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return error;
}

function makeJsonRpcResponse(id, payload) {
  return {
    jsonrpc: '2.0',
    id: id === undefined ? null : id,
    ...payload,
  };
}

function makeToolResult(structuredContent, { isError = false, content = [], resultText } = {}) {
  return {
    structuredContent,
    content: [
      {
        type: 'text',
        text: typeof resultText === 'string' ? resultText : JSON.stringify(structuredContent),
      },
      ...content,
    ],
    isError,
  };
}

function getArtifactResourceLinks(references = []) {
  const seen = new Set();
  return (Array.isArray(references) ? references : [])
    .map(reference => {
      const item = reference && typeof reference === 'object' ? reference : {};
      const uri = typeof item.locator === 'string' ? item.locator.trim()
        : typeof item.uri === 'string' ? item.uri.trim()
          : typeof item.url === 'string' ? item.url.trim() : '';
      if (!/^(file|https?):\/\//i.test(uri) || seen.has(uri)) return null;
      seen.add(uri);
      return {
        type: 'resource_link',
        uri,
        name: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 160) : 'Delivered artifact',
        ...(typeof item.mimeType === 'string' && item.mimeType.trim() ? { mimeType: item.mimeType.trim().slice(0, 120) } : {}),
      };
    })
    .filter(Boolean);
}

function makeWriteToolResult(action, payload = {}) {
  const structuredContent = {
    ok: true,
    action,
    changed: Boolean(payload.changed),
    auditId: typeof payload.auditId === 'string' && payload.auditId ? payload.auditId : null,
  };

  if (Object.prototype.hasOwnProperty.call(payload, 'revision')) {
    structuredContent.revision = payload.revision;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'idempotent')) {
    structuredContent.idempotent = payload.idempotent === true;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'task')) {
    structuredContent.task = payload.task;
    if (!Object.prototype.hasOwnProperty.call(structuredContent, 'revision')) {
      structuredContent.revision = payload.task && typeof payload.task === 'object'
        ? payload.task.__mcpRevision ?? null
        : null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'goal')) {
    structuredContent.goal = payload.goal;
    if (!Object.prototype.hasOwnProperty.call(structuredContent, 'revision')) {
      structuredContent.revision = payload.goal && typeof payload.goal === 'object'
        ? payload.goal.__mcpRevision ?? null
        : null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'result')) {
    structuredContent.result = payload.result;
  }

  for (const field of ['execution', 'event', 'cleanup']) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      structuredContent[field] = payload[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'statusId')) {
    structuredContent.statusId = payload.statusId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'statusCreated')) {
    structuredContent.statusCreated = payload.statusCreated;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'deletedTaskId')) {
    structuredContent.deletedTaskId = payload.deletedTaskId;
  }

  return makeToolResult(structuredContent, {
    content: getArtifactResourceLinks(payload.artifactReferences),
  });
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasResponseId(request) {
  return Boolean(request) && Object.prototype.hasOwnProperty.call(request, 'id');
}

function isJsonRpcIdValid(id) {
  return id === undefined
    || id === null
    || typeof id === 'string'
    || (typeof id === 'number' && Number.isFinite(id));
}

function invalidParams(message, details) {
  return createJsonRpcError(JSON_RPC_ERROR.INVALID_PARAMS, message, details);
}

function makeResourceReadResult(resourceUri, data) {
  return {
    contents: [{ uri: resourceUri, mimeType: 'application/json', text: JSON.stringify(data) }],
  };
}

module.exports = {
  JSON_RPC_ERROR,
  createJsonRpcError,
  makeJsonRpcResponse,
  makeToolResult,
  makeWriteToolResult,
  makeResourceReadResult,
  normalizeObject,
  hasResponseId,
  isJsonRpcIdValid,
  invalidParams,
};
