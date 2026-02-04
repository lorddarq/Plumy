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

interface TimelineHeaderProps {
  datesByMonth: Record<string, Date[]>;
  monthWidths: Record<string, number>;
  dayWidths: number[];
  defaultDayWidth: number;
  totalTimelineWidth: number;
  endPadding: number;
  rowHeight: number;
  swimlaneCount: number;
  todayOffset?: number | null;
  highlightToday?: boolean;
  headerRef: React.RefObject<HTMLDivElement>;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleString('default', { month: 'short', year: '2-digit' });
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
  datesByMonth,
  monthWidths,
  dayWidths,
  defaultDayWidth,
  totalTimelineWidth,
  endPadding,
  rowHeight,
  swimlaneCount,
  todayOffset,
  highlightToday = true,
  headerRef,
}: TimelineHeaderProps) {
  // Ordered month keys
  const monthKeysOrdered = Object.keys(datesByMonth).sort((a, b) => {
    const ta = datesByMonth[a]?.[0]?.getTime() ?? 0;
    const tb = datesByMonth[b]?.[0]?.getTime() ?? 0;
    return ta - tb;
  });

  // Compute month metadata with indices for day width lookup
  const monthMeta: { key: string; dates: Date[]; width: number; startIndex: number }[] = [];
  let runningIndex = 0;
  monthKeysOrdered.forEach(k => {
    const md = datesByMonth[k] ?? [];
    const w = monthWidths[k] ?? md.length * defaultDayWidth;
    monthMeta.push({ key: k, dates: md, width: w, startIndex: runningIndex });
    runningIndex += md.length;
  });

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
            {monthMeta.map(m => (
              <div
                key={m.key}
                style={{ width: `${m.width}px` }}
                className="month-column"
              >
                {/* Month header */}
                <div
                  data-month-header
                  className="month-header"
                >
                  <span className="month-header-text">
                    {getMonthLabel(m.dates[0])}
                  </span>
                </div>

                {/* Day row */}
                <div
                  data-day-header
                  className="day-row"
                  style={{ height: `${rowHeight}px` }}
                >
                  {m.dates.map((d, i) => {
                    const globalIdx = m.startIndex + i;
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

                    return (
                      <div
                        key={i}
                        className={`day-cell ${isWeekend ? 'weekend' : ''} ${isWeekStart ? 'week-start' : ''}`}
                        style={{ width: `${w}px` }}
                      >
                        <div
                          title={isToday ? 'Today' : isWeekend ? 'Weekend' : undefined}
                          aria-label={isToday ? 'Today' : isWeekend ? 'Weekend' : undefined}
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
                <div className="month-swimlanes absolute left-0 right-0 top-[calc(var(--row-height)*2)] flex flex-col pointer-events-none">
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
              style={{ width: `${endPadding}px` }}
              aria-hidden
            />

            {/* Global today indicator - positioned relative to entire timeline */}
            {typeof todayOffset !== 'undefined' &&
              todayOffset !== null && (
                <div
                  className="today-indicator"
                  style={{ left: `${todayOffset}px` }}
                  aria-hidden
                />
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
