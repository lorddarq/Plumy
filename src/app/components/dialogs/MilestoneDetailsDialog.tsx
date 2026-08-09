import { useEffect, useMemo, useState } from 'react';
import type { ProjectMilestone, StatusColumn, Task, TimelineSwimlane } from '../../types';
import {
  getMilestoneDateRangeLabel,
  getMilestoneHealthVisual,
  getMilestoneProjectIds,
  getStatusLabel,
  summarizeMilestone,
} from '../../utils/roadmap';
import { formatDateRangeLabel } from '../../utils/dateRange';
import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { WorkspaceReadModel } from '../../domain/workspaceReadModel';
import { DialogSurface, DialogSurfaceBody, DialogSurfaceFooter, DialogSurfaceHeader, DialogSurfaceSection } from './DialogSurface';
import { EmptyStateCard } from '../EmptyStateCard';
import {
  MilestoneLinkedTasksSection,
  MilestoneSummaryCard,
} from '../MilestoneSections';
import { TaskDetailsActionMenu } from '../TaskDetailsActionMenu';
import { MilestoneExecutionAction } from '../MilestoneExecutionAction';
import { buildMilestonePdfExportHtml, createMilestonePdfFileName } from '../../utils/milestonePdfExport';
import { formatMilestoneDetailsForClipboard } from '../../utils/milestoneClipboard';
import { exportPdfDocument } from '../../utils/pdfExport';
import { MarkdownContent } from '../MarkdownContent';

interface MilestoneDetailsDialogProps {
  isOpen: boolean;
  milestone?: ProjectMilestone | null;
  projects: TimelineSwimlane[];
  tasks: Task[];
  statusColumns: StatusColumn[];
  readModel?: WorkspaceReadModel;
  onClose: () => void;
  onEdit: (milestone: ProjectMilestone) => void;
  onDelete?: (milestoneId: string) => void;
  onTaskClick: (task: Task) => void;
}

