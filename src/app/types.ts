export type TaskStatus = 'open' | 'in-progress' | 'under-review' | 'done';
export type TaskSize = 'xs' | 's' | 'm' | 'l';
export type TaskComplexity = 'routine' | 'medium' | 'hard';
export type TaskPriority = 'urgent' | 'moderate' | 'normal' | 'low';
export type PersonKind = 'human' | 'agentic';
export type LoadClassification = 'open-tasks' | 'in-progress' | 'in-review' | 'none';
export type RoadmapStage = 'not-started' | 'in-progress' | 'in-review' | 'complete' | 'excluded';
export type AgentWatchAction = 'inspect_only' | 'inspect_and_work' | 'move_to_ready_for_human_review';

export interface StatusColumn {
  id: string;
  title: string;
  color?: string;
  description?: string;
  loadClassification?: LoadClassification;
  roadmapStage?: RoadmapStage;
  aiWatchEnabled?: boolean;
  aiAction?: AgentWatchAction;
}

export interface TaskComment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface TaskTimeEntry {
  id: string;
  minutes: number;
  note?: string;
  loggedAt: string;
  actor?: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  path: string;
  uri: string;
  size?: number;
  addedAt: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  kind: PersonKind;
  avatar?: string;
  color?: string;
  agentInstructions?: string;
  agentOperationalInstructions?: string;
  availableForSubagentDelegation?: boolean;
}

export type TaskContributionRole = 'contributor' | 'subagent';
export type TaskContributionState = 'pending' | 'working' | 'submitted' | 'revision-requested' | 'accepted' | 'blocked';

export interface TaskContributionV1 {
  id: string;
  personId: string;
  role: TaskContributionRole;
  scope: string;
  state: TaskContributionState;
  latestAttemptId?: string;
  evidenceRefs?: string[];
  createdAt?: string;
  updatedAt?: string;
  [extension: string]: unknown;
}

export interface TaskCollaborationV1 {
  schemaVersion: 1;
  orchestratorId: string;
  contributions: TaskContributionV1[];
  [extension: string]: unknown;
}

export interface TaskContributionAttemptV1 {
  schemaVersion: 1;
  id: string;
  taskId: string;
  contributionId: string;
  ordinal: number;
  state: 'handed-off' | 'acknowledged' | 'working' | 'submitted' | 'completed' | 'stopped' | 'failed';
  createdAt: string;
  updatedAt: string;
  [extension: string]: unknown;
}

export interface TaskCollaborationEventV1 {
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  taskId: string;
  contributionId: string;
  attemptId?: string;
  actorPersonId: string;
  command: string;
  type: string;
  previousState: TaskContributionState;
  nextState: TaskContributionState;
  baseTaskRevision: number;
  nextTaskRevision: number;
  outcome: 'applied';
  occurredAt: string;
  [extension: string]: unknown;
}

export interface Task {
  id: string;
  __mcpRevision?: number;
  title: string;
  createdAt?: string;
  status: TaskStatus;
  notes?: string;
  startDate?: string;
  endDate?: string;
  color?: string;
  size?: TaskSize;
  complexity?: TaskComplexity;
  blocked?: boolean;
  priority?: TaskPriority;
  swimlaneOnly?: boolean; // Tasks that only appear in swimlanes
  swimlaneId?: string; // Which timeline swimlane row this task belongs to
  projectIds?: string[]; // Projects this task belongs to
  assigneeId?: string; // Person assigned to this task
  collaboration?: TaskCollaborationV1;
  project?: string; // Project this task belongs to
  milestoneId?: string; // Primary roadmap milestone this task contributes to
  dependencyIds?: string[]; // Roadmap-only dependencies used for milestone planning arrows
  timeSpentMinutes?: number; // Approximate total time spent on this task
  timeSpentNote?: string; // Latest human-readable time-spent note/source
  timeEntries?: TaskTimeEntry[]; // Optional append-only approximate time log
  attachments?: TaskAttachment[]; // Local file references attached to this task
  comments?: TaskComment[];
  mcpUpdatedAt?: string;
  mcpLastActor?: string;
}

export interface ProjectMilestone {
  id: string;
  convexId?: string;
  title: string;
  projectIds: string[];
  projectId?: string; // Legacy single-project milestone field kept for migration.
  startDate?: string;
  endDate: string;
  notes?: string;
  color?: string;
  linkedTaskIds?: string[];
}

