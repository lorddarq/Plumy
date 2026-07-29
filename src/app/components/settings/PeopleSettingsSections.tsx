import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { DesktopArrowDownIcon } from '../icons/DesktopArrowDownIcon';
import type { GoalRecord, Person, PersonKind, StatusColumn, Task, TaskStatus, TimelineSwimlane } from '../../types';
import { getStatusLabel, getTaskProjectIds } from '../../utils/roadmap';
import { getLoadPercentageForTasks, getTaskLoadPoints, PERSON_CAPACITY_POINTS } from '../../utils/taskLoad';
import { AnchoredPanelSection } from '../AnchoredPanel';
import { EmptyStateCard } from '../EmptyStateCard';
import { AgentCard, PersonCard } from '../PersonCards';
import { Button } from '../ui/button';
import { DeleteConfirmDialog } from '../dialogs/DeleteConfirmDialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { OverflowActionMenu } from '../OverflowActionMenu';
import { exportPdfDocument } from '../../utils/pdfExport';
import { buildPersonPdfExportHtml, buildPersonTaskExportListItem, createPersonPdfFileName } from '../../utils/personPdfExport';
import { AgentInstructionFields } from '../AgentInstructionFields';
import { AgentIcon } from '../icons/AgentIcon';
import { PenWritingIcon } from '../icons/PenWritingIcon';
import { UsersIcon } from '../icons/UsersIcon';
import { TrashIcon } from '../icons/TrashIcon';
import { buildAgentConfigurationFile, parseAgentConfigurationFile } from '../../utils/agentConfiguration';

interface PeopleManagementSectionsProps {
  people: Person[];
  tasks: Task[];
  projects: TimelineSwimlane[];
  statusColumns: StatusColumn[];
  executionLoadStatusIds: TaskStatus[];
  pipelineLoadStatusIds: TaskStatus[];
  onAddPerson: (person: Omit<Person, 'id'>) => void;
  onUpdatePerson: (personId: string, updates: Pick<Person, 'name' | 'role' | 'kind' | 'agentInstructions' | 'agentOperationalInstructions' | 'availableForSubagentDelegation'>) => void;
  onDeletePerson: (personId: string) => void;
}

type AddSection = 'people' | 'agents';

const SETTINGS_POPOVER_FIELD_CLASS = 'h-8 rounded-xl border-black/10 bg-white/10 px-2 text-sm font-normal text-[#303038] caret-[#303038] placeholder:text-[#b5b5ba] focus-visible:ring-gray-300';
const SETTINGS_POPOVER_PROMPT_CLASS = 'max-h-[min(220px,32vh)] min-h-[125px] resize-none overflow-y-auto rounded-xl border-black/10 bg-white/10 p-3 text-sm font-normal leading-5 text-[#303038] caret-[#303038] placeholder:text-[#b5b5ba] focus-visible:ring-gray-300';

