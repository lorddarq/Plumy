# ACP cross-provider portability QA report

Date: 2026-07-30  
Task: `task-7a1c588f-d713-4172-b44b-5fdacf930662`

## Summary

The provider-neutral profile and protocol layers are present and the bounded task-context ledger is implemented. Static and contract-level checks pass for profile validation, native ACP/Codex/Claude capability negotiation, bounded context projection, immutable source-linked entries, revision protection, session-binding identity, and privacy restrictions.

The requested end-to-end second-runtime handoff is not ready to accept. The current task start path records `contextEntryIds` in the preflight contract snapshot, but the session runner starts the second runtime with an empty session configuration and does not retrieve or inject the accepted checkpoint and bounded history index. No transcript replay was observed; the missing behavior is context-pack delivery, not an unsafe replay path.

## Findings

| Area | Result | Evidence |
| --- | --- | --- |
| Same profile contract across runtimes | Pass at contract level | `agent-runtime-profile-service.test.cjs`; `agent-runtime-protocol-client.test.cjs` cover ACP, Codex app-server, and Claude stream-json profiles. |
| Latest checkpoint and bounded history | Pass in ledger/preflight projection; blocked end-to-end | `task-context-ledger-service.test.cjs` caps the projection and preserves `hasMore`; `agent-execution-preflight-service.cjs` records only entry IDs. The session runner does not retrieve or pass those entries to a native client. |
| Targeted older source-linked retrieval | Pass at MCP/domain boundary; not wired into handoff | `tasks.context.list/get` and ledger tests preserve source references and explicit missing sources. No runner call retrieves a selected entry. |
| Task/Goal identity and revision gates | Pass for existing contracts | Session binding tests cover task and Goal-node scope; preflight tests cover stale revision and digest rejection. |
| Provider-private state isolation | Pass | Bindings retain one runtime profile and one opaque session reference per execution scope; raw session references are rejected from normalized task context and event payloads. |
| Capability differences | Pass | Native clients expose exact capability snapshots and reject unsupported resume/close operations instead of emulating them. |
| Credentials/transcripts/conversion/failover | Pass by static and negative checks | Profile validation rejects credential-like fixed args; forbidden-field checks reject prompts, responses, transcripts, credentials, and opaque references; clients launch exact executables with `shell: false`. |
| Controlled provider comparison | Blocked | No two configured, runnable provider profiles and no stable fixture task/accepted checkpoint were available for a live controlled run. Provider-reported usage remains unknown unless a native runtime emits it. |
| Portability evidence report | Pass | This report is the durable QA artifact. |

## Reproduction of the handoff gap

1. Prepare a task execution with a checkpoint and bounded history entries.
2. Observe the preflight contract snapshot: it contains bounded `contextEntryIds`.
3. Start a native session through `agent-runtime-session-runner.cjs`.
4. Observe that the runner calls `client.startSession({})`; it does not call `tasks.context.get`, resolve source references, or create a bounded context pack from the checkpoint/index.
5. Result: a second provider can start under the same governance and binding contract, but it cannot yet continue from the latest accepted Omvra context through the product path.

## Ready-for-test checklist

- [x] Profiles validate exact executable paths and reject credential-like arguments.
- [x] ACP, Codex app-server, and Claude stream-json clients negotiate provider-specific capabilities without emulation.
- [x] Context ledger list/get/append behavior is bounded, source-linked, immutable, revision-protected, and idempotent.
- [x] Session bindings preserve task/Goal scope and runtime identity without persisting opaque references into task context or normalized events.
- [x] Unsupported operations, missing usage, and missing source records remain explicit.
- [ ] A runtime-independent context-pack builder exists for the latest accepted checkpoint plus bounded history index.
- [ ] The session runner retrieves only selected older source-linked entries and passes the bounded pack to the selected native runtime.
- [ ] Two different configured providers complete the same controlled fixture task and produce comparable evidence.

## Recommended next verification

Implement the context-pack builder and runner injection first. Then run one fixture through two configured native profiles with the same task revision, accepted checkpoint, permission policy, and evidence contract. Compare only observed fields: context tokens when reported, interventions, rework, scope adherence, evidence quality, and provider-reported usage; label absent or aggregation-unknown values as `unknown`.