export type GoalElementType = 'goal' | 'subgoal' | 'agent' | 'connector' | 'instructions' | 'condition' | 'approval-gate' | 'human-input' | 'retry' | 'artifact' | 'deliverable';
export type GoalConnectorSide = 'top' | 'right' | 'bottom' | 'left';
export type GoalConditionBranch = 'positive' | 'negative';
export type GoalRetryExhaustionPolicy = 'human-review' | 'fail-goal';
export type GoalElementReadiness = 'not-ready' | 'ready' | 'unavailable' | 'needs-review';
export type GoalAgentMode = 'existing' | 'ephemeral';
export type GoalAcceptanceActor = 'human' | 'agentic' | 'both';
export type GoalBudgetMode = 'hard-cap' | 'goal-pool' | 'approval-required' | 'unbounded';
export type GoalPolicyDimension = 'financial' | 'tokens' | 'concurrency' | 'attempts' | 'retries';
export type GoalPolicyUnit = 'USD' | 'tokens' | 'loops' | 'attempts' | 'retries';
export type GoalInputKind = 'inline' | 'file' | 'task' | 'milestone' | 'mcp-resource' | 'external';
export type GoalScope = 'goal' | 'subgoal' | 'agent' | 'contract';
export type GoalCapabilityTrust = 'trusted' | 'untrusted' | 'unknown';
export type GoalCapabilityPermission = 'allowed' | 'denied' | 'approval-required' | 'unknown';
export type GoalProjectBindingRole = 'primary' | 'contributor' | 'dependency';
export type GoalProjectBindingState = 'active' | 'stale-project' | 'archived-project';

export type GoalArtifactType = 'task' | 'milestone' | 'goal' | 'evidence' | 'document' | 'file' | 'url' | 'user-defined';
export type GoalArtifactRole = 'supporting' | 'deliverable';
export type GoalDeliverableStatus = 'planned' | 'in-progress' | 'ready-for-review' | 'accepted' | 'rejected';
export type SupportingArtifactType = 'document' | 'file' | 'url' | 'user-defined';

export interface GoalRuntimeProjection {
  execution?: { state?: string; revision?: number; attempt?: number; policyRevision?: number; executionAttemptId?: string; reconciliationRequired?: boolean; workerDelegationStatus?: 'not-required' | 'required' | 'fulfilled' | 'blocked'; workerDelegationResults?: Array<{ elementId: string; status: string; agentId?: string; agentName?: string }> } | null;
  handoffs?: Array<{ id: string; deliverableId?: string; producedArtifactReferences?: Array<{ label?: string; locator?: string; format?: string }>; deliveryFacts?: Record<string, unknown>; deliveredAt?: string }>;
  effectivePolicy?: import('./utils/goalPolicy.ts').GoalPolicyV1 | null;
  policyRevision?: number;
  executionAttempt?: number | null;
  executionAttemptId?: string | null;
  agentAvailability?: Array<{ elementId: string; available: boolean; errorCode?: string | null }>;
  policyImpacts?: Array<{ goalId?: string; status?: string; requiresUserConfirmation?: boolean }>;
  scheduleOccurrences?: GoalScheduleOccurrence[];
  lastChange?: { scope?: string; errorCode?: string; changeType?: string } | null;
}

export interface GoalInputReference {
  id: string;
  kind: GoalInputKind;
  scope: GoalScope;
  ownerId?: string;
  required?: boolean;
  label?: string;
  valueType?: string;
  value?: unknown;
  valueRef?: string;
  locator?: string;
  resourceUri?: string;
  artifactId?: string;
  sourceRevision?: number;
  contentHash?: string;
  sensitive?: boolean;
  state?: 'resolved' | 'missing' | 'stale' | 'unavailable';
}

export interface GoalCapabilityReference {
  id: string;
  capabilityId: string;
  scope: GoalScope;
  ownerId?: string;
  required?: boolean;
  version?: string;
  source?: string;
  sourceConstraint?: string;
  trust?: GoalCapabilityTrust;
  permission?: GoalCapabilityPermission;
  label?: string;
  state?: 'available' | 'missing' | 'unavailable' | 'incompatible' | 'denied';
}

export interface GoalProjectBinding {
  id: string;
  projectId: string;
  role: GoalProjectBindingRole;
  projection?: {
    state: GoalProjectBindingState;
    exists: boolean;
    name?: string;
    description?: string;
  };
}

export interface GoalDeliverySpec {
  outcomeKind: 'file' | 'summary' | 'conclusion' | 'resolution' | 'other';
  instructions: string;
  format?: string;
  destination?: string;
  recipient?: string;
  acceptanceCriteria?: string[];
  expectedArtifactCount?: number;
}

export interface GoalArtifactReference {
  id: string;
  artifactType: GoalArtifactType;
  artifactId: string;
  role?: string;
  linkedAt?: string;
  linkedBy?: string;
  sourceRevision?: number;
  contribution?: 'supporting' | 'deliverable' | 'dependency' | 'evidence';
  label?: string;
  kind?: string;
  format?: string;
  locator?: string;
  contentHash?: string;
  sourceTaskId?: string;
  sourceAttachmentId?: string;
  projection?: {
    exists?: boolean;
    state?: string;
    title?: string;
    status?: string;
    assigneeId?: string;
    dependencyIds?: string[];
    startDate?: string;
    endDate?: string;
    milestoneId?: string;
    evidence?: unknown[];
    contribution?: 'supporting' | 'deliverable' | 'dependency' | 'evidence';
    contributionState?: 'satisfied' | 'blocked-dependency' | 'missing-evidence' | 'verified-evidence' | 'stale-source';
    sourceRevision?: number;
  };
}

