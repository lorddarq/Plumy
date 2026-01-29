Electron scaffolding

Dev run (starts Vite and Electron):

  npm run dev

Build renderer and package electron:

  npm run dist

Notes:
- In dev, Electron will load http://localhost:5173. Make sure `npm run dev` is running before starting Electron.
- Attachments are referenced by absolute local paths by default. Embed option copies files into `app.getPath('userData')/attachments`.
- Exposed preload APIs are available under `window.electron` (storeGet/storeSet, attachments.*, openExternal).