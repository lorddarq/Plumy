/**
 * useTimelineMode Hook
 *
 * Manages the Timeline display mode: Projects or People view.
 * Projects mode (default): swimlanes represent projects/epics
 * People mode (future): swimlanes grouped by person, with projects as sub-rows
 *
 * This is a view-level toggle within TimelineView, separate from the global
 * view toggle (TimelineView vs KanbanView).
 */

import { useCallback, useState } from 'react';

export type TimelineMode = 'projects' | 'people';

export function useTimelineMode(initialMode: TimelineMode = 'projects') {
  const [mode, setMode] = useState<TimelineMode>(initialMode);

  /**
   * Toggle between Projects and People modes.
   */
  const toggleMode = useCallback(() => {
    setMode(prev => (prev === 'projects' ? 'people' : 'projects'));
  }, []);

  /**
   * Set mode explicitly.
   *
   * @param newMode - Target mode (projects | people)
   */
  const setModeExplicit = useCallback((newMode: TimelineMode) => {
    setMode(newMode);
  }, []);

  return {
    mode,
    setMode: setModeExplicit,
    toggleMode,
    isProjectsMode: mode === 'projects',
    isPeopleMode: mode === 'people',
  };
}
