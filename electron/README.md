Electron scaffolding

Dev run (starts Vite and Electron):

  npm run dev

Build renderer and package electron:

  npm run dist

Notes:
- In dev, Electron will load http://localhost:5173. Make sure `npm run dev` is running before starting Electron.
- Attachments are referenced by absolute local paths by default. Embed option copies files into `app.getPath('userData')/attachments`.
- Exposed preload APIs are available under `window.electron` (storeGet/storeSet, attachments.*, openExternal).

Generating icon assets:

- Place your source PNG at `electron/assets/icon.png` (already present).
- To generate platform assets (.icns, .ico, .png), run:

```
npm run generate:icons
```

This uses `icon-gen` via `npx` to generate `icon.icns` and `icon.ico` into `electron/assets/`. Add them to the repository before building for macOS/Windows to ensure builds include the proper icon files.