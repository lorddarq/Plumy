import React from 'react';

interface MonthColumnProps {
  monthKey: string;
  monthDates: Date[];
  monthWidth: number;
  dayWidths: number[];
  getMonthLabel: (d: Date) => string;
  getDayLabel: (d: Date) => string;
  onResizeStart: (e: React.MouseEvent, monthKey: string) => void;
  rowHeight?: number;
  swimlaneCount?: number;
}

export function MonthColumn({
  monthKey,
  monthDates,
  monthWidth,
  dayWidths,
  getMonthLabel,
  getDayLabel,
  onResizeStart,
}: MonthColumnProps): React.ReactElement {
  return (
    <div className="border-r last:border-r-0 bg-white flex-shrink-0" style={{ width: `${monthWidth}px` }}>
      <div className="px-3 py-2 border-b bg-white relative">
        <span className="text-sm font-medium text-gray-700">{getMonthLabel(monthDates[0])}</span>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize month ${getMonthLabel(monthDates[0])}`}
          onMouseDown={(e) => onResizeStart(e, monthKey)}
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-gray-100"
        />
      </div>

      <div className="px-3 py-2 border-b bg-white">
        <div className="flex gap-2 items-center">
          {monthDates.map((d, i) => (
            <div
              key={i}
              className="flex items-center justify-center border border-gray-200 h-9 bg-white rounded-sm"
              style={{ width: `${dayWidths[i] ?? 60}px` }}
            >
              <div className="text-xs text-gray-500">{getDayLabel(d)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MonthColumn;
