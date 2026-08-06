import { RefreshCcw } from 'lucide-react';
import type { McpHealthCheckResult } from '../../services/mcp/types';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { FilesCopyIcon } from '../icons/FilesCopyIcon';

type McpCapabilityProfile = 'read_only' | 'task_write' | 'admin';

interface McpAccessSettingsSectionProps {
  agentAccessEnabled: boolean;
  address: string;
  bindHost: string;
  port: number;
  accessToken: string;
  accessTokenTtlMinutes: number;
  capabilityProfile: McpCapabilityProfile;
  copiedAddress: boolean;
  copiedStdioCommand: boolean;
  listenerStatus: McpListenerStatus | null;
  listenerStatusLabel: string;
  connectionStatusLabel: string;
  tokenExpiryLabel: string;
  restartPending: boolean;
  remoteTokenWarning: string | null;
  stdioCommand: string;
  healthResult: McpHealthCheckResult | null;
  healthRunning: boolean;
  onAgentAccessToggle: (enabled: boolean) => void;
  onAddressChange: (address: string) => void;
  onBindHostChange: (host: string) => void;
  onPortChange: (port: number) => void;
  onAccessTokenChange: (token: string) => void;
  onAccessTokenRotate: () => void;
  onAccessTokenTtlMinutesChange: (ttlMinutes: number) => void;
  onCapabilityProfileChange: (profile: McpCapabilityProfile) => void;
  onRestartServer: () => void;
  onCopyAddress: () => void;
  onCopyStdioCommand: () => void;
  onRunHealthCheck: () => void;
}

const FIELD_CLASS =
  'h-9 rounded-xl border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] placeholder:text-[#b5b5ba] focus-visible:ring-gray-200';
const LABEL_CLASS = 'text-sm font-semibold leading-5 text-[#71717a]';
const DESCRIPTION_CLASS = 'text-xs leading-5 text-[#7f8796] text-pretty';
const ACTION_CLASS =
  'inline-flex min-h-7 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-[#1d6fd7] outline-none transition-[color,background-color] hover:bg-[#1d6fd7]/5 hover:text-[#1459b3] focus-visible:ring-2 focus-visible:ring-[#1d6fd7]/25';

