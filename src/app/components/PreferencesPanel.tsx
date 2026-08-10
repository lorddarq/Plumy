import { useState } from 'react';
import { Person, StorageMeter, Task, TaskStatus, StatusColumn, TimelineSwimlane } from '../types';
import { McpHealthCheckResult } from '../services/mcp/types';
import type { MarkdownAppearance } from '../utils/markdownAppearance';
import type { GoalPolicyV1 } from '../utils/goalPolicy';
import {
  DataSettingsSection,
  AgentRuntimeSettingsSection,
  GeneralSettingsSection,
  McpActivitySettingsSection,
  McpSettingsSection,
  McpTestingSettingsSection,
  SettingsPanel,
  TasksSettingsSection,
  WorkflowSettingsSection,
} from './SettingsPanel';
import { AboutSettingsSection, HelpSettingsSection } from './settings/AboutHelpSettingsSections';
import { McpAccessSettingsSection } from './settings/McpAccessSettingsSection';
import { McpCommandSettingsSection } from './settings/McpCommandSettingsSection';
import { McpActivityLogSection } from './settings/McpDiagnosticsSections';
import { PeopleManagementSections } from './settings/PeopleSettingsSections';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { AgentRuntimeSettings } from './settings/AgentRuntimeSettings';
import { useWorkspaceSelector } from '../store/workspaceStore.tsx';

interface PreferencesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialAnchor?: string;
  statusColumns: StatusColumn[];
  showCompletedTimelineTasks: boolean;
  cleanupGoalArtifacts: boolean;
  goalAuditArchiveDirectory: string;
  externalSkillsDirectory: string;
  customScrollbarsEnabled: boolean;
  condensedUI: boolean;
  goalPolicy: GoalPolicyV1;
  executionLoadStatusIds: TaskStatus[];
  pipelineLoadStatusIds: TaskStatus[];
  updateChannel: 'stable' | 'rc';
  markdownAppearance: MarkdownAppearance;
  people: Person[];
  tasks: Task[];
  timelineSwimlanes: TimelineSwimlane[];
  onMarkdownAppearanceChange: (updates: Partial<MarkdownAppearance>) => void;
  onShowCompletedTimelineTasksChange: (show: boolean) => void;
  onCleanupGoalArtifactsChange: (enabled: boolean) => void;
  onGoalAuditArchiveDirectoryChange: (directory: string) => void;
  onExternalSkillsDirectoryChange: (directory: string) => void;
  onCustomScrollbarsEnabledChange: (enabled: boolean) => void;
  onCondensedUIChange: (enabled: boolean) => void;
  onGoalPolicyChange: (updates: {
    currency?: string;
    acceptance?: GoalPolicyV1['acceptance'];
    agentMutationConfirmation?: GoalPolicyV1['agentMutationConfirmation'];
    dimensions?: Partial<GoalPolicyV1['dimensions']>;
  }) => void;
  onResetGoalPolicy: () => void;
  onUpdateStatusColumn: (columnId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => void;
  onAddPerson: (person: Omit<Person, 'id'>) => void;
  onUpdatePerson: (personId: string, updates: Pick<Person, 'name' | 'role' | 'kind' | 'agentInstructions' | 'agentOperationalInstructions' | 'availableForSubagentDelegation'>) => void;
  onDeletePerson: (personId: string) => void;
  onNukeLocalData: () => void;
  onExportWorkspaceBackup: () => Promise<boolean>;
  onExportGoalPolicyBackup: () => Promise<boolean>;
  onImportTasksAndProjects: (file: File) => void;
  onImportGoalPolicyBackup: (file: File) => void;
  importFeedback?: {
    type: 'success' | 'error';
    message: string;
  } | null;
  mcpAgentAccessEnabled: boolean;
  mcpAddress: string;
  mcpBindHost: string;
  mcpPort: number;
  mcpAccessToken: string;
  mcpAccessTokenIssuedAt?: string;
  mcpAccessTokenTtlMinutes: number;
  mcpCapabilityProfile: 'read_only' | 'task_write' | 'admin';
  mcpListenerStatus: McpListenerStatus | null;
  mcpAuditLog: McpAuditEntry[];
  mcpAuditSummary: McpAuditSummary | null;
  onUpdateChannelChange: (channel: 'stable' | 'rc') => void;
  onMcpAgentAccessToggle: (enabled: boolean) => void;
  onMcpAddressChange: (address: string) => void;
  onMcpBindHostChange: (host: string) => void;
  onMcpPortChange: (port: number) => void;
  onMcpAccessTokenChange: (token: string) => void;
  onMcpAccessTokenRotate: () => void;
  onMcpAccessTokenTtlMinutesChange: (ttlMinutes: number) => void;
  onMcpCapabilityProfileChange: (profile: 'read_only' | 'task_write' | 'admin') => void;
  onRestartMcpServer: () => void;
  mcpHealthResult: McpHealthCheckResult | null;
  mcpHealthCheckRunning: boolean;
  onRunMcpHealthCheck: () => void;
  mcpRestartPending: boolean;
  onRefreshMcpAuditLog: () => void;
  storageMeter: StorageMeter;
}

