function registerPerformanceIpcHandlers({ ipcMain, performanceLog }) {
  ipcMain.handle('performance/record', (_event, details) => performanceLog.record(details));
  ipcMain.handle('performance/record-batch', (_event, events) => performanceLog.recordMany(events));
  ipcMain.handle('performance/open-logs-folder', () => performanceLog.openFolder());
  ipcMain.handle('performance/clear-logs', () => performanceLog.clear());
}

module.exports = { registerPerformanceIpcHandlers };
