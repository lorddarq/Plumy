/**
 * SwimlaneRowsView Component
 *
 * Renders the swimlane rows (timeline tasks) for the Projects view.
 * Each row represents a swimlane and contains draggable task cards.
 *
 * This component handles:
 * - Rendering swimlane rows
 * - Task drag/drop within and across swimlanes
 * - Task click handlers
 * - Visual feedback for row hover/selection
 */

import React, { useRef, useCallback } from 'react';
import { Task, TimelineSwimlane } from '../types';
import { DraggableSwimlaneRow } from './DraggableSwimlaneRow';

interface SwimlaneRowsViewProps {
  swimlanes: TimelineSwimlane[];
  tasks: Task[];
  rowHeight: number;
  totalTimelineWidth: number;
  endPadding: number;
  leftColWidth: number;
  onTaskClick: (task: Task) => void;
  onUpdateTaskDates: (taskId: string, startDate: string, endDate: string) => void;
  onReorderTasks: (tasks: Task[]) => void;
  // Additional props for task positioning (computed from dates/dayWidths)
  dates: Date[];
  dayWidths: number[];
  defaultDayWidth: number;
  datesByMonth: Record<string, Date[]>;
  monthWidths: Record<string, number>;
}

export function SwimlaneRowsView({
  swimlanes,
  tasks,
  rowHeight,
  totalTimelineWidth,
  endPadding,
  leftColWidth,
  onTaskClick,
  onUpdateTaskDates,
  onReorderTasks,
  dates,
  dayWidths,
  defaultDayWidth,
  datesByMonth,
  monthWidths,
}: SwimlaneRowsViewProps) {
  const rowsContainerRef = useRef<HTMLDivElement>(null);

  const handleTaskClick = useCallback(
    (task: Task) => {
      onTaskClick(task);
    },
    [onTaskClick]
  );

  const handleUpdateTaskDates = useCallback(
    (taskId: string, startDate: string, endDate: string) => {
      onUpdateTaskDates(taskId, startDate, endDate);
    },
    [onUpdateTaskDates]
  );

  const handleReorderTasks = useCallback(
    (reorderedTasks: Task[]) => {
      onReorderTasks(reorderedTasks);
    },
    [onReorderTasks]
  );

  const timelineInnerStyle: React.CSSProperties = {
    minWidth: `${totalTimelineWidth + endPadding}px`,
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div
      ref={rowsContainerRef}
      className="swimlane-rows relative"
      style={{
        ...timelineInnerStyle,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {swimlanes.map((swimlane, idx) => (
        <div
          key={swimlane.id}
          className="swimlane-row border-b"
          style={{
            position: 'relative',
            minHeight: `${rowHeight}px`,
            height: `${rowHeight}px`,
          }}
        >
          <DraggableSwimlaneRow
            swimlane={swimlane}
            index={idx}
            tasks={tasks.filter(t => t.swimlaneId === swimlane.id)}
            dates={dates}
            dateWidths={dayWidths}
            monthKeys={Object.keys(datesByMonth)}
            monthWidths={monthWidths}
            datesByMonth={datesByMonth}
            totalTimelineWidth={totalTimelineWidth}
            rowHeight={rowHeight}
            onTaskClick={handleTaskClick}
            onAddTask={() => {}} // will be implemented later
            onEditSwimlane={() => {}} // will be implemented later
            onMoveSwimlane={() => {}} // will be implemented later
            onMoveTaskToSwimlane={() => {}} // will be implemented later
            getTaskPosition={() => null} // will be implemented later
            getTaskColor={() => ({})} // will be implemented later
            handleResizeStart={() => {}} // will be implemented later
            resizingTaskId={null}
          />
        </div>
      ))}
    </div>
  );
}
