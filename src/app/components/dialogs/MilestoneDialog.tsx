import { CalendarDays, ChevronsUpDown, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProjectMilestone, StatusColumn, Task, TimelineSwimlane } from '../../types';
import { resolveProjectColor } from '../../utils/projectVisual';
import { getMilestoneProjectIds, getTaskProjectIds, wouldCreateDependencyCycle } from '../../utils/roadmap';
import type { WorkspaceReadModel } from '../../domain/workspaceReadModel';
import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DialogSurface, DialogSurfaceFooter } from './DialogSurface';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { EmptyStateCard } from '../EmptyStateCard';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { MagnifierIcon } from '../icons/MagnifierIcon';
import { MilestoneTaskLinker } from '../MilestoneSections';
import { FeatheredScrollList } from '../FeatheredScrollList';
import { ProjectBadge } from '../ProjectBadge';
import { FolderIcon } from '../icons/FolderIcon';
import { TaskCheckboxControl } from '../TaskCheckboxControl';
import { Textarea } from '../ui/textarea';
import {
  taskEditFieldClassName,
  taskEditIconFieldClassName,
  taskEditIconSelectClassName,
  taskEditLabelClassName,
} from '../taskFormStyles';

const milestoneDialogProjectListClassName = 'max-h-36 rounded-[18px] border border-black/[0.06] bg-white p-0 shadow-[0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)]';

interface MilestoneDialogProps {
  isOpen: boolean;
  milestone?: ProjectMilestone | null;
  projects: TimelineSwimlane[];
  statusColumns: StatusColumn[];
  tasks: Task[];
  readModel?: WorkspaceReadModel;
  onClose: () => void;
  onSave: (milestone: ProjectMilestone) => void;
  onUpdateTaskDependencies?: (updates: Array<{ taskId: string; dependencyIds: string[] }>) => void;
  onDelete?: (milestoneId: string) => void;
}

