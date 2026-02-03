/**
 * ViewToggle Component
 *
 * Segmented control for switching between TimelineView and KanbanView.
 * Renders as a toggle button group in the top bar.
 *
 * Usage:
 *   <ViewToggle
 *     currentView={viewState.currentView}
 *     onViewChange={(view) => viewState.switchView(view)}
 *   />
 */

import React from 'react';
import { ViewType } from '@/app/hooks/useViewState';

interface ViewToggleProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  disabled?: boolean;
}

export function ViewToggle({
  currentView,
  onViewChange,
  disabled = false,
}: ViewToggleProps) {
  const views: { value: ViewType; label: string }[] = [
    { value: 'timeline', label: 'Timeline' },
    { value: 'kanban', label: 'Kanban' },
  ];

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-md">
      {views.map(view => (
        <button
          key={view.value}
          onClick={() => onViewChange(view.value)}
          disabled={disabled}
          className={`
            px-4 py-2 rounded-sm font-medium text-sm transition-all
            ${
              currentView === view.value
                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          aria-pressed={currentView === view.value}
          aria-label={`Switch to ${view.label} view`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
