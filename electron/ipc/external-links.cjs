function registerExternalLinkIpcHandlers({ ipcMain, shell }) {
  ipcMain.handle('open-external', async (_, urlString) => {
    try {
      const url = new URL(urlString);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('Invalid protocol');
      await shell.openExternal(urlString);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerExternalLinkIpcHandlers };
