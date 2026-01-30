const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Consider the app to be in dev mode when it's not packaged. This avoids trying to load a dev server in packaged builds.
const isDev = !app.isPackaged;
const store = new Store({ name: 'plumy-store' });

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Set macOS dock icon at runtime if the .icns file exists
  if (process.platform === 'darwin') {
    const dockIconCandidates = [path.join(__dirname, 'assets', 'app.icns'), path.join(__dirname, 'assets', 'icon.icns')];
    try {
      for (const dockIcon of dockIconCandidates) {
        if (fs.existsSync(dockIcon) && app.dock) {
          app.dock.setIcon(dockIcon);
          break;
        }
      }
    } catch (err) {
      // ignore errors setting dock icon
    }
  }

  const loadDev = async () => {
    const devUrl = 'http://localhost:5173';
    try {
      await win.loadURL(devUrl);
      win.webContents.openDevTools({ mode: 'detach' });
    } catch (e) {
      console.error('Failed to load dev server at', devUrl, e);
      // fallback to packaged index if available
      const prodIndex = path.join(__dirname, '../dist/index.html');
      try {
        if (fs.existsSync(prodIndex)) {
          await win.loadFile(prodIndex);
        } else {
          dialog.showErrorBox('App load error', `Could not load dev server (${devUrl}) and no packaged index found at ${prodIndex}`);
        }
      } catch (err) {
        dialog.showErrorBox('App load error', `Failed to load app: ${err?.message || err}`);
      }
    }
  };

  // Add error listeners to help diagnose load failures in packaged apps
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('WebContents failed to load', { errorCode, errorDescription, validatedURL, isMainFrame });
    try { dialog.showErrorBox('Load Error', `Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`); } catch (e) {}
  });

  win.webContents.on('did-finish-load', () => {
    console.log('WebContents finished load:', win.webContents.getURL());

    // Probe the renderer for DOM content to help diagnose empty UI
    try {
      win.webContents.executeJavaScript(`(async function(){
        await new Promise(r => setTimeout(r, 500));
        const root = document.getElementById('root');
        const bodyText = document.body ? document.body.innerText.slice(0,400) : null;
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerHTML.slice(0,80));
        return { exists: !!root, html: root ? root.innerHTML.slice(0,200) : null, bodyText, scripts };
      })()`)
      .then((res) => {
        console.log('Renderer probe:', res);
      }).catch(err => console.error('Renderer probe failed', err));
    } catch (err) {
      console.error('Renderer probe error', err);
    }
  });

  // Forward renderer console messages to main process stdout for easier debugging
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[renderer console][level=${level}] ${message} (line:${line} source:${sourceId})`);
  });

  // Detect render process crashes or terminations
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
    try { dialog.showErrorBox('Renderer error', `Renderer process terminated: ${details.reason}`); } catch (e) {}
  });

  win.webContents.on('crashed', (event) => {
    console.error('Renderer crashed');
    try { dialog.showErrorBox('Renderer crashed', 'The renderer process crashed.'); } catch (e) {}
  });

  const loadProd = async () => {
    const prodIndex = path.join(__dirname, '../dist/index.html');
    try {
      if (fs.existsSync(prodIndex)) {
        await win.loadFile(prodIndex);
      } else {
        dialog.showErrorBox('Missing app files', `Packaged index not found at ${prodIndex}. Ensure the build artifacts are included in the app bundle.`);
      }
    } catch (err) {
      console.error('Failed to load packaged index', err);
      dialog.showErrorBox('App load error', `Failed to load packaged app: ${err?.message || err}`);
    }
  };

  if (isDev) {
    loadDev();
  } else {
    loadProd();
  }

  // Optionally open devtools in packaged app for debugging when PLUMY_DEBUG_RENDERER=1
  try {
    if (!isDev && process.env.PLUMY_DEBUG_RENDERER === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (e) {}

}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// =====================
// IPC: Store
// =====================
ipcMain.handle('store/get', (_, key) => store.get(key));
ipcMain.handle('store/set', (_, key, value) => store.set(key, value));
ipcMain.handle('store/export', () => store.store);

// =====================
// IPC: Attachments
// =====================
ipcMain.handle('attachments/pick', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('attachments/verify', async (_, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return { exists: true, size: stats.size, mtime: stats.mtimeMs, readable: true };
  } catch (err) {
    return { exists: false, error: err.message };
  }
});

ipcMain.handle('attachments/embed', async (_, filePath) => {
  try {
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    await fs.promises.mkdir(attachmentsDir, { recursive: true });
    const base = path.basename(filePath);
    const dest = path.join(attachmentsDir, `${Date.now()}-${base}`);
    await fs.promises.copyFile(filePath, dest);
    return { success: true, path: dest };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// =====================
// IPC: Open external URLs (validate protocol)
// =====================
ipcMain.handle('open-external', async (_, urlStr) => {
  try {
    const url = new URL(urlStr);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
    await shell.openExternal(urlStr);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});