import type { TaskStatus } from '../types.ts';

export function areShallowValuesEqual<T extends object>(left: T, right: T): boolean {
  const keys = Object.keys(left) as Array<keyof T>;
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.is(left[key], right[key]));
}

export function normalizeLoadStatusIds(
  value: unknown,
  fallback: TaskStatus[],
  statusColumns: Array<{ id: string }>
): TaskStatus[] {
  const validIds = new Set(statusColumns.map(column => column.id));
  const candidates = Array.isArray(value) ? value : typeof value === 'string' ? [value] : fallback;
  const normalized = candidates.filter((statusId): statusId is TaskStatus => (
    typeof statusId === 'string' && validIds.has(statusId)
  ));

  return Array.from(new Set(normalized));
}

export function areSerializedValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right) && (left === null || typeof left !== 'object')) return true;

  if (left !== right && Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    if (left.every((value, index) => Object.is(value, right[index]))) return true;
  } else if (
    left !== right
    && left !== null
    && right !== null
    && typeof left === 'object'
    && typeof right === 'object'
  ) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (
      leftKeys.length === rightKeys.length
      && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key)
        && Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
    ) return true;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
