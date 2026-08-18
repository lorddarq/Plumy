import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Person, ProjectMilestone, Task, TaskStatus, TimelineSwimlane } from '../types.ts';
import { initialTasks, initialTimelineSwimlanes } from '../data/sampleData.ts';
import { initialMilestones } from '../data/sampleMilestones.ts';
import { initialPeople } from '../data/samplePeople.ts';
import { swimlanes as defaultSwimlanes } from '../constants/swimlanes.ts';
import {
  buildLocalMcpAddress,
  DEFAULT_MCP_BIND_HOST,
  DEFAULT_MCP_PORT,
} from '../constants/mcp.ts';
import {
  DEFAULT_MARKDOWN_APPEARANCE,
  type MarkdownAppearance,
} from '../utils/markdownAppearance.ts';
import { getDefaultStatusId } from '../utils/mcpPreferences.ts';
import { type StatusColumnState } from '../utils/workspaceSanitizers.ts';
import {
  type GoalPolicyV1,
  updateGoalPolicy,
} from '../utils/goalPolicy.ts';
import { useWorkspaceActions, type WorkspaceSnapshot } from './workspaceActions.ts';
import {
  readInitialWorkspaceState,
  useCanonicalWorkspaceHydration,
  type WorkspaceSeeds,
} from './workspaceHydration.ts';
import { useWorkspacePersistence } from './workspacePersistence.ts';
import {
  createWorkspaceSubscriptionStore,
  type WorkspaceSubscriptionStore,
} from './workspaceSubscriptionStore.ts';

const ENABLE_SAMPLE_WORKSPACE = Boolean(import.meta.env.DEV);
const WORKSPACE_SEEDS: WorkspaceSeeds = {
  tasks: ENABLE_SAMPLE_WORKSPACE ? initialTasks : [],
  timelineSwimlanes: ENABLE_SAMPLE_WORKSPACE ? initialTimelineSwimlanes : [],
  people: ENABLE_SAMPLE_WORKSPACE ? initialPeople : [],
  milestones: ENABLE_SAMPLE_WORKSPACE ? initialMilestones : [],
};

export interface AppPreferences {
  executionLoadStatusIds: TaskStatus[];
  pipelineLoadStatusIds: TaskStatus[];
  cleanupGoalArtifacts: boolean;
  goalAuditArchiveDirectory: string;
  skillRoots: Array<{ root: string; source?: string }>;
  customScrollbarsEnabled: boolean;
  condensedUI: boolean;
  performanceLoggingEnabled: boolean;
  updateChannel: 'stable' | 'rc';
  markdownAppearance: MarkdownAppearance;
  mcpAgentAccessEnabled: boolean;
  mcpCapabilityProfile: 'read_only' | 'task_write' | 'admin';
  mcpBindHost: string;
  mcpPort: number;
  mcpServerAddress: string;
  mcpAccessToken: string;
  mcpAccessTokenIssuedAt?: string;
  mcpAccessTokenTtlMinutes: number;
}

