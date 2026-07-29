const { buildMcpPromptCatalog } = require('./workspace-service.cjs');

const READ_TOOL_DEFINITIONS = [
  {
    name: 'workspace.get_snapshot',
    description: 'Returns the full read-only workspace snapshot. Use this after initialize when you need the canonical task, person, project, and board state.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'tasks.list',
    description: 'Lists tasks with optional filters (status, assigneeId, search, projectId).',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        status: { type: 'string' },
        assigneeId: { type: 'string' },
        search: { type: 'string' },
        projectId: { type: 'string' },
      },
    },
  },
  {
    name: 'goals.list',
    description: 'Lists complete goal graphs, including subgoals, linked personas, scoped instructions, conditions, approval gates, sequence connectors, and execution metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'diagnostics.audit_summary',
    description: 'Returns bounded privacy-preserving MCP audit summaries grouped by agent, client, tool, transport, origin, outcome, and complexity band. It never returns raw audit events or payloads.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        agent: { type: 'string' },
        clientName: { type: 'string' },
        toolName: { type: 'string' },
        transport: { type: 'string' },
        origin: { type: 'string' },
        outcome: { type: 'string' },
        complexityBand: { type: 'string' },
      },
    },
  },
  {
    name: 'tasks.get',
    description: 'Gets a single task by id.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        taskId: { type: 'string' },
      },
      oneOf: [{ required: ['id'] }, { required: ['taskId'] }],
    },
  },
  {
    name: 'tasks.collaboration_history',
    description: 'Returns bounded contribution attempt and redacted lifecycle-event history for one task, optionally filtered to one contribution.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string' },
        contributionId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'agent.resolve_task_context',
    description: 'Strict execution preflight. Resolves a task by id, then its exact assignee id and required agent context. A failed result must prevent task work from starting.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'cards.kanban.list',
    description: 'Lists cards for the kanban view. Use this when you want a board-shaped projection with task status, assignee, and notes.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        statusId: { type: 'string' },
        assigneeId: { type: 'string' },
        search: { type: 'string' },
      },
    },
  },
  {
    name: 'cards.timeline.list',
    description: 'Lists cards for the timeline view. Use this when you need date-bounded task cards for scheduling or planning.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        laneId: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
      },
    },
  },
  {
    name: 'boards.watch.poll',
    description: 'Polls a kanban board/status for new or changed tasks and persists watcher state for duplicate suppression. Call this repeatedly to watch a board for incoming work.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        watcherId: { type: 'string' },
        statusId: { type: 'string' },
        assigneeId: { type: 'string' },
        projectId: { type: 'string' },
        search: { type: 'string' },
        persist: { type: 'boolean' },
      },
      required: ['statusId'],
    },
  },
  {
    name: 'milestones.list',
    description: 'Lists roadmap milestones with project scope, release dates, notes, and linked task IDs.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'milestones.get',
    description: 'Gets one roadmap milestone by id.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        milestoneId: { type: 'string' },
      },
      oneOf: [{ required: ['id'] }, { required: ['milestoneId'] }],
    },
  },
  {
    name: 'goals.get',
    description: 'Gets one complete goal graph by id, including current execution state and explicit worker-owned subagent delegation instructions.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        goalId: { type: 'string' },
      },
      oneOf: [{ required: ['id'] }, { required: ['goalId'] }],
    },
  },
  {
    name: 'skills.list',
    description: 'Lists the read-only skills bundled with the local Omvra app, including stage and persona compatibility.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'skills.get',
    description: 'Reads one skill from the local Omvra bundled skills catalog by skillId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { skillId: { type: 'string' } },
      required: ['skillId'],
    },
  },
];