export interface GoalPolicyDimensionOverride {
  constrained?: boolean;
  mode?: Exclude<GoalBudgetMode, 'unbounded'>;
  value?: number;
  unit?: GoalPolicyUnit;
}

export interface GoalPolicy {
  acceptanceActor?: GoalAcceptanceActor;
  financialBudgetMode?: GoalBudgetMode;
  tokenBudgetMode?: GoalBudgetMode;
  timeBudgetMode?: GoalBudgetMode;
  concurrencyBudgetMode?: GoalBudgetMode;
  retryBudgetMode?: GoalBudgetMode;
  maxRetries?: number;
  maxLoopAttempts?: number;
  maxConcurrentLoops?: number;
  maxFinancialCost?: number;
  maxTokens?: number;
  loopAttemptsBudgetMode?: GoalBudgetMode;
  dimensions?: Partial<Record<GoalPolicyDimension, GoalPolicyDimensionOverride>>;
  agentMutationConfirmation?: 'required' | 'allowed';
}

export interface GoalAgentConfiguration {
  version: 1;
  mode: GoalAgentMode;
  assigneeId?: string;
  requestedName?: string;
  requestedType?: string;
  autoGenerateName?: boolean;
  instructions: string;
  workAsSubagent?: boolean;
  spawnIfUnavailable?: boolean;
}

export interface GoalElement {
  id: string;
  type: GoalElementType;
  title: string;
  body?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  status?: 'draft' | 'working' | 'blocked' | 'complete' | 'evidence-required' | 'approval-required' | 'permission-denied' | 'human-review';
  readiness?: GoalElementReadiness;
  readinessReason?: string;
  assigneeId?: string;
  agentConfiguration?: GoalAgentConfiguration;
  sourceId?: string;
  targetId?: string;
  sourceSide?: GoalConnectorSide;
  targetSide?: GoalConnectorSide;
  conditionBranch?: GoalConditionBranch;
  conditionPositiveLabel?: string;
  conditionNegativeLabel?: string;
  conditionPositiveOutcome?: string;
  conditionNegativeOutcome?: string;
  /** Legacy aliases retained for older persisted condition records. */
  conditionTrueLabel?: string;
  conditionFalseLabel?: string;
  humanInputPrompt?: string;
  retryMaxAttempts?: number;
  retryExhaustionPolicy?: GoalRetryExhaustionPolicy;
  handoffRequired?: boolean;
  handoffNotes?: string;
  artifactRole?: 'supporting';
  approvalEvidenceRequired?: boolean;
  policy?: GoalPolicy;
  inputs?: GoalInputReference[];
  capabilities?: GoalCapabilityReference[];
  artifactReferences?: GoalArtifactReference[];
  deliverySpec?: GoalDeliverySpec;
  deliverableStatus?: GoalDeliverableStatus;
}

export interface GoalRecord {
  id: string;
  title: string;
  color?: string;
  updatedAt: string;
  elements: GoalElement[];
  overseerAgentId?: string;
  policy?: GoalPolicy;
  inputs?: GoalInputReference[];
  capabilities?: GoalCapabilityReference[];
  projectBindings?: GoalProjectBinding[];
  projectless?: boolean;
  projectBindingState?: 'projectless' | 'bound' | 'stale';
}

export type GoalScheduleMode = 'one-time' | 'recurring';
export type GoalScheduleFrequency = 'weekly' | 'monthly';

export interface GoalScheduleRule {
  mode: GoalScheduleMode;
  frequency?: GoalScheduleFrequency;
  time: string;
  date?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export interface GoalSchedule {
  id: string;
  goalId: string;
  enabled: boolean;
  rule: GoalScheduleRule;
  timezone: string;
  startsAt?: string;
  endsAt?: string;
  temporalMode: 'anchored' | 'latest';
  updatedAt: string;
}

export type GoalScheduleOccurrenceState = 'pending' | 'retrying' | 'blocked' | 'started' | 'missed' | 'expired';

export interface GoalScheduleOccurrence {
  id: string;
  scheduleId: string;
  goalId?: string;
  scheduledFor: string;
  temporalMode: 'anchored' | 'latest';
  state: GoalScheduleOccurrenceState;
  attempts: number;
  retryable?: boolean;
  error?: string;
  message?: string;
  executionId?: string;
  createdAt?: string;
  lastAttemptAt?: string;
  startedAt?: string;
  blockedAt?: string;
  missedAt?: string;
  expiredAt?: string;
}

export type Swimlane = StatusColumn;

export interface TimelineSwimlane {
  id: string;
  name: string;
  description?: string;
  subtitle?: string;
  color?: string;
}

export interface StorageMeter {
  usedBytes: number;
  totalBytes: number;
  usagePercent: number;
  sourceLabel: string;
}