export function McpAccessSettingsSection({
  agentAccessEnabled,
  address,
  bindHost,
  port,
  accessToken,
  accessTokenTtlMinutes,
  capabilityProfile,
  copiedAddress,
  copiedStdioCommand,
  listenerStatus,
  listenerStatusLabel,
  connectionStatusLabel,
  tokenExpiryLabel,
  restartPending,
  remoteTokenWarning,
  stdioCommand,
  healthResult,
  healthRunning,
  onAgentAccessToggle,
  onAddressChange,
  onBindHostChange,
  onPortChange,
  onAccessTokenChange,
  onAccessTokenRotate,
  onAccessTokenTtlMinutesChange,
  onCapabilityProfileChange,
  onRestartServer,
  onCopyAddress,
  onCopyStdioCommand,
  onRunHealthCheck,
}: McpAccessSettingsSectionProps) {
  const tokenActionLabel = accessToken.trim() ? 'Regenerate' : 'Generate';

  return (
    <div className="space-y-8">
      <p className="max-w-[440px] text-xs leading-5 text-[#8a8a92] text-pretty">
        Agent access lets connected tools work with this workspace. It is independent from Runtime access: turning Runtime access off does not turn off this connection.
      </p>

      <section className="space-y-5" aria-labelledby="mcp-server-title">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className={LABEL_CLASS}>Allow connected agents</div>
            <p className={DESCRIPTION_CLASS}>When off, external agent tools cannot access this workspace. Runtime access remains controlled separately.</p>
          </div>
          <Switch
            checked={agentAccessEnabled}
            aria-label="Toggle connected agent access"
            onCheckedChange={onAgentAccessToggle}
            className="mt-0.5"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label id="mcp-server-title" htmlFor="mcp-bind-host" className={LABEL_CLASS}>
              Connection service
            </Label>
            <button type="button" onClick={onRestartServer} className={ACTION_CLASS}>
              <RefreshCcw className="size-4" />
              Restart
            </button>
          </div>
          <p className={DESCRIPTION_CLASS}>Change the host or port, then restart the service to apply the connection settings.</p>
          <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-2 max-sm:grid-cols-1">
            <Input
              id="mcp-bind-host"
              value={bindHost}
              onChange={(event) => onBindHostChange(event.target.value)}
              placeholder="127.0.0.1"
              className={FIELD_CLASS}
            />
            <Input
              id="mcp-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(event) => onPortChange(Number(event.target.value))}
              placeholder="3456"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <CopySettingField
          id="mcp-address"
          label="Public URL"
          description="Use this URL when configuring external agents/tunnels."
          value={address}
          copied={copiedAddress}
          onChange={onAddressChange}
          onCopy={onCopyAddress}
        />

        <ReadOnlyCopyField
          id="mcp-stdio-command"
          label="Local connection"
          description="Use this when your client supports command-based connections. It avoids ports and tunnels."
          value={stdioCommand}
          copied={copiedStdioCommand}
          onCopy={onCopyStdioCommand}
        />
      </section>

      <section className="space-y-5" aria-labelledby="mcp-security-title">
        <h3 id="mcp-security-title" className="text-base font-medium leading-6 text-[#5f6068]">
          Security
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="mcp-token" className={LABEL_CLASS}>Access Token</Label>
            <button type="button" onClick={onAccessTokenRotate} className={ACTION_CLASS}>
              {tokenActionLabel}
            </button>
          </div>
          <p className={DESCRIPTION_CLASS}>If set, clients must send Authorization: Bearer Token</p>
          <div className="relative">
            <Input
              id="mcp-token"
              type="password"
              value={accessToken}
              onChange={(event) => onAccessTokenChange(event.target.value)}
              placeholder="No bearer token"
              className={`${FIELD_CLASS} pr-16`}
            />
            <button
              type="button"
              onClick={() => onAccessTokenChange('')}
              className="absolute right-3 top-1/2 min-h-8 -translate-y-1/2 rounded-lg px-1 text-sm font-semibold text-[#71717a] outline-none hover:text-[#4b4b54] focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <Label htmlFor="mcp-token-ttl" className={LABEL_CLASS}>Token Life</Label>
          <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-3 max-sm:grid-cols-1">
            <Input
              id="mcp-token-ttl"
              type="number"
              min={1}
              max={1440}
              value={accessTokenTtlMinutes}
              onChange={(event) => onAccessTokenTtlMinutesChange(Number(event.target.value))}
              className={FIELD_CLASS}
            />
            <p className={DESCRIPTION_CLASS}>Token expires after this many minutes from when it was last set.</p>
          </div>
        </div>

        <div className="space-y-3">
          <Label htmlFor="mcp-capability-profile" className={LABEL_CLASS}>Access</Label>
          <div className="grid grid-cols-[172px_minmax(0,1fr)] items-center gap-3 max-sm:grid-cols-1">
            <Select
              value={capabilityProfile}
              onValueChange={(value) => onCapabilityProfileChange(value as McpCapabilityProfile)}
            >
              <SelectTrigger id="mcp-capability-profile" className={`${FIELD_CLASS} w-full justify-between`}>
                <SelectValue placeholder="Select access" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read_only">Read Only</SelectItem>
                <SelectItem value="task_write">Task Write</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className={DESCRIPTION_CLASS}>Choose whether connected agents can only read workspace data or also make approved changes.</p>
          </div>
          <p className={DESCRIPTION_CLASS}>Restart the connection service after changing.</p>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="mcp-diagnostics-title">
        <h3 id="mcp-diagnostics-title" className="text-base font-medium leading-6 text-[#5f6068]">
          Diagnostics
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-3">
              <div className={LABEL_CLASS}>Connection health</div>
              <p className={DESCRIPTION_CLASS}>
                Checks the connection, available capabilities, workspace parity, and recent response performance.
              </p>
            </div>
            <button type="button" onClick={onRunHealthCheck} disabled={healthRunning} className={ACTION_CLASS}>
              {healthRunning ? 'Checking...' : 'Check'}
            </button>
          </div>

          <div className={LABEL_CLASS}>Result:</div>
          <HealthResultCard
            result={healthResult}
            listenerStatus={listenerStatus}
            listenerStatusLabel={listenerStatusLabel}
            connectionStatusLabel={connectionStatusLabel}
            tokenExpiryLabel={tokenExpiryLabel}
            restartPending={restartPending}
          />
        </div>
      </section>

      {remoteTokenWarning && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {remoteTokenWarning}
        </p>
      )}
    </div>
  );
}

