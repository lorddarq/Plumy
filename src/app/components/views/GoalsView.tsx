import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { GoalAgentConfiguration, GoalArtifactReference, GoalConditionBranch, GoalConnectorSide, GoalElement, GoalElementType, GoalPolicy, GoalPolicyDimension, GoalPolicyDimensionOverride, GoalRecord, GoalRuntimeProjection, GoalSchedule, Person, ProjectMilestone, SupportingArtifactType, Task, TimelineSwimlane } from '../../types.ts';
import type { GoalPolicyV1 } from '../../utils/goalPolicy.ts';
import { GOAL_TEMPLATES, instantiateGoalTemplate, type GoalTemplate } from '../../data/goalTemplates.ts';
import { getCanonicalJSON, safeReadJSON, setCanonicalJSON } from '../../utils/storage.ts';
import { goalRevision, readGoals } from '../../utils/goalPersistence.ts';
import { goalCanvasElementHeight, goalConnectorPath, isGoalElementConnected, isValidRetryTarget, wouldCreateGoalCycle } from '../../utils/goalCanvas.ts';
import { createAgentElement, createGoalElement, createStableId } from '../../utils/goalElements.ts';
import { formatGoalDetailsForClipboard } from '../../utils/goalClipboard';
import { createCustomArtifactReference, createSupportingSourceReference } from '../../utils/goalArtifacts.ts';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { GoalsCanvasControls } from '../goals/GoalsCanvasControls';
import { GoalsCanvasEmptyState } from '../goals/GoalsCanvasEmptyState';
import { GoalsCanvasSurface } from '../goals/GoalsCanvasSurface';
import { GoalsCanvasNodes } from '../goals/GoalsCanvasNodes';
import { GoalsConnectorLayer } from '../goals/GoalsConnectorLayer';
import { DeleteGoalDialog, NewGoalDialog } from '../goals/GoalsDialogs';
import { GoalsInspector } from '../goals/GoalsInspector';
import { GoalsInspectorIdentity } from '../goals/GoalsInspectorIdentity';
import { GoalsArtifactEditor } from '../goals/GoalsArtifactEditor';
import { GoalsConnectorInspector } from '../goals/GoalsConnectorInspector';
import { GoalsPolicyEditor } from '../goals/GoalsPolicyEditor';
import { GoalsRuntimeStatus } from '../goals/GoalsRuntimeStatus';
import { GoalsAgentSection, GoalsConditionSection, GoalsConnectionsSection, GoalsControlFlowSection, GoalsDeliverableSection, GoalsProjectBindingsSection, GoalsRequirementsSection, GoalsScheduleSection } from '../goals/GoalsInspectorSections';
import { GoalsSidebar } from '../goals/GoalsSidebar';
import { GoalsToolbar } from '../goals/GoalsToolbar';
import { ARTIFACT_ITEMS, CONTROL_FLOW_ITEMS, TOOL_ITEMS } from '../goals/GoalsMetadata';
import { ReadyIcon, StatusIcon, compactChipClass, conditionNegativeLabel, conditionPositiveLabel, elementIcon, getElementBody, getElementTitle, isCompletionElement, isExecutionLocked, nodeClass, readinessChipClass, readinessDescription, readinessForElement, readinessLabel, runtimeStatusForElement, statusChipClass, statusDescription, statusLabel, statusNextStep } from '../goals/GoalsPresentation';
import { GOAL_SCHEDULES_STORAGE_KEY, normalizeGoalSchedules } from '../../utils/goalSchedules.ts';
import { useGoalsInspectorSelection } from '../../hooks/useGoalsInspectorSelection';

const STORAGE_KEY = 'omvra.goals.v1';
const GOAL_ID = 'goal-lights-off-factory';
const ARTIFACT_SELECT_CLASS = 'h-9 rounded-xl border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#71717a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-visible:ring-gray-200';