export function MilestoneDetailsDialog({
  isOpen,
  milestone,
  projects,
  tasks,
  statusColumns,
  readModel,
  onClose,
  onEdit,
  onDelete,
  onTaskClick,
}: MilestoneDetailsDialogProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [startWorkRequest, setStartWorkRequest] = useState(0);
  const enrichedMilestone = milestone ? readModel?.milestonesById.get(milestone.id) : undefined;
  const milestoneProjects = enrichedMilestone?.projects ?? (milestone
    ? projects.filter(item => getMilestoneProjectIds(milestone).includes(item.id))
    : []);
  const summary = enrichedMilestone?.summary ?? (milestone ? summarizeMilestone(milestone, tasks, statusColumns) : null);
  const lateTaskIds = new Set(summary?.lateTasks.map(task => task.id) || []);
  const healthVisual = summary ? getMilestoneHealthVisual(summary.health) : null;
  const sortedTasks = summary
    ? [...summary.linkedTasks].sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''))
    : [];
  const canDelete = Boolean(milestone && onDelete);
  const normalizedNotes = milestone?.notes?.trim() || '';
  const isLongDescription = normalizedNotes.length > 900 || normalizedNotes.split('\n').length > 14;
  const filteredTasks = useMemo(() => {
    const normalizedSearch = taskSearchQuery.trim().toLowerCase();
    if (!normalizedSearch) return sortedTasks;

    return sortedTasks.filter(task => {
      const dependencyTitles = (task.dependencyIds || [])
        .map(dependencyId => sortedTasks.find(item => item.id === dependencyId)?.title || '')
        .join(' ');
      const haystack = [task.title, task.startDate, task.endDate, task.status, dependencyTitles]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [sortedTasks, taskSearchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    setTaskSearchQuery('');
    setIsDescriptionExpanded(false);
    setStartWorkRequest(0);
  }, [isOpen, milestone?.id]);

  const handleDelete = () => {
    if (!milestone || !onDelete) return;
    onDelete(milestone.id);
    setDeleteConfirmOpen(false);
  };

  const handleCopyMilestoneDetails = async () => {
    if (!milestone || !summary) return;

    const text = formatMilestoneDetailsForClipboard({
      milestoneId: milestone.id,
      title: milestone.title,
      projectLabels: milestoneProjects.map(project => project.name),
      healthLabel: healthVisual?.label || '',
      completionLabel: `${summary.completionPercent}% (${summary.completedTasks} of ${summary.totalTasks} tasks)`,
      dateRangeLabel: getMilestoneDateRangeLabel(milestone),
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
    if (!milestone || !summary || !window.electron?.tasks?.exportPdf || isExportingPdf) return;

    setIsExportingPdf(true);

    const html = buildMilestonePdfExportHtml({
      milestoneId: milestone.id,
      title: milestone.title,
      exportedAt: new Date().toISOString(),
      projectLabels: milestoneProjects.map(project => project.name),
      summaryFields: [
        { label: 'Health', value: healthVisual?.label || '' },
        { label: 'Completion', value: `${summary.completionPercent}% (${summary.completedTasks} of ${summary.totalTasks} tasks)` },
        { label: 'Date Range', value: getMilestoneDateRangeLabel(milestone) },
        { label: 'Late Tasks', value: summary.lateTasks.length > 0 ? summary.lateTasks.length : 'None' },
      ],
      notes: milestone.notes,
      linkedTasks: sortedTasks.map(task => {
        const dependencyTasks = (task.dependencyIds || [])
          .map(dependencyId => sortedTasks.find(item => item.id === dependencyId))
          .filter((item): item is Task => Boolean(item));
        const detailParts = [formatDateRangeLabel(task.startDate || 'No start', task.endDate || 'No end')];
        if (dependencyTasks.length > 0) {
          detailParts.push(`Depends on ${dependencyTasks.map(item => item.title).join(', ')}`);
        }
        return {
          title: task.title,
          detail: detailParts.join(' | '),
          badge: getStatusLabel(statusColumns, task.status),
        };
      }),
    });

    try {
      await exportPdfDocument({
        html,
        defaultFileName: createMilestonePdfFileName(milestone.title),
        entityLabel: 'milestone',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogSurface
          showClose={false}
          overlayClassName="omvra-settings-overlay"
          className="h-[min(1600px,calc(100vh-2rem))] w-[min(837px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-[28px] border border-black/5 bg-white p-0 shadow-[0_14px_28px_rgba(0,0,0,0.1),0_-6px_12px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.1)] sm:max-w-none"
        >
          <div className="sr-only">
            <DialogTitle>{milestone?.title || 'Roadmap milestone'}</DialogTitle>
            <DialogDescription>Review milestone details, linked tasks, and dependency context.</DialogDescription>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/6 px-8 py-5">
            <div className="min-w-0">
              <h2 className="break-words text-[18px] font-normal tracking-[-0.02em] text-[#71717a] [overflow-wrap:anywhere]">
                {milestone?.title || 'Roadmap milestone'}
              </h2>
            </div>
            <div className="ml-0 shrink-0 sm:ml-4">
              <TaskDetailsActionMenu
                copyState={copyState}
                canEdit={Boolean(milestone)}
                canExportPdf={Boolean(window.electron?.tasks?.exportPdf && !isExportingPdf)}
                menuLabel="Milestone actions"
                copyLabel="Copy info"
                exportLabel="Export details"
                onEdit={milestone ? () => onEdit(milestone) : undefined}
                onCopy={handleCopyMilestoneDetails}
                onExportPdf={handleExportPdf}
                onStartWork={() => setStartWorkRequest(request => request + 1)}
              />
            </div>
          </div>

          {milestone && summary && (
            <DialogSurfaceBody className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto bg-white px-8 py-8">
              <MilestoneSummaryCard
                projects={milestoneProjects}
                summary={summary}
                statusColumns={statusColumns}
                startDate={milestone.startDate}
                endDate={milestone.endDate}
              />

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[14px] font-semibold text-[#71717a]">Description</h3>
                  {isLongDescription ? (
                    <button
                      type="button"
                      className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-[#71717a] hover:bg-[#71717a]/5"
                      onClick={() => setIsDescriptionExpanded(value => !value)}
                    >
                      {isDescriptionExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  ) : null}
                </div>
                <DialogSurfaceSection className={`relative overflow-hidden rounded-[12px] border border-black/10 bg-white px-4 py-4 shadow-none ${isLongDescription && !isDescriptionExpanded ? 'max-h-[300px]' : ''}`}>
                  {normalizedNotes ? (
                    <MarkdownContent content={normalizedNotes} />
                  ) : (
                    <div className="text-[12px] leading-6 text-[#6a7282]">No description provided.</div>
                  )}
                </DialogSurfaceSection>
                {isLongDescription && !isDescriptionExpanded && (
                  <div className="-mt-[30px] h-8 rounded-b-xl bg-gradient-to-b from-white/0 to-white" aria-hidden="true" />
                )}
              </section>

              {sortedTasks.length > 0 && filteredTasks.length === 0 ? (
                <section className="space-y-6">
                  <h3 className="text-[14px] font-semibold text-[#71717a]">Dependencies</h3>
                  <div className="space-y-1">
                    <label htmlFor="milestone-task-search" className="text-[12px] font-medium text-[#71717a]">
                      Search task:
                    </label>
                    <Input
                      id="milestone-task-search"
                      value={taskSearchQuery}
                      onChange={(event) => setTaskSearchQuery(event.target.value)}
                      placeholder="Task name"
                      className="h-10 rounded-[12px] border-black/10 bg-white text-sm font-normal text-[#4a4a4f] shadow-none placeholder:text-[#b5b5ba] focus-visible:ring-[#71717a]/15"
                    />
                  </div>
                  <EmptyStateCard
                    compact
                    title="No linked tasks match this search"
                    description="Try a different task title or dependency keyword."
                  />
                </section>
              ) : (
                <MilestoneLinkedTasksSection
                  tasks={filteredTasks}
                  lateTaskIds={lateTaskIds}
                  statusColumns={statusColumns}
                  searchQuery={taskSearchQuery}
                  onSearchQueryChange={setTaskSearchQuery}
                  onTaskClick={onTaskClick}
                />
              )}
            </DialogSurfaceBody>
          )}
          {milestone && <MilestoneExecutionAction milestone={milestone} tasks={tasks} projects={milestoneProjects} trigger={null} openRequest={startWorkRequest} />}

          <DialogSurfaceFooter className="border-t-0 bg-white px-8 pb-6 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          </DialogSurfaceFooter>
        </DialogSurface>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogSurface
          showClose={false}
          overlayClassName="omvra-settings-overlay"
          className="max-w-[430px] rounded-[28px] border border-black/5 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
        >
          <DialogSurfaceHeader
            title="Delete milestone?"
            description="This removes the milestone and clears milestone-linked dependency wiring from the affected tasks."
            className="border-b-0"
          />
          <DialogSurfaceFooter className="border-t-0 bg-white pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              className="h-8 rounded-[12px] border border-[#f0c8c8] bg-[#fbeaea] px-4 text-[14px] font-normal text-[#ff0000] shadow-none hover:bg-[#f7dddd] hover:text-[#ff0000]"
            >
              Delete milestone
            </Button>
          </DialogSurfaceFooter>
        </DialogSurface>
      </Dialog>
    </>
  );
}
