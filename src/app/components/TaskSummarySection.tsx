import { Ban } from 'lucide-react';
import { ReactNode } from 'react';
import { TaskPriority, Person } from '../types';
import { resolveStatusColor } from '../utils/roadmap';
import { PERSON_CAPACITY_POINTS } from '../utils/taskLoad';
import { getReadableTextClassFor } from '../utils/contrast';
import { EmptyStateCard } from './EmptyStateCard';
import { TASK_PRIORITY_ICONS } from './taskPriorityIcons';
import { AgentIcon } from './icons/AgentIcon';
import { UserIcon } from './icons/UserIcon';
import { NodesIcon } from './icons/NodesIcon';
import { ExecutionNotice } from './ExecutionNotice';
import { getAttentionState } from '../utils/attention';

interface TaskSummarySectionProps {
  statusLabel: string;
  primaryTimelineProject: string;
  assigneeLabel: string;
  timelineLabel: string;
  taskSizeLabel: string;
  complexityLabel: string;
  priorityLabel: string;
  priority: TaskPriority;
  blockedLabel: string;
  blocked: boolean;
  assigneeKind?: Person['kind'];
  milestoneLabel: string;
  blockedNextStep?: string;
}

interface TaskLoadDetailsSectionProps {
  taskLoadPoints: number;
  taskLoadContribution: number | null;
}

