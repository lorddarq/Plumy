# Omvra

Omvra is a planning workspace where people and agents coordinate durable work while operational activity and local interface state remain distinct.

## Language

**Workspace**:
The durable planning record shared by people and agents: tasks, projects, people, milestones, statuses, Goals, and execution policy. Related changes become visible together as one consistent Workspace Snapshot.
_Avoid_: App state, runtime state

**Workspace Snapshot**:
A consistent observation of the Workspace after a complete mutation. Runtime Operations and UI Session changes do not invalidate it.
_Avoid_: Runtime snapshot, UI state

**Runtime Operations**:
The live operational activity of agents and connections, including ACP sessions, MCP availability, watches, and their current observations.
_Avoid_: Workspace, agent state

**UI Session**:
The local interaction state of one running Omvra interface, including open surfaces, filters, scroll positions, and current selections.
_Avoid_: Workspace, persisted planning state
