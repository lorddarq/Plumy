function registerStoreIpcHandlers({ ipcMain, store, preferencesKey, onPreferencesSet, onStoreMutation }) {
  ipcMain.handle('store/get', (_, key) => store.get(key));
  ipcMain.handle('store/get-many', (_, keys) => {
    const requestedKeys = Array.isArray(keys) ? keys.filter(key => typeof key === 'string') : [];
    const storedSnapshot = store.store;
    const snapshot = storedSnapshot && typeof storedSnapshot === 'object' ? storedSnapshot : {};
    return Object.fromEntries(requestedKeys.map(key => [key, snapshot[key]]));
  });
  ipcMain.handle('store/set', (_, key, value) => {
    if (typeof onStoreMutation === 'function' && typeof key === 'string') onStoreMutation([key]);
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
    if (typeof onStoreMutation === 'function') onStoreMutation(entries.map(([key]) => key));

    const storedSnapshot = store.store;
    const current = storedSnapshot && typeof storedSnapshot === 'object' ? storedSnapshot : {};
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
  ipcMain.handle('store/delete', (_, key) => {
    if (typeof onStoreMutation === 'function' && typeof key === 'string') onStoreMutation([key]);
    return store.delete(key);
  });
  ipcMain.handle('store/export', () => store.store);
}

module.exports = { registerStoreIpcHandlers };
