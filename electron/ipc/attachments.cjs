function registerAttachmentIpcHandlers({ ipcMain, app, dialog, fs, path, shell }) {
  const pickDirectory = async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0] || null;
  };

  ipcMain.handle('goal-audit/pick-directory', pickDirectory);
  ipcMain.handle('skills/pick-directory', pickDirectory);
  ipcMain.handle('attachments/pick', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('attachments/verify', async (_, filePath) => {
    try {
      const stats = await fs.promises.stat(filePath);
      return { exists: true, size: stats.size, mtime: stats.mtimeMs, readable: true };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  });
  ipcMain.handle('attachments/embed', async (_, filePath) => {
    try {
      const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
      await fs.promises.mkdir(attachmentsDir, { recursive: true });
      const destination = path.join(attachmentsDir, `${Date.now()}-${path.basename(filePath)}`);
      await fs.promises.copyFile(filePath, destination);
      return { success: true, path: destination };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle('attachments/reveal', async (_, filePath) => {
    try {
      if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Attachment path is required');
      await fs.promises.stat(filePath);
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerAttachmentIpcHandlers };
