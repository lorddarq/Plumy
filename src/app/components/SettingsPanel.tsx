import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, Download, Upload } from 'lucide-react';
import { Person, RoadmapStage, StatusColumn, StorageMeter } from '../types';
import { getDefaultGoalBudgetDimension, type GoalPolicyBudgetMode, type GoalPolicyDimension, type GoalPolicyV1 } from '../utils/goalPolicy';
import { AnchoredPanel, AnchoredPanelSection } from './AnchoredPanel';
import { AgentBoardWatchSettings } from './settings/AgentBoardWatchSettings';
import { AgentIcon } from './icons/AgentIcon';
import { FolderIcon } from './icons/FolderIcon';
import { UsersIcon } from './icons/UsersIcon';
import { WorkflowsIcon } from './icons/WorkflowsIcon';
import { EmptyStateCard } from './EmptyStateCard';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { getDefaultColumnSemantics } from '../utils/statusColumnSemantics';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from './ui/sheet';

const SETTINGS_PANEL_NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      {
        id: 'general',
        label: 'General',
        icon: SlidersIcon,
      },
      {
        id: 'workflows',
        label: 'Workflows',
        icon: WorkflowsIcon,
      },
      {
        id: 'task-load',
        label: 'Tasks',
        icon: TasksIcon,
      },
      {
        id: 'people',
        label: 'People',
        icon: UsersIcon,
      },
    ],
  },
  {
    label: 'Agents & connections',
    items: [
      {
        id: 'agents',
        label: 'Agent profiles',
        icon: AgentIcon,
      },
      {
        id: 'agent-runtimes',
        label: 'Runtime access',
        icon: AgentIcon,
      },
      {
        id: 'mcp-access',
        label: 'Connected agents',
        icon: FiltersIcon,
      },
      {
        id: 'mcp-testing',
        label: 'Troubleshoot connections',
        icon: GaugeIcon,
      },
      {
        id: 'mcp-activity',
        label: 'Activity log',
        icon: WindowPointerIcon,
      },
    ],
  },
  {
    label: 'Data & recovery',
    items: [
      {
        id: 'storage',
        label: 'Local data & backup',
        icon: LayersIcon,
      },
    ],
  },
  {
    label: 'About & help',
    items: [
      {
        id: 'about',
        label: 'About & updates',
        icon: AboutIcon,
      },
      {
        id: 'help',
        label: 'Help',
        icon: HelpIcon,
      },
    ],
  },
];

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialAnchor?: string;
  children: ReactNode;
}

export function SettingsPanel({ isOpen, onClose, initialAnchor = 'general', children }: SettingsPanelProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        className="omvra-settings-sheet !bottom-2 !left-auto !right-2 !top-2 !h-auto !w-[min(800px,calc(100vw-16px))] !translate-x-0 !translate-y-0 gap-0 overflow-hidden rounded-[24px] border-0 bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.10),0_-6px_12px_rgba(0,0,0,0.10),0_14px_28px_rgba(0,0,0,0.10)] sm:max-w-none"
        overlayClassName="omvra-settings-overlay"
        showClose={false}
      >
        <SheetTitle className="sr-only">Preferences</SheetTitle>
        <SheetDescription className="sr-only">
          Configure workspace preferences, agent connections, local workspace data, backups, and help.
        </SheetDescription>
        <AnchoredPanel
          title="Preferences"
          navGroups={SETTINGS_PANEL_NAV_GROUPS}
          initialAnchor={initialAnchor}
          onClose={onClose}
        >
          {children}
        </AnchoredPanel>
      </SheetContent>
    </Sheet>
  );
}

export function GeneralSettingsSection({ children }: McpSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="general"
      title="General"
      icon={SlidersIcon}
      description="Workspace-wide appearance and behavior preferences"
    >
      {children}
    </AnchoredPanelSection>
  );
}

export function AgentRuntimeSettingsSection({ children }: McpSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="agent-runtimes"
      title="Runtime access"
      icon={AgentIcon}
      description="Control whether Omvra can connect to local or external agent runtimes."
    >
      {children}
    </AnchoredPanelSection>
  );
}

