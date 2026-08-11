import { shouldBootstrapFromLocalStorage } from './canonicalHydration.js';
import { measurePerformanceOperation } from '../services/performanceLogging.ts';

export async function getJSON<T = any>(key: string, fallback: T | null = null): Promise<T | null> {
  // In Electron we have window.electron.storeGet available via preload
  try {
    // @ts-ignore
    if (typeof window !== 'undefined' && (window as any).electron && (window as any).electron.storeGet) {
      // electron-store returns undefined for unknown keys
      const v = await (window as any).electron.storeGet(key);
      return v === undefined ? fallback : (v as T);
    }
  } catch (err) {
    // fallthrough to localStorage
  }

  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    return fallback;
  }
}

export async function getJSONBatch(keys: string[]): Promise<Record<string, unknown>> {
  if (typeof window === 'undefined') return {};

  try {
    const storeGetMany = window.electron?.storeGetMany;
    if (typeof storeGetMany === 'function') return await storeGetMany(keys);
  } catch {
    // Fall through to the per-key/localStorage path.
  }

  const values = await Promise.all(keys.map(async key => [key, await getJSON(key)] as const));
  return Object.fromEntries(values);
}

export async function setJSON<T = any>(key: string, value: T): Promise<void> {
  try {
    // @ts-ignore
    if (typeof window !== 'undefined' && (window as any).electron && (window as any).electron.storeSet) {
      await (window as any).electron.storeSet(key, value);
      return;
    }
  } catch (err) {
    // fallthrough to localStorage
  }

  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    // ignore
  }
}

export async function getCanonicalJSON<T = any>(key: string, fallback: T | null = null): Promise<T | null> {
  try {
    const storeGet = window.electron?.storeGet;
    if (typeof storeGet !== 'function') return fallback;
    const value = await storeGet(key);
    return value === undefined ? fallback : value as T;
  } catch {
    return fallback;
  }
}

export async function setCanonicalJSON<T = any>(key: string, value: T): Promise<boolean> {
  try {
    const storeSet = window.electron?.storeSet;
    if (typeof storeSet !== 'function') return false;
    await storeSet(key, value);
    return true;
  } catch {
    return false;
  }
}

export async function deleteStoredValue(key: string): Promise<void> {
  try {
    // @ts-ignore
    if (typeof window !== 'undefined' && (window as any).electron && (window as any).electron.storeDelete) {
      await (window as any).electron.storeDelete(key);
      return;
    }
  } catch (err) {
    // fallthrough to localStorage
  }

  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  } catch (err) {
    // ignore
  }
}

/**
 * Persist to the renderer storage surface and best-effort mirror to electron-store.
 * In Electron, the canonical data source is electron-store; localStorage remains
 * a portability/fallback layer for web-style and backup flows.
 */
export function persistJSONWithElectronMirror<T = any>(key: string, value: T): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  return measurePerformanceOperation('storage', `persist.${key}`, async () => {
    try {
      const storeSet = window.electron?.storeSet;
      if (typeof storeSet === 'function') {
        await storeSet(key, value).catch(() => {
          // Ignore mirror failures to keep renderer persistence non-breaking.
        });
        return;
      }
    } catch (err) {
      // ignore
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // ignore
    }
  });
}

export function persistJSONBatchWithElectronMirror(entries: Record<string, unknown>): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  return measurePerformanceOperation('storage', 'persist.workspace-batch', async () => {
    const values = Object.entries(entries);
    try {
      const electron = window.electron;
      if (typeof electron?.storeSetMany === 'function') {
        await electron.storeSetMany(Object.fromEntries(values));
      } else if (typeof electron?.storeSet === 'function') {
        await Promise.all(values.map(([key, value]) => electron.storeSet(key, value)));
      } else {
        values.forEach(([key, value]) => {
          try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
        });
      }
    } catch {
      values.forEach(([key, value]) => {
        try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
      });
    }
  });
}

export function persistRawWithElectronMirror(key: string, value: string): void {
  if (typeof window === 'undefined') return;

  try {
    const storeSet = window.electron?.storeSet;
    if (typeof storeSet === 'function') {
      void storeSet(key, value).catch(() => {
        // Ignore mirror failures to keep renderer persistence non-breaking.
      });
      return;
    }
  } catch (err) {
    // ignore
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    // ignore
  }
}

export function removeRawWithElectronMirror(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    // ignore
  }

  try {
    const storeDelete = window.electron?.storeDelete;
    if (typeof storeDelete === 'function') {
      void storeDelete(key).catch(() => {
        // Ignore mirror failures to keep renderer persistence non-breaking.
      });
    }
  } catch (err) {
    // ignore
  }
}

export function safeReadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    return fallback;
  }
}

export function readInitialWorkspaceJSON<T>(key: string, fallback: T): T {
  return shouldBootstrapFromLocalStorage() ? safeReadJSON(key, fallback) : fallback;
}

export function safeReadRaw(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

export function safeWriteRaw(key: string, value: string): void {
  persistRawWithElectronMirror(key, value);
}

export function safeReadLocalStorageJSON<T>(key: string, fallback: T): T {
  const raw = safeReadRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    return fallback;
  }
}

export function getLegacyPortableStorageKey(key: string): string | null {
  if (key.startsWith('omvra.')) return `plumy.${key.slice('omvra.'.length)}`;
  if (key.startsWith('omvra_viewstate_')) return `plumy_viewstate_${key.slice('omvra_viewstate_'.length)}`;
  return null;
}

