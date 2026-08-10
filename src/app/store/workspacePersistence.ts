import { useCallback, useEffect, useRef } from 'react';
import type { Person, ProjectMilestone, Task, TimelineSwimlane } from '../types.ts';
import { GOAL_POLICY_KEY, type GoalPolicyV1 } from '../utils/goalPolicy.ts';
import { persistJSONWithElectronMirror } from '../utils/storage.ts';
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

  const persistWorkspaceJSON = useCallback((key: string, value: unknown) => {
    pendingCanonicalWritesRef.current[key] = (pendingCanonicalWritesRef.current[key] ?? 0) + 1;
    void persistJSONWithElectronMirror(key, value).finally(() => {
      pendingCanonicalWritesRef.current[key] = Math.max(0, (pendingCanonicalWritesRef.current[key] ?? 1) - 1);
    });
  }, []);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { timelineSwimlanesRef.current = timelineSwimlanes; }, [timelineSwimlanes]);
  useEffect(() => { statusColumnsRef.current = statusColumns; }, [statusColumns]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { goalPolicyRef.current = goalPolicy; }, [goalPolicy]);

  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    persistWorkspaceJSON(TASKS_KEY, tasks);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, tasks]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    persistWorkspaceJSON(SWIMLANES_KEY, timelineSwimlanes);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, timelineSwimlanes]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    persistWorkspaceJSON(PEOPLE_KEY, people);
  }, [hasHydratedCanonicalWorkspace, people, persistWorkspaceJSON]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    persistWorkspaceJSON(MILESTONES_KEY, milestones);
  }, [hasHydratedCanonicalWorkspace, milestones, persistWorkspaceJSON]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    persistWorkspaceJSON(STATUS_COLUMNS_KEY, statusColumns);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, statusColumns]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    persistWorkspaceJSON(PREFERENCES_KEY, preferences);
  }, [hasHydratedCanonicalWorkspace, persistWorkspaceJSON, preferences]);
  useEffect(() => {
    if (!hasHydratedCanonicalWorkspace) return;
    persistWorkspaceJSON(GOAL_POLICY_KEY, goalPolicy);
  }, [goalPolicy, hasHydratedCanonicalWorkspace, persistWorkspaceJSON]);
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
  };
}
