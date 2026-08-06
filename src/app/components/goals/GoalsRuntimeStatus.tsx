import { CircleDot, LoaderCircle } from 'lucide-react';
import type { GoalElement, GoalRuntimeProjection } from '../../types.ts';
import { ReadyIcon, StatusIcon, compactChipClass, isCompletionElement, readinessChipClass, readinessDescription, readinessForElement, readinessLabel, statusChipClass, statusDescription, statusLabel, statusNextStep } from './GoalsPresentation';
import { GoalsRuntimeStatusSection } from './GoalsInspectorSections';
import { getExecutionAttentionState } from '../../utils/attention';

function runtimeLabel(state: string): string {
  return state === 'approval-required' ? 'Approval required' : state === 'evidence-required' ? 'Evidence required' : state === 'permission-denied' ? 'Permission denied' : state === 'ready' ? 'Ready to execute' : state.replaceAll('-', ' ');
}

function runtimeChipClass(state: string): string {
  if (state === 'working') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (state === 'blocked' || state === 'permission-denied') return 'border-red-200 bg-red-50 text-red-700';
  if (state === 'approval-required' || state === 'evidence-required') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (state === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'abandoned') return 'border-slate-300 bg-slate-100 text-slate-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function runtimeDescription(state: string): string {
  if (state === 'working') return 'An agent is currently executing this Goal.';
  if (state === 'blocked') return 'Execution is blocked and requires intervention before it can continue.';
  if (state === 'approval-required') return 'Execution is waiting for the configured approval decision.';
  if (state === 'evidence-required') return 'Execution is waiting for required evidence.';
  if (state === 'complete') return 'This execution fulfilled its contract. The Goal can be run again.';
  if (state === 'abandoned') return 'This execution was abandoned. The Goal can be started again.';
  return 'The runtime has recorded this execution state for the active Goal revision.';
}

function workerDelegationDescription(status?: string): string | undefined {
  if (status === 'required') return 'Subagent recruitment is required. The working agent must create the requested subagents through its own runtime before dependent work proceeds.';
  if (status === 'blocked') return 'Subagent recruitment failed or was unavailable. The working agent must report a recovery decision before execution can continue.';
  if (status === 'fulfilled') return 'Requested subagents were reported active or completed by the working agent.';
  return undefined;
}

export function GoalsRuntimeStatus({ element, connected, runtimeProjection, onResetExecution }: { element: GoalElement; connected: boolean; runtimeProjection?: GoalRuntimeProjection | null; onResetExecution?: () => void }) {
  const executionState = runtimeProjection?.execution?.state;
  const attention = executionState ? getExecutionAttentionState(executionState) : undefined;
  return <GoalsRuntimeStatusSection>
    {executionState && <div className="mb-4 border-b border-slate-100 pb-4"><div className="flex items-center gap-1"><span>Execution</span><span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${compactChipClass(runtimeChipClass(executionState))}`}>{executionState === 'working' ? <LoaderCircle className="mr-1 size-3.5 animate-spin" /> : <CircleDot className="mr-1 size-3.5" />}{attention?.label ?? runtimeLabel(executionState)}</span></div><span className="mt-1 block text-[11px] text-slate-400">{attention?.description ?? runtimeDescription(executionState)}</span>{workerDelegationDescription(runtimeProjection?.execution?.workerDelegationStatus) && <span className="mt-2 block rounded-md border border-amber-100 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">{workerDelegationDescription(runtimeProjection.execution.workerDelegationStatus)}</span>}{attention && <span className="mt-2 block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600"><span className="font-semibold text-slate-700">Next step: </span>{attention.nextStep}</span>}{onResetExecution && <button type="button" onClick={onResetExecution} className="mt-3 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50">Reset execution</button>}</div>}
    {isCompletionElement(element) ? <><div className="flex items-center gap-1"><span>Completion</span><span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${compactChipClass(statusChipClass(element.status))}`}><StatusIcon status={element.status} className="mr-1 size-3.5" />{statusLabel(element.status)}</span></div><span className="mt-1 block text-[11px] text-slate-400">{statusDescription(element.status)}</span>{statusNextStep(element.status) && <span className="mt-2 block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-normal text-slate-600"><span className="font-semibold text-slate-700">Next step: </span>{statusNextStep(element.status)}</span>}</> : (() => { const readiness = readinessForElement(element, connected); return <><div className="flex items-center gap-1"><span>Readiness</span>{readiness === 'ready' ? <span className="inline-flex items-center" title="Ready for workflow use"><ReadyIcon /></span> : <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${readinessChipClass(readiness)}`}><CircleDot className="mr-1 size-3.5" />{readinessLabel(readiness)}</span>}</div><span className="mt-1 block text-[11px] text-slate-400">{readinessDescription(element, readiness)}</span></>; })()}
  </GoalsRuntimeStatusSection>;
}
