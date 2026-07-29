function registerStoreIpcHandlers({ ipcMain, store, preferencesKey, onPreferencesSet }) {
  ipcMain.handle('store/get', (_, key) => store.get(key));
  ipcMain.handle('store/set', (_, key, value) => {
    const result = store.set(key, value);
    if (key === preferencesKey && typeof onPreferencesSet === 'function') {
      onPreferencesSet(value);
    }
    return result;
  });
  ipcMain.handle('store/delete', (_, key) => store.delete(key));
  ipcMain.handle('store/export', () => store.store);
}

module.exports = { registerStoreIpcHandlers };
