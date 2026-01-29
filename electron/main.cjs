const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const isDev = process.env.NODE_ENV !== 'production';
const store = new Store({ name: 'plumy-store' });

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
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