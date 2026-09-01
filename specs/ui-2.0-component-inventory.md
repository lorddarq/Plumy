# UI 2.0 Component Inventory and Implementation Map

Source PRD: `UI-2.0-IMPLEMENTATION-PRD.md`
Design reference: [Omvra UI 2.0 Figma](https://www.figma.com/design/xK22WyMtqAJLx21eZr3QqS/Omvra?node-id=26-175)
Task: `task-e2c057ab-d2f7-4cb9-bcaa-e98603d64c19`

## Purpose

This inventory verifies the current componentization state before UI 2.0 layout work begins. The goal is to separate safe layout/component extraction from visual restyling, identify reusable primitives, and list the visual states that need to be design-ready before each implementation slice is marked done.

## Current State Summary

The app already has useful surface-level composition, but most panel and dialog surfaces still mix layout, local UI state, data formatting, copy/export helpers, and domain behavior inside large components.

| Area | Current file(s) | Current shape | UI 2.0 posture |
| --- | --- | --- | --- |
| App panel orchestration | `src/app/components/AppPanels.tsx` | Central mount point for task, milestone, people, and preferences panels. Prop-heavy but valuable as a transition boundary. | Reusable as the migration host. Add new panel components here before deleting old ones. |
| Main views | `src/app/components/AppMainViews.tsx` | Clean view switcher for Timeline, Kanban, Roadmap. | Reusable as-is. Keep view switching behavior stable. |
| Settings/preferences | `src/app/components/PreferencesPanel.tsx` | One large `Sheet` with task load, MCP listener/security/testing/activity, and storage controls. | Needs extraction into anchored sections. Highest-value first migration target. |
| People and agents | `src/app/components/PeoplePanel.tsx` | One large `Sheet` with person create/edit cards, load badges, agent instructions, and agent board watch controls. | Split into People/Agents settings sections. Move board-watch controls into Tasks settings. |
| Task edit | `src/app/components/TaskDialog.tsx` | Large dialog with form state, project/milestone/dependency logic, attachments, and footer actions. Already partly styled toward UI 2.0. | Reuse form logic initially; wrap in anchored panel shell later. Extract sections after Settings proves the primitive. |
| Task details | `src/app/components/TaskDetailsDialog.tsx` | Dialog with summary grid, projects, markdown description, attachments, comments, copy, and agent review action. | Good candidate for detail/read-only anchored panel sections. |
| Task details action menu | `src/app/components/TaskDetailsDialog.tsx` | Task details currently exposes actions directly in the dialog surface. | Split as a small structural task before PDF export and before final task-details styling. |
| Kanban | `src/app/components/KanbanView.tsx`, `SwimlanesView.tsx`, `DroppableColumn.tsx`, `TaskCard.tsx` | Modular by board/column/card, with drag/reorder and filter logic spread across view/column components. | Mostly visual refresh after inventory. Keep behavior in place. |
| Timeline | `src/app/components/TimelineView.tsx` and timeline subcomponents | Most modular view, but `TimelineView` still owns scroll, sizing, persistence, virtualization, drag resize, and mode state. | Visual refresh and later layout extraction; avoid moving logic before anchored panel work is proven. |
| Agent/MCP status bar | App shell/header area, likely near `src/app/components/AppHeader.tsx` | New compact shell surface from UI 2.0 showing active/inactive agents and MCP running state. | Mostly presentational. Build after inventory; no anchored panel dependency unless shell extraction reveals one. |
| Milestones/Roadmap | `src/app/components/RoadmapView.tsx`, `MilestoneDialog.tsx`, `MilestoneDetailsDialog.tsx` | Roadmap has timeline/chart helpers and filters. Dialogs have summary/link/dependency sections. | Secondary rollout after core panels; extract reusable milestone cards/sections if styling work repeats. |

## Recommended Implementation Sequence

1. Build the small UI 2.0 shell/status-bar surface after this inventory, because it is mostly UI and has low behavior risk.
2. Build shared anchored panel primitives.
3. Migrate Settings to anchored sections, including moving board watch controls into Tasks settings.
4. Componentize People and Agents cards/editors and mount them as Settings sections.
5. Build the consolidated task details action menu before PDF export and before broad task details styling.
6. Reuse the anchored panel shell for Task Details and Task Edit.
7. Refresh Kanban styling with existing board/column/card behavior intact.
8. Refresh Timeline styling with existing timeline behavior intact.
9. Roll out shared styling to Milestones, dialogs, empty states, and diagnostics.
10. Run visual readiness QA and create follow-up tasks for any missed states.

## Shared Primitives to Add

### `AnchoredPanel`

New primitive. Owns the common panel layout used by Settings, task details, task edit, and later object panels.

Responsibilities:
- Render a left navigation rail and a right scroll region.
- Provide Back/Close behavior.
- Support a stable `initialAnchor`.
- Expose active section state.
- Avoid feature-specific behavior.

Required states:
- Back/Close default, hover, focus.
- Left nav default, active, hover, focus, disabled.
- Long section content.
- Empty section content.
- Bottom action bar without content overlap.

### `AnchoredPanelNav`

New primitive. Renders grouped navigation items.

Responsibilities:
- Render grouped nav sections such as Settings, Storage, Help.
- Scroll to owned section anchors.
- Keep keyboard focus usable.
- Allow direct People and Agents entry points to open Settings at the right anchor.

### `AnchoredPanelScrollView`

New primitive. Owns the scroll container.

Responsibilities:
- Ensure there is one primary scroll container.
- Avoid nested scroll conflicts except for intentionally bounded logs/code blocks.
- Provide section registration/scroll behavior to `AnchoredPanel`.

### `AnchoredPanelSection`

New primitive. Section wrapper for title, description, and content.

Responsibilities:
- Provide stable section ids.
- Provide accessible labels.
- Preserve predictable spacing between sections.

## Settings Inventory

Primary source: `src/app/components/PreferencesPanel.tsx`

### Current Componentization

`PreferencesPanel` is a 780-line component that currently owns:
- MCP agent access toggle.
- MCP listener host/port controls.
- Public MCP URL copy.
- Access token and token TTL controls.
- Capability profile select.
- MCP test/write/local stdio/local tunnel command generation and copy behavior.
- MCP activity log copy/export/refresh.
- Listener/auth/connection status summary.
- MCP health diagnostics.
- Execution and pipeline load status selection.
- Storage usage, backup/restore import/export, and local data deletion.

### Extraction Candidates

| Candidate | Type | Recommendation | Notes |
| --- | --- | --- | --- |
| `SettingsPanel` | container | Needs new component | Uses `AnchoredPanel`; receives all current Preferences props initially. |
| `TasksSettingsSection` | section | Extract first | Hosts Execution Load, Pipeline Load, and Agent Board Watch controls. |
| `McpSettingsSection` | section | Extract with helper functions | Hosts access toggle, listener, URL, local MCP, security, and capability profile. |
| `McpCommandBlock` | reusable component | Extract | Repeated copyable command UI for test/write/stdio/tunnel commands. |
| `McpActivitySection` | section | Extract | Empty and populated states are explicit visual readiness states. |
| `McpHealthDiagnosticsSection` | section | Extract | Preserve `showMcpHealthDiagnostics`, check action, and result rendering. |
| `DataSettingsSection` | section | Extract | Storage meter, export/import, danger zone. |
| `CopyableField` | reusable component | Extract after first section | Useful for MCP URL and commands; avoid early over-generalization. |

### Behavior to Preserve

- Token rotation, TTL, capability profile, and restart-pending behavior.
- Clipboard fallback behavior for environments without `navigator.clipboard`.
- Audit log JSON export and refresh.
- Health check action and diagnostic result rendering.
- Import file input flow.
- Local data deletion action.
- Execution/pipeline load status persistence.

### Visual Readiness States

- Settings shell with Back.
- People section target present.
- Agents section target present.
- Tasks section with load controls and board watch.
- MCP listener running, disabled, error, restart pending.
- MCP with no token, active token, expired token, remote URL without token warning.
- MCP Activity empty and populated.
- MCP Testing command blocks with copied and idle states.
- Data storage normal, unknown, backup restore, danger zone.

## People and Agents Inventory

Primary source: `src/app/components/PeoplePanel.tsx`

### Current Componentization

`PeoplePanel` is a 567-line component that owns:
- Add/edit/cancel/save local form state.
- Human and agentic type selection.
- Agent instruction prompt storage in `Person.agentInstructions`.
- Person task counts by status.
- Execution/pipeline load calculations.
- Agent board watch controls and runtime summary.

### Extraction Candidates

| Candidate | Type | Recommendation | Notes |
| --- | --- | --- | --- |
| `PeopleSettingsSection` | section | Needs extraction | Human list and add/edit controls. |
| `AgentsSettingsSection` | section | Needs extraction | Agent list and add/edit controls. |
| `PersonCard` | component | Extract | Display-only card for human people. |
| `AgentCard` | component | Extract | Display-only card for agentic people with agent instructions summary. |
| `PersonEditorCard` | component | Extract | Add/edit form for human people. |
| `AgentEditorCard` | component | Extract | Add/edit form for agentic people, including instructions textarea. |
| `PersonLoadSummary` | component | Extract | Shared execution/pipeline/task count badges. |
| `AgentBoardWatchSettings` | section/component | Move to Tasks settings | This is task-agent runtime configuration, not People/Agents identity management. |

### Behavior to Preserve

- `onAddPerson`, `onUpdatePerson`, and `onDeletePerson`.
- Agent instructions only appear and persist for `kind === 'agentic'`.
- Existing task counts by status.
- Existing execution and pipeline load calculation.
- Board watch save/remove/poll behavior, after moving UI to Tasks settings.

### Visual Readiness States

- People list empty.
- People list populated.
- Human card default, hover, edit, delete.
- Person editor add, edit, invalid/disabled save, cancel.
- Agents list empty.
- Agent card default, with and without instruction summary.
- Agent editor add, edit, prompt empty, prompt populated, save disabled.
- Load badge low, medium, overloaded.
- Board watch enabled, disabled, runtime error, no recent matches, recent matches.

## Task Details and Edit Inventory

Primary sources:
- `src/app/components/TaskDetailsDialog.tsx`
- `src/app/components/TaskDialog.tsx`

### Current Componentization

`TaskDetailsDialog` is a 389-line read-only dialog with:
- Metadata summary grid.
- Project pills.
- Markdown description.
- Attachments list and reveal behavior.
- Comments list and add-comment form.
- Copy task details.
- Agent task move-to-review action.

`TaskDialog` is a 705-line edit/create dialog with:
- Task form state.
- Status/size/complexity/priority/blocked fields.
- Project and primary timeline project selection.
- Assignee selection.
- Milestone selection.
- Dependency candidate filtering and cycle prevention.
- Date range validation.
- Markdown notes.
- Attachment picking/removal.
- Delete and save footer actions.

### Extraction Candidates

| Candidate | Type | Recommendation | Notes |
| --- | --- | --- | --- |
| `TaskPanel` | container | New after Settings | Anchored panel wrapper for read/edit modes. |
| `TaskPanelNav` | configuration | New | Basic Information, Dependencies, Attachments, Comments, Activity/Agent Summary. |
| `TaskDetailsActionMenu` | component | Extract before PDF export | Three-dot menu with Edit, Copy Task Info, and Export PDF. Keep Delete and Close outside unless design changes. |
| `TaskSummarySection` | section | Extract from details | Status, assignee, priority, blocked, dates, size, complexity. |
| `TaskProjectsSection` | section | Extract/shared | Project pills and primary timeline project. |
| `TaskDescriptionSection` | section | Extract/shared | Markdown read mode and textarea edit mode. |
| `TaskAttachmentsSection` | section | Extract/shared | Read mode reveal and edit mode add/remove. |
| `TaskCommentsSection` | section | Extract from details | Comment list and add-comment form. |
| `TaskDependenciesSection` | section | Extract from edit | Milestone-scoped dependency selector and cycle prevention. |
| `TaskFooterActions` | component | Extract/shared | Close/Edit/Delete/Update/Create/Move to Review. |

### Behavior to Preserve

- Date range validation and end-date coercion.
- Project selection and primary timeline project selection.
- Milestone filtering by project.
- Dependency candidates scoped to milestone.
- Dependency cycle prevention.
- Attachment pick/verify/reveal/remove behavior.
- Markdown normalization on save.
- Agentic task "Move to In Review" behavior.
- Details copy behavior.
- Existing edit entry point behavior when moved into the three-dot menu.
- Export PDF action placement as a menu item, without implementing PDF generation in the menu task.

### Visual Readiness States

- Details read mode.
- Edit mode.
- Create mode.
- No description.
- Long markdown description.
- Attachments empty/populated.
- Comments empty/populated/new comment.
- Dependency candidate empty/populated/cycle-disabled.
- Invalid date range.
- Footer with delete, update, close, and move-to-review combinations.
- Three-dot action menu closed/open, keyboard-focused, Escape-dismissed, and narrow-width states.

## Agent and MCP Status Bar Inventory

Primary likely source:
- `src/app/components/AppHeader.tsx`

Related state sources to verify during implementation:
- People/agent list state from `App.tsx` and `PeoplePanel` data flow.
- MCP listener and health state currently passed through `PreferencesPanel`/MCP hooks.

### Current Componentization

There is not yet a dedicated status bar component. The current app shell has header/view controls and the MCP/agent state exists elsewhere in settings and runtime hooks. UI 2.0 adds a small shell area that should summarize this state without becoming a management surface.

### Extraction Candidates

| Candidate | Type | Recommendation | Notes |
| --- | --- | --- | --- |
| `AppStatusBar` | component | New early shell component | Compact visual row for agent and MCP status. |
| `AgentAvailabilityIndicator` | component | New or inline first | Shows active and inactive/unavailable agent counts from existing people state. |
| `McpStatusIndicator` | component | New or inline first | Shows MCP running/offline/unknown from existing renderer state. |

### Behavior to Preserve

- Do not introduce noisy polling if existing MCP state or health checks are enough.
- Do not move MCP configuration into the status bar.
- Do not move agent management into the status bar.
- Keep the header/view switching behavior unchanged.

### Visual Readiness States

- MCP running.
- MCP offline/unavailable.
- MCP unknown/loading.
- Zero agents.
- Some active and some inactive agents.
- All active agents.
- All inactive/unavailable agents.
- Narrow app width without overlapping view controls.

## Kanban Inventory

Primary sources:
- `src/app/components/KanbanView.tsx`
- `src/app/components/SwimlanesView.tsx`
- `src/app/components/DroppableColumn.tsx`
- `src/app/components/TaskCard.tsx`

### Current Componentization

Kanban has a reasonable split:
- `KanbanView` owns search/filter state, horizontal scroll metrics, edge-scroll during column drag, and custom scrollbar behavior.
- `SwimlanesView` owns column drag/reorder state and filtered-board empty state.
- `DroppableColumn` owns column header, edit dialog trigger, add-task row, task drop indicators, and task list rendering.
- `TaskCard` is already a reusable card presentation component.

### Extraction Candidates

| Candidate | Type | Recommendation | Notes |
| --- | --- | --- | --- |
| `KanbanToolbar` | component | Extract before styling | Search, filters, clear actions, add board. |
| `KanbanScrollFrame` | component/hook | Extract later | Custom scrollbar and scroll metrics are behavior-sensitive. |
| `KanbanColumn` | rename/extract | Wrap `DroppableColumn` | Keep drag/drop behavior intact. |
| `KanbanColumnHeader` | component | Extract during visual refresh | Header title, count, color strip/edit action. |
| `KanbanAddTaskRow` | component | Extract | Useful for empty and populated columns. |
| `KanbanTaskCard` | component | Reuse `TaskCard` with styling updates | Current card already handles checklist preview and project pills. |

### Behavior to Preserve

- Task drag/drop across columns.
- Task reorder within a column.
- Column reorder.
- Column edit/delete/color change.
- Filter persistence and sanitization.
- Search plus project/priority/assignee filters.
- Horizontal scroll preservation and custom scrollbar.
- Edge-scroll during column drag.

### Visual Readiness States

- Board with many columns and horizontal overflow.
- Empty column.
- Column with one task.
- Column with multiple tasks.
- Dragging column.
- Dragging task.
- Filtered empty state.
- Active filter state.
- Task card with checklist preview.
- Task card with project overflow.
- Urgent/high priority card.
- Add board and add task.

## Timeline Inventory

Primary sources:
- `src/app/components/views/TimelineView.tsx`
- `src/app/components/headers/TimelineHeader.tsx`
- `src/app/components/DraggableSwimlaneRow.tsx`
- `src/app/components/DraggableTimelineTask.tsx`
- `src/app/components/DraggableSwimlaneLabel.tsx`

### Current Componentization

Timeline is the most modular primary view, but the container is still large. `TimelineView` owns:
- Left column width persistence.
- Month width persistence.
- Projects/people mode state.
- Weekend visibility.
- Horizontal and vertical scroll coordination.
- Startup scroll-to-today behavior.
- Task resize state.
- Swimlane row reorder/drop indicators.
- Dynamic track allocation.
- Virtualized horizontal rendering metrics.

### Extraction Candidates

| Candidate | Type | Recommendation | Notes |
| --- | --- | --- | --- |
| `TimelineToolbar` | component | Extract during visual refresh | Mode toggle, weekend toggle, add project/person controls if applicable. |
| `TimelineLayoutProvider` | hook/provider | Later | Owns left column width, month widths, scroll state. |
| `TimelineGridFrame` | component | Later | Header/rows/scroll container wiring. |
| `TimelineRowList` | existing | Reuse | `DraggableSwimlaneRow` remains the single active row renderer. |
| `TimelineTaskBar` | existing | Reuse | `DraggableTimelineTask` is the correct behavior boundary. |
| `TimelineSwimlaneNav` | existing | Reuse | `DraggableSwimlaneLabel` should keep reorder behavior. |

### Behavior to Preserve

- Drag-to-resize task dates.
- Drag/drop task across timeline rows.
- Reorder project rows and people rows.
- Scroll synchronization between header and rows.
- Startup scroll to today.
- Left column resize.
- Month resize.
- Weekend visibility.
- Projects/people mode.
- Virtual horizontal rendering.

### Visual Readiness States

- Project timeline mode.
- People timeline mode.
- Empty project/person rows.
- Dense overlapping tasks.
- Resizing task start edge.
- Resizing task end edge.
- Dragging swimlane/person row.
- Add task from grid.
- Add project row.
- Weekend hidden/visible.
- Today visible and outside viewport.

## Milestones and Secondary Surfaces Inventory

Primary sources:
- `src/app/components/RoadmapView.tsx`
- `src/app/components/MilestoneDialog.tsx`
- `src/app/components/MilestoneDetailsDialog.tsx`
- `src/app/components/ColumnDialog.tsx`
- `src/app/components/SwimlaneDialog.tsx`

### Current Componentization

Roadmap is functional but heavy. It owns search/filter state, date-window filtering, chart layout, scrub scrolling, month header grouping, milestone row layout, and task dependency ordering.

Milestone dialogs are more focused but still contain extractable sections for project selection, task linking, dependency editing, summary, late-task warnings, and linked task lists.

### Extraction Candidates

| Candidate | Type | Recommendation | Notes |
| --- | --- | --- | --- |
| `RoadmapToolbar` | component | Extract during secondary rollout | Search, project, health, date filters, add milestone. |
| `RoadmapChart` | component | Extract later | Chart layout is behavior-sensitive. |
| `MilestoneSummaryCard` | component | Extract | Reusable in details and roadmap. |
| `MilestoneLinkedTasksSection` | section | Extract | Details view and edit flow both need linked-task display. |
| `MilestoneTaskLinker` | component | Extract from dialog | Search, selection, and dependency controls. |
| `MilestoneDependencyEditor` | component | Extract carefully | Dependency behavior must stay scoped to linked milestone tasks. |
| `SharedDialogFooter` | component | Extract if repetition increases | Delete/save/cancel patterns across dialogs. |

### Behavior to Preserve

- Roadmap filters and reset behavior.
- Roadmap scroll-to-today and header scrub.
- Milestone date range and health calculation.
- Linked task composition.
- Late-task detection.
- Task linking and unlinking.
- Dependency edits between linked tasks.

### Visual Readiness States

- Roadmap empty.
- Roadmap filtered empty.
- Populated roadmap with multiple milestones.
- Milestone at risk, complete, planned, no tasks.
- Milestone details with no linked tasks.
- Milestone details with late tasks.
- Milestone create/edit validation.
- Linked task dependency states.
- Shared destructive dialog actions.

## First Adoption Target

Start with Settings.

Reasons:
- It is the clearest match for the UI 2.0 anchored navigation design.
- It contains multiple natural sections.
- It has direct People/Agents/Tasks/MCP/Data/MCP Activity/MCP Testing anchors.
- It lets the new `AnchoredPanel` primitive mature before touching task dialogs.
- Moving Agent Board Watch into Tasks settings resolves the main information architecture change early.

Recommended first implementation milestone:

1. Add `AnchoredPanel` primitives with a small fixture/example inside Settings only.
2. Create `SettingsPanel` that renders the same behavior as `PreferencesPanel`.
3. Extract `TasksSettingsSection`.
4. Move `AgentBoardWatchSettings` from `PeoplePanel` into `TasksSettingsSection`.
5. Extract `McpSettingsSection`, `McpActivitySettingsSection`, `McpTestingSettingsSection`, and `DataSettingsSection`.
6. Add `PeopleSettingsSection` and `AgentsSettingsSection`.
7. Keep direct header People and Settings buttons, but route People/Agents buttons to Settings anchors once equivalent behavior is verified.

## Behavior-Sensitive Paths

Do not change these in the same commit as pure layout extraction unless required:

- MCP listener/token/capability profile persistence and restart behavior.
- MCP audit log copy/export.
- Storage import/export and local data purge.
- Agent watch poll/save/reset runtime behavior.
- Person add/edit/delete and `agentInstructions` persistence.
- Task attachment pick/verify/reveal.
- Task dependency cycle prevention.
- Task/milestone link and dependency updates.
- Kanban drag/drop and column reorder.
- Timeline task resize, row reorder, scroll sync, and persisted widths.

## Componentization Tags

Use these tags when creating follow-up implementation tasks:

- `reusable-as-is`: `AppMainViews`, `AppPanels` as transition host, `TaskCard`, timeline row/task subcomponents.
- `reusable-with-wrapper`: `DroppableColumn`, `TaskDialog` form logic, `TaskDetailsDialog` sections, milestone details sections.
- `needs-extraction`: `PreferencesPanel` sections, `PeoplePanel` cards/editors, `KanbanToolbar`, `RoadmapToolbar`, task details/edit sections.
- `new-primitive`: `AnchoredPanel`, `AnchoredPanelNav`, `AnchoredPanelScrollView`, `AnchoredPanelSection`.
- `defer`: `TimelineLayoutProvider`, `KanbanScrollFrame`, `RoadmapChart` until the visible rollout proves the new panel/layout primitives.

## Completion Criteria for This Inventory

- Current componentization state is mapped.
- Reusable, wrapper, extraction, and new primitive candidates are tagged.
- Behavior-sensitive paths are listed before refactor work starts.
- Settings is confirmed as the first anchored-panel adoption target.
- Visual readiness states are listed for Settings, People/Agents, task panels, Kanban, Timeline, and Milestones.