export interface WorkspaceStoreValue {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  timelineSwimlanes: TimelineSwimlane[];
  setTimelineSwimlanes: Dispatch<SetStateAction<TimelineSwimlane[]>>;
  people: Person[];
  setPeople: Dispatch<SetStateAction<Person[]>>;
  milestones: ProjectMilestone[];
  setMilestones: Dispatch<SetStateAction<ProjectMilestone[]>>;
  statusColumns: StatusColumnState[];
  setStatusColumns: Dispatch<SetStateAction<StatusColumnState[]>>;
  preferences: AppPreferences;
  setPreferences: Dispatch<SetStateAction<AppPreferences>>;
  goalPolicy: GoalPolicyV1;
  setGoalPolicy: Dispatch<SetStateAction<GoalPolicyV1>>;
  replaceWorkspaceSnapshot: (snapshot: WorkspaceSnapshot) => void;
  saveMilestone: (milestone: ProjectMilestone) => void;
  deleteMilestone: (milestoneId: string) => void;
  syncMilestoneTaskLinks: (milestone: ProjectMilestone) => void;
  linkTaskMilestone: (taskId: string, nextMilestoneId?: string) => void;
  removeTaskMilestoneLinks: (taskId: string) => void;
  applyRoadmapTaskDependencies: (updates: Array<{ taskId: string; dependencyIds: string[] }>) => void;
  toggleExecutionLoadStatus: (statusId: TaskStatus) => void;
  togglePipelineLoadStatus: (statusId: TaskStatus) => void;
  setCleanupGoalArtifacts: (enabled: boolean) => void;
  setGoalAuditArchiveDirectory: (directory: string) => void;
  setExternalSkillsDirectory: (directory: string) => void;
  setCustomScrollbarsEnabled: (enabled: boolean) => void;
  setCondensedUI: (enabled: boolean) => void;
  setPerformanceLoggingEnabled: (enabled: boolean) => void;
  updateGoalPolicy: (updates: Parameters<typeof updateGoalPolicy>[1]) => void;
  resetGoalPolicy: () => void;
  setUpdateChannel: (channel: AppPreferences['updateChannel']) => void;
  setMarkdownAppearance: (updates: Partial<MarkdownAppearance>) => void;
  setMcpAgentAccessEnabled: (enabled: boolean) => void;
  setMcpServerAddress: (address: string) => void;
  setMcpBindHost: (host: string) => void;
  setMcpPort: (port: number) => void;
  setMcpAccessToken: (token: string) => void;
  setMcpAccessTokenTtlMinutes: (ttl: number) => void;
  setMcpCapabilityProfile: (profile: AppPreferences['mcpCapabilityProfile']) => void;
  hasHydratedCanonicalWorkspace: boolean;
  resetWorkspaceData: () => void;
}

const WorkspaceStoreContext = createContext<WorkspaceSubscriptionStore | null>(null);

export function createDefaultAppPreferences(
  statusColumns: StatusColumnState[] = defaultSwimlanes
): AppPreferences {
  return {
    executionLoadStatusIds: [getDefaultStatusId(statusColumns, 'in-progress')],
    pipelineLoadStatusIds: [getDefaultStatusId(statusColumns, 'open')],
    cleanupGoalArtifacts: false,
    goalAuditArchiveDirectory: '',
    skillRoots: [],
    customScrollbarsEnabled: true,
    condensedUI: false,
    performanceLoggingEnabled: false,
    updateChannel: 'stable',
    markdownAppearance: { ...DEFAULT_MARKDOWN_APPEARANCE },
    mcpAgentAccessEnabled: false,
    mcpCapabilityProfile: 'read_only',
    mcpBindHost: DEFAULT_MCP_BIND_HOST,
    mcpPort: DEFAULT_MCP_PORT,
    mcpServerAddress: buildLocalMcpAddress(DEFAULT_MCP_BIND_HOST, DEFAULT_MCP_PORT),
    mcpAccessToken: '',
    mcpAccessTokenIssuedAt: undefined,
    mcpAccessTokenTtlMinutes: 60,
  };
}