const WRITE_TOOL_DEFINITIONS = [
  {
    name: 'goals.update',
    description: 'Replaces a goal graph through MCP with optimistic revision protection. Use this for canvas positions, nodes, typed connectors, scoped instructions, conditions, approval gates, and overseer assignment.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goalId: { type: 'string' },
        title: { type: 'string' },
        elements: { type: 'array', items: { type: 'object' } },
        inputs: { type: 'array', items: { type: 'object' } },
        capabilities: { type: 'array', items: { type: 'object' } },
        projectBindings: { type: 'array', items: { type: 'object' } },
        overseerAgentId: { type: 'string' },
        humanConfirmed: { type: 'boolean' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['goalId', 'elements', 'expectedRevision'],
    },
  },
  {
    name: 'goals.update_project_bindings',
    description: 'Replaces a Goal project-binding relation with optimistic revision and idempotency protection. Bindings are references only; project source records are not copied or mutated.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goalId: { type: 'string' },
        projectBindings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              projectId: { type: 'string' },
              role: { enum: ['primary', 'contributor', 'dependency'] },
            },
            required: ['projectId', 'role'],
          },
        },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        idempotencyKey: { type: 'string' },
        humanConfirmed: { type: 'boolean' },
      },
      required: ['goalId', 'projectBindings', 'expectedRevision', 'idempotencyKey'],
    },
  },
  {
    name: 'goals.update_element',
    description: 'Updates one non-connector Goal canvas element with optimistic Goal revision and idempotency protection.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goalId: { type: 'string' },
        elementId: { type: 'string' },
        updates: { type: 'object' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        idempotencyKey: { type: 'string' },
        humanConfirmed: { type: 'boolean' },
      },
      required: ['goalId', 'elementId', 'updates', 'expectedRevision', 'idempotencyKey'],
    },
  },
  {
    name: 'goals.update_artifacts',
    description: 'Replaces additive execution-artifact links for one Goal, Subgoal, or Supporting Artifact node with optimistic Goal revision protection. Contributions may be supporting, dependency, or evidence; dependency/evidence projection state is derived read-only from canonical sources. Deliverable nodes own output contracts and terminal handoffs.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goalId: { type: 'string' },
        elementId: { type: 'string' },
        artifactReferences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              artifactType: { enum: ['task', 'milestone', 'goal', 'evidence', 'document', 'file', 'url', 'user-defined'] },
              artifactId: { type: 'string' },
              contribution: { enum: ['supporting', 'dependency', 'evidence', 'deliverable'] },
              sourceRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
              contentHash: { type: 'string' },
            },
            required: ['artifactType', 'artifactId'],
          },
        },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        idempotencyKey: { type: 'string' },
        humanConfirmed: { type: 'boolean' },
      },
      required: ['goalId', 'elementId', 'artifactReferences', 'expectedRevision', 'idempotencyKey'],
    },
  },
  {
    name: 'goals.update_connector',
    description: 'Updates one typed connector in a Goal graph with optimistic Goal revision and idempotency protection.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goalId: { type: 'string' },
        connectorId: { type: 'string' },
        updates: { type: 'object' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        idempotencyKey: { type: 'string' },
        humanConfirmed: { type: 'boolean' },
      },
      required: ['goalId', 'connectorId', 'updates', 'expectedRevision', 'idempotencyKey'],
    },
  },
  {
    name: 'goals.lifecycle',
    description: 'Executes one governed Goal lifecycle command with revision and idempotency protection. Lifecycle state is owned by GoalLifecycleService; this does not invoke agents directly.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goalId: { type: 'string' },
        command: { type: 'string', enum: ['start', 'dispatch', 'acknowledge', 'report-recruitment', 'submit-evidence', 'request-handoff', 'accept', 'pause', 'resume', 'retry', 'delegate', 'wake', 'escalate', 'approve', 'reconcile', 'fail', 'complete', 'abandon', 'reset', 'retry-cleanup'] },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        commandId: { type: 'string' },
        actor: { type: 'string' },
        payload: { type: 'object' },
      },
      required: ['goalId', 'command', 'expectedRevision', 'commandId'],
    },
  },
  {
    name: 'goals.gc',
    description: 'Finds stale Goal executions and, only with explicit human confirmation, marks them abandoned so the Goal can be rerun without deleting its graph or history.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goalId: { type: 'string' },
        maxAgeMs: { type: 'number', minimum: 0 },
        apply: { type: 'boolean' },
        humanConfirmed: { type: 'boolean' },
        actor: { type: 'string' },
      },
    },
  },
  {
    name: 'task_write',
    description: 'Creates a new standalone task with optional project, timeline, assignment, schedule, and task metadata. For roadmap membership or task dependencies, create the task first, then use milestones_link_tasks as the single canonical roadmap write.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        title: { type: 'string' },
        notes: { type: 'string' },
        statusId: { type: 'string' },
        statusTitle: { type: 'string' },
        assigneeId: { type: 'string' },
        assigneeName: { type: 'string' },
        assigneeKind: { type: 'string' },
        projectId: { type: 'string' },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
        },
        swimlaneId: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        size: { type: 'string' },
        complexity: { type: 'string' },
        priority: { type: 'string' },
        blocked: { type: 'boolean' },
        swimlaneOnly: { type: 'boolean' },
        timeSpentMinutes: { type: 'number' },
        timeSpentNote: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'tasks.create',
    description: 'Compatibility alias for task_write. For roadmap membership or task dependencies, create the task first, then use milestones_link_tasks.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        title: { type: 'string' },
        notes: { type: 'string' },
        statusId: { type: 'string' },
        statusTitle: { type: 'string' },
        assigneeId: { type: 'string' },
        assigneeName: { type: 'string' },
        assigneeKind: { type: 'string' },
        projectId: { type: 'string' },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
        },
        swimlaneId: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        size: { type: 'string' },
        complexity: { type: 'string' },
        priority: { type: 'string' },
        blocked: { type: 'boolean' },
        swimlaneOnly: { type: 'boolean' },
        timeSpentMinutes: { type: 'number' },
        timeSpentNote: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'tasks.update',
    description: 'Edits ordinary task details with optimistic revision protection. Do not use this for roadmap milestone membership or intertask dependencies; use milestones_link_tasks for adding tasks to milestones and setting dependencyIds.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
        statusId: { type: 'string' },
        statusTitle: { type: 'string' },
        assigneeId: { type: 'string' },
        assigneeName: { type: 'string' },
        assigneeKind: { type: 'string' },
        projectId: { type: 'string' },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
        },
        swimlaneId: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        size: { type: 'string' },
        complexity: { type: 'string' },
        priority: { type: 'string' },
        blocked: { type: 'boolean' },
        swimlaneOnly: { type: 'boolean' },
        timeSpentMinutes: { type: 'number' },
        timeSpentNote: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.update_description',
    description: 'Replaces the main task description/notes field with optimistic revision protection. Use this for focused description edits.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        notes: { type: 'string' },
        description: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.update_collaboration',
    description: 'Replaces the versioned task collaboration projection with optimistic revision protection. The orchestrator is mirrored to assigneeId; execution/session lifecycle is intentionally separate.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        collaboration: {
          anyOf: [{ type: 'null' }, {
          type: 'object',
          additionalProperties: true,
          properties: {
            schemaVersion: { const: 1 },
            orchestratorId: { type: 'string' },
            contributions: {
              type: 'array',
              maxItems: 50,
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string' },
                  personId: { type: 'string' },
                  role: { enum: ['contributor', 'subagent'] },
                  scope: { type: 'string' },
                  state: { enum: ['pending', 'working', 'submitted', 'revision-requested', 'accepted', 'blocked'] },
                  latestAttemptId: { type: 'string' },
                  evidenceRefs: { type: 'array', maxItems: 50, items: { type: 'string' } },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
                required: ['id', 'personId', 'role', 'scope', 'state'],
              },
            },
          },
          required: ['schemaVersion', 'orchestratorId', 'contributions'],
          }],
        },
      },
      required: ['taskId', 'expectedRevision', 'collaboration'],
    },
  },
  {
    name: 'tasks.transition_contribution',
    description: 'Applies one revision-protected, idempotent contribution or execution-attempt transition. It never changes aggregate task status or starts a runtime.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string' },
        contributionId: { type: 'string' },
        command: { enum: ['delegate', 'handoff', 'acknowledge', 'start', 'submit', 'request-revision', 'accept', 'block', 'unblock', 'stop', 'fail', 'complete'] },
        actorPersonId: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        idempotencyKey: { type: 'string' },
        attemptId: { type: 'string' },
        evidenceRefs: { type: 'array', maxItems: 50, items: { type: 'string' } },
        blockerRef: { type: 'string' },
      },
      required: ['taskId', 'contributionId', 'command', 'actorPersonId', 'expectedRevision', 'idempotencyKey'],
    },
  },
  {
    name: 'tasks.attach_file',
    description: 'Adds a local file attachment reference to a task using an absolute path or file:// URL. This stores metadata only and does not copy or open the file.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        uri: { type: 'string' },
        fileUri: { type: 'string' },
        url: { type: 'string' },
        path: { type: 'string' },
        filePath: { type: 'string' },
        name: { type: 'string' },
        size: { type: 'number' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.remove_attachment',
    description: 'Removes a task attachment reference by attachmentId, absolute path, or file:// URL with optimistic revision protection.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        attachmentId: { type: 'string' },
        uri: { type: 'string' },
        fileUri: { type: 'string' },
        url: { type: 'string' },
        path: { type: 'string' },
        filePath: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.delete',
    description: 'Deletes a task after validating the expected revision. Use only when deletion was explicitly requested or allowed by workflow rules.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.log_time',
    description: 'Logs approximate time spent on a task and increments the task time total. This is not a stopwatch.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        minutes: { type: 'number' },
        note: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'minutes', 'expectedRevision'],
    },
  },
  {
    name: 'milestones.create',
    description: 'Creates a roadmap milestone with project scope, release date, description, and optional initial linked task IDs. For adding tasks or dependencies after creation, use milestones_link_tasks.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        title: { type: 'string' },
        projectId: { type: 'string' },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
        },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        notes: { type: 'string' },
        description: { type: 'string' },
        color: { type: 'string' },
        linkedTaskIds: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['title', 'endDate'],
    },
  },
  {
    name: 'milestones.update',
    description: 'Updates milestone metadata or replaces/removes linkedTaskIds with revision protection. Do not use this as the normal add-tasks path; use milestones_link_tasks when adding tasks to a milestone or setting intertask dependencies.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        milestoneId: { type: 'string' },
        title: { type: 'string' },
        projectId: { type: 'string' },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
        },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        notes: { type: 'string' },
        description: { type: 'string' },
        color: { type: 'string' },
        linkedTaskIds: {
          type: 'array',
          items: { type: 'string' },
        },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['milestoneId', 'expectedRevision'],
    },
  },
  {
    name: 'milestones.link_tasks',
    description: 'Canonical roadmap write: atomically add existing tasks to a milestone and set intertask dependency IDs using only the milestone revision. Use this for all add-task-to-milestone and dependency workflows.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        milestoneId: { type: 'string' },
        taskIds: {
          type: 'array',
          items: { type: 'string' },
        },
        dependencyUpdates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              taskId: { type: 'string' },
              dependencyIds: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['taskId', 'dependencyIds'],
          },
        },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['milestoneId', 'expectedRevision'],
    },
  },
  {
    name: 'milestones.delete',
    description: 'Deletes a roadmap milestone with revision protection and clears affected task milestone/dependency metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        milestoneId: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['milestoneId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.transition_under_review',
    description: 'Transitions a task status to under-review. (not available in read-only mode)',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.update_agent_summary',
    description: 'Updates a task agent summary field. (not available in read-only mode)',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        summary: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'summary', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.add_comment',
    description: 'Adds a structured comment to a task. Use this before handing work off or when you need to leave a concise status note.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        comment: { type: 'string' },
        author: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'comment', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.add_activity_entry',
    description: 'Adds a structured activity entry to a task.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        message: { type: 'string' },
        type: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'message', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.update_completion_description',
    description: 'Replaces the task description/notes. To preserve existing content while adding a full handoff, read the current notes, append the summary, then write the combined notes here. Use this for details longer than the brief completion pointer.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        completion: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'completion', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.complete_and_request_review',
    description: 'Adds a brief completion pointer (maximum 240 characters) and moves the task to Ready for human review. Store the full handoff in the task description first with tasks.update_description, preserving existing notes.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        completion: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'completion', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.move_to_requires_human_review',
    description: 'Creates "Requires human review" board if needed and moves completed review-required tasks there. Use this as a final agent handoff step.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskIds: {
          type: 'array',
          items: { type: 'string' },
        },
        includeDone: { type: 'boolean' },
        expectedRevisions: {
          type: 'object',
          additionalProperties: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        },
      },
    },
  },
  {
    name: 'tasks.move_to_status',
    description: 'Moves a task to a named board/status after validating the target exists. Use this when the destination board is already known.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        statusId: { type: 'string' },
        statusTitle: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.move_to_ready_for_human_review',
    description: 'Moves a task to Ready for human review, creating the board if needed. Use this after completing work and writing a brief completion note.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
  {
    name: 'tasks.assign',
    description: 'Assigns a task to a human or agent person by id or name. Use this to hand work to a specific person before or after execution.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        taskId: { type: 'string' },
        assigneeId: { type: 'string' },
        assigneeName: { type: 'string' },
        assigneeKind: { type: 'string' },
        expectedRevision: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['taskId', 'expectedRevision'],
    },
  },
];

