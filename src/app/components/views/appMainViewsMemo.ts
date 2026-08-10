import type { AppMainViewsProps } from './AppMainViews.tsx';
import { areShallowValuesEqual } from '../../store/workspaceSelectors.ts';

export function areAppMainViewsPropsEqual(
  previous: AppMainViewsProps,
  next: AppMainViewsProps,
): boolean {
  return previous.currentView === next.currentView
    && areShallowValuesEqual(previous.frame, next.frame)
    && areShallowValuesEqual(previous.timeline, next.timeline)
    && areShallowValuesEqual(previous.kanban, next.kanban)
    && areShallowValuesEqual(previous.roadmap, next.roadmap);
}
