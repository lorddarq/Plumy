import { normalizeMcpServerAddress } from '../../constants/mcp.ts';
import { APP_VERSION } from '../../version.ts';
import type {
  McpClientConfig,
  McpInitializeResult,
  McpReadToolName,
  McpResourceResponse,
  McpToolDescriptor,
} from './types.ts';

const DEFAULT_TIMEOUT_MS = 4000;
const MCP_PROTOCOL_VERSION = '2024-11-05';
const MCP_CLIENT_NAME = 'Omvra';

interface JsonRpcSuccess<T> {
  jsonrpc?: '2.0';
  id?: string | number | null;
  result: T;
}

interface JsonRpcFailure {
  jsonrpc?: '2.0';
  id?: string | number | null;
  error: {
    code?: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

export class McpClientDisabledError extends Error {
  constructor() {
    super('MCP access is disabled in preferences.');
    this.name = 'McpClientDisabledError';
  }
}

export class McpClient {
  private readonly config: McpClientConfig;
  private initializePromise: Promise<McpInitializeResult> | null = null;
  private mcpSessionId: string | null = null;

  constructor(config: McpClientConfig) {
    this.config = {
      ...config,
      endpoint: normalizeMcpServerAddress(config.endpoint),
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  get endpoint(): string {
    return this.config.endpoint;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  async initialize(): Promise<McpInitializeResult> {
    return this.ensureInitialized();
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    await this.ensureInitialized();
    const result = await this.rpcCall<{ tools?: McpToolDescriptor[] }>('tools/list', {});
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async readResource(uri: string): Promise<McpResourceResponse[]> {
    await this.ensureInitialized();
    const result = await this.rpcCall<{ contents?: McpResourceResponse[] }>('resources/read', { uri });
    return Array.isArray(result.contents) ? result.contents : [];
  }

  async callReadTool<T = unknown>(name: McpReadToolName, args?: Record<string, unknown>): Promise<T> {
    await this.ensureInitialized();
    const result = await this.rpcCall<{ content?: Array<{ text?: string }>; structuredContent?: unknown }>(
      'tools/call',
      {
        name,
        arguments: args ?? {},
      }
    );

    if (result.structuredContent !== undefined) {
      return result.structuredContent as T;
    }

    const firstText = result.content?.find(entry => typeof entry.text === 'string')?.text;
    if (typeof firstText === 'string' && firstText.trim()) {
      try {
        return JSON.parse(firstText) as T;
      } catch {
        return firstText as T;
      }
    }

    return {} as T;
  }

  async callTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    await this.ensureInitialized();
    const result = await this.rpcCall<{ content?: Array<{ text?: string }>; structuredContent?: unknown }>(
      'tools/call',
      {
        name,
        arguments: args ?? {},
      }
    );

    if (result.structuredContent !== undefined) {
      return result.structuredContent as T;
    }

    const firstText = result.content?.find(entry => typeof entry.text === 'string')?.text;
    if (typeof firstText === 'string' && firstText.trim()) {
      try {
        return JSON.parse(firstText) as T;
      } catch {
        return firstText as T;
      }
    }

    return {} as T;
  }

  private async rpcCall<T>(method: string, params?: unknown): Promise<T> {
    if (!this.config.enabled) {
      throw new McpClientDisabledError();
    }

    if (method !== 'initialize' && method !== 'notifications/initialized') {
      await this.ensureInitialized();
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...this.config.headers,
          ...(this.mcpSessionId ? { 'Mcp-Session-Id': this.mcpSessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `${Date.now()}`,
          method,
          params,
        }),
        signal: controller.signal,
      });

      const sessionId = response.headers.get('Mcp-Session-Id');
      if (sessionId) this.mcpSessionId = sessionId;

      let payload: JsonRpcResponse<T> | null = null;
      try {
        payload = (await response.json()) as JsonRpcResponse<T>;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const responseError = payload && 'error' in payload ? payload.error : null;
        throw new Error(responseError?.message || `MCP request failed (${response.status})`);
      }

      if (!payload) {
        throw new Error('MCP request failed');
      }

      if ('error' in payload) {
        throw new Error(payload.error.message || 'MCP request failed');
      }

      return payload.result;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private async ensureInitialized(): Promise<McpInitializeResult> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.rpcCall<McpInitializeResult>('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      clientInfo: {
        name: MCP_CLIENT_NAME,
        version: APP_VERSION,
      },
      capabilities: {},
    }).catch(error => {
      this.initializePromise = null;
      throw error;
    });

    return this.initializePromise;
  }
}
