# Agent Assignment, MCP, and Modular Backend Architecture Spec

Date: 2026-03-06
Status: Proposed
Scope: Task model, project/repo routing, agent workflow, MCP surface, and backend modularization for future desktop and web deployments

## 1. Purpose

This spec defines how Omvra should evolve from a local desktop planning tool into a system that can:

- track human-reported issues cleanly
- assign tasks to agents in a structured way
- expose project and task context to external tools through MCP
- route work to the correct code repository
- support comments, activity history, and lightweight auditability
- remain private-first
- later run as:
  - Electron desktop app
  - browser-hosted app
  - Docker deployment
  - Umbrel deployment
  - self-hosted setup backed by a private database

The design should avoid tightly coupling the product to any single backend such as `localStorage`, `electron-store`, Convex, or a future SQL store.

## 2. Problem Statement

Omvra currently manages tasks primarily as UI state with local persistence. That is sufficient for a local-first desktop planner, but it does not support a robust workflow where:

- a human reports a bug
- an agent is assigned to it
- the agent detects the assignment
- the agent reads full issue context
- the agent resolves the relevant repository or repositories
- the agent works in the repo
- the agent updates status to `under-review`
- the agent posts a brief execution summary for the human to validate

In the current model:

- tasks only have one `assigneeId`
- projects are not formal first-class records with repo metadata
- persistence is fragmented
- there is no task activity model
- there is no backend abstraction
- there is no MCP-oriented API surface

## 3. Goals

- separate human ownership from agent execution
- keep task description focused on the original problem statement
- store agent output in a separate summary field
- allow comments and activity history to grow later without schema churn
- support multi-project tasks cleanly
- make repository routing deterministic
- expose a stable MCP surface for Codex/Claude-style integrations
- support both local-only and remote/self-hosted backends
- make the core architecture portable to web deployments

## 4. Non-Goals

- arbitrary third-party runtime plugins loaded from unknown sources
- full marketplace/plugin sandboxing in the first iteration
- multi-tenant SaaS features
- real-time collaboration requirements in the first iteration
- PR creation or git hosting integration in the first iteration

## 5. Core Concepts

### 5.1 Task roles

Each task may involve multiple actors with different responsibilities.

- `reporter`
  - the human who created or reported the task
  - defaults to the current user
- `assignee`
  - the human primarily responsible for business ownership or review
  - may be the same as the reporter
- `agent`
  - the automation or assistant responsible for attempting implementation

These must be separate fields. The current single-assignee model is insufficient for the intended workflow.

### 5.2 Description vs summary

The task description must remain the original issue statement or working requirements.

The agent must not overwrite this field with implementation notes.

Agent output belongs in:

- `agentSummary`
- comments
- activity log
- optional artifact references

### 5.3 Projects are routing entities

Projects must become first-class records and not remain only UI swimlanes.

Projects are needed for:

- grouping tasks
- mapping tasks to local repositories
- mapping tasks to remote repositories later
- determining how an agent should work on the task

### 5.4 Multi-project tasks

If a task belongs to multiple projects, that means either:

- one logical issue spans multiple repos
- or the task should fan out into repo-specific child execution tasks

The long-term preferred model is:

- parent task for user-facing coordination
- optional child execution tasks per project/repo

For the first implementation, multi-project tasks may remain single records, but the schema should be designed to support later fan-out.

## 6. Proposed Data Model

### 6.1 User and agent identities

```ts
export interface UserIdentity {
  id: string;
  name: string;
  role?: string;
  avatar?: string;
  color?: string;
}

export interface AgentIdentity {
  id: string;
  name: string;
  enabled: boolean;
  instructions?: string;
}

export interface AgentRuntimeProfile {
  id: string;
  name: string;
  integrationMode: "external-handoff" | "acp";
  executablePath?: string;
  applicationUrlScheme?: string;
  launchArgs?: string[];
  transport?: "stdio";
  enabled: boolean;
}

export interface AgentRuntimeObservation {
  runtimeProfileId: string;
  version?: string;
  capabilities?: string[];
  authenticationState: "unknown" | "authenticated" | "required" | "error";
  checkedAt: string;
}
```

`AgentIdentity` represents the accountable Omvra persona and remains provider-neutral. `AgentRuntimeProfile` addresses an exact installed application or ACP adapter. Provider, model, capabilities, authentication, and billing are properties reported or owned by that runtime; they are not part of the Omvra identity.

### 6.2 Project model

```ts
export interface Project {
  id: string;
  name: string;
  color?: string;
  repoPath?: string;
  repoUrl?: string;
  defaultBranch?: string;
  workspaceKind?: "electron" | "web" | "backend" | "library" | "fullstack";
  agentProfileId?: string;
  defaultAgentRuntimeProfileId?: string;
  metadata?: Record<string, string>;
}
```

Notes:

- `repoPath` is the key field for local agent routing
- `repoUrl` is optional and mostly useful later
- `agentProfileId` allows future project-specific prompts or instructions
- `defaultAgentRuntimeProfileId` selects an installed execution runtime without changing the assigned agent identity

