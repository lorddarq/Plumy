import { useEffect } from 'react';
import { createMcpReadService } from '../services/mcp/service';
import { measurePerformanceOperation } from '../services/performanceLogging.ts';

interface UseMcpDiagnosticsOptions {
  enabled: boolean;
  endpoint: string;
}

export function useMcpDiagnostics({ enabled, endpoint }: UseMcpDiagnosticsOptions) {
  useEffect(() => {
    const isLocalDevHost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!isLocalDevHost) return;

    let cancelled = false;
    let retryTimer: number | null = null;

    const run = async (attempt = 0) => {
      const mcp = createMcpReadService({
        enabled,
        endpoint,
      });

      const result = await measurePerformanceOperation('mcp', 'diagnostics', () => mcp.diagnostics());
      if (cancelled) return;

      if (result.ok) {
        console.info(
          `[MCP diagnostics] connected endpoint=${result.endpoint} latency=${result.latencyMs}ms tools=${result.toolCount}`
        );
        return;
      }

      if (result.error === 'disabled') {
        console.info('[MCP diagnostics] skipped (agent MCP access disabled)');
        return;
      }

      const reason = result.error || 'unknown';
      if (reason.toLowerCase().includes('aborted')) return;
      if (attempt < 2 && (reason.includes('Failed to fetch') || reason.includes('ERR_CONNECTION_REFUSED'))) {
        retryTimer = window.setTimeout(() => {
          void run(attempt + 1);
        }, 600);
        return;
      }

      console.warn(
        `[MCP diagnostics] unavailable endpoint=${result.endpoint} reason=${reason}`
      );
    };

    void run();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [enabled, endpoint]);
}
