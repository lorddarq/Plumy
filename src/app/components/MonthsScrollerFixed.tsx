import React, { useMemo } from 'react';
import { MonthColumn } from './MonthColumn';

interface MonthsScrollerProps {
  datesByMonth: Record<string, Date[]>;
  monthWidths: Record<string, number>;
  dayWidths: number[];
  dates: Date[];
  onMonthResizeStart: (e: React.MouseEvent, monthKey: string) => void;
  getMonthLabel: (d: Date) => string;
  getDayLabel: (d: Date) => string;
  swimlaneCount?: number;
  rowHeight?: number;
}

export default function MonthsScrollerFixed({ datesByMonth, monthWidths, dayWidths, dates, onMonthResizeStart, getMonthLabel, getDayLabel, swimlaneCount, rowHeight }: MonthsScrollerProps) {
  const monthKeys = useMemo(() =>
    Object.keys(datesByMonth).sort((a, b) => {
      const ta = datesByMonth[a]?.[0]?.getTime() ?? 0;
      const tb = datesByMonth[b]?.[0]?.getTime() ?? 0;
      return ta - tb;
    }),
    [datesByMonth]
  );

  const monthSlices = useMemo(() => {
    const res: Record<string, number[]> = {};
    let idx = 0;
    monthKeys.forEach((k) => {
      const len = datesByMonth[k]?.length ?? 0;
      res[k] = dayWidths.slice(idx, idx + len);
      idx += len;
    });
    return res;
  }, [monthKeys, datesByMonth, dayWidths]);

  return (
    <div>
      <div className="flex items-start flex-nowrap">
        {monthKeys.map((k) => (
          <MonthColumn
            key={k}
            monthKey={k}
            monthDates={datesByMonth[k]}
            monthWidth={monthWidths[k] ?? (datesByMonth[k]?.length ?? 0) * 60}
            dayWidths={monthSlices[k] ?? []}
            getMonthLabel={getMonthLabel}
            getDayLabel={getDayLabel}
            onResizeStart={onMonthResizeStart}
            rowHeight={rowHeight}
            swimlaneCount={swimlaneCount}
          />
        ))}
      </div>
    </div>
  );
}
