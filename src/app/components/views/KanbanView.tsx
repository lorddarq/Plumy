/**
 * KanbanView Component
 *
 * Full-page kanban board view with independent horizontal scrolling.
 * Integrates with useViewState to preserve scroll position across view switches.
 *
 * Renders kanban columns (swimlanes) in a responsive flex layout.
 * Columns grow to fill available width or overflow-scroll if total width exceeds viewport.
 */

import { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useState, type RefObject } from 'react';
import { Task, TaskStatus, StatusColumn, TimelineSwimlane, Person } from '../../types';
import { SwimlanesView } from './SwimlanesView';
import { HorizontalScrollbar } from '../HorizontalScrollbar';
import { ALL_FILTER_VALUE, KanbanToolbar } from '../KanbanToolbar';
import {
  clearAllKanbanTaskFilters,
  clearKanbanTaskFilter,
  filterKanbanTasks,
  hasActiveKanbanTaskFilters,
  persistKanbanTaskFilters,
  sanitizeKanbanTaskFilters,
  type KanbanTaskFilterKey,
  type KanbanTaskFilters,
} from '../../utils/taskFilters';
import { orderKanbanTasks, type KanbanTaskOrder } from '../../utils/taskOrdering';
import { areShallowValuesEqual } from '../../store/workspaceSelectors.ts';

const COLUMN_DRAG_EDGE_SCROLL_ZONE = 96;
const COLUMN_DRAG_EDGE_SCROLL_STEP = 28;

interface KanbanViewProps {
  tasks: Task[];
  swimlanes: StatusColumn[];
  projects: TimelineSwimlane[];
  people: Person[];
  customScrollbarsEnabled?: boolean;
  condensedUI?: boolean;
  initialFilters?: KanbanTaskFilters;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  initialScrollLeft?: number;
  initialScrollTop?: number;
  onTaskClick: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onReorderTasks: (tasks: Task[]) => void;
  onReorderColumns: (fromIndex: number, toIndex: number) => void;
  onUpdateColumn?: (colId: string, updates: Partial<Omit<StatusColumn, 'id'>>) => void;
  onAddColumn?: (col: any) => void;
  onDeleteColumn?: (colId: string) => void;
}

