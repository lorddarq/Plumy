import { Task, TimelineSwimlane, Person, TaskStatus, StatusColumn, ProjectMilestone, TaskAttachment } from '../../types';
import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { formatDateRangeLabel } from '../../utils/dateRange';
import { getTaskLoadContributionPercent, getTaskLoadPoints, PERSON_CAPACITY_POINTS } from '../../utils/taskLoad';
import { getMilestoneForTask, getStatusLabel, getStatusVisual } from '../../utils/roadmap';
import { formatTaskDetailsForClipboard } from '../../utils/taskClipboard';
import { buildTaskPdfExportHtml, createTaskPdfFileName } from '../../utils/taskPdfExport';
import { exportPdfDocument } from '../../utils/pdfExport';
import { TaskAttachmentsSection } from '../TaskAttachmentsSection';
import { TaskCommentsSection } from '../TaskCommentsSection';
import { TaskDescriptionSection } from '../TaskDescriptionSection';
import { TaskContextHistorySection } from '../TaskContextHistorySection';
import { TaskDetailsActionMenu } from '../TaskDetailsActionMenu';
import { TaskExecutionAction } from '../TaskExecutionAction';
import { TaskFooterActions } from '../TaskFooterActions';
import { TaskDependencyDetailsSection, TaskLoadDetailsSection, TaskSummarySection } from '../TaskSummarySection';
import { AnchoredPanel, AnchoredPanelSection } from '../AnchoredPanel';
import type { WorkspaceReadModel } from '../../domain/workspaceReadModel';
import { DialogSurface } from './DialogSurface';
import { MessagesIcon } from '../icons/MessagesIcon';
import { NodesIcon } from '../icons/NodesIcon';
import { LoadIcon } from '../icons/LoadIcon';
import { AttachmentIcon } from '../icons/AttachmentIcon';
import { BasicInfoIcon } from '../icons/BasicInfoIcon';
import { DescriptionIcon } from '../icons/DescriptionIcon';

interface TaskDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (task: Task) => void;
  onMoveAgentTaskToReview?: (taskId: string) => void;
  onAddComment?: (taskId: string, content: string) => void;
  onUpdateAttachments?: (taskId: string, attachments: TaskAttachment[]) => void;
  task?: Task | null;
  swimlanes: TimelineSwimlane[];
  people: Person[];
  statusColumns: StatusColumn[];
  tasks?: Task[];
  milestones?: ProjectMilestone[];
  readModel?: WorkspaceReadModel;
}

function formatDate(dateValue?: string): string {
  if (!dateValue) return 'Not set';
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString();
}