### 6.3 Task model

```ts
export type TaskStatus =
  | "open"
  | "in-progress"
  | "under-review"
  | "done";

export type AgentState =
  | "idle"
  | "queued"
  | "working"
  | "blocked"
  | "completed"
  | "failed";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;

  startDate?: string;
  endDate?: string;

  priority?: "urgent" | "moderate" | "normal" | "low";
  size?: "xs" | "s" | "m" | "l";
  complexity?: "routine" | "medium" | "hard";
  blocked?: boolean;

  projectIds: string[];
  primaryProjectId?: string;

  reporterId: string;
  assigneeId?: string;
  agentId?: string;

  agentState?: AgentState;
  agentSummary?: string;
  reviewRequestedAt?: string;
  agentLastRunAt?: string;
  agentRunId?: string;

  createdAt: string;
  updatedAt: string;
}
```

Notes:

- `project` display string should not be stored as canonical data
- `primaryProjectId` can help timeline rendering and default routing
- `agentSummary` must be intentionally short
- `agentRunId` allows future traceability

### 6.4 Comments and activity

Comments and activity should be separate from tasks.

```ts
export interface TaskComment {
  id: string;
  taskId: string;
  authorType: "user" | "agent" | "system";
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  type:
    | "task-created"
    | "status-changed"
    | "agent-assigned"
    | "agent-started"
    | "agent-finished"
    | "agent-failed"
    | "summary-updated"
    | "comment-added"
    | "projects-changed";
  actorType: "user" | "agent" | "system";
  actorId?: string;
  metadata?: Record<string, string>;
  createdAt: string;
}
```

This allows later expansion without repeatedly mutating the task schema.

## 7. Agent Workflow

### 7.0 Runtime resolution

Before an execution or external handoff, Omvra resolves the runtime from an explicit task-execution or Goal-node choice, then the project default, then the global default. The selected runtime is shown to the user and is never silently replaced when missing, incompatible, or signed out.

The minimum integration is a user-initiated external handoff that opens the selected runtime with a bounded task prompt and workspace. ACP adds structured session control when the configured adapter passes protocol initialization. Authentication remains inside the installed runtime; Omvra does not integrate provider authentication libraries or store provider credentials.

### 7.1 Assignment flow

1. Human creates or edits a task.
2. Reporter is auto-set to the current human user.
3. Human optionally assigns an agent.
4. If `agentId` becomes set, the task enters:
   - `status = in-progress` only if desired by product rules
   - `agentState = queued`
5. System records an activity entry.

### 7.2 Agent pickup flow

1. Agent queries for tasks assigned to itself where:
   - `agentId = currentAgentId`
   - `agentState in (queued, blocked)`
   - `status not in (done)`
2. Agent reads:
   - task core fields
   - description
   - comments
   - activity
   - project metadata
3. Agent resolves repository targets from `projectIds`.

### 7.3 Repository resolution rules

If `projectIds.length === 1`:

- resolve a single repo from that project

If `projectIds.length > 1`:

- collect all mapped repos
- if all map to the same `repoPath`, treat as one working repo
- if they map to multiple repos:
  - short-term: agent handles as one multi-repo issue with explicit note
  - long-term: system may create or suggest child execution tasks

### 7.4 Agent completion flow

When work is completed:

1. Agent sets:
   - `status = under-review`
   - `agentState = completed`
   - `reviewRequestedAt = now`
   - `agentSummary = short implementation summary`
2. Agent appends activity log entry
3. Agent may append a short comment with:
   - branch name
   - commit hash
   - PR link
   - validation note

The original task description remains untouched.

### 7.5 Failure or blocked flow

If the agent cannot proceed:

1. Agent sets:
   - `agentState = blocked` or `failed`
2. Agent adds a short comment explaining the blocker
3. Task status may remain unchanged or move according to product rules

## 8. MCP Integration Model

### 8.1 Design principle

Omvra should expose an MCP server so external agents such as Codex or Claude can consume task/project context while still doing actual code work in the correct repository.

Omvra should not depend on those agents being embedded inside the app.

### 8.2 MCP responsibilities

Read responsibilities:

- list projects
- read project routing info
- list tasks
- search tasks
- fetch full task context
- fetch comments and activity
- fetch agent queue for a given agent

Write responsibilities:

- update task status
- set agent state
- set agent summary
- add comment
- append activity entry

### 8.3 Proposed MCP tools

#### Read tools

- `list_projects()`
- `get_project(projectId)`
- `list_tasks(filter?)`
- `get_task(taskId)`
- `search_tasks(query)`
- `list_agent_tasks(agentId, states?)`
- `get_task_context(taskId)`
- `get_project_repo_context(projectId)`

#### Write tools

- `assign_agent(taskId, agentId)`
- `update_task_status(taskId, status)`
- `set_agent_state(taskId, agentState)`
- `set_agent_summary(taskId, summary)`
- `add_task_comment(taskId, body, authorType, authorId)`
- `append_task_activity(taskId, type, actorType, actorId, metadata?)`

