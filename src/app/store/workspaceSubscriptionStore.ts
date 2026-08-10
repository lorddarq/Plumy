import type { WorkspaceStoreValue } from './workspaceStore.tsx';
import { recordWorkspacePublication } from '../services/performanceLogging.ts';

const SNAPSHOT_FIELDS: Array<keyof WorkspaceStoreValue> = [
  'tasks',
  'timelineSwimlanes',
  'people',
  'milestones',
  'statusColumns',
  'agentWatchConfigs',
  'preferences',
  'goalPolicy',
  'hasHydratedCanonicalWorkspace',
];

export interface WorkspaceSubscriptionStore {
  getSnapshot: () => WorkspaceStoreValue;
  publish: (value: WorkspaceStoreValue) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createWorkspaceSubscriptionStore(initialValue: WorkspaceStoreValue): WorkspaceSubscriptionStore {
  let snapshot = initialValue;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    publish: value => {
      if (Object.is(snapshot, value)) return;
      const changedFields = SNAPSHOT_FIELDS.filter(field => !Object.is(snapshot[field], value[field]));
      snapshot = value;
      recordWorkspacePublication(changedFields);
      listeners.forEach(listener => listener());
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