const TOOL_NAME_ALIASES = new Map([
  ['workspace_get_snapshot', 'workspace.get_snapshot'],
  ['diagnostics_audit_summary', 'diagnostics.audit_summary'],
  ['goals_list', 'goals.list'],
  ['goals_get', 'goals.get'],
  ['goals_update', 'goals.update'],
  ['goals_update_element', 'goals.update_element'],
  ['goals_update_artifacts', 'goals.update_artifacts'],
  ['goals_update_project_bindings', 'goals.update_project_bindings'],
  ['goals_update_connector', 'goals.update_connector'],
  ['goals_lifecycle', 'goals.lifecycle'],
  ['goals_gc', 'goals.gc'],
  ['tasks_list', 'tasks.list'],
  ['tasks_get', 'tasks.get'],
  ['tasks_collaboration_history', 'tasks.collaboration_history'],
  ['agent_resolve_task_context', 'agent.resolve_task_context'],
  ['cards_kanban_list', 'cards.kanban.list'],
  ['cards_timeline_list', 'cards.timeline.list'],
  ['boards_watch_poll', 'boards.watch.poll'],
  ['milestones_list', 'milestones.list'],
  ['milestones_get', 'milestones.get'],
  ['tasks_create', 'tasks.create'],
  ['tasks_update', 'tasks.update'],
  ['tasks_update_description', 'tasks.update_description'],
  ['tasks_update_collaboration', 'tasks.update_collaboration'],
  ['tasks_transition_contribution', 'tasks.transition_contribution'],
  ['tasks_attach_file', 'tasks.attach_file'],
  ['tasks_remove_attachment', 'tasks.remove_attachment'],
  ['tasks_delete', 'tasks.delete'],
  ['tasks_log_time', 'tasks.log_time'],
  ['milestones_create', 'milestones.create'],
  ['milestones_update', 'milestones.update'],
  ['milestones_link_tasks', 'milestones.link_tasks'],
  ['milestones_delete', 'milestones.delete'],
  ['tasks_transition_under_review', 'tasks.transition_under_review'],
  ['tasks_update_agent_summary', 'tasks.update_agent_summary'],
  ['tasks_add_comment', 'tasks.add_comment'],
  ['tasks_add_activity_entry', 'tasks.add_activity_entry'],
  ['tasks_update_completion_description', 'tasks.update_completion_description'],
  ['tasks_complete_and_request_review', 'tasks.complete_and_request_review'],
  ['tasks_move_to_requires_human_review', 'tasks.move_to_requires_human_review'],
  ['tasks_move_to_status', 'tasks.move_to_status'],
  ['tasks_move_to_ready_for_human_review', 'tasks.move_to_ready_for_human_review'],
  ['tasks_assign', 'tasks.assign'],
]);