export function GoalsView({ people = [], tasks = [], milestones = [], projects = [], workspacePolicy, goalAuditArchiveDirectory = '', onGoalAuditArchiveDirectoryChange }: { people?: Person[]; tasks?: Task[]; milestones?: ProjectMilestone[]; projects?: TimelineSwimlane[]; workspacePolicy?: GoalPolicyV1; goalAuditArchiveDirectory?: string; onGoalAuditArchiveDirectoryChange?: (directory: string) => void }) {
  const [goals, setGoals] = useState<GoalRecord[]>(() => readGoals(STORAGE_KEY));
  const goalsRef = useRef<GoalRecord[]>([]);
  goalsRef.current = goals;
  const canonicalGoalsRef = useRef<GoalRecord[]>([]);
  const [schedules, setSchedules] = useState<GoalSchedule[]>(() => normalizeGoalSchedules(safeReadJSON<unknown>(GOAL_SCHEDULES_STORAGE_KEY, [])));
  const [schedulesHydrated, setSchedulesHydrated] = useState(false);
  const [canonicalHydrated, setCanonicalHydrated] = useState(false);
  const canonicalWrite = useRef(Promise.resolve());
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [selectedElementId, setSelectedElementId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const spaceHeldRef = useRef(false);
  const panSessionRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [controlFlowMenuOpen, setControlFlowMenuOpen] = useState(false);
  const [artifactMenuOpen, setArtifactMenuOpen] = useState(false);
  const [policyImpacts, setPolicyImpacts] = useState<Array<{ goalId?: string; status?: string; requiresUserConfirmation?: boolean }>>([]);
  const [runtimeProjection, setRuntimeProjection] = useState<GoalRuntimeProjection | null>(null);
  const activeGoalIdRef = useRef('');
  const agentMenuRef = useRef<HTMLDivElement | null>(null);
  const controlFlowMenuRef = useRef<HTMLDivElement | null>(null);
  const artifactMenuRef = useRef<HTMLDivElement | null>(null);
  const [connectorMode, setConnectorMode] = useState(false);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
  const [connectorSourceSide, setConnectorSourceSide] = useState<GoalConnectorSide>('right');
  const [connectorSourceBranch, setConnectorSourceBranch] = useState<GoalConditionBranch | undefined>();
  const [rewireConnectorId, setRewireConnectorId] = useState<string | null>(null);
  const [connectorError, setConnectorError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newGoalDialogOpen, setNewGoalDialogOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalBody, setNewGoalBody] = useState('');
  const [customArtifactLabel, setCustomArtifactLabel] = useState('');
  const [customArtifactKind, setCustomArtifactKind] = useState('document');
  const [customArtifactFormat, setCustomArtifactFormat] = useState('');
  const [customArtifactLocator, setCustomArtifactLocator] = useState('');
  const [supportingArtifactType, setSupportingArtifactType] = useState<SupportingArtifactType>('document');
  const [supportingSourceSearch, setSupportingSourceSearch] = useState('');
  const [canvasElementHeights, setCanvasElementHeights] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const draggingRef = useRef(false);
  const localMutationRef = useRef(false);
  const rendererWritesPendingRef = useRef(0);
  const scheduleWritesPendingRef = useRef(0);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [goalCopyState, setGoalCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const canvasRef = useRef<HTMLDivElement>(null);
  const {
    activeGoal, activeSchedule, selectedElement, selectedAgent, selectedAgentMissing, selectedAgentConfiguration, selectedAgentMode,
    selectedRetryTarget, selectedPolicyElement, selectedEffectivePolicy, selectedPolicyImpact, selectedArtifactReferences,
    artifactOptions, supportingSourceOptions, connections, selectedConnections,
  } = useGoalsInspectorSelection({ goals, selectedGoalId, selectedElementId, schedules, people, tasks, milestones, workspacePolicy, runtimeProjection, policyImpacts, supportingArtifactType, supportingSourceSearch });
  activeGoalIdRef.current = activeGoal?.id ?? '';
  const isRuntimeExecutionLocked = (element: GoalElement | undefined) => {
    const executionState = runtimeProjection?.execution?.state;
    const executionActive = Boolean(executionState && !['ready', 'paused', 'complete', 'failed', 'abandoned'].includes(executionState));
    return isExecutionLocked(element) || executionActive;
  };
  const selectedElementLocked = isRuntimeExecutionLocked(selectedElement);
  const copyGoalDetails = async () => {
    if (!activeGoal) return;
    const goalElement = activeGoal.elements.find(element => element.type === 'goal');
    const overseer = people.find(person => person.id === activeGoal.overseerAgentId);
    const text = formatGoalDetailsForClipboard({
      goalId: activeGoal.id,
      title: activeGoal.title,
      revision: goalRevision(activeGoal),
      status: runtimeProjection?.execution?.state ?? goalElement?.status,
      overseerLabel: overseer?.name,
      agentLabels: activeGoal.elements.filter(element => element.type === 'agent').map(element => getElementTitle(element, people)),
      deliverableLabels: activeGoal.elements.filter(element => element.type === 'deliverable').map(element => element.title),
      nodeCount: activeGoal.elements.length,
      notes: goalElement?.body,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else if (typeof window !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } else throw new Error('Clipboard is unavailable');
      setGoalCopyState('copied');
      window.setTimeout(() => setGoalCopyState('idle'), 1400);
    } catch {
      setGoalCopyState('failed');
      window.setTimeout(() => setGoalCopyState('idle'), 1800);
    }
  };

  useEffect(() => {
    if (goals.length === 0) {
      if (selectedGoalId) setSelectedGoalId('');
      if (selectedElementId) setSelectedElementId('');
      return;
    }
    const nextGoal = goals.find(goal => goal.id === selectedGoalId) ?? goals[0];
    if (nextGoal.id !== selectedGoalId) setSelectedGoalId(nextGoal.id);
    if (!nextGoal.elements.some(element => element.id === selectedElementId)) setSelectedElementId(nextGoal.elements[0]?.id ?? '');
  }, [goals, selectedElementId, selectedGoalId]);
  useEffect(() => {
    if (!activeGoal || !canvasRef.current) return;
    const frame = requestAnimationFrame(() => {
      const nodes = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[role="group"]') ?? []);
      const elements = activeGoal.elements.filter(element => element.type !== 'connector');
      setCanvasElementHeights(current => {
        let changed = false;
        const next = { ...current };
        nodes.forEach((node, index) => {
          const element = elements[index];
          if (!element) return;
          // Connector geometry is expressed in the canvas coordinate system. Use
          // the unscaled layout height so zoom cannot move the node endpoints.
          const height = node.offsetHeight;
          if (next[element.id] !== height) {
            next[element.id] = height;
            changed = true;
          }
        });
        return changed ? next : current;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeGoal, selectedElementId, zoom]);
  useEffect(() => {
    let cancelled = false;
    const storedImpacts = window.electron?.storeGet?.('omvra.goalPolicyImpacts.v1');
    void storedImpacts?.then(value => {
      if (cancelled) return;
      setPolicyImpacts(Array.isArray(value) ? value : []);
    });
    return () => { cancelled = true; };
  }, [workspacePolicy?.policyRevision]);
  useEffect(() => {
    let cancelled = false;
    if (!activeGoal) { setRuntimeProjection(null); return () => { cancelled = true; }; }
    void window.electron?.goals?.getRuntime?.(activeGoal.id).then(value => {
      if (!cancelled && value && typeof value === 'object') setRuntimeProjection(value as GoalRuntimeProjection);
    });
    return () => { cancelled = true; };
  }, [activeGoal?.id]);

  useEffect(() => {
    let cancelled = false;
    const refreshCanonicalGoals = () => getCanonicalJSON<GoalRecord[] | null>(STORAGE_KEY, null).then(stored => {
      if (cancelled || localMutationRef.current) return;
      if (Array.isArray(stored)) {
        const filtered = stored.filter(goal => goal.id !== GOAL_ID);
        canonicalGoalsRef.current = filtered;
        setGoals(filtered);
      }
    });
    void refreshCanonicalGoals().then(() => {
      setCanonicalHydrated(true);
    });
    window.addEventListener('focus', refreshCanonicalGoals);
    const refreshRuntimeProjection = () => {
      const goalId = activeGoalIdRef.current;
      if (!goalId) return;
      void window.electron?.goals?.getRuntime?.(goalId).then(value => {
        if (!cancelled && value && typeof value === 'object') setRuntimeProjection(value as GoalRuntimeProjection);
      }).catch(() => {});
    };
    const runtimePoll = window.setInterval(refreshRuntimeProjection, 1000);
    const unsubscribe = window.electron?.onStoreChanged?.(() => {
      refreshRuntimeProjection();
      if (!draggingRef.current && rendererWritesPendingRef.current === 0) void refreshCanonicalGoals();
    });
    const unsubscribeRuntime = window.electron?.goals?.onRuntimeChanged?.((event) => {
      if (cancelled) return;
      if (event.goalId === activeGoalIdRef.current) {
        void window.electron?.goals?.getRuntime?.(event.goalId).then(value => { if (!cancelled && value && typeof value === 'object') setRuntimeProjection(value as GoalRuntimeProjection); });
      }
      if (event.scope !== 'graph' || draggingRef.current || rendererWritesPendingRef.current > 0) return;
      const local = goalsRef.current.find(goal => goal.id === event.goalId);
      if (local && goalRevision(local) >= event.revision) return;
      void refreshCanonicalGoals();
    });
    return () => { cancelled = true; window.clearInterval(runtimePoll); window.removeEventListener('focus', refreshCanonicalGoals); unsubscribe?.(); unsubscribeRuntime?.(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const refreshSchedules = () => getCanonicalJSON<unknown>(GOAL_SCHEDULES_STORAGE_KEY, null).then(value => {
      if (!cancelled && value !== null) setSchedules(normalizeGoalSchedules(value));
    });
    void refreshSchedules().then(() => {
      if (!cancelled) setSchedulesHydrated(true);
    });
    const unsubscribe = window.electron?.onStoreChanged?.(() => { if (!draggingRef.current && scheduleWritesPendingRef.current === 0) void refreshSchedules(); });
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    if (!schedulesHydrated) return;
    const writeTimer = window.setTimeout(() => {
      scheduleWritesPendingRef.current += 1;
      void setCanonicalJSON(GOAL_SCHEDULES_STORAGE_KEY, schedules).finally(() => {
        scheduleWritesPendingRef.current = Math.max(0, scheduleWritesPendingRef.current - 1);
      });
    }, 120);
    return () => window.clearTimeout(writeTimer);
  }, [schedulesHydrated, schedules]);
  useEffect(() => {
    if (!canonicalHydrated || draggingRef.current) return;
    const writeTimer = window.setTimeout(() => {
      rendererWritesPendingRef.current += 1;
      canonicalWrite.current = canonicalWrite.current.then(async () => {
        const forceLocalWrite = localMutationRef.current;
        try {
          const canonical = await getCanonicalJSON<GoalRecord[] | null>(STORAGE_KEY, null);
          if (Array.isArray(canonical)) canonicalGoalsRef.current = canonical.filter(goal => goal.id !== GOAL_ID);
          const localRevision = Math.max(0, ...goals.map(goalRevision));
          const canonicalRevision = Array.isArray(canonical) ? Math.max(0, ...canonical.map(goalRevision)) : 0;
          const localChangedSinceSubmission = goalsRef.current.some(current => {
            const submitted = goals.find(goal => goal.id === current.id);
            return submitted && goalRevision(current) > goalRevision(submitted);
          });
          if (!forceLocalWrite && !draggingRef.current && !localChangedSinceSubmission && canonicalRevision > localRevision && Array.isArray(canonical)) {
            setGoals(canonical);
            return;
          }
          const previous = canonicalGoalsRef.current;
          const changed = goals.filter(goal => {
            const prior = previous.find(item => item.id === goal.id);
            return prior && JSON.stringify(prior) !== JSON.stringify(goal);
          });
          if (changed.length === 1 && previous.some(goal => goal.id === changed[0].id) && typeof window.electron?.goals?.update === 'function') {
            const goal = changed[0];
            const prior = previous.find(item => item.id === goal.id)!;
            const result = await window.electron.goals.update({ goalId: goal.id, title: goal.title, elements: goal.elements, overseerAgentId: goal.overseerAgentId, expectedRevision: goalRevision(prior) });
            if (result.ok && result.goal) {
              canonicalGoalsRef.current = previous.map(item => item.id === goal.id ? result.goal : item);
              if (!draggingRef.current) setGoals(current => {
                const local = current.find(item => item.id === goal.id);
                if (!local || goalRevision(local) > goalRevision(goal)) return current;
                return current.map(item => item.id === goal.id ? result.goal : item);
              });
              return;
            }
            if (!forceLocalWrite && result.error === 'REVISION_MISMATCH') {
              const fallback = await getCanonicalJSON<GoalRecord[] | null>(STORAGE_KEY, null);
              if (Array.isArray(fallback)) {
                canonicalGoalsRef.current = fallback;
                if (!draggingRef.current) setGoals(current => {
                  const local = current.find(item => item.id === goal.id);
                  if (local && goalRevision(local) > goalRevision(goal)) return current;
                  return fallback.filter(item => item.id !== GOAL_ID);
                });
              }
              return;
            }
          }
          const stored = await setCanonicalJSON(STORAGE_KEY, goals);
          if (!stored) {
            const fallback = await getCanonicalJSON<GoalRecord[] | null>(STORAGE_KEY, null);
            if (Array.isArray(fallback) && !forceLocalWrite && !draggingRef.current) setGoals(current => {
              if (current.some(item => {
                const submitted = goals.find(goal => goal.id === item.id);
                return submitted && goalRevision(item) > goalRevision(submitted);
              })) return current;
              return fallback;
            });
          }
        } finally {
          rendererWritesPendingRef.current = Math.max(0, rendererWritesPendingRef.current - 1);
          if (forceLocalWrite) localMutationRef.current = false;
        }
      });
    }, 120);
    return () => window.clearTimeout(writeTimer);
  }, [canonicalHydrated, goals]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        spaceHeldRef.current = false;
        setSpacePressed(false);
        panSessionRef.current = null;
        setPanMode(false);
        setConnectorMode(false);
        setConnectorSourceId(null);
        setConnectorSourceBranch(undefined);
        setRewireConnectorId(null);
        setAgentMenuOpen(false);
        setControlFlowMenuOpen(false);
        setArtifactMenuOpen(false);
        setNewGoalDialogOpen(false);
        return;
      }
      if (event.code !== 'Space') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, button, [role="button"], [contenteditable="true"]')) return;
      spaceHeldRef.current = true;
      setSpacePressed(true);
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceHeldRef.current = false;
      setSpacePressed(false);
    };
    const resetSpace = () => {
      spaceHeldRef.current = false;
      setSpacePressed(false);
      panSessionRef.current = null;
    };
    const visibility = () => { if (document.hidden) resetSpace(); };
    const closeMenus = (event: PointerEvent) => {
      const target = event.target;
      const nodeTarget = target && typeof target === 'object' && 'nodeType' in target ? target as Node : null;
      if (!nodeTarget) {
        setAgentMenuOpen(false);
        setControlFlowMenuOpen(false);
        setArtifactMenuOpen(false);
        return;
      }
      if (!agentMenuRef.current?.contains(nodeTarget)) setAgentMenuOpen(false);
      if (!controlFlowMenuRef.current?.contains(nodeTarget)) setControlFlowMenuOpen(false);
      if (!artifactMenuRef.current?.contains(nodeTarget)) setArtifactMenuOpen(false);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', resetSpace);
    window.addEventListener('pointerdown', closeMenus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', resetSpace);
      window.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (!drag) return;
    draggingRef.current = true;
    let frame = 0;
    let latestX = drag.startX;
    let latestY = drag.startY;
    const updatePosition = (clientX: number, clientY: number, finalize = false) => setGoals(current => current.map(goal => goal.id !== selectedGoalId ? goal : ({
      ...goal,
      ...(finalize ? { revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString() } : {}),
      elements: goal.elements.map(element => element.id !== drag.id ? element : { ...element, x: drag.originX + (clientX - drag.startX) / zoom, y: drag.originY + (clientY - drag.startY) / zoom }),
    })));
    const move = (event: PointerEvent) => {
      latestX = event.clientX;
      latestY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updatePosition(latestX, latestY);
      });
    };
    const up = (event: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      draggingRef.current = false;
      updatePosition(event.clientX, event.clientY, true);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      draggingRef.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, selectedGoalId, zoom]);

  const updateElement = (updates: Partial<GoalElement>) => {
    if (selectedElementLocked) { setEditNotice('This node is locked while execution is active. Pause or reconcile the lifecycle before editing it.'); return; }
    setGoals(current => current.map(goal => goal.id !== selectedGoalId ? goal : ({ ...goal, revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString(), elements: goal.elements.map(element => element.id === selectedElement?.id ? { ...element, ...updates } : element) })));
  };
  const updateArtifactReferences = async (nextReferences: GoalArtifactReference[]) => {
    if (!activeGoal || !selectedElement || (selectedElement.type !== 'goal' && selectedElement.type !== 'subgoal' && selectedElement.type !== 'artifact')) return;
    const submittedRevision = goalRevision(activeGoal);
    const result = await window.electron?.goals?.updateArtifacts?.({ goalId: activeGoal.id, elementId: selectedElement.id, artifactReferences: nextReferences, expectedRevision: submittedRevision, idempotencyKey: createStableId('artifact-mutation') });
    if (!result?.ok || !result.goal) {
      setEditNotice(result?.message ?? 'Artifact links could not be updated. Refresh the Goal and try again.');
      return;
    }
    canonicalGoalsRef.current = canonicalGoalsRef.current.map(goal => goal.id === result.goal.id ? result.goal : goal);
    setGoals(current => {
      const local = current.find(goal => goal.id === result.goal.id);
      if (!local || goalRevision(local) > submittedRevision) return current;
      return current.map(goal => goal.id === result.goal.id ? result.goal : goal);
    });
  };
  const addCustomArtifactReference = () => {
    if (!selectedElement || selectedElement.type !== 'artifact' || !customArtifactLabel.trim()) return;
    void updateArtifactReferences([...selectedArtifactReferences, createCustomArtifactReference(customArtifactLabel, customArtifactKind, customArtifactFormat, customArtifactLocator)]);
    setCustomArtifactLabel('');
    setCustomArtifactFormat('');
    setCustomArtifactLocator('');
  };
  const addSupportingSourceReference = (value: string) => {
    if (!selectedElement || selectedElement.type !== 'artifact') return;
    const option = supportingSourceOptions.find(item => item.value === value);
    if (!option || selectedArtifactReferences.some(reference => reference.sourceAttachmentId === option.attachment.id && reference.sourceTaskId === option.taskId)) return;
    void updateArtifactReferences([...selectedArtifactReferences, createSupportingSourceReference(option)]);
  };
  const updateAgentConfiguration = (updates: Partial<GoalAgentConfiguration>) => {
    if (selectedElement?.type !== 'agent') return;
    const current = selectedElement.agentConfiguration ?? { version: 1 as const, mode: selectedElement.assigneeId ? 'existing' as const : 'ephemeral' as const, assigneeId: selectedElement.assigneeId, instructions: '' };
    const next = { ...current, ...updates, version: 1 as const };
    if (next.mode === 'ephemeral' && !next.requestedName && !next.autoGenerateName) next.requestedName = selectedAgent?.name ?? selectedElement.title;
    updateElement({ agentConfiguration: next, assigneeId: next.mode === 'existing' ? next.assigneeId : undefined });
  };
  const updateAgentName = (name: string) => {
    if (selectedElement?.type !== 'agent') return;
    const current = selectedElement.agentConfiguration ?? { version: 1 as const, mode: 'ephemeral' as const, instructions: '' };
    updateElement({ title: name, agentConfiguration: { ...current, version: 1 as const, requestedName: name } });
  };
  const updateGoal = (updates: Partial<GoalRecord>) => {
    if (selectedElementLocked) { setEditNotice('This Goal is locked while execution is active. Pause or reconcile the lifecycle before editing it.'); return; }
    setGoals(current => current.map(goal => goal.id === selectedGoalId ? { ...goal, ...updates, revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString() } : goal));
  };
  const resetGoalExecution = async () => {
    if (!activeGoal || !runtimeProjection?.execution) return;
    if (typeof window !== 'undefined' && !window.confirm('Reset this Goal execution? The current attempt will be preserved in history and the Goal will return to its initial not-started state.')) return;
    const result = await window.electron?.goals?.resetExecution?.({ goalId: activeGoal.id });
    if (!result?.ok) {
      setEditNotice(result?.message ?? 'The execution could not be reset. Refresh the Goal and try again.');
      return;
    }
    const refreshed = await window.electron?.goals?.getRuntime?.(activeGoal.id);
    if (refreshed && typeof refreshed === 'object') setRuntimeProjection(refreshed as GoalRuntimeProjection);
  };
  const createSchedule = () => {
    if (!activeGoal || activeSchedule) return;
    const schedule: GoalSchedule = {
      id: createStableId('schedule'),
      goalId: activeGoal.id,
      enabled: true,
      rule: { mode: 'one-time', date: new Date().toISOString().slice(0, 10), time: '09:00' },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      temporalMode: 'anchored',
      updatedAt: new Date().toISOString(),
    };
    setSchedules(current => [...current, schedule]);
  };
  const updateSchedule = (updates: Partial<GoalSchedule> | { rule: Partial<GoalSchedule['rule']> }) => {
    if (!activeGoal || !activeSchedule) return;
    setSchedules(current => current.map(schedule => {
      if (schedule.id !== activeSchedule.id) return schedule;
      const next = 'rule' in updates ? { ...schedule, rule: { ...schedule.rule, ...updates.rule } } : { ...schedule, ...updates };
      return { ...next, updatedAt: new Date().toISOString() };
    }));
  };
  const deleteSchedule = () => {
    if (!activeSchedule) return;
    setSchedules(current => current.filter(schedule => schedule.id !== activeSchedule.id));
  };
  const updatePolicy = (updates: Partial<GoalPolicy>) => {
    if (!selectedPolicyElement) return;
    const nextPolicy = { ...selectedPolicyElement.policy, ...updates };
    if (updates.retryBudgetMode === 'unbounded') delete nextPolicy.maxRetries;
    if (selectedPolicyElement.type === 'goal') updateGoal({ policy: nextPolicy });
    else updateElement({ policy: nextPolicy });
  };
  const updatePolicyDimension = (dimension: GoalPolicyDimension, updates: GoalPolicyDimensionOverride | undefined) => {
    const dimensions = { ...selectedPolicyElement?.policy?.dimensions };
    if (updates) dimensions[dimension] = updates;
    else delete dimensions[dimension];
    updatePolicy({ dimensions });
  };
  const addElement = (type: GoalElementType) => {
    if (!activeGoal) return;
    const element = createGoalElement(type, activeGoal.elements.length);
    setGoals(current => current.map(goal => goal.id === selectedGoalId ? { ...goal, revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString(), elements: [...goal.elements, element] } : goal));
    setSelectedElementId(id);
  };
  const deleteElement = () => {
    if (!selectedElement) return;
    if (selectedElementLocked) { setEditNotice('This node cannot be deleted during active execution.'); return; }
    if (selectedElement.type === 'goal') {
      setDeleteDialogOpen(true);
      return;
    }
    performDeleteElement();
  };
  const performDeleteElement = () => {
    if (!selectedElement) return;
    if (selectedElement.type === 'goal') {
      localMutationRef.current = true;
      const remainingGoals = goals.filter(goal => goal.id !== selectedGoalId);
      setGoals(remainingGoals);
      const nextGoal = remainingGoals[0];
      setSelectedGoalId(nextGoal?.id ?? '');
      setSelectedElementId(nextGoal?.elements[0]?.id ?? '');
      setDeleteDialogOpen(false);
      return;
    }
      setGoals(current => current.map(goal => goal.id === selectedGoalId ? { ...goal, revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString(), elements: goal.elements.filter(element => element.id !== selectedElement.id && element.sourceId !== selectedElement.id && element.targetId !== selectedElement.id) } : goal));
    setSelectedElementId(activeGoal.elements.find(element => element.id !== selectedElement.id)?.id ?? '');
  };
  useEffect(() => {
    const onDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (!selectedElement) return;
      event.preventDefault();
      deleteElement();
    };
    window.addEventListener('keydown', onDeleteKey);
    return () => window.removeEventListener('keydown', onDeleteKey);
  }, [activeGoal, deleteElement, selectedElement]);
  const openNewGoalDialog = () => {
    setNewGoalTitle('');
    setNewGoalBody('');
    setNewGoalDialogOpen(true);
  };
  const createGoal = () => {
    const title = newGoalTitle.trim() || 'Untitled goal';
    const goal: GoalRecord = { id: createStableId('goal'), title, color: '#2563eb', updatedAt: new Date().toISOString(), elements: [{ id: createStableId('element'), type: 'goal', title, body: newGoalBody.trim() || 'Define the outcome', x: 420, y: 180, width: 250, height: 104, status: 'draft' }] };
    setGoals(current => [...current, goal]); setSelectedGoalId(goal.id); setSelectedElementId(goal.elements[0].id); setNewGoalDialogOpen(false);
  };

  const addTemplate = (template: GoalTemplate) => {
    const goal = instantiateGoalTemplate(template, createStableId);
    setGoals(current => [...current, goal]);
    setSelectedGoalId(goal.id);
    setSelectedElementId(goal.elements.find(element => element.type === 'goal')?.id ?? goal.elements[0]?.id ?? '');
  };

  const moveCanvasSelection = (elementId: string, forward: boolean) => {
    const items = activeGoal?.elements ?? [];
    const index = items.findIndex(element => element.id === elementId);
    if (index < 0) return;
    const nextIndex = forward ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    const nextId = items[nextIndex]?.id ?? elementId;
    setSelectedElementId(nextId);
    requestAnimationFrame(() => document.getElementById(`goal-canvas-item-${nextId}`)?.focus());
  };


  const addAgent = (person: Person) => {
    if (!activeGoal) return;
    const element = createAgentElement(person, activeGoal.elements.length);
    setGoals(current => current.map(goal => goal.id === selectedGoalId ? { ...goal, revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString(), elements: [...goal.elements, element] } : goal));
    setSelectedElementId(id);
    setAgentMenuOpen(false);
    setArtifactMenuOpen(false);
  };

  const deleteConnection = (connectionId: string) => {
    const connection = activeGoal?.elements.find(element => element.id === connectionId);
    const source = activeGoal?.elements.find(element => element.id === connection?.sourceId);
    const target = activeGoal?.elements.find(element => element.id === connection?.targetId);
    if (isExecutionLocked(connection) || isExecutionLocked(source) || isExecutionLocked(target)) { setEditNotice('This connection participates in active execution and cannot be changed.'); return; }
    setGoals(current => current.map(goal => goal.id === selectedGoalId
      ? { ...goal, revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString(), elements: goal.elements.filter(element => element.id !== connectionId) }
      : goal));
    if (selectedElement?.id === connectionId) setSelectedElementId(activeGoal?.elements.find(element => element.id !== connectionId)?.id ?? '');
  };

  const connectNodes = (targetId: string, targetSide: GoalConnectorSide = 'left') => {
    if (!connectorSourceId) return;
    if (connectorSourceId === targetId) {
      setConnectorError('A connector needs two different nodes.');
      return;
    }
    if (!activeGoal?.elements.some(element => element.id === connectorSourceId && element.type !== 'connector') || !activeGoal.elements.some(element => element.id === targetId && element.type !== 'connector')) {
      setConnectorError('Both connector endpoints must be valid nodes.');
      return;
    }
    const source = activeGoal.elements.find(element => element.id === connectorSourceId);
    const target = activeGoal.elements.find(element => element.id === targetId);
    if (isExecutionLocked(source) || isExecutionLocked(target)) {
      setConnectorError('Active or committed nodes cannot be rewired. Pause, cancel, or amend the lifecycle first.');
      return;
    }
    if (source?.type === 'retry' && !isValidRetryTarget(activeGoal.elements, source.id, targetId, rewireConnectorId)) {
      setConnectorError('A retry must target an earlier connected workflow step.');
      return;
    }
    if (source?.type === 'retry' && activeGoal.elements.some(element => element.type === 'connector' && element.id !== rewireConnectorId && element.sourceId === source.id)) {
      setConnectorError('A retry node can target one earlier workflow step. Rewire its existing connector instead.');
      return;
    }
    if (source?.type !== 'retry' && wouldCreateGoalCycle(activeGoal.elements, connectorSourceId, targetId, rewireConnectorId)) {
      setConnectorError('That connection would create a cycle.');
      return;
    }
    setGoals(current => current.map(goal => {
      if (goal.id !== selectedGoalId) return goal;
      const elements = rewireConnectorId
        ? goal.elements.map(element => element.id === rewireConnectorId ? { ...element, sourceId: connectorSourceId, targetId, sourceSide: element.sourceSide ?? connectorSourceSide, targetSide, conditionBranch: connectorSourceBranch } : element)
        : [...goal.elements, { id: createStableId('connector'), type: 'connector' as const, title: 'Node connection', x: 0, y: 0, sourceId: connectorSourceId, targetId, sourceSide: connectorSourceSide, targetSide, conditionBranch: connectorSourceBranch }];
      return { ...goal, revision: goalRevision(goal) + 1, updatedAt: new Date().toISOString(), elements };
    }));
    setConnectorMode(false);
    setConnectorSourceId(null);
    setConnectorSourceBranch(undefined);
    setRewireConnectorId(null);
    setConnectorError(null);
  };

  const beginConnection = (elementId: string, side: GoalConnectorSide, branch?: GoalConditionBranch) => {
    if (isExecutionLocked(activeGoal?.elements.find(element => element.id === elementId))) {
      setConnectorError('Active or committed nodes cannot be rewired. Pause, cancel, or amend the lifecycle first.');
      return;
    }
    setConnectorMode(true);
    setConnectorSourceId(elementId);
    setConnectorSourceSide(side);
    setConnectorSourceBranch(branch);
    setConnectorError(null);
  };

  const beginCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    setAgentMenuOpen(false);
    setArtifactMenuOpen(false);
    if ((!spaceHeldRef.current && !panMode) || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const moveCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    setPan({
      x: session.originX + event.clientX - session.startX,
      y: session.originY + event.clientY - session.startY,
    });
  };

  const endCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    panSessionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
  <section className="goals-view relative h-full min-h-0 overflow-hidden bg-slate-50 text-slate-700">
    <GoalsSidebar
      goals={goals}
      selectedGoalId={selectedGoalId}
      collapsed={leftPanelCollapsed}
      onSelectGoal={goal => { setSelectedGoalId(goal.id); setSelectedElementId(goal.elements[0]?.id ?? ''); }}
      onToggleCollapsed={() => setLeftPanelCollapsed(value => !value)}
      onNewGoal={openNewGoalDialog}
      statusChipClass={statusChipClass}
      compactChipClass={compactChipClass}
      statusLabel={statusLabel}
      StatusIcon={StatusIcon}
    />
    <GoalsToolbar
      activeGoal={activeGoal}
      people={people}
      connectorMode={connectorMode}
      agentMenuOpen={agentMenuOpen}
      controlFlowMenuOpen={controlFlowMenuOpen}
      artifactMenuOpen={artifactMenuOpen}
      agentMenuRef={agentMenuRef}
      controlFlowMenuRef={controlFlowMenuRef}
      artifactMenuRef={artifactMenuRef}
      templates={GOAL_TEMPLATES}
      toolItems={TOOL_ITEMS}
      artifactItems={ARTIFACT_ITEMS}
      controlFlowItems={CONTROL_FLOW_ITEMS}
      onSelectTemplate={addTemplate}
      onAddElement={addElement}
      onAddControlFlow={type => { addElement(type); setControlFlowMenuOpen(false); }}
      onAddArtifact={type => { addElement(type); setArtifactMenuOpen(false); }}
      onAddAgent={addAgent}
      onToggleAgentMenu={() => setAgentMenuOpen(value => !value)}
      onToggleControlFlowMenu={() => setControlFlowMenuOpen(value => !value)}
      onToggleArtifactMenu={() => setArtifactMenuOpen(value => !value)}
      onStartConnector={() => { setConnectorMode(true); setConnectorSourceId(null); setConnectorSourceBranch(undefined); }}
    />
    <GoalsCanvasSurface canvasRef={canvasRef} spacePressed={spacePressed} panMode={panMode} pan={pan} zoom={zoom} emptyState={!activeGoal ? <GoalsCanvasEmptyState onNewGoal={openNewGoalDialog} /> : undefined} onPointerDown={beginCanvasPan} onPointerMove={moveCanvasPan} onPointerUp={endCanvasPan} onPointerCancel={endCanvasPan} onLostPointerCapture={event => { if (panSessionRef.current?.pointerId === event.pointerId) panSessionRef.current = null; }}>
        {runtimeProjection?.execution?.state && <div role="status" className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md border border-blue-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm"><span><span className="font-semibold text-slate-800">Execution:</span> <span className="capitalize">{runtimeProjection.execution.state.replaceAll('-', ' ')}</span>{runtimeProjection.execution.state === 'working' && <span className="ml-1 text-blue-700">· {runtimeProjection.execution.workerDelegationStatus === 'required' ? 'Subagent recruitment required' : 'Agent is working'}</span>}</span><button type="button" onClick={resetGoalExecution} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50">Reset execution</button></div>}
        <GoalsConnectorLayer connections={connections} elements={activeGoal?.elements ?? []} selectedElementId={selectedElement?.id} connectorPath={connection => goalConnectorPath(activeGoal?.elements ?? [], connection, canvasElementHeights)} onSelectConnector={connectionId => { setSelectedElementId(connectionId); setConnectorMode(false); setConnectorSourceId(null); setConnectorSourceBranch(undefined); }} onMoveSelection={moveCanvasSelection} />
        {connectorError && <div role="alert" className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow-sm">{connectorError}</div>}
        <GoalsCanvasNodes elements={activeGoal?.elements ?? []} selectedElementId={selectedElement?.id} connectorMode={connectorMode} connectorSourceId={connectorSourceId} connectorSourceSide={connectorSourceSide} connectorSourceBranch={connectorSourceBranch} panMode={panMode} spaceHeld={spaceHeldRef.current} canvasElementHeight={element => goalCanvasElementHeight(element, canvasElementHeights)} getElementTitle={element => getElementTitle(element, people)} getElementBody={element => getElementBody(element, people)} isConnected={elementId => isGoalElementConnected(activeGoal?.elements ?? [], elementId)} isExecutionLocked={isRuntimeExecutionLocked} nodeClass={nodeClass} elementIcon={elementIcon} conditionPositiveLabel={conditionPositiveLabel} conditionNegativeLabel={conditionNegativeLabel} readinessForElement={readinessForElement} readinessLabel={readinessLabel} readinessChipClass={readinessChipClass} isCompletionElement={isCompletionElement} compactChipClass={compactChipClass} statusChipClass={statusChipClass} statusLabel={statusLabel} StatusIcon={StatusIcon} runtimeStatusForElement={element => runtimeStatusForElement(element, runtimeProjection)} onSelectElement={setSelectedElementId} onNodeClick={element => { if (connectorMode) { if (connectorSourceId) connectNodes(element.id); else beginConnection(element.id, 'right'); } else setSelectedElementId(element.id); }} onMoveSelection={moveCanvasSelection} onStartDrag={(element, event) => { if (spaceHeldRef.current || panMode || connectorMode || isRuntimeExecutionLocked(element)) return; setSelectedElementId(element.id); setDrag({ id: element.id, startX: event.clientX, startY: event.clientY, originX: element.x, originY: element.y }); }} onConnectNode={connectNodes} onBeginConnection={beginConnection} />
    </GoalsCanvasSurface>
    {editNotice && <div role="status" className="absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-sm"><LockKeyhole className="size-3.5 shrink-0" />{editNotice}<button type="button" className="ml-1 font-semibold text-amber-900" onClick={() => setEditNotice(null)}>Dismiss</button></div>}

    {selectedElement && (
      <GoalsInspector selectedElement={selectedElement} selectedElementLocked={selectedElementLocked} onDelete={deleteElement} goalCopyState={goalCopyState} onCopyGoalDetails={() => { void copyGoalDetails(); }}>
        <GoalsInspectorIdentity element={selectedElement} activeGoal={activeGoal} people={people} selectedAgent={selectedAgent} selectedAgentMissing={Boolean(selectedAgentMissing)} selectedAgentConfiguration={selectedAgentConfiguration} selectedAgentMode={selectedAgentMode} onUpdateElement={updateElement} onUpdateGoal={updateGoal} onUpdateAgentName={updateAgentName} />
        {selectedElement.type === 'goal' && <GoalsProjectBindingsSection goal={activeGoal} projects={projects} />}
        <GoalsRequirementsSection goal={activeGoal} element={selectedElement} />
        <GoalsAgentSection element={selectedElement} people={people} selectedAgent={selectedAgent} selectedAgentMissing={Boolean(selectedAgentMissing)} selectedAgentConfiguration={selectedAgentConfiguration} selectedAgentMode={selectedAgentMode} onUpdateConfiguration={updateAgentConfiguration} />
        <GoalsControlFlowSection element={selectedElement} retryTargetTitle={selectedRetryTarget ? activeGoal?.elements.find(element => element.id === selectedRetryTarget)?.title ?? 'Missing node' : undefined} onUpdateElement={updateElement} />
        {selectedElement.type === 'deliverable' && (
          <GoalsDeliverableSection>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Delivery contract</p>
            <p className="mt-1 text-[11px] text-slate-400">These instructions are authoritative for this Goal revision. Notes provide context only.</p>
            <label className="mt-3 block text-xs font-medium text-slate-600">Outcome kind
              <Select value={selectedElement.deliverySpec?.outcomeKind ?? 'other'} onValueChange={value => updateElement({ deliverySpec: { ...(selectedElement.deliverySpec ?? { instructions: '' }), outcomeKind: value as NonNullable<GoalElement['deliverySpec']>['outcomeKind'] } })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="file">File</SelectItem><SelectItem value="summary">Summary</SelectItem><SelectItem value="conclusion">Conclusion</SelectItem><SelectItem value="resolution">Resolution</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
              </Select>
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600">Delivery instructions<textarea value={selectedElement.deliverySpec?.instructions ?? ''} onChange={event => updateElement({ deliverySpec: { ...(selectedElement.deliverySpec ?? { outcomeKind: 'other' }), instructions: event.target.value } })} rows={5} placeholder="Describe how this outcome should be delivered, where, and in what form." className="mt-1 w-full resize-y rounded-md border border-emerald-200 bg-emerald-50/30 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-slate-600">Format<Input value={selectedElement.deliverySpec?.format ?? ''} onChange={event => updateElement({ deliverySpec: { ...(selectedElement.deliverySpec ?? { outcomeKind: 'other', instructions: '' }), format: event.target.value || undefined } })} placeholder="e.g. PDF" className="mt-1" /></label>
              <label className="block text-xs font-medium text-slate-600">Recipient<Input value={selectedElement.deliverySpec?.recipient ?? ''} onChange={event => updateElement({ deliverySpec: { ...(selectedElement.deliverySpec ?? { outcomeKind: 'other', instructions: '' }), recipient: event.target.value || undefined } })} placeholder="Person or team" className="mt-1" /></label>
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600">Destination<Input value={selectedElement.deliverySpec?.destination ?? ''} onChange={event => updateElement({ deliverySpec: { ...(selectedElement.deliverySpec ?? { outcomeKind: 'other', instructions: '' }), destination: event.target.value || undefined } })} placeholder="Workspace, folder, URL, or channel" className="mt-1" /></label>
            <label className="mt-3 block text-xs font-medium text-slate-600">Acceptance criteria<textarea value={(selectedElement.deliverySpec?.acceptanceCriteria ?? []).join('\n')} onChange={event => updateElement({ deliverySpec: { ...(selectedElement.deliverySpec ?? { outcomeKind: 'other', instructions: '' }), acceptanceCriteria: event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) } })} rows={4} placeholder="One criterion per line" className="mt-1 w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
            <label className="mt-3 block text-xs font-medium text-slate-600">Expected artifact count <span className="font-normal text-slate-400">(optional)</span><Input type="number" min={0} step={1} value={selectedElement.deliverySpec?.expectedArtifactCount ?? ''} onChange={event => updateElement({ deliverySpec: { ...(selectedElement.deliverySpec ?? { outcomeKind: 'other', instructions: '' }), expectedArtifactCount: event.target.value === '' ? undefined : Math.max(0, Math.floor(Number(event.target.value))) } })} className="mt-1" /></label>
            <label className="mt-3 block text-xs font-medium text-slate-600">Acceptance state
              <Select value={selectedElement.deliverableStatus ?? 'planned'} onValueChange={value => updateElement({ deliverableStatus: value as GoalElement['deliverableStatus'] })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="planned">Planned</SelectItem><SelectItem value="in-progress">In progress</SelectItem><SelectItem value="ready-for-review">Ready for review</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent>
              </Select>
            </label>
            <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50/40 p-2.5">
              <p className="text-[11px] font-semibold text-emerald-800">Delivered outputs</p>
              <p className="mt-1 text-[11px] text-emerald-700/70">Runtime handoff records appear here after execution. Supporting artifacts are kept on separate nodes.</p>
              {(runtimeProjection?.handoffs ?? []).filter(handoff => !handoff.deliverableId || handoff.deliverableId === selectedElement.id).length === 0
                ? <p className="mt-2 text-[11px] text-slate-400">No terminal handoff recorded yet.</p>
                : <div className="mt-2 space-y-2">{(runtimeProjection?.handoffs ?? []).filter(handoff => !handoff.deliverableId || handoff.deliverableId === selectedElement.id).map(handoff => <div key={handoff.id} className="rounded-md border border-emerald-100 bg-white px-2.5 py-2"><p className="text-[10px] text-slate-400">{handoff.deliveredAt ? new Date(handoff.deliveredAt).toLocaleString() : 'Recorded handoff'}</p>{(handoff.producedArtifactReferences ?? []).map((reference, index) => <p key={`${handoff.id}-${index}`} className="mt-1 truncate text-xs font-medium text-slate-700">{reference.label ?? reference.locator ?? 'Produced output'}{reference.format ? ` · ${reference.format}` : ''}</p>)}</div>)}</div>}
            </div>
          </GoalsDeliverableSection>
        )}
        <GoalsConditionSection element={selectedElement} positiveLabel={conditionPositiveLabel(selectedElement)} negativeLabel={conditionNegativeLabel(selectedElement)} onUpdateElement={updateElement} />
        {selectedElement.type === 'subgoal' && (
          <section className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Handoff</p>
            <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={selectedElement.handoffRequired === true} onChange={event => updateElement({ handoffRequired: event.target.checked })} /> Require handoff before the next step</label>
            <label className="mt-3 block text-xs font-medium text-slate-600">Handoff notes<textarea value={selectedElement.handoffNotes ?? ''} onChange={event => updateElement({ handoffNotes: event.target.value })} rows={3} placeholder="What must be passed to the next step?" className="mt-1 w-full resize-none rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          </section>
        )}
        {selectedElement.type === 'goal' && <GoalsScheduleSection schedule={activeSchedule} onCreate={createSchedule} onUpdate={updateSchedule} onDelete={deleteSchedule} />}
        {selectedPolicyElement && <GoalsPolicyEditor element={selectedElement} policyElement={selectedPolicyElement} effectivePolicy={selectedEffectivePolicy} runtimeProjection={runtimeProjection} workspacePolicy={workspacePolicy} policyImpact={selectedPolicyImpact} onUpdateElement={updateElement} onUpdatePolicy={updatePolicy} onUpdatePolicyDimension={updatePolicyDimension} />}
        {(selectedElement.type === 'goal' || selectedElement.type === 'subgoal' || selectedElement.type === 'artifact') && <GoalsArtifactEditor element={selectedElement} artifactOptions={artifactOptions} supportingSourceOptions={supportingSourceOptions} selectedReferences={selectedArtifactReferences} supportingArtifactType={supportingArtifactType} sourceSearch={supportingSourceSearch} customLabel={customArtifactLabel} customKind={customArtifactKind} customFormat={customArtifactFormat} customLocator={customArtifactLocator} selectClass={ARTIFACT_SELECT_CLASS} tasks={tasks} onUpdateReferences={references => { void updateArtifactReferences(references); }} onArtifactTypeChange={value => { setSupportingArtifactType(value); setSupportingSourceSearch(''); }} onSourceSearchChange={setSupportingSourceSearch} onSourceSelect={addSupportingSourceReference} onCustomLabelChange={setCustomArtifactLabel} onCustomKindChange={setCustomArtifactKind} onCustomFormatChange={setCustomArtifactFormat} onCustomLocatorChange={setCustomArtifactLocator} onAddCustomReference={addCustomArtifactReference} />}
        {selectedElement.type !== 'connector' && <GoalsConnectionsSection element={selectedElement} connections={selectedConnections} elements={activeGoal?.elements ?? []} onDeleteConnection={deleteConnection} />}
        <GoalsRuntimeStatus element={selectedElement} connected={isGoalElementConnected(activeGoal?.elements ?? [], selectedElement.id)} runtimeProjection={runtimeProjection} onResetExecution={resetGoalExecution} />
        <GoalsConnectorInspector element={selectedElement} elements={activeGoal?.elements ?? []} onRewire={element => { setConnectorMode(true); setRewireConnectorId(element.id); setConnectorSourceId(element.sourceId ?? null); setConnectorSourceSide(element.sourceSide ?? 'right'); setConnectorSourceBranch(element.conditionBranch); }} />
      </GoalsInspector>
    )}
    <DeleteGoalDialog open={deleteDialogOpen} onCancel={() => setDeleteDialogOpen(false)} onConfirm={performDeleteElement} />
    <NewGoalDialog open={newGoalDialogOpen} title={newGoalTitle} body={newGoalBody} auditDirectory={goalAuditArchiveDirectory} existingGoalCount={goals.length} onTitleChange={setNewGoalTitle} onBodyChange={setNewGoalBody} onPickDirectory={async () => { const directory = await window.electron?.goalAudit?.pickDirectory?.(); if (directory) onGoalAuditArchiveDirectoryChange?.(directory); }} onCancel={() => setNewGoalDialogOpen(false)} onSubmit={event => { event.preventDefault(); createGoal(); }} />
    <GoalsCanvasControls
      spacePressed={spacePressed}
      panMode={panMode}
      zoom={zoom}
      onTogglePanMode={() => setPanMode(value => !value)}
      onZoomOut={() => setZoom(value => Math.max(.6, value - .1))}
      onZoomIn={() => setZoom(value => Math.min(1.4, value + .1))}
    />
  </section>
  );
}
