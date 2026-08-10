function registerStoreIpcHandlers({ ipcMain, store, preferencesKey, onPreferencesSet }) {
  ipcMain.handle('store/get', (_, key) => store.get(key));
  ipcMain.handle('store/set', (_, key, value) => {
    const result = store.set(key, value);
    if (key === preferencesKey && typeof onPreferencesSet === 'function') {
      onPreferencesSet(value);
    }
    return result;
  });
  ipcMain.handle('store/set-many', (_, values) => {
    const entries = values && typeof values === 'object' && !Array.isArray(values)
      ? Object.entries(values)
      : [];
    if (entries.length === 0) return { count: 0 };

    const current = store.store && typeof store.store === 'object' ? store.store : {};
    const next = { ...current };
    entries.forEach(([key, value]) => { next[key] = value; });

    const storeDescriptor = Object.getOwnPropertyDescriptor(store, 'store')
      || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(store) || {}, 'store');
    if (storeDescriptor?.set) {
      try {
        store.store = next;
      } catch {
        entries.forEach(([key, value]) => store.set(key, value));
      }
    } else {
      entries.forEach(([key, value]) => store.set(key, value));
    }

    const preferenceEntry = entries.find(([key]) => key === preferencesKey);
    if (preferenceEntry && typeof onPreferencesSet === 'function') {
      onPreferencesSet(preferenceEntry[1]);
    }
    return { count: entries.length };
  });
  ipcMain.handle('store/delete', (_, key) => store.delete(key));
  ipcMain.handle('store/export', () => store.store);
}

module.exports = { registerStoreIpcHandlers };
