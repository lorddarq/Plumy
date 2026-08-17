import type { GoalConditionBranch, GoalConnectorSide, GoalElement } from '../types.ts';

export function isGoalElementConnected(elements: GoalElement[], elementId: string): boolean {
  return elements.some(element => element.type === 'connector' && (element.sourceId === elementId || element.targetId === elementId));
}

export function isValidRetryTarget(elements: GoalElement[], retryId: string, targetId: string, ignoredConnectorId?: string | null): boolean {
  const incoming = new Map<string, string[]>();
  elements.filter(element => element.type === 'connector' && element.id !== ignoredConnectorId && element.sourceId && element.targetId).forEach(connection => {
    const source = elements.find(element => element.id === connection.sourceId);
    if (source?.type === 'retry') return;
    const parents = incoming.get(connection.targetId!) ?? [];
    parents.push(connection.sourceId!);
    incoming.set(connection.targetId!, parents);
  });

  const pending = [retryId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(incoming.get(current) ?? []));
  }
  return false;
}

export function wouldCreateGoalCycle(elements: GoalElement[], sourceId: string, targetId: string, ignoredConnectorId?: string | null): boolean {
  if (sourceId === targetId) return true;

  const next = new Map<string, string[]>();
  elements.filter(element => element.type === 'connector' && element.id !== ignoredConnectorId && element.sourceId && element.targetId).forEach(connection => {
    const source = elements.find(element => element.id === connection.sourceId);
    if (source?.type === 'retry') return;
    const targets = next.get(connection.sourceId!) ?? [];
    targets.push(connection.targetId!);
    next.set(connection.sourceId!, targets);
  });

  const pending = [targetId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(next.get(current) ?? []));
  }
  return false;
}

export function goalCanvasElementHeight(element: GoalElement, measuredHeights: Record<string, number>): number {
  return measuredHeights[element.id]
    ?? (element.type === 'condition' ? Math.max(element.height ?? 90, 150) : element.type === 'human-input' ? Math.max(element.height ?? 90, 120) : element.height ?? 90);
}

export function goalCanvasPanToCenterElement(element: GoalElement): { x: number; y: number } {
  return {
    x: -(element.x + (element.width ?? 220) / 2),
    y: -(element.y + (element.height ?? 90) / 2),
  };
}

function nodePoint(element: GoalElement, side: GoalConnectorSide, height: number, branch?: GoalConditionBranch) {
  const width = element.width ?? 220;
  if (side === 'top') return { x: element.x + width / 2, y: element.y };
  if (side === 'bottom') return { x: element.x + width / 2, y: element.y + height };
  if (side === 'left') return { x: element.x, y: element.y + height / 2 };
  if (element.type === 'condition' && branch) return { x: element.x + width, y: element.y + height * (branch === 'positive' ? 0.32 : 0.68) };
  return { x: element.x + width, y: element.y + height / 2 };
}

function controlPoint(point: { x: number; y: number }, side: GoalConnectorSide, distance: number) {
  if (side === 'top') return { x: point.x, y: point.y - distance };
  if (side === 'bottom') return { x: point.x, y: point.y + distance };
  if (side === 'left') return { x: point.x - distance, y: point.y };
  return { x: point.x + distance, y: point.y };
}

export function goalConnectorPath(elements: GoalElement[], connection: GoalElement, measuredHeights: Record<string, number>): string | null {
  const source = elements.find(element => element.id === connection.sourceId);
  const target = elements.find(element => element.id === connection.targetId);
  if (!source || !target) return null;
  const sourceSide = connection.sourceSide ?? 'right';
  const targetSide = connection.targetSide ?? 'left';
  const start = nodePoint(source, sourceSide, goalCanvasElementHeight(source, measuredHeights), connection.conditionBranch);
  const end = nodePoint(target, targetSide, goalCanvasElementHeight(target, measuredHeights));
  const bend = Math.max(48, Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) * 0.35);
  const first = controlPoint(start, sourceSide, bend);
  const second = controlPoint(end, targetSide, bend);
  return `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`;
}
