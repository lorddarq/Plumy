import { Activity, Download, RefreshCcw, ShieldAlert } from 'lucide-react';
import type { McpHealthCheckResult } from '../../services/mcp/types';
import { Button } from '../ui/button';
import { EmptyStateCard } from '../EmptyStateCard';
import { Label } from '../ui/label';
import { LoadIcon } from '../icons/LoadIcon';
import { FilesCopyIcon } from '../icons/FilesCopyIcon';

interface McpActivityLogSectionProps {
  auditLog: McpAuditEntry[];
  auditSummary: McpAuditSummary | null;
  copied: boolean;
  onRefresh: () => void;
  onCopy: () => void;
  onExport: () => void;
  listenerStatusLabel: string;
  connectionStatusLabel: string;
  tokenExpiryLabel: string;
  boundUrl?: string | null;
  restartPending: boolean;
}

export function McpActivityLogSection({
  auditLog,
  auditSummary,
  copied,
  onRefresh,
  onCopy,
  onExport,
  listenerStatusLabel,
  connectionStatusLabel,
  tokenExpiryLabel,
  boundUrl,
  restartPending,
}: McpActivityLogSectionProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="text-sm font-semibold leading-5 text-[#71717a]">Activity Log</div>
          <p className="text-xs leading-4 text-[#6a7282] text-pretty">
            Recent requests from connected agents, recorded locally. Use this when an agent action does not behave as expected.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActivityActionButton onClick={onRefresh}>
            <RefreshCcw className="size-4" />
            Refresh
          </ActivityActionButton>
          <ActivityActionButton onClick={onCopy}>
            <FilesCopyIcon className="size-4" />
            {copied ? 'Copied' : 'Copy'}
          </ActivityActionButton>
          <ActivityActionButton onClick={onExport}>
            <Download className="size-4" />
            Export Log
          </ActivityActionButton>
        </div>
      </div>

      <McpAuditSummaryCard summary={auditSummary} />

      {auditLog.length === 0 ? (
        <EmptyStateCard
          compact
          icon={<Activity className="size-4" />}
          title="No agent activity recorded yet"
          description="Use a connected agent or refresh after activity starts to see the latest requests and results."
        />
      ) : (
        <div className="max-h-[422px] overflow-y-auto rounded-xl bg-[#f7f7f8] px-3 py-3">
          {auditLog.map((entry) => (
            <ActivityLogEntry key={entry.auditId} entry={entry} />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="text-sm font-semibold leading-5 text-[#71717a]">Status</div>
        <div className="rounded-xl bg-[#fafafa] px-3 py-3 text-xs leading-4 text-[#6a7282]">
          <p>{listenerStatusLabel}</p>
          <p>{connectionStatusLabel}</p>
          <p>{tokenExpiryLabel}</p>
          {boundUrl && <p>Bound URL: {boundUrl}</p>}
          <p>
            {restartPending
              ? 'Restart required after host, port, token, or capability profile changes.'
              : 'Listener config applied.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function McpAuditSummaryCard({ summary }: { summary: McpAuditSummary | null }) {
  if (!summary || summary.sampleSize === 0) {
    return (
      <EmptyStateCard
        compact
          icon={<LoadIcon className="size-4" />}
        title="No benchmark summary yet"
        description="Once agent activity is recorded, this area will show grouped success, failure, timing, and source metrics."
      />
    );
  }

  const { overall } = summary;
  const formatRate = (value: number | null) => {
    if (value === null) return 'n/a';
    const percent = value * 100;
    return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
  };
  const topAgents = (summary.by.agent || []).slice(0, 3);

  return (
    <div className="space-y-3" aria-label="MCP benchmark summary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold leading-5 text-[#71717a]">Benchmark Summary</div>
          <p className="text-xs leading-4 text-[#6a7282]">
            {summary.sampleSize} sampled redacted event{summary.sampleSize === 1 ? '' : 's'}; grouped locally.
          </p>
        </div>
        <LoadIcon className="mt-0.5 size-4 text-[#71717a]" aria-hidden="true" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryMetric label="Success" value={formatRate(overall.successRate)} />
        <SummaryMetric label="Failure" value={formatRate(overall.failureRate)} />
        <SummaryMetric label="Denied" value={formatRate(overall.deniedRate)} />
        <SummaryMetric label="Median" value={overall.duration.medianMs === null ? 'n/a' : `${overall.duration.medianMs}ms`} />
      </div>

      {topAgents.length > 0 && (
        <div className="space-y-1 text-xs leading-4 text-[#6a7282]">
          <div className="font-medium text-[#71717a]">Provenance groups</div>
          {topAgents.map(agent => (
            <div className="flex items-center justify-between gap-3" key={agent.key}>
              <span className="truncate">{agent.key === 'unknown' ? 'Unknown / missing metadata' : agent.key}</span>
              <span className="shrink-0">{agent.count} · {formatRate(agent.successRate)} success</span>
            </div>
          ))}
        </div>
      )}

      {overall.duration.sampleSize === 0 && (
        <p className="text-xs leading-4 text-[#6a7282]">
          Timing is unavailable for this sample. Older audit entries may predate telemetry capture.
        </p>
      )}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f7f7f8] px-2.5 py-2">
      <div className="text-[11px] leading-4 text-[#6a7282]">{label}</div>
      <div className="text-sm font-semibold leading-5 text-[#3f3f46]">{value}</div>
    </div>
  );
}

function ActivityActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm font-medium leading-5 text-[#71717a] outline-none transition-[background-color,color] hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      {children}
    </button>
  );
}

function ActivityLogEntry({ entry }: { entry: McpAuditEntry }) {
  return (
    <div className="border-b border-[#e5e7eb] py-3 last:border-b-0 last:pb-0 first:pt-0">
      <div className="space-y-0.5 text-xs leading-4 text-[#6a7282]">
        <p>{entry.toolName || entry.method || entry.type || 'mcp_event'}</p>
        {entry.outcome && <p>{entry.outcome}</p>}
        {(entry.agent || entry.clientName) && (
          <p>
            Agent/client: {entry.agent || 'unknown'}{entry.clientName ? ` · ${entry.clientName}` : ''}
            {entry.clientVersion ? ` ${entry.clientVersion}` : ''}
          </p>
        )}
        {entry.taskId && <p>task: {entry.taskId}</p>}
        {typeof entry.durationMs === 'number' && <p>Duration: {entry.durationMs}ms</p>}
        {entry.failureClass && <p>Failure: {entry.failureClass}</p>}
        {entry.reason && <p>Reason: {String(entry.reason).slice(0, 160)}</p>}
        <p>{formatAuditTimestamp(entry.timestamp)}</p>
        <p>Audit ID: {entry.auditId}</p>
        {entry.transport && <p className="pt-3">Transport: {entry.transport}</p>}
        {entry.capabilityProfile && <p>Profile: {entry.capabilityProfile}</p>}
        {entry.origin && <p>Origin: {entry.origin}</p>}
      </div>
    </div>
  );
}

interface McpHealthDiagnosticsSectionProps {
  result: McpHealthCheckResult | null;
  running: boolean;
  onRun: () => void;
}

export function McpHealthDiagnosticsSection({
  result,
  running,
  onRun,
}: McpHealthDiagnosticsSectionProps) {
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between">
        <Label>Advanced connection check (dev)</Label>
        <Button type="button" variant="outline" onClick={onRun} disabled={running}>
          {running ? 'Running...' : 'Run health check'}
        </Button>
      </div>
      {!result && (
        <EmptyStateCard
          compact
          icon={<ShieldAlert className="size-4" />}
          title="No diagnostic run yet"
          description="Run the check to inspect available capabilities, workspace parity, and logical call count."
        />
      )}
      {result && (
        <div className="space-y-1 text-xs text-gray-600">
          <p>
            Status: {result.ok ? 'ok' : 'issues found'} | latency: {result.latencyMs ?? 0}ms
          </p>
          <p>Connection: {result.connectionStatus ?? 'unknown'} | auth: {result.authMode ?? 'none'}</p>
          <p>
            Tools: {result.toolsAvailable.length} available
            {result.missingTools.length ? `, missing: ${result.missingTools.join(', ')}` : ''}
          </p>
          <p>
            Resources/read: {result.resourceReadSupported ? 'supported' : 'not exposed'}
            {result.resourcesAvailable.length
              ? ` (${result.resourcesAvailable.join(', ')})`
              : ''}
          </p>
          <p>
            Snapshot parity: counts {result.countParity ? 'ok' : 'mismatch'}, keys{' '}
            {result.requiredKeyParity ? 'ok' : 'mismatch'}
          </p>
          <p>Median logical calls (MV.2 helper): {result.medianLogicalCalls ?? 'n/a'}</p>
          {result.errors.length > 0 && (
            <div className="space-y-1 pt-1">
              {result.errors.slice(0, 3).map((error) => (
                <p key={error} className="text-amber-700">
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatAuditTimestamp(timestamp?: string) {
  if (!timestamp) return 'Unknown time';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}
