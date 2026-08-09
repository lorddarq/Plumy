import type { ReactNode } from 'react';
import { Filter, Plus, X } from 'lucide-react';
import type { Person, TaskPriority, TimelineSwimlane } from '../types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { UNASSIGNED_ASSIGNEE_FILTER_VALUE, type KanbanTaskFilterKey } from '../utils/taskFilters';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MagnifierIcon } from './icons/MagnifierIcon';
import type { KanbanTaskOrder } from '../utils/taskOrdering';

const ALL_FILTER_VALUE = '__omvra_all__';

const PRIORITY_FILTERS: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

interface KanbanToolbarProps {
  searchQuery: string;
  projectFilterValue: string;
  priorityFilterValue: string;
  assigneeFilterValue: string;
  order: KanbanTaskOrder;
  condensedUI: boolean;
  hasActiveFilters: boolean;
  activeProjectId?: string;
  activePriority?: string;
  activeAssigneeId?: string;
  projects: TimelineSwimlane[];
  people: Person[];
  onSearchQueryChange: (value: string) => void;
  onOrderChange: (value: KanbanTaskOrder) => void;
  onFilterValueChange: (key: KanbanTaskFilterKey, value: string) => void;
  onClearFilter: (key: KanbanTaskFilterKey) => void;
  onClearAllFilters: () => void;
  onAddColumn?: () => void;
}

export function KanbanToolbar({
  searchQuery,
  projectFilterValue,
  priorityFilterValue,
  assigneeFilterValue,
  order,
  condensedUI,
  hasActiveFilters,
  activeProjectId,
  activePriority,
  activeAssigneeId,
  projects,
  people,
  onSearchQueryChange,
  onOrderChange,
  onFilterValueChange,
  onClearFilter,
  onClearAllFilters,
  onAddColumn,
}: KanbanToolbarProps) {
  return (
    <div className="kanban-toolbar">
      <div className="kanban-toolbar-search">
        <MagnifierIcon className="kanban-toolbar-search-icon" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Input type="search" value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Search" className="kanban-toolbar-search-input" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Search tasks</TooltipContent>
        </Tooltip>
      </div>

      <div className="kanban-toolbar-actions">
        <KanbanFilterSelect
          value={projectFilterValue}
          active={Boolean(activeProjectId)}
          placeholder="Project"
          onValueChange={(value) => onFilterValueChange('projectId', value)}
          onClear={() => onClearFilter('projectId')}
        >
          <SelectItem value={ALL_FILTER_VALUE}>{condensedUI ? 'Projects' : 'All projects'}</SelectItem>
          {projects.map(project => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </KanbanFilterSelect>

        <Select value={order} onValueChange={(value) => onOrderChange(value as KanbanTaskOrder)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectTrigger size="sm" className="kanban-filter-trigger">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Order cards</TooltipContent>
          </Tooltip>
          <SelectContent className="omvra-filter-select-content">
            <SelectItem value="manual">Manual order</SelectItem>
            <SelectItem value="urgency">Urgency</SelectItem>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="complexity">Complexity</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>

        <KanbanFilterSelect
          value={priorityFilterValue}
          active={Boolean(activePriority)}
          placeholder="Priority"
          onValueChange={(value) => onFilterValueChange('priority', value)}
          onClear={() => onClearFilter('priority')}
        >
          <SelectItem value={ALL_FILTER_VALUE}>{condensedUI ? 'Priorities' : 'All priorities'}</SelectItem>
          {PRIORITY_FILTERS.map(priority => (
            <SelectItem key={priority.value} value={priority.value}>
              {priority.label}
            </SelectItem>
          ))}
        </KanbanFilterSelect>

        <KanbanFilterSelect
          value={assigneeFilterValue}
          active={Boolean(activeAssigneeId)}
          placeholder="Assignee"
          onValueChange={(value) => onFilterValueChange('assigneeId', value)}
          onClear={() => onClearFilter('assigneeId')}
        >
          <SelectItem value={ALL_FILTER_VALUE}>{condensedUI ? 'Assignees' : 'All assignees'}</SelectItem>
          <SelectItem value={UNASSIGNED_ASSIGNEE_FILTER_VALUE}>Unassigned</SelectItem>
          {people.map(person => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </KanbanFilterSelect>

        {hasActiveFilters && !condensedUI && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearAllFilters}
            className="kanban-toolbar-clear"
          >
            <Filter className="size-4" />
            Clear
          </Button>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="primary" onClick={onAddColumn} className="kanban-toolbar-add-board" disabled={!onAddColumn}>
              <Plus className="size-4" />
              {condensedUI ? null : <span>Add Board</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add board column</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

interface KanbanFilterSelectProps {
  value: string;
  active: boolean;
  placeholder: string;
  children: ReactNode;
  onValueChange: (value: string) => void;
  onClear: () => void;
}

function KanbanFilterSelect({
  value,
  active,
  placeholder,
  children,
  onValueChange,
  onClear,
}: KanbanFilterSelectProps) {
  return (
    <div className="kanban-filter-control">
      <Select value={value} onValueChange={onValueChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger size="sm" className={`kanban-filter-trigger ${active ? 'is-active' : ''}`}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Filter by {placeholder.toLowerCase()}</TooltipContent>
        </Tooltip>
        <SelectContent className="omvra-filter-select-content">{children}</SelectContent>
      </Select>
      {active && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" onClick={onClear} className="kanban-filter-clear" aria-label={`Clear ${placeholder.toLowerCase()} filter`}>
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear {placeholder.toLowerCase()} filter</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export { ALL_FILTER_VALUE };