function CopySettingField({
  id,
  label,
  description,
  value,
  copied,
  onChange,
  onCopy,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  copied: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor={id} className={LABEL_CLASS}>{label}</Label>
      <p className={DESCRIPTION_CLASS}>{description}</p>
      <div className="relative overflow-hidden rounded-xl">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD_CLASS} pr-12`}
        />
        <CopyButton copied={copied} onCopy={onCopy} label={`Copy ${label}`} />
      </div>
    </div>
  );
}

function ReadOnlyCopyField({
  id,
  label,
  description,
  value,
  copied,
  onCopy,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor={id} className={LABEL_CLASS}>{label}</Label>
      <p className={DESCRIPTION_CLASS}>{description}</p>
      <div className="relative overflow-hidden rounded-xl">
        <Input id={id} value={value} readOnly className={`${FIELD_CLASS} pr-12`} />
        <CopyButton copied={copied} onCopy={onCopy} label={`Copy ${label}`} />
      </div>
    </div>
  );
}

function CopyButton({
  copied,
  onCopy,
  label,
}: {
  copied: boolean;
  onCopy: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#71717a] outline-none transition-[background-color,color] hover:bg-zinc-500/10 hover:text-[#4b4b54] focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      <FilesCopyIcon className="size-4" />
    </button>
  );
}

function HealthResultCard({
  result,
  listenerStatus,
  listenerStatusLabel,
  connectionStatusLabel,
  tokenExpiryLabel,
  restartPending,
}: {
  result: McpHealthCheckResult | null;
  listenerStatus: McpListenerStatus | null;
  listenerStatusLabel: string;
  connectionStatusLabel: string;
  tokenExpiryLabel: string;
  restartPending: boolean;
}) {
  const statusLabel = result ? (result.ok ? 'OK' : 'Issue') : summarizeListenerStatus(listenerStatus);
  const latencyLabel = result?.latencyMs === undefined ? 'n/a' : `${result.latencyMs}ms`;
  const connectionLabel = result?.connectionStatus
    ? formatConnectionStatus(result.connectionStatus)
    : connectionStatusLabel.replace(/^Connection status:\s*/i, '');
  const authLabel = result?.authMode ?? tokenExpiryLabel.replace(/^Auth mode:\s*/i, '');
  const resultLines = buildHealthResultLines(result, listenerStatusLabel, connectionStatusLabel, tokenExpiryLabel, restartPending);
  const defaultTone = result ? (result.ok ? 'ok' : 'issue') : 'neutral';

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#fafafa] px-3 py-3">
        <HealthMetric label="Status:" value={statusLabel} tone={defaultTone} />
        <HealthMetric label="Latency:" value={latencyLabel} tone={defaultTone} />
        <HealthMetric label="Connection:" value={connectionLabel} tone={defaultTone} />
        <HealthMetric label="Authentication:" value={authLabel} tone={result?.authMode === 'token' ? 'ok' : defaultTone} />
      </div>

      <div className="space-y-1 text-sm leading-5 text-[#7f8796]">
        {resultLines.map(line => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function HealthMetric({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'issue' | 'neutral' }) {
  const dotClass = tone === 'ok' ? 'bg-[#15c349]' : tone === 'issue' ? 'bg-[#e00000]' : 'bg-[#d4d4d8]';

  return (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] items-center gap-3 py-1">
      <span className="text-sm leading-5 text-[#7f8796]">{label}</span>
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium leading-5 text-[#71717a] tabular-nums">
        <span className={`size-1.5 shrink-0 rounded-full ${dotClass}`} />
        {value}
      </span>
    </div>
  );
}

function buildHealthResultLines(
  result: McpHealthCheckResult | null,
  listenerStatusLabel: string,
  connectionStatusLabel: string,
  tokenExpiryLabel: string,
  restartPending: boolean
): string[] {
  if (!result) {
    return [
      listenerStatusLabel,
      connectionStatusLabel,
      tokenExpiryLabel,
      restartPending ? 'Restart required after connection settings change.' : 'Connection settings applied.',
    ];
  }

  const lines = [
    `Tools: ${result.toolsAvailable.length} available${result.missingTools.length ? `, missing: ${result.missingTools.join(', ')}` : ''}`,
    `Resources/read: ${result.resourceReadSupported ? 'supported' : 'not exposed'}${result.resourcesAvailable.length ? ` (${result.resourcesAvailable.join(', ')})` : ''}`,
    `Snapshot parity: counts ${result.countParity ? 'ok' : 'mismatch'}, keys ${result.requiredKeyParity ? 'ok' : 'mismatch'}`,
    `Median logical calls (MV.2 helper): ${result.medianLogicalCalls ?? 'n/a'}`,
  ];

  return result.errors.length
    ? [...lines, ...result.errors.slice(0, 3)]
    : lines;
}

function summarizeListenerStatus(listenerStatus: McpListenerStatus | null): string {
  if (!listenerStatus) return 'n/a';
  if (listenerStatus.status === 'running') return listenerStatus.token.remainingMinutes === null ? 'On' : `${listenerStatus.token.remainingMinutes} min`;
  if (listenerStatus.status === 'disabled') return 'Off';
  return listenerStatus.status;
}

function formatConnectionStatus(status: NonNullable<McpHealthCheckResult['connectionStatus']>): string {
  return status
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