function toPublicToolName(name) {
  return name.replace(/\./g, '_');
}

function toCanonicalToolName(name) {
  return TOOL_NAME_ALIASES.get(name) || name;
}

function toPublicToolDefinition(tool) {
  return {
    ...tool,
    name: toPublicToolName(tool.name),
  };
}

const PUBLIC_READ_TOOL_DEFINITIONS = READ_TOOL_DEFINITIONS.map(toPublicToolDefinition);
const PUBLIC_WRITE_TOOL_DEFINITIONS = WRITE_TOOL_DEFINITIONS.map(toPublicToolDefinition);

const RESOURCE_DEFINITIONS = [
  {
    uri: 'omvra://workspace',
    name: 'Workspace snapshot',
    description: 'Read-only workspace snapshot',
    mimeType: 'application/json',
  },
  {
    uri: 'omvra://agent/guide',
    name: 'Agent operational reference',
    description: 'Advisory discovery metadata for clients using the Omvra MCP server',
    mimeType: 'application/json',
  },
  {
    uri: 'omvra://schema/task-execution',
    name: 'Task execution schema',
    description: 'Task execution lifecycle and handoff schema',
    mimeType: 'application/json',
  },
  {
    uri: 'omvra://cards/kanban',
    name: 'Kanban cards',
    description: 'Read-only kanban card projection',
    mimeType: 'application/json',
  },
  {
    uri: 'omvra://cards/timeline',
    name: 'Timeline cards',
    description: 'Read-only timeline card projection',
    mimeType: 'application/json',
  },
  {
    uri: 'omvra://milestones',
    name: 'Roadmap milestones',
    description: 'Read-only roadmap milestone list',
    mimeType: 'application/json',
  },
  {
    uri: 'omvra://goals',
    name: 'Goals and loops',
    description: 'Read-only complete goal graph list',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'omvra://tasks/{taskId}',
    name: 'Task by id',
    description: 'Read-only task resource',
    mimeType: 'application/json',
  },
];

