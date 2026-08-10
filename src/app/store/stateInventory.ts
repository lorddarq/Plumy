export type AppStateBucket = 'workspace' | 'ui' | 'layout' | 'preferences' | 'runtime';
export type AppStatePersistence = 'persisted' | 'runtime-only' | 'derived';

export interface AppStateInventoryEntry {
  stateKey: string;
  bucket: AppStateBucket;
  persistence: AppStatePersistence;
  owner: 'workspaceStore' | 'uiLayoutStore' | 'AppContent' | 'derived';
}

// A lightweight inventory of the former App.tsx state surface to keep the store split auditable.
export const APP_STATE_INVENTORY: AppStateInventoryEntry[] = [
  { stateKey: 'tasks', bucket: 'workspace', persistence: 'persisted', owner: 'workspaceStore' },
  { stateKey: 'timelineSwimlanes', bucket: 'workspace', persistence: 'persisted', owner: 'workspaceStore' },
  { stateKey: 'people', bucket: 'workspace', persistence: 'persisted', owner: 'workspaceStore' },
  { stateKey: 'milestones', bucket: 'workspace', persistence: 'persisted', owner: 'workspaceStore' },
  { stateKey: 'statusColumns', bucket: 'workspace', persistence: 'persisted', owner: 'workspaceStore' },
  { stateKey: 'preferences', bucket: 'preferences', persistence: 'persisted', owner: 'workspaceStore' },
  { stateKey: 'currentView', bucket: 'ui', persistence: 'persisted', owner: 'uiLayoutStore' },
  { stateKey: 'hydratedViewStates', bucket: 'ui', persistence: 'persisted', owner: 'uiLayoutStore' },
  { stateKey: 'timelineLayoutState', bucket: 'layout', persistence: 'persisted', owner: 'uiLayoutStore' },
  { stateKey: 'hydratedKanbanFilters', bucket: 'layout', persistence: 'persisted', owner: 'uiLayoutStore' },
  { stateKey: 'isTaskDialogOpen', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'isTaskDetailsOpen', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'isSwimlaneDialogOpen', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'isPreferencesOpen', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'selectedTask', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'detailsTask', bucket: 'ui', persistence: 'derived', owner: 'derived' },
  { stateKey: 'selectedSwimlane', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'defaultStatus', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'defaultDate', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'defaultEndDate', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'defaultSwimlaneId', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'defaultAssigneeId', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'selectedMilestone', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'detailsMilestoneId', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'detailsMilestone', bucket: 'ui', persistence: 'derived', owner: 'derived' },
  { stateKey: 'isMilestoneDialogOpen', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'preferencesInitialAnchor', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'importFeedback', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'resetLocalDataConfirmOpen', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'viewRefreshKey', bucket: 'ui', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'timelineScrollStateRef', bucket: 'layout', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'kanbanScrollStateRef', bucket: 'layout', persistence: 'runtime-only', owner: 'uiLayoutStore' },
  { stateKey: 'storageMeter', bucket: 'runtime', persistence: 'derived', owner: 'derived' },
  { stateKey: 'workspaceReadModel', bucket: 'runtime', persistence: 'derived', owner: 'derived' },
  { stateKey: 'mcpHealth', bucket: 'runtime', persistence: 'runtime-only', owner: 'AppContent' },
  { stateKey: 'mcpListenerStatus', bucket: 'runtime', persistence: 'runtime-only', owner: 'AppContent' },
  { stateKey: 'mcpAuditLog', bucket: 'runtime', persistence: 'runtime-only', owner: 'AppContent' },
];