export function PeopleManagementSections({
  people,
  tasks,
  projects,
  statusColumns,
  executionLoadStatusIds,
  pipelineLoadStatusIds,
  onAddPerson,
  onUpdatePerson,
  onDeletePerson,
}: PeopleManagementSectionsProps) {
  const [addingSection, setAddingSection] = useState<AddSection | null>(null);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newKind, setNewKind] = useState<PersonKind>('human');
  const [newAgentInstructions, setNewAgentInstructions] = useState('');
  const [newAgentOperationalInstructions, setNewAgentOperationalInstructions] = useState('');
  const [newAvailableForSubagentDelegation, setNewAvailableForSubagentDelegation] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editKind, setEditKind] = useState<PersonKind>('human');
  const [editAgentInstructions, setEditAgentInstructions] = useState('');
  const [editAgentOperationalInstructions, setEditAgentOperationalInstructions] = useState('');
  const [editAvailableForSubagentDelegation, setEditAvailableForSubagentDelegation] = useState(false);
  const [pendingDeletePerson, setPendingDeletePerson] = useState<Person | null>(null);
  const [pendingDeleteImpact, setPendingDeleteImpact] = useState<{ taskCount: number; goalCount: number; goalNodeCount: number; goalTitles: string[]; loading: boolean } | null>(null);
  const [activeActionPersonId, setActiveActionPersonId] = useState<string | null>(null);
  const [exportingPersonId, setExportingPersonId] = useState<string | null>(null);
  const [exportingAgentConfigurations, setExportingAgentConfigurations] = useState(false);
  const configurationInputRef = useRef<HTMLInputElement>(null);

  function getTaskCountForPerson(personId: string, status?: string): number {
    return tasks.filter(task => {
      const matchesPerson = task.assigneeId === personId;
      const matchesStatus = status ? task.status === status : true;
      return matchesPerson && matchesStatus;
    }).length;
  }

  function getLoadPercentageForPerson(personId: string, statusIds: string[]): number {
    const selectedStatuses = new Set(statusIds);
    const personTasks = tasks.filter(task => task.assigneeId === personId && selectedStatuses.has(task.status));
    return getLoadPercentageForTasks(personTasks);
  }

  function getProjectLabelsForTask(task: Task): string[] {
    const labels = new Set<string>();
    getTaskProjectIds(task).forEach(projectId => {
      const projectName = projects.find(project => project.id === projectId)?.name;
      if (projectName) labels.add(projectName);
    });
    if (task.project?.trim()) {
      labels.add(task.project.trim());
    }
    return Array.from(labels);
  }

  async function handleExportPersonTasks(person: Person) {
    if (!window.electron?.tasks?.exportPdf || exportingPersonId === person.id) return;

    const assignedTasks = tasks.filter(task => task.assigneeId === person.id);
    const exportProjectLabels = new Set<string>();
    assignedTasks.forEach(task => {
      getProjectLabelsForTask(task).forEach(label => exportProjectLabels.add(label));
    });

    const html = buildPersonPdfExportHtml({
      person,
      exportedAt: new Date().toISOString(),
      projectLabels: Array.from(exportProjectLabels),
      summaryFields: [
        { label: 'Type', value: person.kind === 'agentic' ? 'Agent' : 'Human' },
        { label: 'Role', value: person.role || 'Team Member' },
        { label: 'Assigned Tasks', value: assignedTasks.length },
        { label: 'Execution Load', value: `${getLoadPercentageForPerson(person.id, executionLoadStatusIds)}%` },
        { label: 'Pipeline Load', value: `${getLoadPercentageForPerson(person.id, pipelineLoadStatusIds)}%` },
        { label: 'Load Points', value: `${assignedTasks.reduce((sum, task) => sum + getTaskLoadPoints(task), 0).toFixed(1)} / ${PERSON_CAPACITY_POINTS}` },
      ],
      assignedTasks: assignedTasks
        .slice()
        .sort((left, right) => {
          const leftStatus = getStatusLabel(statusColumns, left.status);
          const rightStatus = getStatusLabel(statusColumns, right.status);
          if (leftStatus !== rightStatus) return leftStatus.localeCompare(rightStatus);
          return left.title.localeCompare(right.title);
        })
        .map(task => buildPersonTaskExportListItem(task, {
          statusLabel: getStatusLabel(statusColumns, task.status),
          projectLabels: getProjectLabelsForTask(task),
        })),
    });

    setExportingPersonId(person.id);
    try {
      await exportPdfDocument({
        html,
        defaultFileName: createPersonPdfFileName(person.name),
        entityLabel: person.kind === 'agentic' ? 'agent' : 'person',
      });
    } finally {
      setExportingPersonId(null);
    }
  }

  async function handleExportAgentConfigurations() {
    if (!window.electron?.agentConfigurations?.export || exportingAgentConfigurations) return;
    setExportingAgentConfigurations(true);
    try {
      const result = await window.electron.agentConfigurations.export({
        json: JSON.stringify(buildAgentConfigurationFile(agenticPeople), null, 2),
        defaultFileName: 'omvra-agent-configurations.json',
      });
      if (result.success) {
        toast.success('Successfully exported', {
          description: `${agenticPeople.length} agent configuration${agenticPeople.length === 1 ? '' : 's'} saved to disk.`,
        });
      } else if (!result.canceled) {
        toast.error(result.error || 'Agent configurations could not be saved.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agent configurations could not be saved. Restart the app and try again.');
    } finally {
      setExportingAgentConfigurations(false);
    }
  }

  function handleImportAgentConfigurations() {
    configurationInputRef.current?.click();
  }

  async function handleConfigurationFile(file: File) {
    try {
      const parsed = parseAgentConfigurationFile(JSON.parse(await file.text()));
      if (parsed.ok === false) {
        toast.error(parsed.error);
        return;
      }
      let updated = 0;
      let added = 0;
      parsed.agents.forEach(configuration => {
        const target = (configuration.id && agenticPeople.find(person => person.id === configuration.id))
          || agenticPeople.find(person => person.name.toLowerCase() === configuration.name.toLowerCase());
        if (target) {
          onUpdatePerson(target.id, { ...configuration, kind: 'agentic' });
          updated += 1;
          return;
        }
        onAddPerson({ ...configuration, kind: 'agentic' });
        added += 1;
      });
      toast.success('Successfully imported', {
        description: `${updated} agent${updated === 1 ? '' : 's'} updated and ${added} added. Existing task assignments were kept.`,
      });
    } catch {
      toast.error('That file could not be read as JSON.');
    }
  }

  function resetAddForm(nextKind: PersonKind = 'human') {
    setNewName('');
    setNewRole('');
    setNewKind(nextKind);
    setNewAgentInstructions('');
    setNewAgentOperationalInstructions('');
    setNewAvailableForSubagentDelegation(false);
  }

  function startAdd(section: AddSection) {
    setAddingSection(section);
    resetAddForm(section === 'agents' ? 'agentic' : 'human');
  }

  function setAddOpen(section: AddSection, open: boolean) {
    if (open) {
      startAdd(section);
      return;
    }
    cancelAdd();
  }

  function cancelAdd() {
    setAddingSection(null);
    resetAddForm();
  }

  function handleAddPerson() {
    if (!newName.trim()) return;
    onAddPerson({
      name: newName.trim(),
      role: newRole.trim() || 'Team Member',
      kind: newKind,
      agentInstructions: newKind === 'agentic' ? newAgentInstructions.trim() || undefined : undefined,
      agentOperationalInstructions: newKind === 'agentic' ? newAgentOperationalInstructions.trim() || undefined : undefined,
      availableForSubagentDelegation: newKind === 'agentic' && newAvailableForSubagentDelegation,
    });
    cancelAdd();
  }

  function startEditPerson(person: Person) {
    setEditingPersonId(person.id);
    setEditName(person.name);
    setEditRole(person.role);
    setEditKind(person.kind === 'agentic' ? 'agentic' : 'human');
    setEditAgentInstructions(person.agentInstructions || '');
    setEditAgentOperationalInstructions(person.agentOperationalInstructions || '');
    setEditAvailableForSubagentDelegation(person.kind === 'agentic' && person.availableForSubagentDelegation === true);
  }

  function cancelEditPerson() {
    setEditingPersonId(null);
    setEditName('');
    setEditRole('');
    setEditKind('human');
    setEditAgentInstructions('');
    setEditAgentOperationalInstructions('');
    setEditAvailableForSubagentDelegation(false);
  }

  function saveEditedPerson(personId: string) {
    if (!editName.trim()) return;
    onUpdatePerson(personId, {
      name: editName.trim(),
      role: editRole.trim() || 'Team Member',
      kind: editKind,
      agentInstructions: editKind === 'agentic' ? editAgentInstructions.trim() || undefined : undefined,
      agentOperationalInstructions: editKind === 'agentic' ? editAgentOperationalInstructions.trim() || undefined : undefined,
      availableForSubagentDelegation: editKind === 'agentic' && editAvailableForSubagentDelegation,
    });
    cancelEditPerson();
  }

  async function requestDeletePerson(person: Person) {
    setPendingDeletePerson(person);
    setPendingDeleteImpact({ taskCount: getTaskCountForPerson(person.id), goalCount: 0, goalNodeCount: 0, goalTitles: [], loading: true });

    try {
      const storedGoals = await window.electron?.storeGet?.('omvra.goals.v1');
      const goals = Array.isArray(storedGoals) ? storedGoals as GoalRecord[] : [];
      const linkedGoals = goals.filter(goal => goal.elements?.some(element => element.assigneeId === person.id));
      setPendingDeleteImpact({
        taskCount: getTaskCountForPerson(person.id),
        goalCount: linkedGoals.length,
        goalNodeCount: linkedGoals.reduce((count, goal) => count + goal.elements.filter(element => element.assigneeId === person.id).length, 0),
        goalTitles: linkedGoals.slice(0, 3).map(goal => goal.title),
        loading: false,
      });
    } catch {
      setPendingDeleteImpact(current => current ? { ...current, loading: false } : current);
    }
  }

  function cancelDeletePerson() {
    setPendingDeletePerson(null);
    setPendingDeleteImpact(null);
  }

  const humanPeople = people.filter(person => person.kind !== 'agentic');
  const agenticPeople = people.filter(person => person.kind === 'agentic');

  function renderPersonItem(person: Person) {
    const totalTasks = getTaskCountForPerson(person.id);
    const isEditing = editingPersonId === person.id;
    const executionLoadPercentage = getLoadPercentageForPerson(person.id, executionLoadStatusIds);
    const pipelineLoadPercentage = getLoadPercentageForPerson(person.id, pipelineLoadStatusIds);
    const statusCounts = statusColumns
      .map(column => ({ column, count: getTaskCountForPerson(person.id, column.id) }))
      .filter(({ count }) => count > 0);
    const editInstructionsId = `person-agent-instructions-${person.id}`;
    const editOperationalInstructionsId = `person-agent-operational-instructions-${person.id}`;
    const displayActions = (
      <PersonCardActions
        open={isEditing}
        person={person}
        name={editName}
        role={editRole}
        kind={editKind}
        agentInstructions={editAgentInstructions}
        agentOperationalInstructions={editAgentOperationalInstructions}
        availableForSubagentDelegation={editAvailableForSubagentDelegation}
        agentInstructionsInputId={editInstructionsId}
        agentOperationalInstructionsInputId={editOperationalInstructionsId}
        onOpenChange={(open) => {
          if (open) {
            startEditPerson(person);
            setActiveActionPersonId(person.id);
            return;
          }
          cancelEditPerson();
          setActiveActionPersonId(current => (current === person.id ? null : current));
        }}
        onActionOpenChange={(open) => {
          setActiveActionPersonId(current => {
            if (open) return person.id;
            return current === person.id ? null : current;
          });
        }}
        onNameChange={setEditName}
        onRoleChange={setEditRole}
        onKindChange={setEditKind}
        onAgentInstructionsChange={setEditAgentInstructions}
        onAgentOperationalInstructionsChange={setEditAgentOperationalInstructions}
        onAvailableForSubagentDelegationChange={setEditAvailableForSubagentDelegation}
        onCancel={cancelEditPerson}
        onSubmit={() => saveEditedPerson(person.id)}
        onDelete={() => {
          void requestDeletePerson(person);
          setActiveActionPersonId(current => (current === person.id ? null : current));
        }}
        onExportPdf={() => {
          void handleExportPersonTasks(person);
        }}
        canExportPdf={Boolean(window.electron?.tasks?.exportPdf) && exportingPersonId !== person.id}
      />
    );

    const cardProps = {
      person,
      totalTasks,
      statusCounts,
      executionLoadPercentage,
      pipelineLoadPercentage,
      actions: displayActions,
    };

    return person.kind === 'agentic' ? (
      <AgentCard key={person.id} {...cardProps} />
    ) : (
      <PersonCard key={person.id} {...cardProps} />
    );
  }

  return (
    <>
      <PeopleSettingsSection
        empty={humanPeople.length === 0}
        popupOpen={
          addingSection === 'people'
          || humanPeople.some(person => person.id === editingPersonId || person.id === activeActionPersonId)
        }
        action={(
          <AddPersonPopover
            open={addingSection === 'people'}
            name={newName}
            role={newRole}
            onOpenChange={(open) => setAddOpen('people', open)}
            onNameChange={setNewName}
            onRoleChange={setNewRole}
            onCancel={cancelAdd}
            onSubmit={handleAddPerson}
          />
        )}
      >
        <div className="space-y-3">
          {humanPeople.map(renderPersonItem)}
        </div>
      </PeopleSettingsSection>

      <AgentsSettingsSection
        empty={agenticPeople.length === 0}
        popupOpen={
          addingSection === 'agents'
          || agenticPeople.some(person => person.id === editingPersonId || person.id === activeActionPersonId)
        }
        action={(
          <AddAgentPopover
            open={addingSection === 'agents'}
            name={newName}
            role={newRole}
            agentInstructions={newAgentInstructions}
            agentOperationalInstructions={newAgentOperationalInstructions}
            availableForSubagentDelegation={newAvailableForSubagentDelegation}
            onOpenChange={(open) => setAddOpen('agents', open)}
            onNameChange={setNewName}
            onRoleChange={setNewRole}
            onAgentInstructionsChange={setNewAgentInstructions}
            onAgentOperationalInstructionsChange={setNewAgentOperationalInstructions}
            onAvailableForSubagentDelegationChange={setNewAvailableForSubagentDelegation}
            onCancel={cancelAdd}
            onSubmit={handleAddPerson}
          />
        )}
        secondaryAction={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportAgentConfigurations}
              disabled={exportingAgentConfigurations}
              className="inline-flex h-8 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#67676f] outline-none hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              <Download className="size-4 shrink-0" />
              Export Agents
            </button>
            <button
              type="button"
              onClick={handleImportAgentConfigurations}
              className="inline-flex h-8 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#67676f] outline-none hover:bg-[#71717a]/5 focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              <Upload className="size-4 shrink-0" />
              Import Agents
            </button>
          </div>
        )}
      >
        <input
          ref={configurationInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleConfigurationFile(file);
            event.currentTarget.value = '';
          }}
        />
        <div className="space-y-3">
          {agenticPeople.map(renderPersonItem)}
        </div>
      </AgentsSettingsSection>

      <DeleteConfirmDialog
        isOpen={Boolean(pendingDeletePerson)}
        title={pendingDeletePerson?.kind === 'agentic' ? 'Delete agent?' : 'Delete person?'}
        description={
          pendingDeletePerson?.kind === 'agentic'
            ? pendingDeleteImpact?.loading
              ? 'Checking assigned work and Goal workflows…'
              : `This removes the agent and unassigns ${pendingDeleteImpact?.taskCount ?? getTaskCountForPerson(pendingDeletePerson.id)} task${(pendingDeleteImpact?.taskCount ?? 0) === 1 ? '' : 's'}. ${pendingDeleteImpact?.goalNodeCount ? `${pendingDeleteImpact.goalNodeCount} Goal node${pendingDeleteImpact.goalNodeCount === 1 ? '' : 's'} across ${pendingDeleteImpact.goalCount} workflow${pendingDeleteImpact.goalCount === 1 ? '' : 's'} will remain as missing-agent references${pendingDeleteImpact.goalTitles.length ? ` (${pendingDeleteImpact.goalTitles.join(', ')}${pendingDeleteImpact.goalCount > pendingDeleteImpact.goalTitles.length ? ', …' : ''})` : ''}.` : 'Existing Goal workflow references will be preserved as missing-agent references.'}`
            : `This removes the person and unassigns ${pendingDeleteImpact?.taskCount ?? (pendingDeletePerson ? getTaskCountForPerson(pendingDeletePerson.id) : 0)} task${(pendingDeleteImpact?.taskCount ?? 0) === 1 ? '' : 's'}.`
        }
        confirmLabel={pendingDeletePerson?.kind === 'agentic' ? 'Delete agent' : 'Delete person'}
        onOpenChange={(open) => {
          if (!open) cancelDeletePerson();
        }}
        onCancel={cancelDeletePerson}
        onConfirm={() => {
          if (!pendingDeletePerson) return;
          onDeletePerson(pendingDeletePerson.id);
          cancelDeletePerson();
        }}
      />
    </>
  );
}

