import type { GoalArtifactReference, GoalElement, SupportingArtifactType } from '../../types.ts';
import type { GoalArtifactOption, SupportingSourceOption } from '../../utils/goalArtifacts.ts';
import { createStableId } from '../../utils/goalElements.ts';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { GoalsArtifactSection } from './GoalsInspectorSections';
import { MagnifierIcon } from '../icons/MagnifierIcon';

export function GoalsArtifactEditor({ element, artifactOptions, supportingSourceOptions, selectedReferences, supportingArtifactType, sourceSearch, customLabel, customKind, customFormat, customLocator, selectClass, tasks, onUpdateReferences, onArtifactTypeChange, onSourceSearchChange, onSourceSelect, onCustomLabelChange, onCustomKindChange, onCustomFormatChange, onCustomLocatorChange, onAddCustomReference }: {
  element: GoalElement;
  artifactOptions: GoalArtifactOption[];
  supportingSourceOptions: SupportingSourceOption[];
  selectedReferences: GoalArtifactReference[];
  supportingArtifactType: SupportingArtifactType;
  sourceSearch: string;
  customLabel: string;
  customKind: string;
  customFormat: string;
  customLocator: string;
  selectClass: string;
  tasks: Array<{ id: string; attachments?: Array<{ id: string; name: string }> }>;
  onUpdateReferences: (references: GoalArtifactReference[]) => void;
  onArtifactTypeChange: (value: SupportingArtifactType) => void;
  onSourceSearchChange: (value: string) => void;
  onSourceSelect: (value: string) => void;
  onCustomLabelChange: (value: string) => void;
  onCustomKindChange: (value: string) => void;
  onCustomFormatChange: (value: string) => void;
  onCustomLocatorChange: (value: string) => void;
  onAddCustomReference: () => void;
}) {
  const isArtifact = element.type === 'artifact';
  return <GoalsArtifactSection>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{isArtifact ? 'Supporting artifacts' : 'Execution artifacts'}</p>
    <p className="mt-1 text-[11px] text-slate-400">{isArtifact ? 'These files and references support execution; they never satisfy delivery acceptance.' : 'Links stay attached to this node; task and milestone records remain canonical.'}</p>
    {!isArtifact && <Select onValueChange={value => { const option = artifactOptions.find(item => item.value === value); if (!option || selectedReferences.some(reference => reference.artifactType === option.artifactType && reference.artifactId === option.artifactId)) return; onUpdateReferences([...selectedReferences, { id: createStableId('artifact-link'), artifactType: option.artifactType, artifactId: option.artifactId, linkedBy: 'renderer', linkedAt: new Date().toISOString() }]); }}><SelectTrigger className="mt-2"><SelectValue placeholder="Link a task or milestone" /></SelectTrigger><SelectContent>{artifactOptions.filter(option => !selectedReferences.some(reference => reference.artifactType === option.artifactType && reference.artifactId === option.artifactId)).map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}{artifactOptions.length === 0 && <SelectItem value="__none__" disabled>No tasks or milestones available</SelectItem>}</SelectContent></Select>}
    {isArtifact && <div className="mt-3 rounded-md border border-sky-100 bg-sky-50/40 p-2.5"><p className="text-[11px] font-semibold text-sky-800">Select a workspace source</p><p className="mt-1 text-[11px] text-sky-700/70">Links the existing attachment without copying its contents into the Goal.</p><label className="mt-3 block text-[11px] font-medium text-slate-600">Artifact type<Select value={supportingArtifactType} onValueChange={value => onArtifactTypeChange(value as SupportingArtifactType)}><SelectTrigger className={`mt-1 ${selectClass}`}><SelectValue /></SelectTrigger><SelectContent className="rounded-xl"><SelectItem value="document">Document</SelectItem><SelectItem value="file">File</SelectItem><SelectItem value="url">URL</SelectItem><SelectItem value="user-defined">User-defined</SelectItem></SelectContent></Select></label>{(supportingArtifactType === 'document' || supportingArtifactType === 'file') && <><label className="mt-3 block text-[11px] font-medium text-slate-600">Search workspace sources<div className="relative mt-1"><MagnifierIcon className="pointer-events-none absolute left-2 top-1/2 z-10 size-[18px] -translate-y-1/2" /><Input type="search" value={sourceSearch} onChange={event => onSourceSearchChange(event.target.value)} placeholder="Search by attachment or task name" className="rounded-xl bg-white pl-8" /></div></label><label className="mt-3 block text-[11px] font-medium text-slate-600">Workspace source<Select onValueChange={onSourceSelect}><SelectTrigger className={`mt-1 ${selectClass}`}><SelectValue placeholder={supportingSourceOptions.length ? 'Choose an existing source' : 'No matching sources'} /></SelectTrigger><SelectContent className="rounded-xl">{supportingSourceOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}<span className="ml-1 text-[10px] text-slate-400">· {option.searchText.replace(option.attachment.name, '').trim()}</span></SelectItem>)}{supportingSourceOptions.length === 0 && <SelectItem value="__none__" disabled>No matching workspace attachments</SelectItem>}</SelectContent></Select></label></>}</div>}
    {isArtifact && <><p className="mt-3 text-[11px] font-semibold text-sky-800">Or declare an external/user-defined source</p><Input value={customLabel} onChange={event => onCustomLabelChange(event.target.value)} placeholder="Artifact label" className="mt-2 bg-white" /><div className="mt-2 grid grid-cols-2 gap-2"><Select value={customKind} onValueChange={onCustomKindChange}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger><SelectContent className="rounded-xl"><SelectItem value="document">Document</SelectItem><SelectItem value="file">File</SelectItem><SelectItem value="url">URL</SelectItem><SelectItem value="user-defined">User-defined</SelectItem></SelectContent></Select><Input value={customFormat} onChange={event => onCustomFormatChange(event.target.value)} placeholder="Format (optional)" className="bg-white" /></div><Input value={customLocator} onChange={event => onCustomLocatorChange(event.target.value)} placeholder="Locator or URL (optional)" className="mt-2 bg-white" /><Button type="button" variant="tertiary" onClick={onAddCustomReference} disabled={!customLabel.trim()} className="mt-2 text-xs">Add supporting artifact</Button></>}
    <div className="mt-2 space-y-2">{selectedReferences.length === 0 ? <p className="text-[11px] text-slate-400">No execution artifacts linked yet.</p> : selectedReferences.map(reference => {
      const projection = reference.projection;
      const sourceTask = reference.sourceTaskId ? tasks.find(task => task.id === reference.sourceTaskId) : undefined;
      const sourceAvailable = reference.sourceAttachmentId ? Boolean(sourceTask?.attachments?.some(attachment => attachment.id === reference.sourceAttachmentId)) : undefined;
      const contributionState = projection?.contributionState;
      const missing = projection?.exists === false || sourceAvailable === false || contributionState === 'stale-source' || contributionState === 'missing-evidence';
      const blocked = projection?.status === 'blocked' || contributionState === 'blocked-dependency';
      const verified = contributionState === 'verified-evidence' || contributionState === 'satisfied';
      const approvalRequired = projection?.status === 'approval-required' || element.status === 'approval-required';
      const status = missing ? 'Stale or missing' : blocked ? 'Blocked' : verified ? (reference.contribution === 'dependency' ? 'Dependency satisfied' : 'Evidence verified') : approvalRequired ? 'Approval required' : projection?.status ?? 'Linked';
      const statusClass = missing || blocked ? 'border-rose-200 bg-rose-50 text-rose-700' : verified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : approvalRequired ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600';
      return <div key={reference.id} className="rounded-md border border-slate-200 px-2.5 py-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-700">{projection?.title ?? reference.label ?? `${reference.artifactType} · ${reference.artifactId}`}</p><Badge variant="outline" className={`mt-1 text-[10px] capitalize ${statusClass}`}>{status}</Badge></div><button type="button" onClick={() => onUpdateReferences(selectedReferences.filter(item => item.id !== reference.id))} className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Unlink execution artifact">×</button></div>{projection?.exists && <p className="mt-1 text-[10px] text-slate-400">{projection.assigneeId ? `Assignee ${projection.assigneeId}` : 'Unassigned'}{projection.dependencyIds?.length ? ` · ${projection.dependencyIds.length} dependencies` : ''}{projection.evidence?.length ? ` · ${projection.evidence.length} evidence refs` : ''}</p>}{missing && <p className="mt-1 text-[10px] text-rose-600">The source is stale or missing; relink it before the gated operation can continue.</p>}{blocked && <p className="mt-1 text-[10px] text-rose-600">This dependency must resolve before Goal start or dispatch.</p>}{reference.contribution === 'evidence' && !missing && !verified && <p className="mt-1 text-[10px] text-amber-700">Evidence must be verified before handoff or completion.</p>}</div>;
    })}</div>
  </GoalsArtifactSection>;
}