export function TaskSummarySection({
  statusLabel,
  primaryTimelineProject,
  assigneeLabel,
  timelineLabel,
  taskSizeLabel,
  complexityLabel,
  priorityLabel,
  priority,
  blockedLabel,
  blocked,
  assigneeKind,
  milestoneLabel,
  blockedNextStep = 'Review the blocking reason and resolve it before starting work.',
}: TaskSummarySectionProps) {
  const priorityIcon = TASK_PRIORITY_ICONS[priority];
  const AssigneeIcon = assigneeKind === 'agentic' ? AgentIcon : UserIcon;

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-3 rounded-xl bg-[#71717a]/5 p-3 sm:grid-cols-2">
        <SummaryRow label="Status" value={statusLabel} />
        <SummaryRow label="Assignee" value={assigneeLabel} icon={<AssigneeIcon className="size-3.5 text-[#71717a]" />} />
        <SummaryRow label="Task Size" value={taskSizeLabel} />
        <SummaryRow label="Complexity" value={complexityLabel} capitalize />
        <SummaryRow
          label="Priority"
          value={priorityLabel}
          icon={<img src={priorityIcon.src} alt="" aria-hidden="true" className="size-3.5" />}
        />
        <SummaryRow
          label="Blocked"
          value={blockedLabel.toUpperCase()}
          icon={blocked ? <Ban className="size-3.5 text-[#71717a]" /> : <Ban className="size-3.5 text-[#71717a]/70" />}
        />
      </div>

      {blocked && (
        <ExecutionNotice tone="danger" title={getAttentionState('blocked').label} nextStep={blockedNextStep}>
          {getAttentionState('blocked').description}
        </ExecutionNotice>
      )}
      {!blocked && /review/i.test(statusLabel) && (
        <ExecutionNotice tone="warning" title={getAttentionState('review').label} nextStep={getAttentionState('review').nextStep}>
          {getAttentionState('review').description}
        </ExecutionNotice>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
        <SummaryStack label="Projects" value={primaryTimelineProject} />
        <SummaryStack label="Milestone" value={milestoneLabel} />
        <SummaryStack label="Timeline" value={timelineLabel} />
      </div>
    </div>
  );
}

export function TaskLoadDetailsSection({
  taskLoadPoints,
  taskLoadContribution,
}: TaskLoadDetailsSectionProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      <LoadMetricRow label="Load Points" value={`${taskLoadPoints.toFixed(1)} / ${PERSON_CAPACITY_POINTS}`} />
      <LoadMetricRow
        label="Load Contribution"
        value={taskLoadContribution !== null ? `${taskLoadContribution}%` : 'N/A'}
      />
    </div>
  );
}

interface TaskDependencyDetailsSectionProps {
  dependencies: Array<{
    id: string;
    title: string;
    status?: string;
    statusColor?: string;
  }>;
}

export function TaskDependencyDetailsSection({ dependencies }: TaskDependencyDetailsSectionProps) {
  if (dependencies.length === 0) {
    return (
      <EmptyStateCard
        compact
        title="No roadmap dependencies"
        description="Add predecessor work from the same milestone when this task should wait on other delivery steps."
      />
    );
  }

  return (
    <div className="flex max-w-[566px] flex-col gap-1 overflow-hidden">
      {dependencies.map(dependency => {
        const statusColor = resolveStatusColor(dependency.status, dependency.statusColor);

        return (
          <div
            key={dependency.id}
            className="flex min-h-[42px] min-w-0 items-center justify-between gap-3 rounded-xl border border-black/[0.05] px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <NodesIcon className="size-4 shrink-0 text-[#67676f]" aria-hidden="true" />
              <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium leading-5 text-[#67676f]">
                {dependency.title}
              </div>
            </div>
            {dependency.status && (
              <DependencyStatusPill label={dependency.status} statusColor={statusColor} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DependencyStatusPill({
  label,
  statusColor,
}: {
  label: string;
  statusColor?: string;
}) {
  const resolvedStatusColor = resolveStatusColor(label, statusColor);
  const textClassName = getReadableTextClassFor(`dependency-status-pill-${resolvedStatusColor}`, resolvedStatusColor);

  return (
    <div
      className={`flex min-h-5 shrink-0 items-center rounded-full px-1.5 py-1 text-xs font-medium leading-none ${textClassName}`}
      style={{ backgroundColor: resolvedStatusColor }}
    >
      {label}
    </div>
  );
}

interface SummaryFieldProps {
  label: string;
  value: string;
  compact?: boolean;
  capitalize?: boolean;
  className?: string;
}

function SummaryField({ label, value, compact = false, capitalize = false, className = '' }: SummaryFieldProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs font-medium leading-5 text-[#71717a]">{label}</div>
      <div
        className={`break-words font-semibold text-[#71717a] [overflow-wrap:anywhere] ${
          compact ? 'text-xs' : 'text-sm'
        } ${capitalize ? 'capitalize' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  capitalize = false,
  icon,
}: Pick<SummaryFieldProps, 'label' | 'value' | 'capitalize'> & { icon?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="shrink-0 text-xs font-medium leading-5 text-[#71717a]">{label}</div>
      <SummaryPill value={value} capitalize={capitalize} icon={icon} />
    </div>
  );
}

function SummaryStack({ label, value }: Pick<SummaryFieldProps, 'label' | 'value'>) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="text-xs font-medium leading-5 text-[#71717a]">{label}:</div>
      <SummaryPill value={value} className="max-w-full" />
    </div>
  );
}

function LoadMetricRow({ label, value }: Pick<SummaryFieldProps, 'label' | 'value'>) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="shrink-0 text-xs font-medium leading-5 text-[#71717a]">{label}</div>
      <div className="inline-flex min-h-5 shrink-0 items-center rounded-full border border-[#ffb6b6] bg-[#ffd9d9] px-2 py-0.5 text-[11px] font-bold leading-none text-[#b80000]">
        {value}
      </div>
    </div>
  );
}

function SummaryPill({
  value,
  capitalize = false,
  className = '',
  icon,
}: Pick<SummaryFieldProps, 'value' | 'capitalize' | 'className'> & { icon?: ReactNode }) {
  return (
    <div
      className={`inline-flex min-h-5 max-w-full items-center gap-1 rounded-full border border-black/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#71717a] ${capitalize ? 'capitalize' : ''} ${className}`}
    >
      {icon}
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}