interface AddPersonPopoverProps {
  open: boolean;
  name: string;
  role: string;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onRoleChange: (role: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function AddPersonPopover({
  open,
  name,
  role,
  onOpenChange,
  onNameChange,
  onRoleChange,
  onCancel,
  onSubmit,
}: AddPersonPopoverProps) {
  return (
    <SettingsAddPopupShell open={open} onOpenChange={onOpenChange}>
      <SettingsAddPopupTrigger>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(!open)}
          className="h-auto px-0 py-0 text-xs font-semibold text-[#1a60cb] hover:bg-transparent hover:text-[#1a60cb]"
        >
          Add Person
        </Button>
      </SettingsAddPopupTrigger>
      <SettingsAddPopupContent open={open}>
        <div className="grid gap-3 px-4 pb-[18px] pt-4 sm:grid-cols-2">
          <SettingsPopoverField
            id="settings-person-name"
            label="Name"
            value={name}
            placeholder="Enter name..."
            autoFocus
            onChange={onNameChange}
          />
          <SettingsPopoverField
            id="settings-person-role"
            label="Role"
            value={role}
            placeholder="Enter role..."
            onChange={onRoleChange}
          />
        </div>
        <SettingsPopoverActions
          addDisabled={!name.trim()}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </SettingsAddPopupContent>
    </SettingsAddPopupShell>
  );
}

interface AddAgentPopoverProps {
  open: boolean;
  name: string;
  role: string;
  agentInstructions: string;
  agentOperationalInstructions: string;
  availableForSubagentDelegation: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onRoleChange: (role: string) => void;
  onAgentInstructionsChange: (instructions: string) => void;
  onAgentOperationalInstructionsChange: (instructions: string) => void;
  onAvailableForSubagentDelegationChange: (available: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function AddAgentPopover({
  open,
  name,
  role,
  agentInstructions,
  agentOperationalInstructions,
  availableForSubagentDelegation,
  onOpenChange,
  onNameChange,
  onRoleChange,
  onAgentInstructionsChange,
  onAgentOperationalInstructionsChange,
  onAvailableForSubagentDelegationChange,
  onCancel,
  onSubmit,
}: AddAgentPopoverProps) {
  return (
    <SettingsAddPopupShell open={open} onOpenChange={onOpenChange}>
      <SettingsAddPopupTrigger>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(!open)}
          className="h-auto px-0 py-0 text-xs font-semibold text-[#1a60cb] hover:bg-transparent hover:text-[#1a60cb]"
        >
          Add Agent
        </Button>
      </SettingsAddPopupTrigger>
      <SettingsAddPopupContent open={open}>
        <div className="grid gap-3 px-4 pb-5 pt-4 sm:grid-cols-2">
          <SettingsPopoverField
            id="settings-agent-name"
            label="Name"
            value={name}
            placeholder="Enter name..."
            autoFocus
            onChange={onNameChange}
          />
          <div className="space-y-1">
            <Label htmlFor="settings-agent-kind" className="text-xs font-medium leading-5 text-[#71717a]">
              Type
            </Label>
            <div
              id="settings-agent-kind"
              className="flex h-8 items-center gap-1 rounded-xl bg-white px-2 text-sm font-normal text-[#303038] shadow-[0_0_1px_1px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)]"
            >
              <AgentIcon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Agentic</span>
            </div>
          </div>
        </div>
        <div className="px-4 pb-4">
          <SettingsPopoverField
            id="settings-agent-role"
            label="Role"
            value={role}
            placeholder="Enter role..."
            onChange={onRoleChange}
          />
        </div>
        <div className="px-4 pb-5">
          <DelegationEligibilityField
            id="settings-agent-delegation-eligibility"
            checked={availableForSubagentDelegation}
            onCheckedChange={onAvailableForSubagentDelegationChange}
          />
        </div>
        <div className="px-4 pb-5">
          <AgentInstructionFields
            behaviorInstructions={agentInstructions}
            operationalInstructions={agentOperationalInstructions}
            behaviorInputId="settings-agent-instructions"
            operationalInputId="settings-agent-operational-instructions"
            onBehaviorChange={onAgentInstructionsChange}
            onOperationalChange={onAgentOperationalInstructionsChange}
            fieldClassName={SETTINGS_POPOVER_PROMPT_CLASS}
            labelClassName="text-xs font-medium leading-5 text-[#71717a]"
            descriptionClassName="text-xs leading-5 text-[#71717a]"
          />
        </div>
        <SettingsPopoverActions
          addDisabled={!name.trim()}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </SettingsAddPopupContent>
    </SettingsAddPopupShell>
  );
}

interface EditPersonPopoverProps {
  open: boolean;
  person: Person;
  name: string;
  role: string;
  kind: PersonKind;
  agentInstructions: string;
  agentOperationalInstructions: string;
  availableForSubagentDelegation: boolean;
  agentInstructionsInputId: string;
  agentOperationalInstructionsInputId: string;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onRoleChange: (role: string) => void;
  onKindChange: (kind: PersonKind) => void;
  onAgentInstructionsChange: (instructions: string) => void;
  onAgentOperationalInstructionsChange: (instructions: string) => void;
  onAvailableForSubagentDelegationChange: (available: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  hideTrigger?: boolean;
}

function EditPersonPopover({
  open,
  person,
  name,
  role,
  kind,
  agentInstructions,
  agentOperationalInstructions,
  availableForSubagentDelegation,
  agentInstructionsInputId,
  agentOperationalInstructionsInputId,
  onOpenChange,
  onNameChange,
  onRoleChange,
  onKindChange,
  onAgentInstructionsChange,
  onAgentOperationalInstructionsChange,
  onAvailableForSubagentDelegationChange,
  onCancel,
  onSubmit,
  hideTrigger = false,
}: EditPersonPopoverProps) {
  return (
    <SettingsAddPopupShell open={open} onOpenChange={onOpenChange}>
      {!hideTrigger ? (
        <SettingsAddPopupTrigger>
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            className="h-auto rounded-sm px-0 py-0 text-xs font-semibold leading-4 text-[#1a60cb] hover:text-[#164ea4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            aria-expanded={open}
          >
            Edit
          </button>
        </SettingsAddPopupTrigger>
      ) : null}
      <SettingsAddPopupContent open={open}>
        <EditPersonPopoverContent
          person={person}
          name={name}
          role={role}
          kind={kind}
          agentInstructions={agentInstructions}
          agentOperationalInstructions={agentOperationalInstructions}
          availableForSubagentDelegation={availableForSubagentDelegation}
          agentInstructionsInputId={agentInstructionsInputId}
          agentOperationalInstructionsInputId={agentOperationalInstructionsInputId}
          onNameChange={onNameChange}
          onRoleChange={onRoleChange}
          onKindChange={onKindChange}
          onAgentInstructionsChange={onAgentInstructionsChange}
          onAgentOperationalInstructionsChange={onAgentOperationalInstructionsChange}
          onAvailableForSubagentDelegationChange={onAvailableForSubagentDelegationChange}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </SettingsAddPopupContent>
    </SettingsAddPopupShell>
  );
}

function EditPersonPopoverContent({
  person,
  name,
  role,
  kind,
  agentInstructions,
  agentOperationalInstructions,
  availableForSubagentDelegation,
  agentInstructionsInputId,
  agentOperationalInstructionsInputId,
  onNameChange,
  onRoleChange,
  onKindChange,
  onAgentInstructionsChange,
  onAgentOperationalInstructionsChange,
  onAvailableForSubagentDelegationChange,
  onCancel,
  onSubmit,
}: Omit<EditPersonPopoverProps, 'open' | 'onOpenChange' | 'hideTrigger'>) {
  const entityLabel = person.kind === 'agentic' ? 'agent' : 'person';

  return (
    <>
      <div className="grid gap-3 px-4 pb-5 pt-4 sm:grid-cols-2">
        <SettingsPopoverField
          id={`settings-edit-person-name-${person.id}`}
          label="Name"
          value={name}
          placeholder={`Enter ${entityLabel} name...`}
          autoFocus
          onChange={onNameChange}
        />
        <div className="space-y-1">
          <Label htmlFor={`settings-edit-person-kind-${person.id}`} className="text-xs font-medium leading-5 text-[#71717a]">
            Type
          </Label>
          <Select value={kind} onValueChange={(value) => onKindChange(value as PersonKind)}>
            <SelectTrigger
              id={`settings-edit-person-kind-${person.id}`}
              className={SETTINGS_POPOVER_FIELD_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="agentic">Agentic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="px-4 pb-4">
        <SettingsPopoverField
          id={`settings-edit-person-role-${person.id}`}
          label="Role"
          value={role}
          placeholder="Enter role..."
          onChange={onRoleChange}
        />
      </div>
      {kind === 'agentic' && (
        <>
          <div className="px-4 pb-5">
            <DelegationEligibilityField
              id={`settings-edit-person-delegation-eligibility-${person.id}`}
              checked={availableForSubagentDelegation}
              onCheckedChange={onAvailableForSubagentDelegationChange}
            />
          </div>
          <div className="px-4 pb-5">
            <AgentInstructionFields
              behaviorInstructions={agentInstructions}
              operationalInstructions={agentOperationalInstructions}
              behaviorInputId={agentInstructionsInputId}
              operationalInputId={agentOperationalInstructionsInputId}
              onBehaviorChange={onAgentInstructionsChange}
              onOperationalChange={onAgentOperationalInstructionsChange}
              fieldClassName={SETTINGS_POPOVER_PROMPT_CLASS}
              labelClassName="text-xs font-medium leading-5 text-[#71717a]"
              descriptionClassName="text-xs leading-5 text-[#71717a]"
            />
          </div>
        </>
      )}
      <SettingsPopoverActions
        addDisabled={!name.trim()}
        submitLabel="Save"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    </>
  );
}

interface PersonCardActionsProps extends Omit<EditPersonPopoverProps, 'hideTrigger'> {
  onDelete: () => void;
  onExportPdf: () => void;
  canExportPdf: boolean;
  onActionOpenChange: (open: boolean) => void;
}

function PersonCardActions({
  open,
  person,
  name,
  role,
  kind,
  agentInstructions,
  agentOperationalInstructions,
  availableForSubagentDelegation,
  agentInstructionsInputId,
  agentOperationalInstructionsInputId,
  onOpenChange,
  onActionOpenChange,
  onNameChange,
  onRoleChange,
  onKindChange,
  onAgentInstructionsChange,
  onAgentOperationalInstructionsChange,
  onAvailableForSubagentDelegationChange,
  onCancel,
  onSubmit,
  onDelete,
  onExportPdf,
  canExportPdf,
}: PersonCardActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuOpenChange = (nextOpen: boolean) => {
    setMenuOpen(nextOpen);
    onActionOpenChange(nextOpen || open);
  };

  const handleEditOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    onActionOpenChange(menuOpen || nextOpen);
  };

  return (
    <SettingsAddPopupShell
      open={menuOpen || open}
      onOpenChange={() => {
        if (open) {
          handleEditOpenChange(false);
          return;
        }
        handleMenuOpenChange(false);
      }}
    >
      <div className="flex justify-end">
        <OverflowActionMenu
          menuLabel={`${person.kind === 'agentic' ? 'Agent' : 'Person'} actions`}
          buttonClassName="h-8 w-9 rounded-xl border-black/10 bg-white/85 text-[#71717a] shadow-none hover:bg-[#71717a]/5"
          onOpenChange={handleMenuOpenChange}
          items={[
            {
              label: 'Edit',
              icon: PenWritingIcon,
              onSelect: () => {
                handleMenuOpenChange(false);
                handleEditOpenChange(true);
              },
            },
            {
              label: 'Delete',
              icon: TrashIcon,
              tone: 'danger',
              onSelect: () => {
                handleMenuOpenChange(false);
                onDelete();
              },
            },
            {
              label: 'Export tasks',
              icon: DesktopArrowDownIcon,
              disabled: !canExportPdf,
              onSelect: () => {
                handleMenuOpenChange(false);
                onExportPdf();
              },
            },
          ]}
        />
      </div>

      <SettingsAddPopupContent open={open}>
        <EditPersonPopoverContent
          person={person}
          name={name}
          role={role}
          kind={kind}
          agentInstructions={agentInstructions}
          agentOperationalInstructions={agentOperationalInstructions}
          availableForSubagentDelegation={availableForSubagentDelegation}
          agentInstructionsInputId={agentInstructionsInputId}
          agentOperationalInstructionsInputId={agentOperationalInstructionsInputId}
          onNameChange={onNameChange}
          onRoleChange={onRoleChange}
          onKindChange={onKindChange}
          onAgentInstructionsChange={onAgentInstructionsChange}
          onAgentOperationalInstructionsChange={onAgentOperationalInstructionsChange}
          onAvailableForSubagentDelegationChange={onAvailableForSubagentDelegationChange}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </SettingsAddPopupContent>
    </SettingsAddPopupShell>
  );
}

interface SettingsAddPopupShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

function SettingsAddPopupShell({ open, onOpenChange, children }: SettingsAddPopupShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <div ref={shellRef} className="relative">
      {children}
    </div>
  );
}

function SettingsAddPopupTrigger({ children }: { children: ReactNode }) {
  return <div className="flex justify-end">{children}</div>;
}

function SettingsAddPopupContent({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;

  return (
    <div className="absolute right-0 top-[34px] z-[120] max-h-[min(calc(100vh-7rem),520px)] w-[min(calc(100vw-2rem),365px)] overflow-y-auto rounded-xl border border-black/15 bg-white p-0 shadow-[0_2px_4px_rgba(0,0,0,0.10),0_2px_2px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.06),0_0_20.5px_rgba(0,0,0,0.10)]">
      <PopoverArrow />
      {children}
    </div>
  );
}

interface SettingsPopoverFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}

function SettingsPopoverField({
  id,
  label,
  value,
  placeholder,
  autoFocus = false,
  onChange,
}: SettingsPopoverFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium leading-5 text-[#71717a]">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={SETTINGS_POPOVER_FIELD_CLASS}
      />
    </div>
  );
}

function DelegationEligibilityField({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const descriptionId = `${id}-description`;
  return (
    <label
      htmlFor={id}
      className="flex min-h-10 cursor-pointer items-start gap-3 rounded-xl border border-black/10 bg-white/60 px-3 py-2.5"
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        aria-describedby={descriptionId}
        className="mt-0.5 size-4 shrink-0 accent-[#1a60cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium leading-5 text-[#303038]">
          Available for subagent delegation
        </span>
        <span id={descriptionId} className="block text-xs leading-5 text-[#71717a]">
          Allows this agent to appear in subagent selection. Omvra does not automatically spawn or assign work.
        </span>
      </span>
    </label>
  );
}

interface SettingsPopoverActionsProps {
  addDisabled: boolean;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: () => void;
}

function SettingsPopoverActions({ addDisabled, submitLabel = 'Add', onCancel, onSubmit }: SettingsPopoverActionsProps) {
  return (
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-zinc-500/10 bg-white px-4 py-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCancel}
        className="h-7 rounded-xl border-black/10 px-3 text-sm font-medium text-[#67676f]"
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onSubmit}
        disabled={addDisabled}
        className="h-7 rounded-xl bg-zinc-500/15 px-3 text-sm font-medium text-[#67676f] hover:bg-zinc-500/20 disabled:opacity-50"
      >
        {submitLabel}
      </Button>
    </div>
  );
}

function PopoverArrow() {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-[7px] right-10 size-3.5 rotate-45 border-l border-t border-black/15 bg-white"
    />
  );
}