interface WorkflowSettingsSectionProps {
  cleanupGoalArtifacts: boolean;
  goalAuditArchiveDirectory: string;
  externalSkillsDirectory: string;
  onCleanupGoalArtifactsChange: (enabled: boolean) => void;
  onGoalAuditArchiveDirectoryChange: (directory: string) => void;
  onExternalSkillsDirectoryChange: (directory: string) => void;
  goalPolicy: GoalPolicyV1;
  onGoalPolicyChange: (updates: {
    currency?: string;
    acceptance?: GoalPolicyV1['acceptance'];
    agentMutationConfirmation?: GoalPolicyV1['agentMutationConfirmation'];
    dimensions?: Partial<GoalPolicyV1['dimensions']>;
  }) => void;
  onResetGoalPolicy: () => void;
  onExportGoalPolicyBackup: () => Promise<boolean>;
  onImportGoalPolicyBackup: (file: File) => void;
}

export function WorkflowSettingsSection({
  cleanupGoalArtifacts,
  goalAuditArchiveDirectory,
  externalSkillsDirectory,
  onCleanupGoalArtifactsChange,
  onGoalPolicyChange,
  onGoalAuditArchiveDirectoryChange,
  onExternalSkillsDirectoryChange,
  goalPolicy,
  onResetGoalPolicy,
  onExportGoalPolicyBackup,
  onImportGoalPolicyBackup,
}: WorkflowSettingsSectionProps) {
  const [validationWarnings, setValidationWarnings] = useState<Partial<Record<GoalPolicyDimension, string>>>({});
  const dimensionLabels: Record<GoalPolicyDimension, string> = {
    financial: 'Financial cost',
    tokens: 'Token count',
    concurrency: 'Concurrent loops',
    attempts: 'Total loop attempts',
    retries: 'Retries / rework',
  };

  const updateDimension = (dimension: GoalPolicyDimension, updates: Partial<Extract<GoalPolicyV1['dimensions'][GoalPolicyDimension], { constrained: true }>>) => {
    const current = goalPolicy.dimensions[dimension];
    if (!current.constrained) return;
    onGoalPolicyChange({ dimensions: { [dimension]: { ...current, ...updates } } });
  };

  const setDimensionConstrained = (dimension: GoalPolicyDimension, constrained: boolean) => {
    setValidationWarnings(previous => ({ ...previous, [dimension]: undefined }));
    onGoalPolicyChange({
      dimensions: {
        [dimension]: constrained
          ? getDefaultGoalBudgetDimension(dimension)
          : { constrained: false },
      },
    });
  };

  return (
    <AnchoredPanelSection
      id="workflows"
      title="Workflows"
      icon={WorkflowsIcon}
      description="Configure how completed Goals retain their working artefacts."
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold leading-5 text-[#71717a]">Cleanup goal artefacts</div>
          <p className="mt-1 max-w-[32rem] text-xs leading-4 text-[#6a7282]">
            When enabled, remove completed goals’ project.md and roster.md after durable evidence is verified. Off retains them for inspection.
          </p>
        </div>
        <Switch
          aria-label="Cleanup goal artefacts"
          checked={cleanupGoalArtifacts}
          onCheckedChange={onCleanupGoalArtifactsChange}
        />
      </div>
      <div className="mt-5 border-t border-[#ececf0] pt-5">
        <div className="text-sm font-semibold leading-5 text-[#71717a]">Audit history location</div>
        <p className="mt-1 max-w-[40rem] text-xs leading-4 text-[#6a7282]">
          Retain Goal cleanup audit history indefinitely in an external folder.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={goalAuditArchiveDirectory}
            readOnly
            placeholder="Not configured"
            aria-label="Goal cleanup audit history location"
            className="h-9 min-w-0 flex-1 rounded-xl border-[#e5e7eb] bg-white px-3 text-sm text-[#71717a]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 text-xs"
            onClick={async () => {
              const directory = await window.electron?.goalAudit?.pickDirectory?.();
              if (directory) onGoalAuditArchiveDirectoryChange(directory);
            }}
          >
            <FolderIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Choose folder
          </Button>
        </div>
      </div>
      <div className="mt-5 border-t border-[#ececf0] pt-5">
        <div className="text-sm font-semibold leading-5 text-[#71717a]">External skills location</div>
        <p className="mt-1 max-w-[40rem] text-xs leading-4 text-[#6a7282]">
          Use a local folder for skills that are not bundled with Omvra. Folder/SKILL.md skills work without a manifest and resolve before bundled fallbacks.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={externalSkillsDirectory}
            readOnly
            placeholder="Not configured"
            aria-label="External skills location"
            className="h-9 min-w-0 flex-1 rounded-xl border-[#e5e7eb] bg-white px-3 text-sm text-[#71717a]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 text-xs"
            onClick={async () => {
              const directory = await window.electron?.skills?.pickDirectory?.();
              if (directory) onExternalSkillsDirectoryChange(directory);
            }}
          >
            <FolderIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Choose folder
          </Button>
        </div>
      </div>
      <div className="mt-6 border-t border-[#ececf0] pt-5">
        <div className="text-sm font-semibold leading-5 text-[#3f3f46]">Goals / Loops policy</div>
        <p className="mt-1 max-w-[40rem] text-xs leading-4 text-[#6a7282]">
          Configure bounded execution defaults. Goal and subgoal overrides may narrow these limits, but cannot weaken safety or required human review.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-[#52525b]">
            Currency
            <Select
              value={goalPolicy.currency}
              onValueChange={currency => onGoalPolicyChange({ currency })}
            >
              <SelectTrigger className="h-9 w-full rounded-xl border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-visible:ring-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="RON">RON</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[#52525b]">
            Default acceptance
            <Select
              value={goalPolicy.acceptance.actor}
              onValueChange={actor => onGoalPolicyChange({ acceptance: { actor: actor as GoalPolicyV1['acceptance']['actor'] } })}
            >
              <SelectTrigger className="h-9 w-full rounded-xl border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-visible:ring-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="human">Human review</SelectItem>
                <SelectItem value="agentic">Agent evidence</SelectItem>
                <SelectItem value="both">Human + agent evidence</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="mt-4 grid gap-3">
          {(Object.keys(dimensionLabels) as GoalPolicyDimension[]).map(dimension => {
            const current = goalPolicy.dimensions[dimension];
            const constrained = current.constrained;
            return (
              <div key={dimension} className="rounded-2xl bg-[#f7f7f8] px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold leading-5 text-[#71717a]">{dimensionLabels[dimension]}</div>
                  <label className="flex items-center gap-2 text-sm text-[#71717a]">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={constrained}
                      aria-label={`${dimensionLabels[dimension]} bounded`}
                      className={`flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${constrained ? 'border-[#2563eb] bg-[#2563eb] text-white' : 'border-[#d4d4d8] bg-white text-transparent'}`}
                      onClick={() => setDimensionConstrained(dimension, !constrained)}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </button>
                    Bounded
                  </label>
                </div>
                {constrained ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
                    <Input
                      className="h-9 rounded-xl border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-visible:ring-gray-200"
                      type="number"
                      min="0.01"
                      step={dimension === 'financial' ? '0.01' : '1'}
                      value={current.value}
                      aria-label={`${dimensionLabels[dimension]} value`}
                      onChange={event => {
                        const value = Number(event.target.value);
                        const valid = Number.isFinite(value) && value > 0 && (dimension === 'financial' || Number.isInteger(value));
                        if (!valid) {
                          setValidationWarnings(previous => ({
                            ...previous,
                            [dimension]: dimension === 'financial'
                              ? 'Enter a positive amount.'
                              : 'Enter a positive whole number.',
                          }));
                          return;
                        }
                        setValidationWarnings(previous => ({ ...previous, [dimension]: undefined }));
                        updateDimension(dimension, { value });
                      }}
                    />
                    <Select
                      value={current.mode}
                      onValueChange={mode => updateDimension(dimension, { mode: mode as GoalPolicyBudgetMode })}
                    >
                      <SelectTrigger className="h-9 w-full rounded-xl border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-visible:ring-gray-200" aria-label={`${dimensionLabels[dimension]} allocation mode`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hard-cap">Hard cap</SelectItem>
                        <SelectItem value="goal-pool">Goal pool</SelectItem>
                        <SelectItem value="approval-required">Approval required</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex h-9 items-center rounded-xl border border-[#e5e7eb] bg-[#f4f4f5] px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                      {dimension === 'financial' ? goalPolicy.currency : current.unit}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs leading-5 text-[#7f8796]">Unbounded dimensions do not carry a value or allocation mode.</p>
                )}
                {validationWarnings[dimension] ? <p className="mt-2 text-xs text-red-600" role="alert">{validationWarnings[dimension]}</p> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold leading-5 text-[#71717a]">Agent graph mutation</div>
            <p className="text-xs leading-5 text-[#7f8796]">Require confirmation before an agent changes the Goal graph.</p>
          </div>
          <Switch
            className="mt-0.5"
            aria-label="Require confirmation for agent Goal graph mutations"
            checked={goalPolicy.agentMutationConfirmation === 'required'}
            onCheckedChange={required => onGoalPolicyChange({ agentMutationConfirmation: required ? 'required' : 'allowed' })}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#71717a]">Dynamic rollover returns unused cycle budget to the parent Goal pool.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetGoalPolicy}
          >
            Reset to safe defaults
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { void onExportGoalPolicyBackup(); }}
          >
            <Download className="size-3.5" />
            Back up Policies
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#d9d9df] px-3 py-2 text-xs font-medium text-[#52525b] hover:bg-[#f4f4f5]">
            <Upload className="size-3.5" />
            Restore Policies
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                if (file) onImportGoalPolicyBackup(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>
    </AnchoredPanelSection>
  );
}

interface McpSettingsSectionProps {
  children: ReactNode;
}

export function McpSettingsSection({ children }: McpSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="mcp-access"
      title="Connected agents"
      icon={FiltersIcon}
      description="Let connected agent tools work with this workspace. This is separate from Runtime access."
    >
      {children}
    </AnchoredPanelSection>
  );
}

export function McpTestingSettingsSection({ children }: McpSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="mcp-testing"
      title="Troubleshoot connections"
      icon={GaugeIcon}
      description="Check agent connections and troubleshoot access issues."
    >
      {children}
    </AnchoredPanelSection>
  );
}

export function McpActivitySettingsSection({ children }: McpSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="mcp-activity"
      title="Activity log"
      icon={WindowPointerIcon}
      description="Review recent agent requests when troubleshooting behavior."
    >
      {children}
    </AnchoredPanelSection>
  );
}

interface TasksSettingsSectionProps {
  people: Person[];
  statusColumns: StatusColumn[];
  showCompletedTimelineTasks: boolean;
  onShowCompletedTimelineTasksChange: (show: boolean) => void;
  onUpdateStatusColumn: (columnId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => void;
}

export function TasksSettingsSection({
  people,
  statusColumns,
  showCompletedTimelineTasks,
  onShowCompletedTimelineTasksChange,
  onUpdateStatusColumn,
}: TasksSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="task-load"
      title="Tasks"
      icon={TasksIcon}
      description="Configure workload and roadmap behavior for your tasks."
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold leading-5 text-[#71717a]">Completed work on Timeline and Roadmap</div>
              <p className="mt-1 break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
                Show tasks and milestones classified as complete.
              </p>
            </div>
            <Switch
              aria-label="Show completed work on Timeline and Roadmap"
              checked={showCompletedTimelineTasks}
              onCheckedChange={onShowCompletedTimelineTasksChange}
            />
          </div>
          <div className="space-y-2 border-t border-black/5 pt-4">
            <div className="text-sm font-semibold leading-5 text-[#71717a]">Kanban workflow categories</div>
            <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
              Define what each column means. Names can stay completely custom.
            </p>
            {statusColumns.map(column => (
              <label key={column.id} className="flex items-center justify-between gap-4 rounded-xl bg-[#f7f7f8] px-3 py-2">
                <span className="min-w-0 truncate text-sm text-[#52525b]">{column.title}</span>
                <Select
                  value={column.roadmapStage ?? getDefaultColumnSemantics(column.id).roadmapStage}
                  onValueChange={value => onUpdateStatusColumn(column.id, { roadmapStage: value as RoadmapStage })}
                >
                  <SelectTrigger className="h-9 w-40 max-w-full shrink-0 rounded-xl border-0 bg-white px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-visible:ring-gray-200" aria-label={`${column.title} workflow category`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-started">Backlog</SelectItem>
                    <SelectItem value="in-progress">In progress</SelectItem>
                    <SelectItem value="in-review">In review</SelectItem>
                    <SelectItem value="complete">Done</SelectItem>
                    <SelectItem value="excluded">Excluded</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>
        </div>

      </div>
    </AnchoredPanelSection>
  );
}

interface DataSettingsSectionProps {
  storageMeter: StorageMeter;
  onNukeLocalData: () => void;
  onExportWorkspaceBackup: () => Promise<boolean>;
  onImportTasksAndProjects: (file: File) => void;
  importFeedback?: {
    type: 'success' | 'error';
    message: string;
  } | null;
}

export function DataSettingsSection({
  storageMeter,
  onNukeLocalData,
  onExportWorkspaceBackup,
  onImportTasksAndProjects,
  importFeedback,
}: DataSettingsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usagePercent = Math.min(100, Math.max(0, storageMeter.usagePercent));

  return (
    <AnchoredPanelSection id="storage" title="Local data & backup" icon={LayersIcon} description="Find local workspace data, storage usage, and backup controls.">
      <div className="min-w-0 space-y-8">
        <div className="space-y-3">
          <div className="text-sm font-semibold leading-5 text-[#71717a]">Storage Usage</div>
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#71717a]/15">
              <div
                className="h-full rounded-full bg-[#71717a] transition-[width] duration-300"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
              <span className="font-bold">{formatBytes(storageMeter.usedBytes)}</span>
              {' used of '}
              <span className="font-bold">{formatBytes(storageMeter.totalBytes)}</span>
              {` available (${storageMeter.usagePercent}%)`}
            </div>
            <div className="break-words text-[11px] leading-4 text-[#71717a] [overflow-wrap:anywhere]">
              Source: {storageMeter.sourceLabel}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold leading-5 text-[#71717a]">Backup and restore</div>
          <p className="break-words text-xs leading-4 text-[#6a7282] [overflow-wrap:anywhere]">
            Export the full workspace backup, including UI preferences, people, projects, task allocation, and board metadata.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void onExportWorkspaceBackup();
              }}
            >
              <Download className="size-4 shrink-0" />
              Backup Data
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4 shrink-0" />
              Restore Data
            </Button>
          </div>
          {importFeedback ? (
            <EmptyStateCard
              compact
              icon={importFeedback.type === 'error' ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
              title={importFeedback.type === 'error' ? 'Backup restore failed' : 'Backup restored'}
              description={importFeedback.message}
              className={importFeedback.type === 'error' ? 'border-red-200 bg-red-50/70' : 'border-emerald-200 bg-emerald-50/70'}
            />
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportTasksAndProjects(file);
              }
              e.currentTarget.value = '';
            }}
          />
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-semibold leading-5 text-[#c40000]">Danger Zone</div>
            <div className="text-xs leading-4 text-[#6a7282]">
              <p>Purge the local storage used by the app.</p>
              <p>This is irreversible</p>
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onNukeLocalData}
          >
            Erase Local Storage
          </Button>
        </div>
      </div>
    </AnchoredPanelSection>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>circle-half-dotted-check</title>
      <g fill="currentColor">
        <path d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M9 1.75C13.004 1.75 16.25 4.996 16.25 9C16.25 13.004 13.004 16.25 9 16.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M5.75 9.25L8 11.75L12.25 6.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M3.87299 14.877C4.2872 14.877 4.62299 14.5412 4.62299 14.127C4.62299 13.7128 4.2872 13.377 3.87299 13.377C3.45877 13.377 3.12299 13.7128 3.12299 14.127C3.12299 14.5412 3.45877 14.877 3.87299 14.877Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M1.75 9.75C2.16421 9.75 2.5 9.41421 2.5 9C2.5 8.58579 2.16421 8.25 1.75 8.25C1.33579 8.25 1 8.58579 1 9C1 9.41421 1.33579 9.75 1.75 9.75Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M3.87299 4.62299C4.2872 4.62299 4.62299 4.2872 4.62299 3.87299C4.62299 3.45877 4.2872 3.12299 3.87299 3.12299C3.45877 3.12299 3.12299 3.45877 3.12299 3.87299C3.12299 4.2872 3.45877 4.62299 3.87299 4.62299Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M6.22601 16.448C6.64023 16.448 6.97601 16.1122 6.97601 15.698C6.97601 15.2838 6.64023 14.948 6.22601 14.948C5.8118 14.948 5.47601 15.2838 5.47601 15.698C5.47601 16.1122 5.8118 16.448 6.22601 16.448Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M2.302 12.524C2.71622 12.524 3.052 12.1882 3.052 11.774C3.052 11.3598 2.71622 11.024 2.302 11.024C1.88779 11.024 1.552 11.3598 1.552 11.774C1.552 12.1882 1.88779 12.524 2.302 12.524Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M2.302 6.97601C2.71622 6.97601 3.052 6.64023 3.052 6.22601C3.052 5.8118 2.71622 5.47601 2.302 5.47601C1.88779 5.47601 1.552 5.8118 1.552 6.22601C1.552 6.64023 1.88779 6.97601 2.302 6.97601Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M6.22601 3.052C6.64023 3.052 6.97601 2.71622 6.97601 2.302C6.97601 1.88779 6.64023 1.552 6.22601 1.552C5.8118 1.552 5.47601 1.88779 5.47601 2.302C5.47601 2.71622 5.8118 3.052 6.22601 3.052Z" fill="currentColor" data-stroke="none" stroke="none" />
      </g>
    </svg>
  );
}

export function HelpIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>life-ring</title>
      <g fill="currentColor">
        <path d="M10.311 5.487L11.71 1.738C10.866 1.423 9.95302 1.251 8.99902 1.251C8.04502 1.251 7.13202 1.423 6.28802 1.738L7.68702 5.487C8.09602 5.334 8.53602 5.251 8.99802 5.251C9.46002 5.251 9.90102 5.335 10.309 5.488L10.311 5.487Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M12.513 10.311L16.262 11.71C16.577 10.866 16.749 9.953 16.749 9C16.749 8.046 16.577 7.133 16.262 6.289L12.513 7.688C12.666 8.097 12.749 8.537 12.749 8.999C12.749 9.461 12.665 9.902 12.512 10.31L12.513 10.311Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M7.68898 12.513L6.28998 16.262C7.13398 16.577 8.04698 16.749 9.00098 16.749C9.95498 16.749 10.868 16.577 11.712 16.262L10.313 12.513C9.90398 12.666 9.46398 12.749 9.00198 12.749C8.53998 12.749 8.09898 12.665 7.69098 12.512L7.68898 12.513Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M5.48698 7.689L1.73798 6.29C1.42298 7.134 1.25098 8.047 1.25098 9C1.25098 9.954 1.42298 10.867 1.73798 11.711L5.48698 10.312C5.33398 9.903 5.25098 9.463 5.25098 9.001C5.25098 8.539 5.33498 8.098 5.48798 7.69L5.48698 7.689Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M5.48602 7.688C5.86502 6.672 6.67302 5.865 7.68902 5.485M10.312 5.486C11.328 5.865 12.135 6.673 12.515 7.689M12.514 10.312C12.135 11.328 11.327 12.135 10.311 12.515M7.68799 12.514C6.67199 12.135 5.86499 11.327 5.48499 10.311M6.46402 15.794C4.50002 15.061 2.93902 13.5 2.20502 11.535M15.794 11.536C15.061 13.5 13.499 15.061 11.535 15.795M11.536 2.206C13.5 2.939 15.061 4.501 15.795 6.465M2.20599 6.464C2.93899 4.5 4.49999 2.939 6.46499 2.205" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M10.311 5.487L11.71 1.738C10.866 1.423 9.95302 1.251 8.99902 1.251C8.04502 1.251 7.13202 1.423 6.28802 1.738L7.68702 5.487C8.09602 5.334 8.53602 5.251 8.99802 5.251C9.46002 5.251 9.90102 5.335 10.309 5.488L10.311 5.487ZM12.513 10.311L16.262 11.71C16.577 10.866 16.749 9.953 16.749 9C16.749 8.046 16.577 7.133 16.262 6.289L12.513 7.688C12.666 8.097 12.749 8.537 12.749 8.999C12.749 9.461 12.665 9.902 12.512 10.31L12.513 10.311ZM7.68898 12.513L6.28998 16.262C7.13398 16.577 8.04698 16.749 9.00098 16.749C9.95498 16.749 10.868 16.577 11.712 16.262L10.313 12.513C9.90398 12.666 9.46398 12.749 9.00198 12.749C8.53998 12.749 8.09898 12.665 7.69098 12.512L7.68898 12.513ZM5.48698 7.689L1.73798 6.29C1.42298 7.134 1.25098 8.047 1.25098 9C1.25098 9.954 1.42298 10.867 1.73798 11.711L5.48698 10.312C5.33398 9.903 5.25098 9.463 5.25098 9.001C5.25098 8.539 5.33498 8.098 5.48798 7.69L5.48698 7.689Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

export function AboutIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>circle-info</title>
      <g fill="currentColor">
        <path d="M9 16.25C13.0041 16.25 16.25 13.004 16.25 9C16.25 4.996 13.0041 1.75 9 1.75C4.9959 1.75 1.75 4.996 1.75 9C1.75 13.004 4.9959 16.25 9 16.25Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M9 16.25C13.004 16.25 16.25 13.004 16.25 9C16.25 4.996 13.004 1.75 9 1.75C4.996 1.75 1.75 4.996 1.75 9C1.75 13.004 4.996 16.25 9 16.25Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M9 12.75V9.25C9 8.9739 8.7761 8.75 8.5 8.75H7.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M9 6.75C8.448 6.75 8 6.301 8 5.75C8 5.199 8.448 4.75 9 4.75C9.552 4.75 10 5.199 10 5.75C10 6.301 9.552 6.75 9 6.75Z" fill="currentColor" data-stroke="none" stroke="none" />
      </g>
    </svg>
  );
}

export function FiltersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>filters</title>
      <g fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M13.4868 7.0974C13.4955 6.98275 13.5 6.8669 13.5 6.75C13.5 4.26472 11.4853 2.25 9 2.25C6.51472 2.25 4.5 4.26472 4.5 6.75C4.5 6.86689 4.50446 6.98275 4.51321 7.0974C2.89021 7.777 1.75 9.38035 1.75 11.25C1.75 13.7353 3.76472 15.75 6.25 15.75C7.28562 15.75 8.23953 15.4002 9 14.8122C9.76047 15.4002 10.7144 15.75 11.75 15.75C14.2353 15.75 16.25 13.7353 16.25 11.25C16.25 9.38035 15.1098 7.77701 13.4868 7.0974Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M10.496 9.757C10.66 10.224 10.75 10.727 10.75 11.25C10.75 13.735 8.735 15.75 6.25 15.75C3.765 15.75 1.75 13.735 1.75 11.25C1.75 10.339 2.021 9.491 2.486 8.783" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M11.511 15.745C12.042 15.773 12.587 15.707 13.123 15.536C15.49 14.778 16.794 12.245 16.036 9.878C15.278 7.511 12.745 6.207 10.378 6.965C9.50999 7.243 8.78599 7.759 8.25299 8.418" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M8.156 11.171C7.695 11.083 7.239 10.92 6.806 10.679C4.636 9.468 3.859 6.727 5.07 4.556C6.281 2.385 9.022 1.609 11.193 2.82C11.904 3.217 12.465 3.778 12.856 4.429" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

export function WindowPointerIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>window-pointer</title>
      <g fill="currentColor">
        <path d="M11.126 10.7701L17.066 12.94C17.316 13.0301 17.309 13.39 17.055 13.4699L14.336 14.3399L13.466 17.0601C13.385 17.3101 13.028 17.32 12.937 17.07L10.767 11.13C10.685 10.9 10.902 10.69 11.126 10.7701Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M1.75 4.75C1.75 3.64543 2.64543 2.75 3.75 2.75H14.25C15.3546 2.75 16.25 3.64543 16.25 4.75V7.75H1.75V4.75Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M4.25 6C4.664 6 5 5.66 5 5.25C5 4.84 4.664 4.5 4.25 4.5C3.836 4.5 3.5 4.84 3.5 5.25C3.5 5.66 3.836 6 4.25 6Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M6.75 6C7.164 6 7.5 5.66 7.5 5.25C7.5 4.84 7.164 4.5 6.75 4.5C6.336 4.5 6 4.84 6 5.25C6 5.66 6.336 6 6.75 6Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M1.75 7.75H16.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M16.25 9.44788V4.75C16.25 3.65 15.355 2.75 14.25 2.75H3.75C2.645 2.75 1.75 3.65 1.75 4.75V13.25C1.75 14.35 2.645 15.25 3.75 15.25H9.0779" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M11.126 10.7701L17.066 12.94C17.316 13.0301 17.309 13.39 17.055 13.4699L14.336 14.3399L13.466 17.0601C13.385 17.3101 13.028 17.32 12.937 17.07L10.767 11.13C10.685 10.9 10.902 10.69 11.126 10.7701Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

export function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>gauge-3</title>
      <g fill="currentColor">
        <path opacity="0.3" fillRule="evenodd" clipRule="evenodd" d="M3.75 15H14.25C15.489 13.699 16.25 11.938 16.25 10C16.25 5.996 13.004 2.75 9 2.75C4.996 2.75 1.75 5.996 1.75 10C1.75 11.938 2.511 13.699 3.75 15Z" fill="currentColor" data-stroke="none" stroke="none" />
        <path d="M9 2.75V4.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M14.127 4.87299L12.712 6.28799" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M16.25 10H14.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M3.87305 4.87299L8.29305 9.293" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M1.75 10H3.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M6.45264 3.2103C7.24504 2.9128 8.10363 2.75 9.00003 2.75C13.004 2.75 16.25 5.996 16.25 10C16.25 12.002 15.439 13.815 14.127 15.127L12.713 13.713" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M5.28799 13.712L3.87399 15.126C2.56199 13.814 1.75 12.002 1.75 9.99899C1.75 9.10279 1.91271 8.2445 2.21001 7.4523" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M9 11.25C9.69 11.25 10.25 10.69 10.25 10C10.25 9.31 9.69 8.75 9 8.75C8.31 8.75 7.75 9.31 7.75 10C7.75 10.69 8.31 11.25 9 11.25Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function LayersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>layers-3</title>
      <g fill="currentColor">
        <path d="M2.665 5.086L8.534 1.995C8.826 1.841 9.174 1.841 9.466 1.995L15.336 5.086C15.87 5.367 15.87 6.132 15.336 6.413L9.466 9.504C9.174 9.658 8.826 9.658 8.534 9.504L2.665 6.414C2.131 6.133 2.131 5.367 2.665 5.086Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M2.665 5.086L8.534 1.995C8.826 1.841 9.174 1.841 9.466 1.995L15.336 5.086C15.87 5.367 15.87 6.132 15.336 6.413L9.466 9.504C9.174 9.658 8.826 9.658 8.534 9.504L2.665 6.414C2.131 6.133 2.131 5.367 2.665 5.086Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M15.736 9C15.736 9.261 15.602 9.523 15.335 9.664L9.46499 12.755C9.17299 12.909 8.82499 12.909 8.53299 12.755L2.66299 9.664C2.39599 9.523 2.26199 9.262 2.26199 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M15.736 12.25C15.736 12.511 15.602 12.773 15.335 12.914L9.46499 16.005C9.17299 16.159 8.82499 16.159 8.53299 16.005L2.66299 12.914C2.39599 12.773 2.26199 12.512 2.26199 12.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

export function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <title>sliders</title>
      <g fill="currentColor">
        <path d="M11 7.5C12.2426 7.5 13.25 6.49264 13.25 5.25C13.25 4.00736 12.2426 3 11 3C9.75736 3 8.75 4.00736 8.75 5.25C8.75 6.49264 9.75736 7.5 11 7.5Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M7 15C8.24264 15 9.25 13.9926 9.25 12.75C9.25 11.5074 8.24264 10.5 7 10.5C5.75736 10.5 4.75 11.5074 4.75 12.75C4.75 13.9926 5.75736 15 7 15Z" fill="currentColor" fillOpacity="0.3" data-stroke="none" stroke="none" />
        <path d="M13.25 5.25H16.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M1.75 5.25H8.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M11 7.5C12.2426 7.5 13.25 6.49264 13.25 5.25C13.25 4.00736 12.2426 3 11 3C9.75736 3 8.75 4.00736 8.75 5.25C8.75 6.49264 9.75736 7.5 11 7.5Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M4.75 12.75H1.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M16.25 12.75H9.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M7 15C8.24264 15 9.25 13.9926 9.25 12.75C9.25 11.5074 8.24264 10.5 7 10.5C5.75736 10.5 4.75 11.5074 4.75 12.75C4.75 13.9926 5.75736 15 7 15Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}