const RESOURCE_TEMPLATE_DEFINITIONS = [
  {
    uriTemplate: 'omvra://tasks/{taskId}',
    name: 'Task by id',
    description: 'Resolve a task by id',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'omvra://milestones/{milestoneId}',
    name: 'Milestone by id',
    description: 'Resolve a roadmap milestone by id',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'omvra://goals/{goalId}',
    name: 'Goal by id',
    description: 'Resolve a complete goal graph by id',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'omvra://agents/{personId}/assigned',
    name: 'Assigned tasks by person',
    description: 'Resolve tasks assigned to a person',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'omvra://projects/{projectId}/tasks',
    name: 'Tasks by project',
    description: 'Resolve tasks in a project',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'omvra://boards/{statusId}/tasks',
    name: 'Tasks by board',
    description: 'Resolve tasks in a board/status',
    mimeType: 'application/json',
  },
];

const PROMPT_DEFINITIONS = buildMcpPromptCatalog();

function isKnownWriteToolName(name) {
  if (WRITE_TOOL_DEFINITIONS.some(tool => tool.name === name)) return true;
  return /^(goals\.(update|update_element|update_connector|update_artifacts|lifecycle)|tasks\.(create|update|delete|write|set|transition|complete|log_time)|milestones\.(create|update|delete))/.test(name);
}

module.exports = {
  READ_TOOL_DEFINITIONS,
  WRITE_TOOL_DEFINITIONS,
  PUBLIC_READ_TOOL_DEFINITIONS,
  PUBLIC_WRITE_TOOL_DEFINITIONS,
  RESOURCE_DEFINITIONS,
  RESOURCE_TEMPLATE_DEFINITIONS,
  PROMPT_DEFINITIONS,
  toCanonicalToolName,
  isKnownWriteToolName,
};
