# Electron Integration Plan for Plumy

> Minimal, secure, cross-platform Electron integration for a Vite + React app.

## Goals ✅
- Deliver a lightweight desktop app for macOS, Windows, Linux
- Keep renderer sandboxed and secure (no Node in renderer)
- Use a simple persistence layer (default: `electron-store`, reference-only attachments)
- Provide a smooth dev workflow (Vite HMR + Electron) and CI packaging

---

## High-level architecture 🏗️
- **Main process**: Electron app lifecycle, native APIs, storage, file system, packaging hooks
- **Preload**: Minimal, typed IPC surface exposed via `contextBridge`
- **Renderer**: Existing Vite/React app (dev served by Vite, prod loads `dist`)
- **Storage**: `electron-store` in main (JSON file under `app.getPath('userData')`)

---

## Security Defaults 🔒
- `BrowserWindow` options:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `enableRemoteModule: false`
- Use preload to expose only required APIs (store, attachments, `openExternal`)
- Validate and normalize all file paths in the main process; reject non-local schemes
- Use CSP in the renderer and open external links via `shell.openExternal()` from main

---

## Persistence & Attachments 💾
- **Default:** store local absolute paths only (no remote URLs). Keep metadata: { id, path, size, mtime, hash? }
  - Show `Exists / Missing / Unreadable` in UI
- **Optional Embed:** copy files to `app.getPath('userData')/attachments` when users choose to embed for portability
- **Export:** metadata-only export by default, optional zip that includes referenced files (requires user confirmation)

---

## IPC / Preload Surface ✨
- Main handlers (examples):
  - `ipcMain.handle('store/get', (e, key) => store.get(key))`
  - `ipcMain.handle('store/set', (e, key, value) => store.set(key, value))`
  - `ipcMain.handle('attachments/pick', () => dialog.showOpenDialog(...))`
  - `ipcMain.handle('attachments/verify', (_, path) => fs.stat(path))`
  - `ipcMain.handle('attachments/embed', (_, path) => copy to attachments dir)`
  - `ipcMain.handle('open-external', (_, url) => shell.openExternal(url))` (validate url first)

- Preload exposes minimal typed functions to renderer via `contextBridge.exposeInMainWorld('electron', { ... })`

---

## Dev Workflow (fast feedback) 🚀
- Dev scripts:
```json
"dev:vite": "vite",
"dev:electron": "wait-on http://localhost:5173 && electron .",
"dev": "concurrently \"npm run dev:vite\" \"npm run dev:electron\""
```
- In dev, point Electron `BrowserWindow` to `http://localhost:5173` and enable HMR

---

## Packaging & Auto-update 📦
- Use `electron-builder` for cross-platform packaging
- Minimal `build` config in `package.json`:
```json
"build": {
  "appId": "com.yourorg.plumy",
  "productName": "Plumy",
  "files": ["dist/**", "electron/**"],
  "mac": { "target": ["dmg","pkg"] },
  "win": { "target": ["nsis"] },
  "linux": { "target": ["AppImage"] }
}
```
- For auto-updates use `electron-updater` + GitHub Releases (or custom server)

---

## Signing & Notarization 🔐
- macOS: notarize with Apple `Developer ID` cert (requires macOS runner in CI)
- Windows: code-sign with certificate (recommended EV for trust)
- Store signing credentials securely in CI secrets

---

## CI Recommendations ⚙️
- GitHub Actions matrix build for macOS, Windows, Linux
- Build & upload artifacts to GitHub Releases
- macOS notarization step requires macOS runner + Apple secrets

---

## Risks & Mitigations ⚠️
- Electron binary size: prune and keep native modules minimal
- Native modules (e.g., SQLite) require `electron-rebuild` and extra packaging complexity — prefer `electron-store` unless SQL is necessary
- Attachment references can break if users move files — provide UI warnings and optional embed/copy

---

## Next Steps (pick one) ▶️
- Scaffold **Electron main + preload + dev scripts** (fast): create `electron/main.ts`, `electron/preload.ts`, update scripts
- Add **persistence & attachments**: wire `electron-store`, attachments handlers, and a small UI for pick/verify/embed
- Add **CI & packaging config**: `electron-builder` config and example GH Actions

---

## Notes & UX tips 💡
- Explicitly show file reference status and provide `Locate` / `Embed` actions
- For notes containing URLs: accept plain http(s) links only, sanitize, and open via `openExternal` through validated IPC
- Keep CLI instructions for local dev & packaging in the README

---

Saved on: `guidelines/Electron-Integration-Plan.md`

If you want, I can scaffold the first step (main + preload + scripts) now and add a short README with dev instructions.