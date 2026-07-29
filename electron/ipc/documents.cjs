function sanitizePdfFileName(value) {
  const baseName = typeof value === 'string' && value.trim() ? value.trim() : 'task-details.pdf';
  const safeName = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
}

function registerDocumentIpcHandlers({ ipcMain, BrowserWindow, dialog, fs, shell }) {
  ipcMain.handle('tasks/export-pdf', async (event, { html, defaultFileName } = {}) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { success: false, error: 'PDF content is missing.' };
    }

    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export task as PDF',
      defaultPath: sanitizePdfFileName(defaultFileName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    };
    const saveResult = sourceWindow
      ? await dialog.showSaveDialog(sourceWindow, options)
      : await dialog.showSaveDialog(options);
    if (saveResult.canceled || !saveResult.filePath) return { success: false, canceled: true };

    let exportWindow;
    try {
      exportWindow = new BrowserWindow({
        show: false,
        width: 794,
        height: 1123,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await exportWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
      });
      await fs.promises.writeFile(saveResult.filePath, pdfBuffer);
      shell.showItemInFolder(saveResult.filePath);
      return { success: true, filePath: saveResult.filePath };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    } finally {
      if (exportWindow && !exportWindow.isDestroyed()) exportWindow.destroy();
    }
  });

  ipcMain.handle('agent-configurations/export', async (event, { json, defaultFileName = 'omvra-agent-configurations.json' } = {}) => {
    if (typeof json !== 'string' || !json.trim()) {
      return { success: false, error: 'Agent configuration data is missing.' };
    }
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export agents',
      defaultPath: defaultFileName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    };
    const saveResult = sourceWindow
      ? await dialog.showSaveDialog(sourceWindow, options)
      : await dialog.showSaveDialog(options);
    if (saveResult.canceled || !saveResult.filePath) return { success: false, canceled: true };

    try {
      await fs.promises.writeFile(saveResult.filePath, json, 'utf8');
      shell.showItemInFolder(saveResult.filePath);
      return { success: true, filePath: saveResult.filePath };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  });
}

module.exports = { registerDocumentIpcHandlers, sanitizePdfFileName };