export function MilestoneDialog({
  isOpen,
  milestone,
  projects,
  statusColumns,
  tasks,
  readModel,
  onClose,
  onSave,
  onUpdateTaskDependencies,
  onDelete,
}: MilestoneDialogProps) {
  const defaultProjectId = projects[0]?.id || '';
  const [title, setTitle] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>(defaultProjectId ? [defaultProjectId] : []);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([]);
  const [dependencyIdsByTaskId, setDependencyIdsByTaskId] = useState<Record<string, string[]>>({});
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    setTitle(milestone?.title || '');
    setProjectIds(milestone ? getMilestoneProjectIds(milestone) : defaultProjectId ? [defaultProjectId] : []);
    setStartDate(milestone?.startDate || '');
    setEndDate(milestone?.endDate || '');
    setNotes(milestone?.notes || '');
    const firstProjectId = milestone ? getMilestoneProjectIds(milestone)[0] : defaultProjectId;
    setColor(milestone?.color || resolveProjectColor(projects.find(project => project.id === firstProjectId)));
    setLinkedTaskIds(milestone?.linkedTaskIds || []);
    setDependencyIdsByTaskId(
      Object.fromEntries(tasks.map(task => [task.id, Array.isArray(task.dependencyIds) ? task.dependencyIds : []]))
    );
    setTaskSearchQuery('');
    setProjectSearchQuery('');
  }, [isOpen, milestone?.id]);

  const projectTasks = useMemo(() => {
    if (readModel) {
      return readModel.tasks
        .filter(task => task.projects.some(project => projectIds.includes(project.id)))
        .map(task => task.task);
    }

    return tasks.filter(task => {
      return getTaskProjectIds(task).some(projectId => projectIds.includes(projectId));
    });
  }, [projectIds, readModel, tasks]);
  const filteredProjectTasks = useMemo(() => {
    const normalizedSearch = taskSearchQuery.trim().toLowerCase();
    if (!normalizedSearch) return projectTasks;

    return projectTasks.filter(task => {
      const projectLabels = getTaskProjectIds(task)
        .map(projectId => projects.find(project => project.id === projectId)?.name)
        .filter(Boolean)
        .join(' ');
      const haystack = [
        task.title,
        task.notes,
        task.status,
        projectLabels,
      ].join(' ').toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [projectTasks, projects, taskSearchQuery]);

  const normalizedProjectSearchQuery = projectSearchQuery.trim().toLowerCase();
  const filteredProjects = useMemo(
    () => normalizedProjectSearchQuery
      ? projects.filter(project => project.name.toLowerCase().includes(normalizedProjectSearchQuery))
      : projects,
    [normalizedProjectSearchQuery, projects]
  );
  const selectedProjects = useMemo(
    () => projectIds
      .map(projectId => projects.find(project => project.id === projectId))
      .filter((project): project is TimelineSwimlane => Boolean(project)),
    [projectIds, projects]
  );
  const selectedProjectChips = selectedProjects.slice(0, 2);
  const remainingSelectedProjectCount = selectedProjects.length - selectedProjectChips.length;

  const toggleProject = (projectId: string) => {
    setProjectIds(prev => {
      const nextProjectIds = prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId];
      const nextProjectIdSet = new Set(nextProjectIds);

      setLinkedTaskIds(previousTaskIds =>
        previousTaskIds.filter(taskId => {
          const task = tasks.find(item => item.id === taskId);
          if (!task) return false;
          return getTaskProjectIds(task).some(id => nextProjectIdSet.has(id));
        })
      );

      return nextProjectIds;
    });
  };

  const toggleTask = (taskId: string) => {
    setLinkedTaskIds(prev => {
      if (!prev.includes(taskId)) return [...prev, taskId];

      const nextLinkedTaskIds = prev.filter(id => id !== taskId);
      setDependencyIdsByTaskId(previousMap => {
        const nextMap = { ...previousMap };
        delete nextMap[taskId];
        Object.keys(nextMap).forEach(dependentTaskId => {
          nextMap[dependentTaskId] = (nextMap[dependentTaskId] || []).filter(id => id !== taskId);
        });
        return nextMap;
      });
      return nextLinkedTaskIds;
    });
  };

  const toggleDependency = (taskId: string, dependencyId: string) => {
    if (taskId === dependencyId) return;
    setDependencyIdsByTaskId(prev => {
      const currentDependencyIds = prev[taskId] || [];
      const isRemoving = currentDependencyIds.includes(dependencyId);
      const nextDependencyIds = isRemoving
        ? currentDependencyIds.filter(id => id !== dependencyId)
        : [...currentDependencyIds, dependencyId];

      if (
        !isRemoving
        && wouldCreateDependencyCycle(taskId, dependencyId, currentTaskId => {
          if (currentTaskId === taskId) return nextDependencyIds;
          return prev[currentTaskId] || [];
        })
      ) {
        return prev;
      }

      return {
        ...prev,
        [taskId]: nextDependencyIds,
      };
    });
  };

  const wouldCreateTaskDependencyCycle = (taskId: string, dependencyId: string): boolean =>
    wouldCreateDependencyCycle(taskId, dependencyId, currentTaskId => {
      if (currentTaskId === taskId) {
        const currentDependencyIds = dependencyIdsByTaskId[taskId] || [];
        return currentDependencyIds.includes(dependencyId)
          ? currentDependencyIds
          : [...currentDependencyIds, dependencyId];
      }
      return dependencyIdsByTaskId[currentTaskId] || [];
    });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || projectIds.length === 0 || !endDate) return;

    const sanitizedLinkedTaskIds = linkedTaskIds.filter(taskId =>
      projectTasks.some(task => task.id === taskId)
    );

    onUpdateTaskDependencies?.(
      sanitizedLinkedTaskIds.map(taskId => ({
        taskId,
        dependencyIds: (dependencyIdsByTaskId[taskId] || []).filter(
          dependencyId => dependencyId !== taskId && sanitizedLinkedTaskIds.includes(dependencyId)
        ),
      }))
    );

    onSave({
      id: milestone?.id || Date.now().toString(),
      convexId: milestone?.convexId,
      title: title.trim(),
      projectIds,
      projectId: projectIds[0],
      startDate: startDate || undefined,
      endDate,
      notes: notes.trim() || undefined,
      color,
      linkedTaskIds: sanitizedLinkedTaskIds,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogSurface
        showClose={false}
        overlayClassName="omvra-settings-overlay"
        className="h-[min(920px,calc(100vh-2rem))] w-[min(837px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-[28px] border border-black/5 bg-white p-0 shadow-[0_14px_28px_rgba(0,0,0,0.10),0_-6px_12px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.10)] sm:max-w-none"
      >
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <div className="sr-only">
            <DialogTitle>{milestone ? 'Edit Milestone' : 'Create Milestone'}</DialogTitle>
            <DialogDescription>
              Milestones can be scoped to one product or span multiple projects under a shared release frame.
            </DialogDescription>
          </div>
          <div className="flex items-start border-b border-black/6 px-8 py-5">
            <div className="min-w-0">
              <h2 className="break-words text-[18px] font-normal tracking-[-0.02em] text-[#71717a] [overflow-wrap:anywhere]">
                {milestone ? 'Edit Milestone' : 'Create Milestone'}
              </h2>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-8 py-8">
            <section className="space-y-6">
              <h3 className="text-[14px] font-semibold text-[#71717a]">Basic Information</h3>

              <div className="grid grid-cols-1 gap-x-5 gap-y-5 md:grid-cols-[88px_minmax(0,1.1fr)_minmax(0,0.85fr)_minmax(0,0.85fr)]">
                <div className="space-y-1 md:w-[88px]">
                  <Label htmlFor="milestone-color" className={taskEditLabelClassName}>Color</Label>
                  <Input
                    id="milestone-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="h-8 w-full rounded-[14px] border border-black/10 bg-white p-1 shadow-[0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)] md:min-w-[88px]"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="milestone-title" className={taskEditLabelClassName}>Milestone Name</Label>
                  <Input
                    id="milestone-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Name"
                    className={taskEditFieldClassName}
                    required
                  />
                </div>

                <MilestoneDateSelectField
                  id="milestone-start"
                  label="Start Date:"
                  value={startDate}
                  onChange={setStartDate}
                />

                <MilestoneDateSelectField
                  id="milestone-end"
                  label="End Date:"
                  value={endDate}
                  onChange={setEndDate}
                />
              </div>

              <div className="max-w-[300px] space-y-1">
                <Label htmlFor="project-search" className={taskEditLabelClassName}>Search Project:</Label>
                <div className="relative">
                  <MagnifierIcon className="pointer-events-none absolute left-2 top-1/2 z-10 size-[18px] -translate-y-1/2" />
                  <Input
                    type="search"
                    id="project-search"
                    value={projectSearchQuery}
                    onChange={(event) => setProjectSearchQuery(event.target.value)}
                    placeholder="Search projects..."
                    className={taskEditIconFieldClassName}
                  />
                </div>
              </div>

              <FeatheredScrollList
                className={milestoneDialogProjectListClassName}
                scrollClassName="max-h-36"
              >
                {filteredProjects.length > 0 ? (
                  filteredProjects.map(project => {
                    const isChecked = projectIds.includes(project.id);

                    return (
                      <label
                        key={project.id}
                        className="flex h-10 cursor-pointer items-center gap-2 border-b border-black/[0.06] px-3 last:border-b-0 hover:bg-[#71717a]/5"
                      >
                        <TaskCheckboxControl
                          checked={isChecked}
                          ariaLabel={`Select ${project.name}`}
                          onCheckedChange={() => toggleProject(project.id)}
                        />
                        <FolderIcon className="size-4 shrink-0 text-[#71717a]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#3f3f46]">
                          {project.name}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <EmptyStateCard
                    compact
                    icon={<FolderIcon className="size-4 text-[#71717a]" />}
                    title={`No projects match "${projectSearchQuery}"`}
                    description="Try a different project name or clear the search to see all available projects."
                  />
                )}
              </FeatheredScrollList>

              <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-sm font-medium text-[#71717a]">
                <span>Projects:</span>
                {selectedProjectChips.length > 0 ? (
                  <>
                    {selectedProjectChips.map(project => (
                      <Badge
                        key={project.id}
                        variant="outline"
                        className="max-w-[180px] rounded-full border-black/10 bg-[#71717a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#71717a]"
                        title={project.name}
                      >
                        <span className="truncate">{project.name}</span>
                      </Badge>
                    ))}
                    {remainingSelectedProjectCount > 0 ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-black/10 bg-[#71717a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#71717a]"
                      >
                        {remainingSelectedProjectCount} More
                      </Badge>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[#a1a1aa]">None</span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor="milestone-notes" className="text-[14px] font-semibold text-[#71717a]">Goals:</Label>
                  <span className="text-xs text-[#8a8a92]">Supports Markdown</span>
                </div>
                <Textarea
                  id="milestone-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Write a description in markdown..."
                  rows={5}
                  className="min-h-[190px] rounded-[24px] border-black/10 bg-white p-5 text-base font-medium leading-relaxed text-[#67676f] shadow-[0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)] placeholder:text-[#b5b5ba] focus-visible:ring-[#71717a]/15"
                />
              </div>
            </section>

            <div className="mt-10">
                <MilestoneTaskLinker
                  projectTasks={projectTasks}
                  filteredProjectTasks={filteredProjectTasks}
                  linkedTaskIds={linkedTaskIds}
                  dependencyIdsByTaskId={dependencyIdsByTaskId}
                  statusColumns={statusColumns}
                  taskSearchQuery={taskSearchQuery}
                  onTaskSearchQueryChange={setTaskSearchQuery}
                  onToggleTask={toggleTask}
                  onToggleDependency={toggleDependency}
                  wouldCreateDependencyCycle={wouldCreateTaskDependencyCycle}
                />
            </div>
          </div>

          <DialogSurfaceFooter className="border-t border-black/6 bg-white px-8 pb-6 pt-3">
            {milestone && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                className="mr-auto h-8 rounded-[12px] border border-[#f0c8c8] bg-[#fbeaea] px-4 text-[14px] font-normal text-[#ff0000] shadow-none hover:bg-[#f7dddd] hover:text-[#ff0000]"
              >
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || projectIds.length === 0 || !endDate}
            >
              {milestone ? 'Update' : 'Create'}
            </Button>
          </DialogSurfaceFooter>
        </form>
      </DialogSurface>

      <DeleteConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete milestone?"
        description="This removes the milestone and clears milestone-linked dependency wiring from the affected tasks."
        confirmLabel="Delete milestone"
        onOpenChange={setDeleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (!milestone || !onDelete) return;
          onDelete(milestone.id);
          setDeleteConfirmOpen(false);
          onClose();
        }}
      />
    </Dialog>
  );
}

interface MilestoneDateSelectFieldProps {
  id: string;
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}

function MilestoneDateSelectField({ id, label, value, min, onChange }: MilestoneDateSelectFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openDatePicker = () => {
    const input = inputRef.current;
    if (!input) return;

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={taskEditLabelClassName}>{label}</Label>
      <div
        role="button"
        tabIndex={0}
        aria-label={label.replace(':', '')}
        className={`${taskEditIconSelectClassName} cursor-pointer`}
        onClick={openDatePicker}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openDatePicker();
        }}
      >
        <CalendarDays className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[#71717a]" />
        <span className="min-w-0 flex-1 truncate text-[#67676f]">
          {value || 'Select date'}
        </span>
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[#71717a]" />
        <input
          ref={inputRef}
          id={id}
          type="date"
          value={value}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 opacity-0"
          aria-label={label.replace(':', '')}
        />
      </div>
    </div>
  );
}
