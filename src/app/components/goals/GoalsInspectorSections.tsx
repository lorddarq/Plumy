import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { LinkIcon as Link2 } from '../icons/LinkIcon';
import type { GoalAgentConfiguration, GoalAgentMode, GoalElement, GoalRecord, GoalRetryExhaustionPolicy, Person, TimelineSwimlane } from '../../types.ts';
import type { GoalSchedule, GoalScheduleOccurrence } from '../../types.ts';
import { scheduleStatus } from '../../utils/goalSchedules.ts';

interface GoalsAgentSectionProps {
  element?: GoalElement;
  people: Person[];
  selectedAgent?: Person;
  selectedAgentMissing: boolean;
  selectedAgentConfiguration?: GoalAgentConfiguration;
  selectedAgentMode?: GoalAgentMode;
  onUpdateConfiguration: (updates: Partial<GoalAgentConfiguration>) => void;
}

export function GoalsAgentSection({ element, people, selectedAgent, selectedAgentMissing, selectedAgentConfiguration, selectedAgentMode, onUpdateConfiguration }: GoalsAgentSectionProps) {
  if (!element || element.type !== 'agent') return null;
  return <section className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Task instructions</p>
    <label className="mt-3 block text-sm font-medium text-slate-700">What this agent must do
      <textarea value={selectedAgentConfiguration?.instructions ?? ''} onChange={event => onUpdateConfiguration({ instructions: event.target.value })} rows={8} autoFocus={false} placeholder="Describe the concrete work, scope, and expected result for this agent node." className="mt-1 w-full resize-y rounded-md border border-blue-200 bg-blue-50/30 px-3 py-2.5 text-sm leading-5 text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
    </label>
    <p className="mt-2 text-[11px] text-slate-400">These instructions are sent with the delegation contract. They are separate from the node label and canonical agent profile.</p>
    <label className="mt-3 flex items-start gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={selectedAgentConfiguration?.workAsSubagent === true} onChange={event => onUpdateConfiguration({ workAsSubagent: event.target.checked })} className="mt-0.5" /> <span>Instruct the working agent to run this as a subagent<span className="mt-1 block text-[11px] font-normal text-slate-400">Omvra does not spawn it. The working agent must create and manage the subagent through its own runtime.</span></span></label>
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Agent setup</p>
      <label className="mt-3 block text-xs font-medium text-slate-600">Agent mode
        <Select value={selectedAgentMode} onValueChange={value => onUpdateConfiguration({ mode: value as GoalAgentMode, ...(value === 'existing' ? { requestedName: undefined, requestedType: undefined } : { assigneeId: undefined }) })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="existing">Existing canonical agent</SelectItem><SelectItem value="ephemeral">Ephemeral temporary agent</SelectItem></SelectContent>
        </Select>
      </label>
      {selectedAgentMode === 'existing' ? <>
        <label className="mt-3 block text-xs font-medium text-slate-600">Canonical agent
          <Select value={selectedAgentConfiguration?.assigneeId ?? element.assigneeId ?? '__none__'} onValueChange={value => onUpdateConfiguration({ assigneeId: value === '__none__' ? undefined : value })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select an agent" /></SelectTrigger>
            <SelectContent><SelectItem value="__none__">Select an agent</SelectItem>{people.filter(person => person.kind === 'agentic').map(person => <SelectItem key={person.id} value={person.id}>{person.name} · {person.role}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        {selectedAgent && <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">Canonical profile is applied at dispatch: {selectedAgent.agentInstructions ? 'persona' : 'no persona'} + {selectedAgent.agentOperationalInstructions ? 'operational guidance' : 'no operational guidance'}.</p>}
        {selectedAgentMissing && <p role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">Assign a canonical agent before this node can be started or dispatched.</p>}
        <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={selectedAgentConfiguration?.spawnIfUnavailable === true} onChange={event => onUpdateConfiguration({ spawnIfUnavailable: event.target.checked })} /> Recruit temporarily if unavailable</label>
      </> : <>
        <label className="mt-3 flex items-start gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={selectedAgentConfiguration?.autoGenerateName === true} onChange={event => onUpdateConfiguration({ autoGenerateName: event.target.checked, ...(event.target.checked ? { requestedName: undefined } : {}) })} className="mt-0.5" /> <span>Generate name at spawn<span className="mt-1 block text-[11px] font-normal text-slate-400">Use this when the role is more important than a fixed name.</span></span></label>
        <label className="mt-3 block text-xs font-medium text-slate-600">Requested capability / type<Input value={selectedAgentConfiguration?.requestedType ?? ''} onChange={event => onUpdateConfiguration({ requestedType: event.target.value || undefined })} className="mt-1" placeholder="e.g. accessibility researcher" /></label>
      </>}
    </div>
    <p className="mt-3 text-[11px] text-slate-400">Ephemeral agents receive only the requested capability and these task instructions; existing agents additionally receive their canonical profile.</p>
  </section>;
}

interface GoalsControlFlowSectionProps {
  element?: GoalElement;
  retryTargetTitle?: string;
  onUpdateElement: (updates: Partial<GoalElement>) => void;
}

export function GoalsControlFlowSection({ element, retryTargetTitle, onUpdateElement }: GoalsControlFlowSectionProps) {
  if (!element || (element.type !== 'human-input' && element.type !== 'retry')) return null;
  if (element.type === 'human-input') return <section className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Human input</p>
    <label className="mt-3 block text-xs font-medium text-slate-600">Prompt for the user<textarea value={element.humanInputPrompt ?? ''} onChange={event => onUpdateElement({ humanInputPrompt: event.target.value })} rows={4} placeholder="What should the overseer ask the user?" className="mt-1 w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
    <p className="mt-2 text-[11px] text-slate-400">The overseer will pause this workflow and persist the user's response before resuming.</p>
  </section>;
  return <section className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Retry control</p>
    <label className="mt-3 block text-xs font-medium text-slate-600">Maximum attempts
      <Input type="number" min={1} step={1} value={element.retryMaxAttempts ?? ''} onChange={event => { const value = Number(event.target.value); onUpdateElement({ retryMaxAttempts: Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined }); }} className="mt-1" aria-describedby="retry-attempts-help" />
      <span id="retry-attempts-help" className="mt-1 block text-[11px] font-normal text-slate-400">Counts retries for the current execution. The return target is configured with a regular connector.</span>
    </label>
    <label className="mt-3 block text-xs font-medium text-slate-600">When attempts are exhausted
      <Select value={element.retryExhaustionPolicy ?? 'human-review'} onValueChange={value => onUpdateElement({ retryExhaustionPolicy: value as GoalRetryExhaustionPolicy })}>
        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="human-review">Require human review</SelectItem><SelectItem value="fail-goal">Fail the Goal</SelectItem></SelectContent>
      </Select>
    </label>
    <div className="mt-3 rounded-md border border-cyan-100 bg-cyan-50/60 px-2.5 py-2 text-[11px] text-cyan-800"><span className="font-semibold">Retry target:</span> {retryTargetTitle ?? 'Connect this node to an earlier step.'}</div>
  </section>;
}

export function GoalsRequirementsSection({ goal, element }: { goal?: GoalRecord; element?: GoalElement }) {
  const inputs = [...(goal?.inputs ?? []), ...(element?.inputs ?? [])];
  const capabilities = [...(goal?.capabilities ?? []), ...(element?.capabilities ?? [])];
  if (inputs.length === 0 && capabilities.length === 0) return null;
  return <section className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Contract requirements</p>
    <p className="mt-1 text-[11px] text-slate-400">Typed references are resolved before setup. Contents and secrets are never copied into this inspector.</p>
    <div className="mt-3 space-y-2">
      {inputs.map(input => <div key={`input-${input.id}`} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2"><p className="text-xs font-medium text-slate-700">Input · {input.label ?? input.id}</p><p className="mt-0.5 text-[11px] capitalize text-slate-400">{input.kind.replace('-', ' ')} · {input.scope}{input.required === false ? ' · optional' : ''}</p></div>)}
      {capabilities.map(capability => <div key={`capability-${capability.id}`} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2"><p className="text-xs font-medium text-slate-700">Capability · {capability.label ?? capability.capabilityId}</p><p className="mt-0.5 text-[11px] text-slate-400">{capability.source ?? 'any source'}{capability.version ? ` · ${capability.version}` : ''} · {capability.permission ?? 'permission unknown'}</p></div>)}
    </div>
  </section>;
}

export function GoalsProjectBindingsSection({ goal, projects }: { goal?: GoalRecord; projects: TimelineSwimlane[] }) {
  const bindings = goal?.projectBindings ?? [];
  const projectById = new Map(projects.map(project => [project.id, project]));
  return <section className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Project bindings</p>
    {bindings.length === 0 ? <p className="mt-2 rounded-md border border-dashed border-slate-200 px-2.5 py-2 text-[11px] text-slate-400">Projectless Goal · no synthetic project assigned.</p> : <div className="mt-3 space-y-2">{bindings.map(binding => {
      const project = projectById.get(binding.projectId);
      const state = binding.projection?.state ?? (project ? 'active' : 'stale-project');
      return <div key={binding.id} className={`rounded-md border px-2.5 py-2 ${state === 'active' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className="text-xs font-medium text-slate-700">{project?.name ?? binding.projection?.name ?? binding.projectId}</p>
        <p className="mt-0.5 text-[11px] capitalize text-slate-400">{binding.role} · {state.replace('-', ' ')}{project?.description ? ` · ${project.description}` : ''}</p>
      </div>;
    })}</div>}
  </section>;
}

interface GoalsConnectionsSectionProps {
  element: GoalElement;
  connections: GoalElement[];
  elements: GoalElement[];
  onDeleteConnection: (connectionId: string) => void;
}

export function GoalsConnectionsSection({ element, connections, elements, onDeleteConnection }: GoalsConnectionsSectionProps) {
  return <section className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Connections</p>
    {connections.length === 0 ? <p className="mt-2 text-[11px] text-slate-400">No connected nodes yet.</p> : <div className="mt-2 space-y-2">{connections.map(connection => {
      const isSource = connection.sourceId === element.id;
      const otherId = isSource ? connection.targetId : connection.sourceId;
      const other = elements.find(candidate => candidate.id === otherId);
      const branch = connection.conditionBranch ? ` · ${connection.conditionBranch}` : '';
      return <div key={connection.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2"><span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-700">{isSource ? 'To' : 'From'} · {other?.title ?? 'Missing node'}</span><span className="block truncate text-[11px] capitalize text-slate-400">{connection.title}{branch}</span></span><button type="button" onClick={() => onDeleteConnection(connection.id)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove connection ${connection.title}`} title="Remove connection"><Link2 className="size-3.5 rotate-45" /></button></div>;
    })}</div>}
  </section>;
}

interface GoalsConditionSectionProps {
  element?: GoalElement;
  positiveLabel: string;
  negativeLabel: string;
  onUpdateElement: (updates: Partial<GoalElement>) => void;
}

export function GoalsConditionSection({ element, positiveLabel, negativeLabel, onUpdateElement }: GoalsConditionSectionProps) {
  if (!element || element.type !== 'condition') return null;
  return <section className="mt-5 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Branches</p>
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <p className="text-[11px] font-semibold text-emerald-800">Positive branch</p>
      <label className="mt-2 block text-xs font-medium text-slate-600">Branch name<Input value={positiveLabel} onChange={event => onUpdateElement({ conditionPositiveLabel: event.target.value })} className="mt-1" /></label>
      <label className="mt-2 block text-xs font-medium text-slate-600">Outcome<textarea value={element.conditionPositiveOutcome ?? ''} onChange={event => onUpdateElement({ conditionPositiveOutcome: event.target.value })} rows={2} placeholder="What happens when the condition is positive?" className="mt-1 w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
    </div>
    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
      <p className="text-[11px] font-semibold text-rose-800">Negative branch</p>
      <label className="mt-2 block text-xs font-medium text-slate-600">Branch name<Input value={negativeLabel} onChange={event => onUpdateElement({ conditionNegativeLabel: event.target.value })} className="mt-1" /></label>
      <label className="mt-2 block text-xs font-medium text-slate-600">Outcome<textarea value={element.conditionNegativeOutcome ?? ''} onChange={event => onUpdateElement({ conditionNegativeOutcome: event.target.value })} rows={2} placeholder="What happens when the condition is negative?" className="mt-1 w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
    </div>
    <p className="mt-2 text-[11px] font-normal text-slate-400">Each branch has its own name and outcome. Connect the positive and negative ports to different next steps.</p>
  </section>;
}

interface GoalsScheduleSectionProps {
  schedule?: GoalSchedule;
  latestOccurrence?: GoalScheduleOccurrence;
  onCreate: () => void;
  onUpdate: (updates: Partial<GoalSchedule> | { rule: Partial<GoalSchedule['rule']> }) => void;
  onDelete: () => void;
}

export function GoalsScheduleSection({ schedule, latestOccurrence, onCreate, onUpdate, onDelete }: GoalsScheduleSectionProps) {
  return <section className="mt-5 border-t border-slate-100 pt-4">
    <div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Schedule</p><p className="mt-1 text-[11px] text-slate-400">Runs create independent lifecycle attempts in the captured timezone.</p></div>{!schedule && <button type="button" onClick={onCreate} className="rounded-md border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50">Add</button>}</div>
    {schedule ? <div className="mt-3 space-y-3">
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={schedule.enabled} onChange={event => onUpdate({ enabled: event.target.checked })} /> Enabled</label>
      <label className="block text-xs font-medium text-slate-600">Run type<select value={schedule.rule.mode} onChange={event => onUpdate({ rule: { mode: event.target.value as GoalSchedule['rule']['mode'] } })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="one-time">One-time</option><option value="recurring">Recurring</option></select></label>
      {schedule.rule.mode === 'recurring' && <label className="block text-xs font-medium text-slate-600">Frequency<select value={schedule.rule.frequency ?? 'weekly'} onChange={event => onUpdate({ rule: { frequency: event.target.value as 'weekly' | 'monthly' } })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>}
      {schedule.rule.mode === 'recurring' && schedule.rule.frequency === 'weekly' && <label className="block text-xs font-medium text-slate-600">Day of week<select value={schedule.rule.dayOfWeek ?? 1} onChange={event => onUpdate({ rule: { dayOfWeek: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
      {schedule.rule.mode === 'recurring' && schedule.rule.frequency === 'monthly' && <label className="block text-xs font-medium text-slate-600">Day of month<Input type="number" min={1} max={31} value={schedule.rule.dayOfMonth ?? 1} onChange={event => onUpdate({ rule: { dayOfMonth: Math.min(31, Math.max(1, Number(event.target.value) || 1)) } })} className="mt-1" /></label>}
      {schedule.rule.mode === 'one-time' && <label className="block text-xs font-medium text-slate-600">Date<Input type="date" value={schedule.rule.date ?? ''} onChange={event => onUpdate({ rule: { date: event.target.value } })} className="mt-1" /></label>}
      <label className="block text-xs font-medium text-slate-600">Time<Input type="time" value={schedule.rule.time} onChange={event => onUpdate({ rule: { time: event.target.value } })} className="mt-1" /></label>
      <label className="block text-xs font-medium text-slate-600">Temporal mode<select value={schedule.temporalMode} onChange={event => onUpdate({ temporalMode: event.target.value as GoalSchedule['temporalMode'] })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="anchored">Anchored data window</option><option value="latest">Latest data on retry</option></select></label>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500"><span className="font-semibold text-slate-700">Timezone:</span> {schedule.timezone}<br /><span className="font-semibold text-slate-700">Status:</span> {scheduleStatus(schedule)}</div>
      {latestOccurrence && <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-500"><span className="font-semibold text-slate-700">Latest occurrence:</span> {latestOccurrence.state.replace(/-/g, ' ')} · {latestOccurrence.attempts} attempt{latestOccurrence.attempts === 1 ? '' : 's'}<br /><span className="font-semibold text-slate-700">Scheduled for:</span> {latestOccurrence.scheduledFor}{latestOccurrence.error && <><br /><span className="font-semibold text-red-700">Outcome:</span> {latestOccurrence.error}</>}</div>}
      <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-medium text-slate-600">Starts<input type="date" value={schedule.startsAt?.slice(0, 10) ?? ''} onChange={event => onUpdate({ startsAt: event.target.value || undefined })} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label><label className="block text-xs font-medium text-slate-600">Ends<input type="date" value={schedule.endsAt?.slice(0, 10) ?? ''} onChange={event => onUpdate({ endsAt: event.target.value || undefined })} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label></div>
      <button type="button" onClick={onDelete} className="text-xs font-medium text-red-600 hover:text-red-700">Remove schedule</button>
    </div> : <p className="mt-3 rounded-md border border-dashed border-slate-200 px-2.5 py-2 text-[11px] text-slate-400">No schedule configured. Add one to distinguish one-time and recurring execution.</p>}
  </section>;
}

export function GoalsDeliverableSection({ children }: { children: ReactNode }) {
  return <section className="mt-5 border-t border-slate-100 pt-4">{children}</section>;
}

export function GoalsArtifactSection({ children }: { children: ReactNode }) {
  return <section className="mt-5 border-t border-slate-100 pt-4">{children}</section>;
}

export function GoalsRuntimeStatusSection({ children }: { children: ReactNode }) {
  return <section className="mt-4 text-xs font-medium text-slate-600">{children}</section>;
}
