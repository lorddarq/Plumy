import { useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { Person, TaskCollaborationV1, TaskContributionV1 } from '../types';
import { buildTaskAssignmentValue, getDefaultTaskContributionScope, getEffectiveTaskOrchestratorId, isEligibleTaskContributor, type TaskAssignmentValue } from '../utils/taskAssignment';
import { AgentIcon } from './icons/AgentIcon';
import { UserIcon } from './icons/UserIcon';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TaskCheckboxControl } from './TaskCheckboxControl';
import { taskEditFieldClassName, taskEditLabelClassName, taskEditSelectClassName } from './taskFormStyles';

const ACTIVE_CONTRIBUTION_STATES = new Set<TaskContributionV1['state']>([
  'working',
  'submitted',
  'revision-requested',
  'accepted',
  'blocked',
]);

function cloneContributions(value?: TaskCollaborationV1): TaskContributionV1[] {
  return value?.contributions.map(contribution => ({
    ...contribution,
    evidenceRefs: contribution.evidenceRefs ? [...contribution.evidenceRefs] : undefined,
  })) ?? [];
}

function createContribution(person: Person): TaskContributionV1 {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const roleScope = getDefaultTaskContributionScope(person);
  return {
    id: `contribution-${uuid}`,
    personId: person.id,
    role: 'subagent',
    scope: roleScope,
    scopeSource: roleScope ? 'person-role' : undefined,
    state: 'pending',
  };
}

function usesPersonRoleScope(contribution: TaskContributionV1, person?: Person): boolean {
  if (person?.kind !== 'agentic' || !person.role.trim()) return false;
  return contribution.scopeSource === 'person-role' || contribution.scope.trim() === person.role.trim();
}

interface TaskAssignmentPopoverProps {
  value: TaskAssignmentValue;
  people: Person[];
  onApply: (value: TaskAssignmentValue) => void;
  onOpenChange?: (open: boolean) => void;
  loading?: boolean;
  conflictMessage?: string;
  onReload?: () => void;
}

