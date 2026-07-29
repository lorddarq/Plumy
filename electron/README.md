Electron scaffolding

Dev run (starts Vite and Electron):

  npm run dev

Build renderer and package electron:

  npm run dist

Notes:
- In dev, Electron will load http://localhost:5173. Make sure `npm run dev` is running before starting Electron.
- Attachments are referenced by absolute local paths by default. The task model stores metadata only; Omvra does not copy attached files unless the optional embed IPC is used by future UI.
- Exposed preload APIs are available under `window.electron` (storeGet/storeSet, attachments.*, openExternal).
- `attachments.pick` opens the native file picker with multi-selection.
- `attachments.verify` checks whether a referenced file still exists and returns file metadata such as size and mtime.
- `attachments.reveal` uses `shell.showItemInFolder(path)` to reveal/select the attachment in Finder instead of opening the file.
- `openExternal` intentionally remains limited to `http` and `https`; local files are handled only through attachment-specific IPC.
- `attachments.embed` remains available as a lower-level helper and copies a file into `app.getPath('userData')/attachments`, but the current task attachment UI stores local references only.

MCP attachment tools:

- `tasks.attach_file` adds a local file reference to a task from an absolute path or `file://` URL. It normalizes metadata into the same `Task.attachments` shape used by the UI.
- `tasks.remove_attachment` removes a local file reference by `attachmentId`, absolute path, or `file://` URL.
- Both tools are gated by the MCP write capability profile and require `expectedRevision`.
- The tools reject non-file URL protocols and never open, read, copy, or upload the referenced files.

Task attachment implementation:

- Renderer model: `Task.attachments` in `src/app/types.ts`
- Add/remove UI: `src/app/components/TaskDialog.tsx`
- Reveal UI: `src/app/components/TaskDetailsDialog.tsx`
- Persistence normalization: `src/app/utils/workspaceSanitizers.ts`
- Backup/import normalization: `src/app/services/workspaceBackup.ts`
- Main/preload bridge: `electron/main.cjs`, `electron/preload.cjs`, and `src/electron.d.ts`
- MCP mutation logic: `electron/services/workspace-service.cjs`
- MCP tool/resource registry: `electron/services/mcp-registry.cjs`
- MCP tool and resource handlers: `electron/services/mcp-handlers.cjs`, `electron/services/mcp-resource-handlers.cjs`
- MCP response and audit adapters: `electron/services/mcp-response.cjs`, `electron/services/mcp-audit-adapter.cjs`
- MCP JSON-RPC dispatch and HTTP transport: `electron/services/mcp-http-server.cjs`

Generating icon assets:

- Place your source PNG at `electron/assets/icon.png` (already present).
- To generate platform assets (.icns, .ico, .png), run:

```
npm run generate:icons
```

This uses `icon-gen` via `npx` to generate `icon.icns` and `icon.ico` into `electron/assets/`. Add them to the repository before building for macOS/Windows to ensure builds include the proper icon files.
