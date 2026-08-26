# Archived: unified Codex watcher handoff proposal

Status: archived; historical proposal only
Original task: `task-5bd3a967-8710-4d6d-b97a-f7d0b9855b1d`
Archived: 2026-08-26

## Why this record is archived

The proposal depended on a renderer-owned `useAgentWatchRuntime` polling loop and a future `CodexWatcherHandoff` lease/claim state machine. The runtime hook was removed, its two historical hook tests are intentionally skipped as removed behavior, and no `agent.handoffs.*` API or persisted handoff record exists in the product.

This file is therefore not current implementation evidence and does not authorize rebuilding the removed feature as part of architecture cleanup.

## Current implementation boundary

- MCP HTTP and stdio share one request dispatcher and preserve bounded `initialize.clientInfo` provenance.
- ACP runtime sessions are started explicitly through `agent-runtime-session-runner.cjs`; watcher detection is not an execution request.
- Task execution is governed by exact assignee preflight, revision checks, contribution/attempt state, and explicit confirmation.
- Durable task context and runtime outcomes remain separate from provider session/transcript state.
- No background watcher automatically wakes Codex or completes a task.

## Revisit trigger

Reopen this decision only when an approved product requirement calls for automatic task-change delivery to CLI or desktop runtimes. Any new design must start from the then-current task/runtime contracts and independently re-establish deduplication, authorization, loop prevention, leasing, privacy, budgets, and shutdown behavior. Do not treat the archived interface or state names as compatibility commitments.