### 8.4 Proposed MCP resource shapes

#### `get_task_context(taskId)`

Should return:

- task core fields
- related projects
- reporter
- assignee
- assigned agent
- comments
- recent activity
- repo targets derived from project metadata

#### `get_project_repo_context(projectId)`

Should return:

- `projectId`
- `projectName`
- `repoPath`
- `repoUrl`
- `defaultBranch`
- `workspaceKind`
- optional `agentProfile`

## 9. Backend and Deployment Architecture

### 9.1 Guiding principle

The core product must not depend directly on:

- `localStorage`
- `electron-store`
- Electron IPC
- Convex-specific APIs
- browser-only storage APIs

Instead, the product should depend on interfaces.

### 9.2 Core interfaces

```ts
export interface WorkspaceRepository {
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;

  listTasks(): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;
  saveTask(task: Task): Promise<void>;
  deleteTask(taskId: string): Promise<void>;

  listComments(taskId: string): Promise<TaskComment[]>;
  addComment(comment: TaskComment): Promise<void>;

  listActivity(taskId: string): Promise<TaskActivity[]>;
  addActivity(activity: TaskActivity): Promise<void>;
}

export interface HostCapabilities {
  openExternal(url: string): Promise<void>;
  pickFiles(): Promise<string[]>;
  embedAttachment(filePath: string): Promise<{ path: string }>;
  getAppInfo(): Promise<{ version: string; host: string }>;
}
```

### 9.3 Initial adapter implementations

Recommended initial adapters:

- `LocalBrowserRepository`
- `ElectronStoreRepository`
- `ElectronHostCapabilities`

Recommended future adapters:

- `ConvexRepository`
- `PostgresRepository`
- `FilesystemRepository`
- `BrowserHostCapabilities`
- `WebServerHostCapabilities`

### 9.4 Packaging target structure

Recommended long-term package split:

- `packages/core`
  - domain types
  - use cases
  - repository interfaces
  - migrations
- `packages/web`
  - React frontend
  - browser composition root
- `packages/electron-shell`
  - Electron main/preload
  - desktop packaging
- `packages/server`
  - optional HTTP API
  - optional auth
  - background agent queue processing
- `packages/adapters`
  - storage adapters
  - MCP adapter
  - host adapters

This makes the app portable to:

- desktop
- browser
- Docker
- Umbrel
- private self-hosted deployments with their own database

## 10. Settings Requirements

To support this architecture cleanly, a settings area should eventually expose:

- current user identity
- available agent identities
- installed agent runtime profiles
- one global default runtime and optional project defaults
- runtime connection test, observed version, ACP capabilities, availability, and authentication state
- default reporter behavior
- available projects and repo mapping
- backend mode
  - local browser
  - electron store
  - remote API
  - Convex
- MCP connection settings
- privacy and diagnostics controls

This settings model should also be backed by repository/config abstractions, not ad hoc `localStorage`.

## 11. Security and Privacy Principles

- all integrations must be opt-in
- local-only mode must remain supported
- provider authentication and credentials remain owned by the installed runtime
- runtime launch uses an exact executable plus argument array without shell interpolation
- missing or incompatible runtimes fail explicitly without automatic provider fallback or background retries
- no task data should be transmitted externally unless a backend or MCP integration is explicitly enabled
- MCP write actions should be constrained to safe task-level operations
- repo paths should be treated as sensitive local configuration

## 12. Migration Strategy

### Phase 1

- add `Project` entity
- add `reporterId`
- add `agentId`
- add `agentState`
- add `agentSummary`
- add comments and activity tables/collections
- keep existing UI functional

### Phase 2

- move persistence into `WorkspaceRepository`
- stop direct `localStorage` writes in UI components
- migrate existing task project fields

### Phase 3

- add settings UI
- add project repo mapping
- add agent identities
- add one exact local runtime profile, global/project selection, and connection testing without provider credentials

### Phase 4

- expose MCP read-only tools
- verify external agent workflow

### Phase 5

- expose MCP write tools
- enable automated status/summary/comment updates

### Phase 6

- add web-hosted runtime
- add remote/self-hosted backend adapter
- prepare Docker/Umbrel packaging

## 13. Open Decisions

- should `assigneeId` remain a human owner field or be renamed to `ownerId`?
- should multi-repo tasks automatically fan out into child tasks or remain manual?
- should agent execution be polling-based or event/queue-based?
- should comments be markdown-capable from the start?
- should project repo mapping support multiple repo paths per project in v1?
- should MCP run inside the desktop app, a sidecar process, or a web/server package?

## 14. Recommendation

The recommended path is:

1. formalize projects as first-class data
2. separate human ownership from agent execution
3. add comments and activity as separate records
4. move to repository and host abstractions
5. expose MCP over that stable service layer

This gives Omvra a clean path toward:

- agent-driven bug execution
- private local workflows
- future self-hosted backends
- portable desktop and web deployments

without locking the product into a single storage or runtime model.