export function normalizePortableStorageKey(key: string): string | null {
  if (key.startsWith('omvra.') || key.startsWith('omvra_viewstate_')) return key;
  if (key.startsWith('plumy.')) return `omvra.${key.slice('plumy.'.length)}`;
  if (key.startsWith('plumy_viewstate_')) return `omvra_viewstate_${key.slice('plumy_viewstate_'.length)}`;
  return null;
}

export function isPortableStorageKey(key: string): boolean {
  return normalizePortableStorageKey(key) !== null;
}

const PORTABLE_OBJECT_STORE_KEYS = new Set([
  'omvra.agentRuntimeProfiles.v1',
  'omvra.agentRuntimeDefaults.v1',
  'omvra.agentRuntimeObservations.v1',
  'omvra.externalAgentHandoffs.v1',
  'omvra.acpSessionBindings.v1',
  'omvra.acpSessionEvents.v1',
]);

export function getPortableStorageSnapshot(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const snapshot: Record<string, string> = {};

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      const portableKey = normalizePortableStorageKey(key);
      if (!portableKey) continue;
      const value = window.localStorage.getItem(key);
      if (typeof value === 'string') {
        snapshot[portableKey] = value;
      }
    }
  } catch (err) {
    return {};
  }

  return snapshot;
}

export function flattenPortableStoreEntries(
  value: unknown,
  prefix = '',
  out: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) {
      out[prefix] = value;
    }
    return out;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    const portablePrefix = normalizePortableStorageKey(nextPrefix);
    const isPortableObjectStoreValue = portablePrefix ? PORTABLE_OBJECT_STORE_KEYS.has(portablePrefix) : false;
    if (child && typeof child === 'object' && !Array.isArray(child) && !isPortableObjectStoreValue) {
      flattenPortableStoreEntries(child, nextPrefix, out);
    } else {
      out[nextPrefix] = child;
    }
  }

  return out;
}

export function getPortableStoreValue<T = unknown>(
  exported: Record<string, unknown>,
  key: string
): T | undefined {
  const candidateKeys = [key, getLegacyPortableStorageKey(key)].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidateKey of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(exported, candidateKey)) {
      return exported[candidateKey] as T;
    }
  }

  for (const candidateKey of candidateKeys) {
    const segments = candidateKey.split('.');
    let current: unknown = exported;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current) || !(segment in (current as Record<string, unknown>))) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    if (current !== undefined) {
      return current as T;
    }
  }

  return undefined;
}

export async function getPortableElectronStoreSnapshot(): Promise<Record<string, unknown>> {
  try {
    const exported = await window.electron?.storeExport?.();
    if (!exported || typeof exported !== 'object') {
      return {};
    }

    const flattened = flattenPortableStoreEntries(exported);
    return Object.fromEntries(
      Object.entries(flattened).reduce<Array<[string, unknown]>>((acc, [key, value]) => {
        const portableKey = normalizePortableStorageKey(key);
        if (portableKey) {
          acc.push([portableKey, value]);
        }
        return acc;
      }, [])
    );
  } catch (err) {
    return {};
  }
}

export function clearPortableStorageKeys(): void {
  if (typeof window === 'undefined') return;

  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && isPortableStorageKey(key)) {
        keys.push(key);
      }
    }

    keys.forEach(key => {
      window.localStorage.removeItem(key);
    });
  } catch (err) {
    // ignore
  }
}

export function hasAnyPortableLocalStorageData(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && isPortableStorageKey(key)) {
        return true;
      }
    }
  } catch (err) {
    return false;
  }

  return false;
}

export async function clearPortableElectronStoreKeys(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const exported = await window.electron?.storeExport?.();
    if (!exported || typeof exported !== 'object') return;

    const keys = Object.keys(flattenPortableStoreEntries(exported)).filter(isPortableStorageKey);
    await Promise.all(keys.map(key => deleteStoredValue(key).catch(() => undefined)));
  } catch (err) {
    // ignore
  }
}

export async function restorePortableStorageSnapshot(
  storageSnapshot?: Record<string, string>,
  electronStoreSnapshot?: Record<string, unknown>
): Promise<void> {
  clearPortableStorageKeys();
  await clearPortableElectronStoreKeys();

  if (storageSnapshot && typeof storageSnapshot === 'object') {
    Object.entries(storageSnapshot).forEach(([key, value]) => {
      const portableKey = normalizePortableStorageKey(key);
      if (!portableKey || typeof value !== 'string') return;
      safeWriteRaw(portableKey, value);
    });
  }

  if (electronStoreSnapshot && typeof electronStoreSnapshot === 'object') {
    const entries = Object.entries(electronStoreSnapshot)
      .map(([key, value]) => {
        const portableKey = normalizePortableStorageKey(key);
        return portableKey ? [portableKey, value] as const : null;
      })
      .filter((entry): entry is readonly [string, unknown] => Boolean(entry));

    const storeSetMany = window.electron?.storeSetMany;
    if (typeof storeSetMany === 'function') {
      await storeSetMany(Object.fromEntries(entries)).catch(() => undefined);
    } else {
      const storeSet = window.electron?.storeSet;
      if (typeof storeSet === 'function') {
        await Promise.all(entries.map(([key, value]) => storeSet(key, value).catch(() => undefined)));
      }
    }
  }
}