export function TaskAssignmentPopover({ value, people, onApply, onOpenChange, loading = false, conflictMessage, onReload }: TaskAssignmentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [draftContributions, setDraftContributions] = useState<TaskContributionV1[]>([]);
  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);
  const orchestratorId = getEffectiveTaskOrchestratorId(value);
  const orchestrator = orchestratorId ? peopleById.get(orchestratorId) : undefined;
  const canDelegate = orchestrator?.kind === 'agentic';
  const persistedContributions = value.collaboration?.contributions ?? [];
  const hasActiveContributions = persistedContributions.some(contribution => ACTIVE_CONTRIBUTION_STATES.has(contribution.state));
  const selectedPersonIds = useMemo(
    () => new Set(draftContributions.map(contribution => contribution.personId)),
    [draftContributions],
  );
  const candidates = useMemo(
    () => people.filter(person => person.id !== orchestratorId && isEligibleTaskContributor(person)),
    [orchestratorId, people],
  );
  const hasBlankScope = draftContributions.some(contribution => {
    const person = peopleById.get(contribution.personId);
    return !((usesPersonRoleScope(contribution, person) ? person?.role : contribution.scope) || '').trim();
  });
  const hasMissingPerson = draftContributions.some(contribution => !peopleById.has(contribution.personId));
  const hasInvalidContributor = draftContributions.some(contribution => {
    const person = peopleById.get(contribution.personId);
    return Boolean(person && (person.kind !== 'agentic' || contribution.role !== 'subagent'));
  });
  const canApply = canDelegate && !loading && !conflictMessage && !hasBlankScope && !hasMissingPerson && !hasInvalidContributor;
  const hasEligibleAgents = candidates.some(person => person.kind === 'agentic');

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftContributions(cloneContributions(value.collaboration));
      setPortalContainer(triggerRef.current?.closest('[data-slot="dialog-content"]') as HTMLElement | null);
    }
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const closePopover = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  const updateOrchestrator = (nextId: string) => {
    if (hasActiveContributions && nextId !== orchestratorId) return;
    const nextOrchestratorId = nextId === 'unassigned' ? undefined : nextId;
    const nextOrchestrator = nextOrchestratorId ? peopleById.get(nextOrchestratorId) : undefined;
    const contributions = nextOrchestrator?.kind === 'agentic'
      ? persistedContributions.filter(contribution => contribution.personId !== nextOrchestratorId)
      : [];
    onApply(buildTaskAssignmentValue(nextOrchestratorId, contributions));
  };

  const toggleContributor = (person: Person, checked: boolean) => {
    if (checked) {
      if (!canDelegate || selectedPersonIds.has(person.id)) return;
      setDraftContributions(previous => [...previous, createContribution(person)]);
      return;
    }

    const contribution = draftContributions.find(item => item.personId === person.id);
    if (!contribution || contribution.state !== 'pending') return;
    setDraftContributions(previous => previous.filter(item => item.personId !== person.id));
  };

  const removeContributor = (contribution: TaskContributionV1) => {
    if (contribution.state !== 'pending') return;
    setDraftContributions(previous => previous.filter(item => item.id !== contribution.id));
  };

  const updateScope = (contributionId: string, scope: string) => {
    setDraftContributions(previous => previous.map(contribution => (
      contribution.id === contributionId ? { ...contribution, scope, scopeSource: undefined } : contribution
    )));
  };

  const handleApply = () => {
    if (!canApply || !orchestratorId) return;
    const resolvedContributions = draftContributions.map(contribution => {
      const person = peopleById.get(contribution.personId);
      return usesPersonRoleScope(contribution, person)
        ? { ...contribution, scope: person!.role.trim(), scopeSource: 'person-role' }
        : contribution;
    });
    onApply(buildTaskAssignmentValue(orchestratorId, resolvedContributions));
    closePopover();
  };

  const contributorCount = persistedContributions.length;
  const contributorLabel = contributorCount === 0
    ? 'No contributors'
    : `${contributorCount} ${contributorCount === 1 ? 'contributor' : 'contributors'}`;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-x-2 gap-y-3 md:grid-cols-2">
        <div className="space-y-1">
          <div className="flex min-h-5 items-center justify-between gap-2">
            <Label htmlFor="task-assignee" className={taskEditLabelClassName}>Assignee</Label>
            {orchestrator?.kind === 'agentic' && (
              <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px] font-semibold text-[#71717a]">Overseer</Badge>
            )}
          </div>
          <Select value={orchestratorId ?? 'unassigned'} onValueChange={updateOrchestrator} disabled={loading || Boolean(conflictMessage)}>
            <SelectTrigger id="task-assignee" className={taskEditSelectClassName}>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned" disabled={hasActiveContributions}>Unassigned</SelectItem>
              {people.map(person => {
                const PersonIcon = person.kind === 'agentic' ? AgentIcon : UserIcon;
                return (
                  <SelectItem
                    key={person.id}
                    value={person.id}
                    disabled={hasActiveContributions && person.id !== orchestratorId}
                  >
                    <PersonIcon className="size-4 text-[#8a8a91]" aria-hidden="true" />
                    {person.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className={taskEditLabelClassName}>Contributors</Label>
          <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
              <button
                ref={triggerRef}
                type="button"
                aria-label={canDelegate ? `Contributors: ${contributorLabel}` : 'Contributors unavailable: no agentic assignee'}
                aria-expanded={open}
                aria-busy={loading}
                disabled={!canDelegate || loading || Boolean(conflictMessage)}
                className={`${taskEditSelectClassName} flex w-full items-center justify-between gap-2 text-left`}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <AgentIcon className="size-4 shrink-0 text-[#8a8a91]" aria-hidden="true" />
                  <span className="truncate">{canDelegate ? contributorLabel : 'No agentic assignee'}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-[#8a8a91]" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              container={portalContainer}
              align="end"
              sideOffset={6}
              collisionPadding={16}
              onKeyDown={event => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                closePopover();
                window.requestAnimationFrame(() => triggerRef.current?.focus());
              }}
              className="flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border-black/10 p-0 shadow-[0_16px_40px_rgba(0,0,0,0.14)]"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-[#27272a]">Contributors</h3>
                  <p className="text-xs leading-5 text-[#71717a]">Choose people for {orchestrator?.name ?? 'the overseer'} to coordinate.</p>
                </div>

                <fieldset className="mt-4 space-y-2">
                  <legend className="sr-only">Available contributors</legend>
                  <div className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-1">
                    {candidates.length > 0 ? candidates.map(person => {
                      const contribution = draftContributions.find(item => item.personId === person.id);
                      const isActive = Boolean(contribution && ACTIVE_CONTRIBUTION_STATES.has(contribution.state));
                      return (
                        <label key={person.id} className="flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-[#52525b] hover:bg-white">
                          <TaskCheckboxControl
                            checked={Boolean(contribution)}
                            disabled={isActive}
                            ariaLabel={`Select ${person.name} as contributor`}
                            onCheckedChange={checked => toggleContributor(person, checked)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-[#3f3f46]">{person.name}</span>
                            <span className="block truncate text-[11px] text-[#8a8a91]">{person.role.trim() || 'Eligible agent'}</span>
                          </span>
                        </label>
                      );
                    }) : (
                      <p className="px-3 py-4 text-xs leading-5 text-[#71717a]">No contributors are available for this overseer.</p>
                    )}
                  </div>
                  {!hasEligibleAgents && people.some(person => person.kind === 'agentic') && (
                    <p className="text-[11px] leading-4 text-[#71717a]">No agents are available for new delegation. Enable eligibility in Agent settings.</p>
                  )}
                </fieldset>

                {draftContributions.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <div className="text-xs font-semibold text-[#52525b]">Selected contributors</div>
                    {draftContributions.map(contribution => {
                      const person = peopleById.get(contribution.personId);
                      const canRemove = contribution.state === 'pending';
                      const roleProvidesScope = usesPersonRoleScope(contribution, person);
                      return (
                        <div key={contribution.id} className="min-w-0 rounded-xl border border-black/[0.08] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-[#3f3f46]">{person?.name ?? 'Unavailable person'}</div>
                              <div className="text-[11px] text-[#8a8a91]">{person ? (contribution.role === 'subagent' ? 'Subagent' : 'Human contributor') : contribution.personId}</div>
                            </div>
                            <Badge variant="outline" className="shrink-0 capitalize text-[10px]">{contribution.state.replace('-', ' ')}</Badge>
                            <button
                              type="button"
                              onClick={() => removeContributor(contribution)}
                              disabled={!canRemove}
                              aria-label={`Remove ${person?.name ?? 'unavailable person'} from contributors`}
                              title={canRemove ? `Remove ${person?.name ?? 'contributor'}` : 'Resolve this contribution in Collaboration before removing it'}
                              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[#8a8a91] transition-[background-color,color] hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <X className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                          {roleProvidesScope ? (
                            <div className="mt-3 rounded-lg bg-black/[0.025] px-3 py-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8a91]">Scope from role</div>
                              <div className="mt-0.5 text-xs leading-5 text-[#52525b]">{person!.role.trim()}</div>
                            </div>
                          ) : (
                            <>
                              <Label htmlFor={`contribution-scope-${contribution.id}`} className="mt-3 text-[11px] font-medium text-[#71717a]">Scope</Label>
                              <Input
                                id={`contribution-scope-${contribution.id}`}
                                value={contribution.scope}
                                onChange={event => updateScope(contribution.id, event.target.value)}
                                placeholder="Define this contributor's task-specific responsibility"
                                aria-invalid={!contribution.scope.trim()}
                                aria-describedby={!contribution.scope.trim() ? `contribution-scope-error-${contribution.id}` : undefined}
                                className={`${taskEditFieldClassName} mt-1 w-full`}
                              />
                              {!contribution.scope.trim() && (
                                <p id={`contribution-scope-error-${contribution.id}`} className="mt-1 text-[11px] text-red-600">Scope is required when the contributor has no reusable role.</p>
                              )}
                            </>
                          )}
                          {!person && (
                            <p className="mt-1 text-[11px] text-red-600">This person is unavailable. Remove the pending contribution or restore the person before applying.</p>
                          )}
                          {person?.kind === 'agentic' && person.availableForSubagentDelegation !== true && (
                            <p className="mt-1 text-[11px] text-amber-700">Unavailable for new delegation. Existing work is preserved.</p>
                          )}
                          {person?.kind === 'human' && (
                            <p className="mt-1 text-[11px] text-red-600">Human contributors are not supported. Remove this contribution before applying.</p>
                          )}
                          {!canRemove && (
                            <p className="mt-1 text-[11px] text-[#71717a]">Resolve {contribution.state.replace('-', ' ')} work in Collaboration before removing it.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-black/[0.07] bg-[#fafafa] px-4 py-3">
                <Button type="button" variant="ghost" size="sm" onClick={closePopover}>Cancel</Button>
                <Button type="button" size="sm" onClick={handleApply} disabled={!canApply}>Apply</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {hasActiveContributions && (
        <p className="text-[11px] leading-4 text-[#71717a]">Resolve active contributor work before changing the assignee.</p>
      )}
      {conflictMessage && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>{conflictMessage}</span>
          {onReload && <Button type="button" variant="outline" size="sm" onClick={onReload}>Reload</Button>}
        </div>
      )}
    </div>
  );
}