export function PreferencesPanel({
  isOpen,
  onClose,
  initialAnchor,
  statusColumns,
  showCompletedTimelineTasks,
  cleanupGoalArtifacts,
  goalAuditArchiveDirectory,
  externalSkillsDirectory,
  customScrollbarsEnabled,
  condensedUI,
  goalPolicy,
  executionLoadStatusIds,
  pipelineLoadStatusIds,
  updateChannel,
  markdownAppearance,
  people,
  tasks,
  timelineSwimlanes,
  onMarkdownAppearanceChange,
  onShowCompletedTimelineTasksChange,
  onCleanupGoalArtifactsChange,
  onGoalAuditArchiveDirectoryChange,
  onExternalSkillsDirectoryChange,
  onCustomScrollbarsEnabledChange,
  onCondensedUIChange,
  onGoalPolicyChange,
  onResetGoalPolicy,
  onUpdateStatusColumn,
  onAddPerson,
  onUpdatePerson,
  onDeletePerson,
  onNukeLocalData,
  onExportWorkspaceBackup,
  onExportGoalPolicyBackup,
  onImportTasksAndProjects,
  onImportGoalPolicyBackup,
  importFeedback,
  mcpAgentAccessEnabled,
  mcpAddress,
  mcpBindHost,
  mcpPort,
  mcpAccessToken,
  mcpAccessTokenIssuedAt,
  mcpAccessTokenTtlMinutes,
  mcpCapabilityProfile,
  mcpListenerStatus,
  mcpAuditLog,
  mcpAuditSummary,
  onUpdateChannelChange,
  onMcpAgentAccessToggle,
  onMcpAddressChange,
  onMcpBindHostChange,
  onMcpPortChange,
  onMcpAccessTokenChange,
  onMcpAccessTokenRotate,
  onMcpAccessTokenTtlMinutesChange,
  onMcpCapabilityProfileChange,
  onRestartMcpServer,
  mcpHealthResult,
  mcpHealthCheckRunning,
  onRunMcpHealthCheck,
  mcpRestartPending,
  onRefreshMcpAuditLog,
  storageMeter,
}: PreferencesPanelProps) {
  const performanceLoggingEnabled = useWorkspaceSelector(state => state.preferences.performanceLoggingEnabled);
  const onPerformanceLoggingEnabledChange = useWorkspaceSelector(state => state.setPerformanceLoggingEnabled);
  const [copied, setCopied] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedWriteCommand, setCopiedWriteCommand] = useState(false);
  const [copiedStdioCommand, setCopiedStdioCommand] = useState(false);
  const [copiedTunnelCommand, setCopiedTunnelCommand] = useState(false);
  const [copiedAuditLog, setCopiedAuditLog] = useState(false);
  const hasMcpToken = Boolean(mcpAccessToken.trim());

  const tokenExpiryLabel = (() => {
    if (!hasMcpToken) return 'Auth mode: none';
    if (!mcpAccessTokenIssuedAt) return 'Auth mode: token set, expiry unavailable';

    const issuedAtMs = Date.parse(mcpAccessTokenIssuedAt);
    if (Number.isNaN(issuedAtMs)) return 'Auth mode: token set, expiry unavailable';

    const expiresAtMs = issuedAtMs + (mcpAccessTokenTtlMinutes * 60 * 1000);
    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      return 'Auth mode: token expired';
    }

    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return `Auth mode: token active, expires in ~${remainingMinutes} min`;
  })();

  const listenerStatusLabel = (() => {
    if (!mcpAgentAccessEnabled) return 'Listener status: disabled';
    if (!mcpListenerStatus) return 'Listener status: not checked';

    if (mcpListenerStatus.status === 'running') {
      return `Listener status: running${mcpListenerStatus.boundUrl ? ` at ${mcpListenerStatus.boundUrl}` : ''}`;
    }
    if (mcpListenerStatus.status === 'starting') {
      return 'Listener status: starting';
    }
    if (mcpListenerStatus.status === 'error') {
      return `Listener status: error${mcpListenerStatus.error ? ` - ${mcpListenerStatus.error}` : ''}`;
    }
    if (mcpListenerStatus.status === 'stopped') {
      return 'Listener status: stopped';
    }
    return 'Listener status: disabled';
  })();

  const curlCommand = [
    `curl -sS -X POST http://${mcpBindHost}:${mcpPort}/mcp \\`,
    `  -H 'Content-Type: application/json' \\`,
    hasMcpToken ? `  -H 'Authorization: Bearer ${mcpAccessToken}' \\` : `  -H 'Authorization: Bearer <token>' \\`,
    `  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'`,
  ].join('\n');

  const stdioCommand = 'node electron/scripts/mcp-stdio.cjs';
  const tunnelCommand = `npx localtunnel --port ${mcpPort}`;
  const writeCommand = [
    `curl -sS -X POST http://${mcpBindHost}:${mcpPort}/mcp \\`,
    `  -H 'Content-Type: application/json' \\`,
    hasMcpToken ? `  -H 'Authorization: Bearer ${mcpAccessToken}' \\` : `  -H 'Authorization: Bearer <token>' \\`,
    `  -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"tasks.transition_under_review","arguments":{"taskId":"<task-id>","expectedRevision":<revision>}}}'`,
    '',
    `curl -sS -X POST http://${mcpBindHost}:${mcpPort}/mcp \\`,
    `  -H 'Content-Type: application/json' \\`,
    hasMcpToken ? `  -H 'Authorization: Bearer ${mcpAccessToken}' \\` : `  -H 'Authorization: Bearer <token>' \\`,
    `  -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"tasks.update_completion_description","arguments":{"taskId":"<task-id>","completion":"<brief summary>","expectedRevision":<revision>}}}'`,
  ].join('\n');

  const retryGuidance = 'If a write returns REVISION_MISMATCH, re-read the task, use the latest __mcpRevision, then retry once.';
  const auditLogJson = JSON.stringify(mcpAuditLog, null, 2);

  const isRemoteMcpAddress = (() => {
    try {
      const host = new URL(mcpAddress).hostname.toLowerCase();
      return !['localhost', '127.0.0.1', '::1'].includes(host);
    } catch {
      return false;
    }
  })();

  const remoteTokenWarning =
    mcpAgentAccessEnabled && isRemoteMcpAddress && !hasMcpToken
      ? 'Remote MCP is enabled without a token. Add one before sharing this URL.'
      : null;

  const connectionStatusLabel = (() => {
    if (!mcpAgentAccessEnabled) return 'Connection status: disabled';
    if (mcpHealthResult?.connectionStatus === 'auth-error') return 'Connection status: auth error';
    if (mcpHealthResult?.connectionStatus === 'handshake-error') return 'Connection status: handshake error';
    if (mcpHealthResult?.connectionStatus === 'local-ready') return 'Connection status: local ready';
    if (mcpHealthResult?.connectionStatus === 'remote-ready') return 'Connection status: remote ready';
    if (mcpListenerStatus?.status === 'running') return 'Connection status: listener running';
    if (mcpListenerStatus?.status === 'error') return 'Connection status: listener error';
    if (mcpListenerStatus?.status === 'starting') return 'Connection status: listener starting';
    return mcpHealthResult ? 'Connection status: unknown' : 'Connection status: not checked';
  })();

  const copyText = async (text: string, setCopiedState: (copied: boolean) => void) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof window !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedState(true);
      window.setTimeout(() => setCopiedState(false), 1400);
    } catch {
      setCopiedState(false);
    }
  };

  const copyMcpAddress = async () => {
    await copyText(mcpAddress, setCopied);
  };

  const copyMcpCommand = async () => {
    await copyText(curlCommand, setCopiedCommand);
  };

  const copyWriteCommand = async () => {
    await copyText(writeCommand, setCopiedWriteCommand);
  };

  const copyStdioCommand = async () => {
    await copyText(stdioCommand, setCopiedStdioCommand);
  };

  const copyTunnelCommand = async () => {
    await copyText(tunnelCommand, setCopiedTunnelCommand);
  };

  const copyAuditLog = async () => {
    await copyText(auditLogJson, setCopiedAuditLog);
  };

  const exportAuditLog = () => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([auditLogJson], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `omvra-mcp-audit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <SettingsPanel isOpen={isOpen} onClose={onClose} initialAnchor={initialAnchor}>
      <GeneralSettingsSection>
        <div className="flex items-center justify-between gap-4 border-b border-black/5 pb-4">
          <div>
            <div className="text-sm font-semibold leading-5 text-[#71717a]">Condensed UI</div>
            <p className="mt-1 text-xs leading-4 text-[#6a7282]">
              Use icon-only navigation and shorter filter controls across the workspace.
            </p>
          </div>
          <Switch aria-label="Condensed UI" checked={condensedUI} onCheckedChange={onCondensedUIChange} />
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-black/5 pb-4">
          <div>
            <div className="text-sm font-semibold leading-5 text-[#71717a]">Custom horizontal scrollbars</div>
            <p className="mt-1 text-xs leading-4 text-[#6a7282]">
              Use Omvra&apos;s persistent scrollbar in Timeline and Milestones. Disable to use Chromium&apos;s standard scrollbar.
            </p>
          </div>
          <Switch
            aria-label="Use custom horizontal scrollbars"
            checked={customScrollbarsEnabled}
            onCheckedChange={onCustomScrollbarsEnabledChange}
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-black/5 pb-4">
          <div>
            <div className="text-sm font-semibold leading-5 text-[#71717a]">Performance logging</div>
            <p className="mt-1 text-xs leading-4 text-[#6a7282]">
              Write private timing-only diagnostics to a local file for this and future app runs.
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { void window.electron?.performance?.openLogsFolder(); }}>
                Open logs folder
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { void window.electron?.performance?.clearLogs(); }}>
                Clear logs
              </Button>
            </div>
          </div>
          <Switch
            aria-label="Performance logging"
            checked={performanceLoggingEnabled}
            onCheckedChange={onPerformanceLoggingEnabledChange}
          />
        </div>
        <MarkdownAppearanceSettings
          value={markdownAppearance}
          onChange={onMarkdownAppearanceChange}
        />
      </GeneralSettingsSection>

      <WorkflowSettingsSection
        cleanupGoalArtifacts={cleanupGoalArtifacts}
        goalAuditArchiveDirectory={goalAuditArchiveDirectory}
        externalSkillsDirectory={externalSkillsDirectory}
        onGoalAuditArchiveDirectoryChange={onGoalAuditArchiveDirectoryChange}
        onExternalSkillsDirectoryChange={onExternalSkillsDirectoryChange}
        onCleanupGoalArtifactsChange={onCleanupGoalArtifactsChange}
        goalPolicy={goalPolicy}
        onGoalPolicyChange={onGoalPolicyChange}
        onResetGoalPolicy={onResetGoalPolicy}
        onExportGoalPolicyBackup={onExportGoalPolicyBackup}
        onImportGoalPolicyBackup={onImportGoalPolicyBackup}
      />

      <TasksSettingsSection
        people={people}
        statusColumns={statusColumns}
        showCompletedTimelineTasks={showCompletedTimelineTasks}
        onShowCompletedTimelineTasksChange={onShowCompletedTimelineTasksChange}
        onUpdateStatusColumn={onUpdateStatusColumn}
      />

      <PeopleManagementSections
        people={people}
        tasks={tasks}
        projects={timelineSwimlanes}
        statusColumns={statusColumns}
        executionLoadStatusIds={executionLoadStatusIds}
        pipelineLoadStatusIds={pipelineLoadStatusIds}
        onAddPerson={onAddPerson}
        onUpdatePerson={onUpdatePerson}
        onDeletePerson={onDeletePerson}
      />

      <AgentRuntimeSettingsSection>
        <AgentRuntimeSettings projects={timelineSwimlanes} tasks={tasks} />
      </AgentRuntimeSettingsSection>

      <McpSettingsSection>
        <McpAccessSettingsSection
          agentAccessEnabled={mcpAgentAccessEnabled}
          address={mcpAddress}
          bindHost={mcpBindHost}
          port={mcpPort}
          accessToken={mcpAccessToken}
          accessTokenTtlMinutes={mcpAccessTokenTtlMinutes}
          capabilityProfile={mcpCapabilityProfile}
          copiedAddress={copied}
          copiedStdioCommand={copiedStdioCommand}
          listenerStatus={mcpListenerStatus}
          listenerStatusLabel={listenerStatusLabel}
          connectionStatusLabel={connectionStatusLabel}
          tokenExpiryLabel={tokenExpiryLabel}
          restartPending={mcpRestartPending}
          remoteTokenWarning={remoteTokenWarning}
          stdioCommand={stdioCommand}
          healthResult={mcpHealthResult}
          healthRunning={mcpHealthCheckRunning}
          onAgentAccessToggle={onMcpAgentAccessToggle}
          onAddressChange={onMcpAddressChange}
          onBindHostChange={onMcpBindHostChange}
          onPortChange={onMcpPortChange}
          onAccessTokenChange={onMcpAccessTokenChange}
          onAccessTokenRotate={onMcpAccessTokenRotate}
          onAccessTokenTtlMinutesChange={onMcpAccessTokenTtlMinutesChange}
          onCapabilityProfileChange={onMcpCapabilityProfileChange}
          onRestartServer={onRestartMcpServer}
          onCopyAddress={copyMcpAddress}
          onCopyStdioCommand={copyStdioCommand}
          onRunHealthCheck={onRunMcpHealthCheck}
        />
      </McpSettingsSection>

      <McpTestingSettingsSection>
        <McpCommandSettingsSection
          testCommand={curlCommand}
          writeCommand={writeCommand}
          tunnelCommand={tunnelCommand}
          retryGuidance={retryGuidance}
          copiedTestCommand={copiedCommand}
          copiedWriteCommand={copiedWriteCommand}
          copiedTunnelCommand={copiedTunnelCommand}
          onCopyTestCommand={copyMcpCommand}
          onCopyWriteCommand={copyWriteCommand}
          onCopyTunnelCommand={copyTunnelCommand}
        />
      </McpTestingSettingsSection>

      <McpActivitySettingsSection>
        <McpActivityLogSection
          auditLog={mcpAuditLog}
          auditSummary={mcpAuditSummary}
          copied={copiedAuditLog}
          onRefresh={onRefreshMcpAuditLog}
          onCopy={copyAuditLog}
          onExport={exportAuditLog}
          listenerStatusLabel={listenerStatusLabel}
          connectionStatusLabel={connectionStatusLabel}
          tokenExpiryLabel={tokenExpiryLabel}
          boundUrl={mcpListenerStatus?.boundUrl}
          restartPending={mcpRestartPending}
        />
      </McpActivitySettingsSection>

      <DataSettingsSection
        storageMeter={storageMeter}
        onNukeLocalData={onNukeLocalData}
        onExportWorkspaceBackup={onExportWorkspaceBackup}
        onImportTasksAndProjects={onImportTasksAndProjects}
        importFeedback={importFeedback}
      />

      <AboutSettingsSection
        updateChannel={updateChannel}
        onUpdateChannelChange={onUpdateChannelChange}
        onExportWorkspaceBackup={onExportWorkspaceBackup}
      />
      <HelpSettingsSection onReplayOnboarding={() => { window.dispatchEvent(new CustomEvent('omvra:replay-onboarding')); }} />
    </SettingsPanel>
  );
}

const MARKDOWN_SIZE_FIELDS: Array<{ key: keyof MarkdownAppearance; label: string; description: string }> = [
  { key: 'blockSpacing', label: 'Block spacing', description: 'Gap between paragraphs and other markdown blocks.' },
  { key: 'listBlockSpacing', label: 'List block spacing', description: 'Top and bottom spacing around lists and nested list groups.' },
  { key: 'listItemSpacing', label: 'List item spacing', description: 'Vertical spacing between list items.' },
  { key: 'listIndent', label: 'List indent', description: 'Left indent for non-checklist markdown lists.' },
  { key: 'taskIndent', label: 'Checklist indent', description: 'Indent applied to nested checklist children.' },
  { key: 'codeBlockSpacing', label: 'Code spacing', description: 'Gap between code snippets and nearby paragraph content.' },
  { key: 'inlineCodePaddingX', label: 'Inline code padding X', description: 'Horizontal padding for inline code.' },
  { key: 'inlineCodePaddingY', label: 'Inline code padding Y', description: 'Vertical padding for inline code.' },
  { key: 'inlineCodeRadius', label: 'Inline code radius', description: 'Corner radius for inline code chips.' },
  { key: 'inlineCodeMarginX', label: 'Inline code margin X', description: 'Horizontal spacing around inline code inside paragraphs.' },
  { key: 'inlineCodeMarginY', label: 'Inline code margin Y', description: 'Vertical spacing around inline code inside paragraphs.' },
  { key: 'preformattedPaddingX', label: 'Code block padding X', description: 'Horizontal padding for wrapped code/preformatted text.' },
  { key: 'preformattedPaddingY', label: 'Code block padding Y', description: 'Vertical padding for wrapped code/preformatted text.' },
  { key: 'preformattedRadius', label: 'Code block radius', description: 'Corner radius for wrapped code/preformatted text.' },
];

const MARKDOWN_COLOR_FIELDS: Array<{ key: keyof MarkdownAppearance; label: string; description: string }> = [
  { key: 'inlineCodeBg', label: 'Inline code background', description: 'Background color for inline code.' },
  { key: 'inlineCodeColor', label: 'Inline code text', description: 'Text color for inline code.' },
  { key: 'preformattedBg', label: 'Code block background', description: 'Background color for wrapped code/preformatted text.' },
  { key: 'preformattedColor', label: 'Code block text', description: 'Text color for wrapped code/preformatted text.' },
];

function MarkdownAppearanceSettings({
  value,
  onChange,
}: {
  value: MarkdownAppearance;
  onChange: (updates: Partial<MarkdownAppearance>) => void;
}) {
  return (
    <div className="min-w-0 space-y-8">
      <div className="space-y-1">
        <div className="text-sm font-semibold leading-5 text-[#71717a]">Markdown appearance</div>
        <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
          Control how markdown content renders in task descriptions. These settings persist with your workspace backup.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {MARKDOWN_SIZE_FIELDS.map((field) => (
          <PreferenceTextField
            key={field.key}
            label={field.label}
            description={field.description}
            value={value[field.key]}
            onChange={(nextValue) => onChange({ [field.key]: nextValue })}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {MARKDOWN_COLOR_FIELDS.map((field) => (
          <PreferenceColorField
            key={field.key}
            label={field.label}
            description={field.description}
            value={value[field.key]}
            onChange={(nextValue) => onChange({ [field.key]: nextValue })}
          />
        ))}
      </div>
    </div>
  );
}

function PreferenceTextField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <div className="text-sm font-semibold leading-5 text-[#71717a]">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-[#4a4a4f] outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      />
      <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">{description}</p>
    </label>
  );
}

function PreferenceColorField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const pickerValue = normalizeColorPickerValue(value);

  return (
    <label className="space-y-1">
      <div className="text-sm font-semibold leading-5 text-[#71717a]">{label}</div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 rounded-xl border border-black/10 bg-white p-1"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#4a4a4f] outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
        />
      </div>
      <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">{description}</p>
    </label>
  );
}

function normalizeColorPickerValue(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7);
  return '#000000';
}