export function TaskDetailsDialog({
  isOpen,
  onClose,
  onEdit,
  onMoveAgentTaskToReview,
  onAddComment,
  onUpdateAttachments,
  task,
  swimlanes,
  people,
  statusColumns,
  tasks = [],
  milestones = [],
  readModel,
}: TaskDetailsDialogProps) {
  const [startWorkRequest, setStartWorkRequest] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const enrichedTask = task ? readModel?.tasksById.get(task.id) : undefined;
  const primaryTimelineProject = enrichedTask?.primaryTimelineProject?.name
    ?? (task?.swimlaneId
    ? swimlanes.find(s => s.id === task.swimlaneId)?.name ?? 'Unknown swimlane'
    : 'No timeline project');
  const projectLabels = enrichedTask
    ? enrichedTask.projects.map(project => project.name)
    : task?.projectIds?.length
    ? task.projectIds
        .map(projectId => swimlanes.find(s => s.id === projectId)?.name)
        .filter((label): label is string => Boolean(label))
    : [];
  const personLabel = enrichedTask?.assignee?.name
    ? enrichedTask.assignee.name
    : task?.assigneeId
    ? people.find(p => p.id === task.assigneeId)?.name ?? 'Unknown assignee'
    : 'Unassigned';
  const milestone = enrichedTask?.milestone ?? getMilestoneForTask(task, milestones);
  const dependencyTasks = enrichedTask
    ? enrichedTask.dependencyTasks.map(item => item.task)
    : task
      ? (task.dependencyIds || [])
          .map(dependencyId => tasks.find(item => item.id === dependencyId))
          .filter((item): item is Task => Boolean(item))
      : [];
  const assignee = enrichedTask?.assignee ?? (task?.assigneeId ? people.find(p => p.id === task.assigneeId) : null);
  const statusLabel = task
    ? enrichedTask?.statusColumn?.title ?? getStatusLabel(statusColumns, task.status)
    : '';
  const taskLoadPoints = task ? getTaskLoadPoints(task) : 0;
  const taskLoadContribution = task && task.assigneeId
    ? getTaskLoadContributionPercent(task)
    : null;
  const assigneeLabel = `${personLabel}${assignee ? ` (${assignee.kind === 'agentic' ? 'Agentic' : 'Human'})` : ''}`;
  const timelineLabel = task ? formatDateRangeLabel(task.startDate, task.endDate) : '';
  const milestoneLabel = milestone ? `${milestone.title} (${formatDate(milestone.endDate)})` : 'No roadmap milestone';
  const priorityLabel = task
    ? ({
        urgent: 'Urgent',
        moderate: 'Moderate',
        normal: 'Normal',
        low: 'Low priority',
      } as const)[task.priority || 'normal']
    : '';
  const canMoveAgentTaskToReview = Boolean(
    task &&
    assignee &&
    assignee.kind === 'agentic' &&
    task.status === 'in-progress'
  );
  const sortedComments = useMemo(
    () => [...(task?.comments || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [task?.comments]
  );
  const normalizedNotes = task?.notes?.trim() || '';
  const isLongDescription = normalizedNotes.length > 900 || normalizedNotes.split('\n').length > 14;
  const detailsNavGroups = useMemo(
    () => [
      {
        label: 'Task Details',
        items: [
          { id: 'task-basic', label: 'Basic Info', icon: BasicInfoIcon },
          { id: 'task-description', label: 'Description', icon: DescriptionIcon },
          { id: 'task-context-history', label: 'Context History', icon: FileText },
          { id: 'task-load', label: 'Load', icon: LoadIcon },
          { id: 'task-dependencies', label: 'Dependencies', icon: NodesIcon },
          { id: 'task-attachments', label: 'Attachments', icon: AttachmentIcon },
          { id: 'task-comments', label: 'Comments', icon: MessagesIcon },
        ],
      },
    ],
    []
  );

  const handleAddComment = () => {
    if (!task || !onAddComment || !newComment.trim()) return;
    onAddComment(task.id, newComment);
    setNewComment('');
  };

  const handleCopyTaskDetails = async () => {
    if (!task) return;

    const text = formatTaskDetailsForClipboard({
      taskId: task.id,
      title: task.title,
      assigneeLabel: personLabel,
      projectLabels,
      statusLabel,
    });

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
      } else {
        throw new Error('Clipboard is unavailable');
      }

      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1400);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 1800);
    }
  };

  const handleExportPdf = async () => {
    if (!task || !window.electron?.tasks?.exportPdf || isExportingPdf) return;

    setIsExportingPdf(true);

    const html = buildTaskPdfExportHtml({
      taskId: task.id,
      title: task.title,
      exportedAt: new Date().toISOString(),
      summaryFields: [
        { label: 'Status', value: statusLabel },
        { label: 'Assignee', value: assigneeLabel },
        { label: 'Task Size', value: (task.size || 'm').toUpperCase() },
        { label: 'Complexity', value: task.complexity || 'medium' },
        { label: 'Priority', value: priorityLabel },
        { label: 'Blocked', value: task.blocked ? 'Yes' : 'No' },
        { label: 'Primary Project', value: primaryTimelineProject },
        { label: 'Milestone', value: milestoneLabel },
        { label: 'Timeline', value: timelineLabel },
      ],
      projectLabels,
      description: task.notes,
      loadFields: [
        { label: 'Load Points', value: `${taskLoadPoints.toFixed(1)} / ${PERSON_CAPACITY_POINTS}` },
        { label: 'Load Contribution', value: taskLoadContribution !== null ? `${taskLoadContribution}%` : 'N/A' },
      ],
      dependencies: dependencyTasks.map(dependencyTask => ({
        title: dependencyTask.title,
        detail: getStatusLabel(statusColumns, dependencyTask.status),
      })),
      attachments: (task.attachments || []).map(attachment => ({
        title: attachment.name,
        detail: attachment.path,
      })),
      comments: sortedComments.map(comment => ({
        author: comment.author,
        content: comment.content,
        createdAt: formatDate(comment.createdAt),
      })),
    });

    try {
      await exportPdfDocument({
        html,
        defaultFileName: createTaskPdfFileName(task.title),
        entityLabel: 'task',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleRevealAttachment = async (filePath: string) => {
    await window.electron?.attachments?.reveal?.(filePath);
  };

  const handleAddAttachments = async () => {
    if (!task || !onUpdateAttachments) return;

    const pickedPaths = await window.electron?.attachments?.pick?.();
    if (!Array.isArray(pickedPaths) || pickedPaths.length === 0) return;

    const existingAttachments = task.attachments || [];
    const existingPaths = new Set(existingAttachments.map(attachment => attachment.path));
    const nextAttachments = await Promise.all(
      pickedPaths
        .filter(filePath => typeof filePath === 'string' && filePath.trim() && !existingPaths.has(filePath))
        .map(async (filePath): Promise<TaskAttachment> => {
          const verified = await window.electron?.attachments?.verify?.(filePath).catch(() => null);
          const normalized = filePath.replace(/\\/g, '/');
          const name = normalized.split('/').filter(Boolean).pop() || filePath;
          const prefixed = normalized.match(/^[A-Za-z]:\//) ? `/${normalized}` : normalized;
          return {
            id: `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            path: filePath,
            uri: `file://${encodeURI(prefixed)}`,
            size: verified?.exists && Number.isFinite(Number(verified.size)) ? Number(verified.size) : undefined,
            addedAt: new Date().toISOString(),
          };
        })
    );

    if (nextAttachments.length > 0) {
      onUpdateAttachments(task.id, [...existingAttachments, ...nextAttachments]);
    }
  };

  const handleEditTask = () => {
    if (!task || !onEdit) return;
    onEdit(task);
  };

  const handleMoveAgentTaskToReview = () => {
    if (!task || !onMoveAgentTaskToReview) return;
    onMoveAgentTaskToReview(task.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogSurface
        showClose={false}
        overlayClassName="omvra-settings-overlay"
        className="flex h-[min(920px,calc(100vh-2rem))] min-h-0 w-[min(837px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-[24px] border-0 bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.10),0_-6px_12px_rgba(0,0,0,0.10),0_14px_28px_rgba(0,0,0,0.10)] sm:max-w-none"
      >
        <div className="sr-only">
          <DialogTitle>{task?.title || 'Task details'}</DialogTitle>
          <DialogDescription>Review task details and markdown description.</DialogDescription>
        </div>
        <AnchoredPanel
          className="h-auto min-h-0 flex-1"
          contentClassName="space-y-8"
          title={task?.title || 'Task details'}
          description="Review task details and markdown description."
          navGroups={detailsNavGroups}
          headerAction={task && (
            <TaskDetailsActionMenu
              copyState={copyState}
              canEdit={Boolean(onEdit)}
              canExportPdf={Boolean(window.electron?.tasks?.exportPdf && !isExportingPdf)}
              onEdit={handleEditTask}
              onCopy={handleCopyTaskDetails}
              onExportPdf={handleExportPdf}
              onStartWork={() => {
                onClose();
                setStartWorkRequest(request => request + 1);
              }}
            />
          )}
          footer={(
            <TaskFooterActions
              canMoveToReview={Boolean(task && canMoveAgentTaskToReview && onMoveAgentTaskToReview)}
              onMoveToReview={handleMoveAgentTaskToReview}
              onClose={onClose}
            />
          )}
        >
          <AnchoredPanelSection
            id="task-basic"
            title="Basic Information"
          >
            {task && (
              <TaskSummarySection
                statusLabel={statusLabel}
                primaryTimelineProject={primaryTimelineProject}
                assigneeLabel={assigneeLabel}
                timelineLabel={timelineLabel}
                taskSizeLabel={(task.size || 'm').toUpperCase()}
                complexityLabel={task.complexity || 'medium'}
                priorityLabel={priorityLabel}
                priority={task.priority || 'normal'}
                blockedLabel={task.blocked ? 'Yes' : 'No'}
                blocked={Boolean(task.blocked)}
                assigneeKind={assignee?.kind}
                milestoneLabel={milestoneLabel}
              />
            )}
          </AnchoredPanelSection>

          <AnchoredPanelSection
            id="task-description"
            title="Description"
            headerAction={isLongDescription ? (
              <button
                type="button"
                className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-[#71717a] hover:bg-[#71717a]/5"
                onClick={() => setIsDescriptionExpanded(value => !value)}
              >
                {isDescriptionExpanded ? 'Collapse' : 'Expand'}
              </button>
            ) : undefined}
          >
            <TaskDescriptionSection notes={task?.notes} isExpanded={isDescriptionExpanded} />
          </AnchoredPanelSection>

          <TaskContextHistorySection
            taskId={task?.id}
            expectedRevision={task?.__mcpRevision || 0}
          />

          <AnchoredPanelSection
            id="task-load"
            title="Load"
          >
            <TaskLoadDetailsSection
              taskLoadPoints={taskLoadPoints}
              taskLoadContribution={taskLoadContribution}
            />
          </AnchoredPanelSection>

          <AnchoredPanelSection
            id="task-dependencies"
            title="Dependencies"
          >
            <TaskDependencyDetailsSection
              dependencies={dependencyTasks.map(dependencyTask => {
                const dependencyStatusVisual = getStatusVisual(
                  statusColumns,
                  dependencyTask.status,
                  enrichedTask?.dependencyTasks.find(item => item.task.id === dependencyTask.id)?.statusColumn?.color
                );
                return {
                  id: dependencyTask.id,
                  title: dependencyTask.title,
                  status: dependencyStatusVisual.label,
                  statusColor: dependencyStatusVisual.color,
                };
              })}
            />
          </AnchoredPanelSection>

          <AnchoredPanelSection
            id="task-attachments"
            title="Attachments"
            headerAction={(
              <button
                type="button"
                onClick={handleAddAttachments}
                disabled={!task || !onUpdateAttachments || !window.electron?.attachments?.pick}
                className="text-sm font-semibold leading-5 text-[#1a60cb] hover:text-[#004ec5] disabled:cursor-not-allowed disabled:text-[#a5a5ac]"
              >
                Add
              </button>
            )}
          >
            <TaskAttachmentsSection
              attachments={task?.attachments}
              canReveal={Boolean(window.electron?.attachments?.reveal)}
              onRevealAttachment={handleRevealAttachment}
            />
          </AnchoredPanelSection>

          <AnchoredPanelSection
            id="task-comments"
            title="Comments"
          >
            <TaskCommentsSection
              comments={sortedComments}
              newComment={newComment}
              onNewCommentChange={setNewComment}
              onAddComment={handleAddComment}
              formatDate={formatDate}
              canAddComment={Boolean(newComment.trim() && task)}
            />
          </AnchoredPanelSection>
        </AnchoredPanel>
        {task && (
          <TaskExecutionAction
            task={task}
            repositoryFolder={swimlanes.find(project => project.id === task.swimlaneId || task.projectIds?.includes(project.id))?.repositoryFolder}
            openRequest={startWorkRequest}
            onOpenRequestHandled={() => setStartWorkRequest(0)}
            trigger={null}
          />
        )}
      </DialogSurface>
    </Dialog>
  );
}