export function KanbanView({
  tasks,
  swimlanes,
  projects,
  people,
  customScrollbarsEnabled = true,
  condensedUI = false,
  initialFilters,
  scrollContainerRef,
  initialScrollLeft = 0,
  initialScrollTop = 0,
  onTaskClick,
  onEditTask,
  onAddTask,
  onMoveTask,
  onReorderTasks,
  onReorderColumns,
  onUpdateColumn,
  onAddColumn,
  onDeleteColumn,
}: KanbanViewProps) {
  const fallbackContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollContainerRef ?? fallbackContainerRef;
  const didRestoreInitialScrollRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [order, setOrder] = useState<KanbanTaskOrder>('manual');
  const [filters, setFilters] = useState<KanbanTaskFilters>(() =>
    sanitizeKanbanTaskFilters(initialFilters, projects, people)
  );

  const activeFilters = useMemo(
    () => sanitizeKanbanTaskFilters(filters, projects, people),
    [filters, people, projects]
  );

  const trimmedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearchActive = trimmedSearchQuery.length > 0;
  const hasActiveFilters = hasActiveKanbanTaskFilters(activeFilters);
  const isBoardFiltered = isSearchActive || hasActiveFilters;

  const filteredTasks = useMemo(() => {
    const matchingTasks = filterKanbanTasks(tasks, activeFilters).filter(task => {
      if (isSearchActive) {
        const haystack = `${task.title} ${task.notes || ''}`.toLowerCase();
        if (!haystack.includes(trimmedSearchQuery)) return false;
      }

      return true;
    });
    return orderKanbanTasks(matchingTasks, order, projects);
  }, [activeFilters, isSearchActive, order, projects, tasks, trimmedSearchQuery]);

  useEffect(() => {
    persistKanbanTaskFilters(activeFilters);
  }, [activeFilters]);

  useEffect(() => {
    setFilters(previousFilters => {
      const nextFilters = sanitizeKanbanTaskFilters(previousFilters, projects, people);
      return areShallowValuesEqual(previousFilters, nextFilters)
        ? previousFilters
        : nextFilters;
    });
  }, [people, projects]);

  useEffect(() => {
    setFilters(previousFilters => {
      const nextFilters = sanitizeKanbanTaskFilters(initialFilters, projects, people);
      return areShallowValuesEqual(previousFilters, nextFilters)
        ? previousFilters
        : nextFilters;
    });
  }, [initialFilters, people, projects]);

  const projectFilterValue = activeFilters.projectId || ALL_FILTER_VALUE;
  const priorityFilterValue = activeFilters.priority || ALL_FILTER_VALUE;
  const assigneeFilterValue = activeFilters.assigneeId || ALL_FILTER_VALUE;

  const setFilterValue = (key: KanbanTaskFilterKey, value: string) => {
    setFilters(previousFilters => {
      if (value === ALL_FILTER_VALUE) {
        return clearKanbanTaskFilter(previousFilters, key);
      }

      return { ...previousFilters, [key]: value };
    });
  };

  const clearFilter = (key: KanbanTaskFilterKey) => {
    setFilters(previousFilters => clearKanbanTaskFilter(previousFilters, key));
  };

  const clearAllFilters = () => {
    setFilters(clearAllKanbanTaskFilters());
  };

  const emitScrollState = useCallback((target: HTMLDivElement) => {
    const event = new CustomEvent('kanbanScroll', {
      detail: { scrollLeft: target.scrollLeft, scrollTop: target.scrollTop },
    });
    document.dispatchEvent(event);
  }, []);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      emitScrollState(e.currentTarget);
    },
    [emitScrollState]
  );

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || didRestoreInitialScrollRef.current) return;

    node.scrollLeft = initialScrollLeft;
    node.scrollTop = initialScrollTop;
    didRestoreInitialScrollRef.current = true;
    emitScrollState(node);
  }, [containerRef, emitScrollState, initialScrollLeft, initialScrollTop]);

  const handleColumnDragHover = useCallback((clientX: number) => {
    const node = containerRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    let nextScrollLeft = node.scrollLeft;

    if (clientX < rect.left + COLUMN_DRAG_EDGE_SCROLL_ZONE) {
      nextScrollLeft -= COLUMN_DRAG_EDGE_SCROLL_STEP;
    } else if (clientX > rect.right - COLUMN_DRAG_EDGE_SCROLL_ZONE) {
      nextScrollLeft += COLUMN_DRAG_EDGE_SCROLL_STEP;
    } else {
      return;
    }

    const maxScrollLeft = Math.max(node.scrollWidth - node.clientWidth, 0);
    nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, nextScrollLeft));
    if (nextScrollLeft === node.scrollLeft) return;

    node.scrollLeft = nextScrollLeft;
    emitScrollState(node);
  }, [emitScrollState]);

  return (
    <div className="kanban-shell">
      <KanbanToolbar
        searchQuery={searchQuery}
        projectFilterValue={projectFilterValue}
        priorityFilterValue={priorityFilterValue}
        assigneeFilterValue={assigneeFilterValue}
        order={order}
        condensedUI={condensedUI}
        hasActiveFilters={hasActiveFilters}
        activeProjectId={activeFilters.projectId}
        activePriority={activeFilters.priority}
        activeAssigneeId={activeFilters.assigneeId}
        projects={projects}
        people={people}
        onSearchQueryChange={setSearchQuery}
        onOrderChange={setOrder}
        onFilterValueChange={setFilterValue}
        onClearFilter={clearFilter}
        onClearAllFilters={clearAllFilters}
        onAddColumn={onAddColumn ? () => onAddColumn({ title: 'New Column' }) : undefined}
      />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`kanban-board-scroll ${customScrollbarsEnabled ? 'kanban-native-scrollbar-hidden' : ''}`}
        style={{ scrollbarGutter: 'stable both-edges' }}
      >
        <SwimlanesView
          tasks={filteredTasks}
          swimlanes={swimlanes}
          people={people}
          isFilterActive={isBoardFiltered}
          onTaskClick={onTaskClick}
          onEditTask={onEditTask}
          onAddTask={onAddTask}
          onMoveTask={onMoveTask}
          onReorderTasks={onReorderTasks}
          onReorderColumns={onReorderColumns}
          onUpdateColumn={onUpdateColumn}
          onAddColumn={onAddColumn}
          onDeleteColumn={onDeleteColumn}
          onColumnDragHover={handleColumnDragHover}
        />
      </div>

      <HorizontalScrollbar
        scrollContainerRef={containerRef}
        ariaLabel="Kanban board horizontal scroll"
        enabled={customScrollbarsEnabled}
        hideWhenNoOverflow
      />
    </div>
  );
}
