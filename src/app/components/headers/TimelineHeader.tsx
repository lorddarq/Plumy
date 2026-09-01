/**
 * TimelineHeader Component
 *
 * Renders the month and day headers for the timeline.
 * Displays months and individual day cells with visual indicators
 * (e.g., today highlight).
 *
 * Props should be passed from parent TimelineView after calculating
 * dates, month widths, and day widths.
 */

import React from 'react';
import type { TimelineViewportMonth } from '../../utils/timelineWindow';

interface TimelineHeaderProps {
  months: TimelineViewportMonth[];
  dayWidths: number[];
  defaultDayWidth: number;
  totalTimelineWidth: number;
  endPadding: number;
  leadingSpacerWidth?: number;
  trailingSpacerWidth?: number;
  rowHeight: number;
  swimlaneCount: number;
  highlightToday?: boolean;
  headerRef: React.RefObject<HTMLDivElement>;
  onMonthResizeStart?: (monthKey: string, e: React.MouseEvent<HTMLDivElement>) => void;
  onMonthReset?: (monthKey: string) => void;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
}

function getDayLabel(date: Date): string {
  return date.getDate().toString();
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function TimelineHeader({
  months,
  dayWidths,
  defaultDayWidth,
  totalTimelineWidth,
  endPadding,
  leadingSpacerWidth = 0,
  trailingSpacerWidth = 0,
  rowHeight,
  swimlaneCount,
  highlightToday = true,
  headerRef,
  onMonthResizeStart,
  onMonthReset,
}: TimelineHeaderProps) {
  const timelineInnerStyle: React.CSSProperties = {
    minWidth: `${totalTimelineWidth + endPadding}px`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  };

  return (
    <div
      ref={headerRef}
      className="hide-scrollbar"
      style={{ overflowX: 'visible', overflowY: 'visible', width: '100%' }}
    >
      <div style={timelineInnerStyle}>
        {/* Month headers and day rows */}
        <div style={{ display: 'flex', width: '100%' }}>
          <div style={{ display: 'flex', width: '100%' }}>
            {leadingSpacerWidth > 0 && (
              <div
                className="months-leading-spacer flex-shrink-0"
                style={{ width: `${leadingSpacerWidth}px` }}
                aria-hidden
              />
            )}
            {months.map(month => (
              <div
                key={month.monthKey}
                style={{ width: `${month.width}px` }}
                className="month-column"
              >
                {/* Month header */}
                <div
                  data-month-header
                  className="month-header relative"
                >
                  <span className="month-header-text">
                    {getMonthLabel(month.dates[0])}
                  </span>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-gray-300/40"
                    onMouseDown={(e) => onMonthResizeStart?.(month.monthKey, e)}
                    onDoubleClick={() => onMonthReset?.(month.monthKey)}
                    title="Drag to resize month. Double-click to reset."
                  />
                </div>

                {/* Day row */}
                <div
                  data-day-header
                  className="day-row timeline-day-scrub-handle"
                  style={{ height: `${rowHeight}px` }}
                >
                  {month.dates.map((d, i) => {
                    const globalIdx = month.startDayIndex + i;
                    const w = dayWidths[globalIdx] ?? defaultDayWidth;
                    const today = new Date();
                    const todayNoTime = new Date(
                      today.getFullYear(),
                      today.getMonth(),
                      today.getDate()
                    );
                    const isToday = isSameDate(d, todayNoTime);
                    
                    // Check if this is a weekend or week start
                    const dayOfWeek = d.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const isWeekStart = dayOfWeek === 1; // Monday
                    const dateLabel = d.toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });

                    return (
                      <div
                        key={i}
                        className={`day-cell ${isWeekend ? 'weekend' : ''} ${isWeekStart ? 'week-start' : ''}`}
                        style={{ width: `${w}px` }}
                      >
                        <div
                          title={isToday ? 'Today' : isWeekend ? 'Weekend' : undefined}
                          aria-label={`${dateLabel}${isToday ? ', Today' : ''}${isWeekend ? ', Weekend' : ''}`}
                          className={`day-label ${
                            isToday ? 'today' : ''
                          } ${
                            isToday && highlightToday ? 'highlight' : ''
                          }`}
                        >
                          {getDayLabel(d)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Per-month swimlane placeholders (background grid) */}
                <div className="month-swimlanes absolute left-0 right-0 flex flex-col pointer-events-none">
                  {Array.from({ length: swimlaneCount }).map((_, si) => (
                    <div
                      key={si}
                      data-month-cell
                      className="month-swimlane-cell"
                      style={{
                        height: `${rowHeight}px`,
                        minHeight: `${rowHeight}px`,
                      }}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Trailing spacer */}
            <div
              className="months-end-spacer flex-shrink-0"
              style={{ width: `${trailingSpacerWidth + endPadding}px` }}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}