interface PeopleSettingsSectionProps {
  children: ReactNode;
  empty?: boolean;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  popupOpen?: boolean;
}

export function PeopleSettingsSection({ children, empty = false, action, popupOpen = false }: PeopleSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="people"
      title="People"
      icon={UsersIcon}
      description="The information below is used to calculate individual person and agentic load, for better capacity management."
      className={popupOpen ? 'relative z-[100]' : 'relative z-0'}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold leading-5 text-[#71717a]">Available People</h4>
            {action}
          </div>
          <p className="text-xs leading-4 text-[#6a7282]">Manage humans for task assignment.</p>
        </div>
        {empty ? (
          <EmptyStateCard
            compact
            icon={<UsersIcon className="size-4" />}
            title="No people available"
            description="Add a teammate to make human assignment and load tracking available here."
          />
        ) : children}
      </div>
    </AnchoredPanelSection>
  );
}

export function AgentsSettingsSection({ children, empty = false, action, secondaryAction, popupOpen = false }: PeopleSettingsSectionProps) {
  return (
    <AnchoredPanelSection
      id="agents"
      title="Agents"
      icon={AgentIcon}
      description="The information below is used to calculate individual person and agentic load, for better capacity management."
      className={popupOpen ? 'relative z-[100]' : 'relative z-0'}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold leading-5 text-[#71717a]">Available Agents</h4>
            {action}
          </div>
          <p className="text-xs leading-4 text-[#6a7282]">Manage agentic sub-agents for task assignment.</p>
        </div>
        {empty ? (
          <EmptyStateCard
            compact
            icon={<AgentIcon className="size-4" />}
            title="No agents available"
            description="Add an agentic teammate to configure assignment, load, and watcher behavior."
          />
        ) : children}
        <div className="space-y-3">
          <p className="max-w-[42rem] rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-4 text-[#6a7282]">
            Export all agents to one editable JSON file, then import it after making changes. Matching IDs (or names when IDs are absent) are updated in place, while new entries are added; existing task assignments stay with their agents.
          </p>
          {secondaryAction}
        </div>
      </div>
    </AnchoredPanelSection>
  );
}