export function WorkspaceStoreProvider({ children }: PropsWithChildren) {
  const initialStateRef = useRef<ReturnType<typeof readInitialWorkspaceState> | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = readInitialWorkspaceState(WORKSPACE_SEEDS);
  }
  const initialState = initialStateRef.current;

  const [tasks, setTasks] = useState<Task[]>(initialState.tasks);
  const [timelineSwimlanes, setTimelineSwimlanes] = useState<TimelineSwimlane[]>(initialState.timelineSwimlanes);
  const [people, setPeople] = useState<Person[]>(initialState.people);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>(initialState.milestones);
  const [statusColumns, setStatusColumns] = useState<StatusColumnState[]>(initialState.statusColumns);
  const [preferences, setPreferences] = useState<AppPreferences>(initialState.preferences);
  const [goalPolicy, setGoalPolicy] = useState<GoalPolicyV1>(initialState.goalPolicy);
  const [hasHydratedCanonicalWorkspace, setHasHydratedCanonicalWorkspace] = useState(
    initialState.hasHydratedCanonicalWorkspace
  );

  const persistence = useWorkspacePersistence({
    tasks,
    timelineSwimlanes,
    people,
    milestones,
    statusColumns,
    preferences,
    goalPolicy,
    hasHydratedCanonicalWorkspace,
  });

  useCanonicalWorkspaceHydration({
    seeds: WORKSPACE_SEEDS,
    hasHydratedCanonicalWorkspace,
    setHasHydratedCanonicalWorkspace,
    setTasks,
    setTimelineSwimlanes,
    setPeople,
    setMilestones,
    setStatusColumns,
    setPreferences,
    setGoalPolicy,
    timelineSwimlanesRef: persistence.timelineSwimlanesRef,
    statusColumnsRef: persistence.statusColumnsRef,
    preferencesRef: persistence.preferencesRef,
    goalPolicyRef: persistence.goalPolicyRef,
    pendingCanonicalWritesRef: persistence.pendingCanonicalWritesRef,
    suppressNextPersistRef: persistence.suppressNextPersistRef,
  });

  const actions = useWorkspaceActions({
    milestones,
    tasksRef: persistence.tasksRef,
    setTasks,
    setTimelineSwimlanes,
    setPeople,
    setMilestones,
    setStatusColumns,
    setPreferences,
    setGoalPolicy,
    createDefaultPreferences: createDefaultAppPreferences,
  });

  const value = useMemo<WorkspaceStoreValue>(() => ({
    tasks,
    setTasks,
    timelineSwimlanes,
    setTimelineSwimlanes,
    people,
    setPeople,
    milestones,
    setMilestones,
    statusColumns,
    setStatusColumns,
    preferences,
    setPreferences,
    goalPolicy,
    setGoalPolicy,
    ...actions,
    hasHydratedCanonicalWorkspace,
  }), [
    actions,
    goalPolicy,
    hasHydratedCanonicalWorkspace,
    milestones,
    people,
    preferences,
    statusColumns,
    tasks,
    timelineSwimlanes,
  ]);

  const subscriptionStoreRef = useRef<WorkspaceSubscriptionStore | null>(null);
  if (!subscriptionStoreRef.current) {
    subscriptionStoreRef.current = createWorkspaceSubscriptionStore(value);
  }
  const subscriptionStore = subscriptionStoreRef.current;

  useLayoutEffect(() => {
    subscriptionStore.publish(value);
  }, [subscriptionStore, value]);

  return (
    <WorkspaceStoreContext.Provider value={subscriptionStore}>
      {children}
    </WorkspaceStoreContext.Provider>
  );
}

export function useWorkspaceSelector<T>(
  selector: (value: WorkspaceStoreValue) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
): T {
  const store = useContext(WorkspaceStoreContext);
  if (!store) {
    throw new Error('useWorkspaceSelector must be used within WorkspaceStoreProvider.');
  }

  const cacheRef = useRef<{
    snapshot: WorkspaceStoreValue;
    selector: (value: WorkspaceStoreValue) => T;
    selection: T;
  } | null>(null);
  const getSelection = useMemo(() => () => {
    const snapshot = store.getSnapshot();
    const cached = cacheRef.current;
    if (cached && cached.selector === selector && Object.is(cached.snapshot, snapshot)) return cached.selection;

    const selection = selector(snapshot);
    if (cached && isEqual(cached.selection, selection)) {
      cacheRef.current = { snapshot, selector, selection: cached.selection };
      return cached.selection;
    }

    cacheRef.current = { snapshot, selector, selection };
    return selection;
  }, [isEqual, selector, store]);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}

export function useWorkspaceStore(): WorkspaceStoreValue {
  return useWorkspaceSelector(value => value);
}
