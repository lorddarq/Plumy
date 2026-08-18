import { useCallback, useEffect, useRef } from 'react';
import type { Person, ProjectMilestone, Task, TimelineSwimlane } from '../types.ts';
import { GOAL_POLICY_KEY, type GoalPolicyV1 } from '../utils/goalPolicy.ts';
import { persistJSONBatchWithElectronMirror } from '../utils/storage.ts';
import type { StatusColumnState } from '../utils/workspaceSanitizers.ts';
import type { AppPreferences } from './workspaceStore.tsx';
import { areSerializedValuesEqual } from './workspaceSelectors.ts';

export const TASKS_KEY = 'omvra.tasks.v1';
export const SWIMLANES_KEY = 'omvra.swimlanes.v1';
export const PEOPLE_KEY = 'omvra.people.v1';
export const MILESTONES_KEY = 'omvra.milestones.v1';
export const STATUS_COLUMNS_KEY = 'omvra.statusColumns.v1';
export const PREFERENCES_KEY = 'omvra.preferences.v1';

interface WorkspacePersistenceState {
  tasks: Task[];
  timelineSwimlanes: TimelineSwimlane[];
  people: Person[];
  milestones: ProjectMilestone[];
  statusColumns: StatusColumnState[];
  preferences: AppPreferences;
  goalPolicy: GoalPolicyV1;
  hasHydratedCanonicalWorkspace: boolean;
}

export function useWorkspacePersistence(state: WorkspacePersistenceState) {
  const {
    tasks,
    timelineSwimlanes,
    people,
    milestones,
    statusColumns,
    preferences,
    goalPolicy,
    hasHydratedCanonicalWorkspace,
  } = state;
  const tasksRef = useRef(tasks);
  const timelineSwimlanesRef = useRef(timelineSwimlanes);
  const statusColumnsRef = useRef(statusColumns);
  const preferencesRef = useRef(preferences);
  const goalPolicyRef = useRef(goalPolicy);
  const previousGoalPolicyForImpactRef = useRef(goalPolicy);
  const goalPolicyImpactInitializedRef = useRef(false);
  const pendingCanonicalWritesRef = useRef<Record<string, number>>({});
  const pendingWorkspaceWritesRef = useRef<Record<string, unknown>>({});
  const pendingWorkspaceFlushRef = useRef<Promise<void> | null>(null);
  // Set by useCanonicalWorkspaceHydration right before it applies a genuinely
  // new externally-synced value. Consumed (and cleared) once by the matching
  // persistence effect below so an incoming external sync (e.g. an MCP write)
  // is never echoed straight back to storage, which would otherwise raise
  // pendingCanonicalWritesRef and drop a second external sync that lands
  // while that pointless echo write is still in flight.
  const suppressNextPersistRef = useRef<Record<string, boolean>>({});

  const shouldSkipPersist = useCallback((key: string) => {
    if (!suppressNextPersistRef.current[key]) return false;
    suppressNextPersistRef.current[key] = false;
    return true;
  }, []);

  const persistWorkspaceJSON = useCallback((key: string, value: unknown) => {
    if (!(key in pendingWorkspaceWritesRef.current)) {
      pendingCanonicalWritesRef.current[key] = (pendingCanonicalWritesRef.current[key] ?? 0) + 1;
    }
    pendingWorkspaceWritesRef.current[key] = value;
    if (pendingWorkspaceFlushRef.current) return;

    // Start the write in the next microtask so React can finish the state
    // update, but do not leave the latest workspace snapshot behind a timer:
    // quitting the app immediately after creating a task must still persist it.
    const flush = () => {
      pendingWorkspaceFlushRef.current = Promise.resolve().then(async () => {
        const batch = pendingWorkspaceWritesRef.current;
        pendingWorkspaceWritesRef.current = {};
        await persistJSONBatchWithElectronMirror(batch);
        Object.keys(batch).forEach(batchKey => {
          pendingCanonicalWritesRef.current[batchKey] = Math.max(0, (pendingCanonicalWritesRef.current[batchKey] ?? 1) - 1);
        });
      }).finally(() => {
        pendingWorkspaceFlushRef.current = null;
        if (Object.keys(pendingWorkspaceWritesRef.current).length > 0) flush();
      });
    };
    flush();
  }, []);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { timelineSwimlanesRef.current = timelineSwimlanes; }, [timelineSwimlanes]);
  useEffect(() => { statusColumnsRef.current = statusColumns; }, [statusColumns]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { goalPolicyRef.current = goalPolicy; }, [goalPolicy]);

  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace || shouldSkipPersist(TASKS_KEY)) return;
    persistWorkspaceJSON(TASKS_KEY, tasks);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, shouldSkipPersist, tasks]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace || shouldSkipPersist(SWIMLANES_KEY)) return;
    persistWorkspaceJSON(SWIMLANES_KEY, timelineSwimlanes);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, shouldSkipPersist, timelineSwimlanes]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace || shouldSkipPersist(PEOPLE_KEY)) return;
    persistWorkspaceJSON(PEOPLE_KEY, people);
  }, [hasHydratedCanonicalWorkspace, people, persistWorkspaceJSON, shouldSkipPersist]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace || shouldSkipPersist(MILESTONES_KEY)) return;
    persistWorkspaceJSON(MILESTONES_KEY, milestones);
  }, [hasHydratedCanonicalWorkspace, milestones, persistWorkspaceJSON, shouldSkipPersist]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace || shouldSkipPersist(STATUS_COLUMNS_KEY)) return;
    persistWorkspaceJSON(STATUS_COLUMNS_KEY, statusColumns);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, shouldSkipPersist, statusColumns]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace || shouldSkipPersist(PREFERENCES_KEY)) return;
    persistWorkspaceJSON(PREFERENCES_KEY, preferences);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, preferences, shouldSkipPersist]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace || shouldSkipPersist(GOAL_POLICY_KEY)) return;
    persistWorkspaceJSON(GOAL_POLICY_KEY, goalPolicy);
  }, [goalPolicy, hasHydratedCanonicalWorkspace, persistWorkspaceJSON, shouldSkipPersist]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    if (!goalPolicyImpactInitializedRef.current) {
      previousGoalPolicyForImpactRef.current = goalPolicy;
      goalPolicyImpactInitializedRef.current = true;
      return;
    }
    const previousPolicy = previousGoalPolicyForImpactRef.current;
    if (areSerializedValuesEqual(previousPolicy, goalPolicy)) return;
    previousGoalPolicyForImpactRef.current = goalPolicy;
    void window.electron?.recordGoalPolicyImpact?.({
      previousPolicy,
      nextPolicy: goalPolicy,
      actor: 'workspace-settings',
    });
  }, [goalPolicy, hasHydratedCanonicalWorkspace]);
  return {
    tasksRef,
    timelineSwimlanesRef,
    statusColumnsRef,
    preferencesRef,
    goalPolicyRef,
    pendingCanonicalWritesRef,
    suppressNextPersistRef,
  };
}
