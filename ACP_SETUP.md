# ACP setup in Omvra

This guide covers configuring the managed agent connections used by Omvra. It intentionally does **not** configure a project or repository folder globally. The working directory is resolved from the selected project/swimlane when a task starts.

## What is configured globally

An agent runtime profile contains provider-specific connection settings:

- Profile name
- Runtime mode
- Exact executable path
- Optional preferred model
- Optional fixed launch arguments
- Enabled/disabled state
- Codex approval policy, when using the Codex app-server mode

Project/repository folders are task context, not runtime profile settings. Set them on the project/swimlane and verify the task resolves to the intended folder before starting work.

Open **Settings → Agent runtimes** to create or edit a profile. Save the profile, then use **Test connection**. A successful test validates the executable and protocol contract; it does not necessarily prove that the provider account can run a model turn.

## Claude Code over stream-json

Omvra uses Claude Code’s native stream-json interface. This is not the Claude desktop application and does not use an ACP adapter.

### Profile

Set:

```text
Mode: Claude stream-json over stdio
Executable: /Users/<user>/.local/bin/claude
Preferred model: sonnet       # optional
Fixed arguments:               # normally empty
Enabled: on
```

The executable must be the Claude Code CLI. Common installation paths include:

```text
/Users/<user>/.local/bin/claude
/opt/homebrew/bin/claude
```

Omvra launches the CLI with the native arguments:

```text
-p
--input-format stream-json
--output-format stream-json
--verbose
--session-id <generated-session-id>
--model <preferred-model>       # only when configured
```

When MCP agent access is enabled, Omvra also passes the active local MCP endpoint through Claude’s native `--mcp-config` option. The endpoint is generated from the running Omvra listener; it is not a global project path.

### Authentication

Claude Code authentication is separate from the Claude desktop app. Check the CLI account directly:

```bash
/Users/<user>/.local/bin/claude auth status
```

The CLI must have an active Claude Code entitlement. A free Claude desktop account does not necessarily provide Claude Code access. An expired OAuth session or an account without the required plan prevents a model turn even when the desktop app is open and working.

### Model format

Use a single string, not JSON or an array:

```text
sonnet
```

Omvra passes this as `--model sonnet`. Do not enter `--model`, quotes, or brackets in the preferred-model field.

### Session recovery

Claude stores MCP/tool context in its provider conversation. If a session was created before MCP was enabled or before the tool profile changed, resuming the old Claude session can preserve stale tool availability. Omvra recovery creates a fresh Claude session ID and re-sends the authoritative task context.

Use **Reconnect and continue** or **Resume task** when supervision reports stale tools, an unavailable session, or an interrupted provider. The current task context is preserved; the old Claude provider history is intentionally not reused.

## Codex app-server over stdio

Omvra uses Codex’s native app-server protocol over stdio. This is distinct from Claude stream-json and from generic ACP.

### Profile

Set:

```text
Mode: Codex app-server over stdio
Executable: /absolute/path/to/codex
Preferred model: gpt-5             # optional; use a model advertised by Codex
Fixed arguments:                    # optional, one argument per line
Enabled: on
Approval policy: on-request         # untrusted, on-request, or never
```

The executable path must point to the actual Codex app-server-capable executable, not a directory. On macOS installations this may be inside the ChatGPT application bundle, for example:

```text
/Applications/ChatGPT.app/Contents/Resources/codex
```

Use the executable path present on the target machine; do not copy this path into a project or swimlane configuration.

Optional fixed arguments are passed before the app-server protocol starts. For example:

```text
-c
model="gpt-5"
```

Prefer the dedicated preferred-model field when the runtime advertises models. Use fixed arguments only for provider options that are not represented by the profile fields.

### Authentication and model discovery

The connection test negotiates the Codex app-server protocol, account state, capabilities, and advertised models. If Codex reports that sign-in is required, authenticate Codex on the target machine before starting a task.

Select a preferred model from the models advertised by the test result. Do not enter an array or a complete command-line fragment in the model field.

### MCP and task scope

Omvra waits for its local MCP listener before starting managed work. Provider MCP configuration remains provider-specific; task and project folders remain task context. The MCP capability profile controls whether Codex can only read workspace data or can perform task writes and review transitions.

## Generic ACP over stdio

For an ACP-compatible provider that is neither Claude nor Codex, select:

```text
Mode: ACP agent over stdio
Executable: /absolute/path/to/agent
Fixed arguments: one argument per line
```

For providers that require a subcommand, put that subcommand in fixed arguments. For example, an OpenCode ACP profile commonly uses:

```text
acp
```

The provider is responsible for its ACP implementation and authentication. Omvra validates the protocol handshake, exposes the negotiated capabilities, and keeps the task working directory scoped to the selected project/swimlane.

## MCP capability profiles

MCP access is configured independently from the provider profile under **Settings → MCP Access**:

- **Read only**: workspace and task inspection without task writes.
- **Task Write**: task descriptions, assignments, context, status/review transitions, and related task writes.
- **Admin**: broader administrative operations.

If an agent says that `tasks.*` tools are unavailable, check all of the following:

1. MCP agent access is enabled.
2. The listener status is running.
3. The selected capability profile exposes the required tools.
4. The provider session was created after the MCP configuration was available.
5. For Claude, reconnect so Omvra creates a fresh provider session instead of resuming stale history.

## Troubleshooting checklist

1. Confirm the profile is enabled and its executable path exists on the target machine.
2. Run **Test connection** after changing the executable or fixed arguments.
3. Authenticate the provider CLI separately from its desktop application.
4. Confirm the preferred model is a plain model identifier such as `sonnet` or an advertised Codex model.
5. Confirm MCP access and capability profile in Settings.
6. Start the task from a project/swimlane with a valid repository folder.
7. If the session reports stale tools or old context, reconnect to create a fresh provider session.

