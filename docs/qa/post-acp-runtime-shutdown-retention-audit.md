# Post-ACP runtime shutdown and retention verification

Date: 2026-08-26  
Task: `task-77f79616-220f-4f4d-9e2a-ff7c921d57fa`

## Validation rubric

- [x] Electron shutdown reaches the runtime runner before other main-process resources close.
- [x] Every live runtime client closes its transport, streams, listeners, timers, pending requests, and in-memory registry entry exactly once.
- [x] Live bindings reconcile to an explicit interrupted/app-shutdown state exactly once.
- [x] Sustained event writes retain no more than `MAX_EVENTS = 2000` records.
- [x] Persisted MCP audit events contain only the documented top-level and target keys, including when an unexpected safe field reaches the adapter.

## Implementation and evidence

`electron/main.cjs` now calls `agentRuntimeSessionRunner.dispose()` from `before-quit` after stopping the reconciliation timer and before closing MCP/update resources. The runner tracks listener unsubscribe functions and both timeout families by binding. Its idempotent `dispose()` clears timers and pending requests, unsubscribes listeners, closes each client transport, removes in-memory clients, and reconciles each live binding to `interrupted` with `terminalReason: app-shutdown`. New runtime work fails explicitly with `ACP_APP_SHUTDOWN` after disposal.

`JsonLineTransport.close()` now detaches child-process and stdout/stderr listeners, kills the child once, rejects pending protocol requests (which clears their request timers), and clears notification/lifecycle listener sets. Explicit close remains distinct from unexpected connection loss.

Focused tests:

- `electron/services/agent-runtime-session-runner.test.cjs` invokes the shutdown hook contract and disposes a live resumed session with a pending elicitation and cancellation-settle timer. It asserts one transport close, two listener unsubscriptions, timer cancellation, empty pending/client registries, one session interruption, one connection-loss event, and idempotent repeated disposal.
- `electron/services/agent-runtime-protocol-client.test.cjs` asserts child termination and zero remaining child, stream, notification, and lifecycle listeners after repeated close.
- `electron/domain/agent-runtime-session-service.test.cjs` appends 2,005 distinct events and asserts that storage contains exactly the latest 2,000 (`5..2004`), proving stored-growth bounds rather than only read limits.
- `electron/services/mcp-http-server.test.cjs` sends a real `tasks.list` dispatch and asserts exact equality with the event-contract key set. A direct adapter negative control supplies `unexpectedSafeField` and proves it is absent both from the returned audit record and `omvra.mcp.audit.v1`.

## MCP audit validation

Source: request metadata and explicitly supplied tool details.  
Control: `getRequestMeta`, `AUDIT_DETAIL_KEYS`, `getSafeAuditDetails`, normalized outcome/failure classification, and the explicit `target` projection in `mcp-audit-adapter.cjs`.  
Sink: bounded `appendMcpAuditLog` persistence under `omvra.mcp.audit.v1`.

Disposition: the suspected allow-list gap is not reproducible. The adapter rejects the unexpected safe field, and the realistic dispatcher path persists exactly the documented top-level and target fields. Confidence is high because both the real MCP dispatcher and the direct adapter boundary are exercised.

## Result

Focused lifecycle, transport, retention, and MCP audit verification: 110 passed, 0 failed. `npm run test:mcp`: 303 passed, 0 failed. `npm run build`: passed with 2,309 renderer modules transformed. `node --check` and `git diff --check`: passed.
