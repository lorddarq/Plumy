import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { Task, TimelineSwimlane } from '../../types';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

const FIELD_CLASS = 'h-9 rounded-xl border-[#e5e7eb] bg-white px-3 text-sm text-[#71717a]';
const BUTTON_CLASS = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#52525b] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON_CLASS = 'inline-flex h-9 items-center justify-center rounded-xl bg-[#0b0b1b] px-3 text-sm font-semibold text-white hover:bg-[#24243a] disabled:cursor-not-allowed disabled:opacity-50';

const EMPTY_PROFILE: AgentRuntimeProfile = {
  schemaVersion: 1,
  id: '',
  name: '',
  integrationMode: 'acp-local-stdio',
  executablePath: '',
  fixedArgs: [],
  enabled: true,
};

export function AgentRuntimeSettings({ projects, tasks }: { projects: TimelineSwimlane[]; tasks: Task[] }) {
  const [state, setState] = useState<AgentRuntimeState | null>(null);
  const [draft, setDraft] = useState<AgentRuntimeProfile>(EMPTY_PROFILE);
  const [fixedArgsText, setFixedArgsText] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [executionProfileId, setExecutionProfileId] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [contextReference, setContextReference] = useState('');
  const [prompt, setPrompt] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const runtimeBridge = window.electron?.agentRuntime;

  const load = async () => {
    if (!runtimeBridge) {
      setState({ schemaVersion: 1, profiles: [], defaults: { globalProfileId: null, projectProfileIds: {} }, observations: {} });
      setFeedback('Agent runtime execution is available in the Omvra desktop app.');
      return;
    }
    const result = await runtimeBridge.getState();
    if (result.ok && result.value) setState(result.value);
    else setFeedback(result.error || 'Unable to load runtime profiles.');
  };

  useEffect(() => { void load(); }, []);

  const profiles = state?.profiles || [];
  const selectedTask = tasks.find(task => task.id === selectedTaskId);
  const resolved = (() => {
    if (!state) return null;
    const profileId = executionProfileId
      || (selectedProjectId ? state.defaults.projectProfileIds[selectedProjectId] : '')
      || state.defaults.globalProfileId;
    return profileId ? profiles.find(profile => profile.id === profileId) || null : null;
  })();

  const saveProfile = async () => {
    if (!runtimeBridge) return setFeedback('Agent runtime profiles can be saved in the Omvra desktop app.');
    setBusy(true);
    const id = draft.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `runtime-${Date.now()}`);
    const result = await runtimeBridge.saveProfile({
      ...draft,
      id,
      fixedArgs: fixedArgsText.split('\n').map(value => value.trim()).filter(Boolean),
      executablePath: draft.executablePath?.trim() || undefined,
      externalUrlScheme: draft.externalUrlScheme?.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) return setFeedback(result.error || 'Unable to save runtime profile.');
    setDraft(EMPTY_PROFILE);
    setFixedArgsText('');
    setFeedback('Runtime profile saved.');
    await load();
  };

  const saveDefault = async (scope: 'global' | 'project', profileId: string) => {
    if (!state || !runtimeBridge) return setFeedback('Runtime defaults can be saved in the Omvra desktop app.');
    const defaults = {
      ...state.defaults,
      globalProfileId: scope === 'global' ? (profileId || null) : state.defaults.globalProfileId,
      projectProfileIds: scope === 'project' && selectedProjectId
        ? { ...state.defaults.projectProfileIds, [selectedProjectId]: profileId }
        : state.defaults.projectProfileIds,
    };
    if (scope === 'project' && selectedProjectId && !profileId) delete defaults.projectProfileIds[selectedProjectId];
    const result = await runtimeBridge.saveDefaults(defaults);
    if (!result.ok) return setFeedback(result.error || 'Unable to save runtime defaults.');
    setFeedback('Runtime default saved.');
    await load();
  };

  const testResolvedConnection = async () => {
    if (!runtimeBridge) return setFeedback('Connection testing requires the Omvra desktop app.');
    setBusy(true);
    const result = await runtimeBridge.testConnection({
      workspacePath,
      projectId: selectedProjectId || undefined,
      executionProfileId: executionProfileId || undefined,
    });
    setBusy(false);
    setFeedback(result.ok ? `Connection ready: ${result.observation?.implementationName || resolved?.name || 'ACP agent'}.` : result.error || `Connection state: ${result.state}.`);
    await load();
  };

  const openExternal = async () => {
    if (!selectedTask || !runtimeBridge) return setFeedback('External handoff requires the Omvra desktop app.');
    setBusy(true);
    const result = await runtimeBridge.openExternal({
      workspacePath,
      taskId: selectedTask.id,
      contextReference,
      prompt,
      projectId: selectedProjectId || undefined,
      executionProfileId: executionProfileId || undefined,
    });
    setBusy(false);
    setFeedback(result.ok ? 'External handoff opened. Omvra recorded intent only; task state was not changed.' : result.error || `Handoff state: ${result.state}.`);
  };

  return (
    <div className="space-y-8">
      <p className="max-w-[38rem] text-xs leading-5 text-[#7f8796]">
        Profiles contain configuration only—never credentials. Omvra uses the exact resolved profile and does not silently fall back to another runtime.
      </p>

      <section className="space-y-4" aria-labelledby="runtime-profiles-title">
        <h3 id="runtime-profiles-title" className="text-base font-medium text-[#5f6068]">Runtime profiles</h3>
        {profiles.map(profile => {
          const observation = state?.observations[profile.id];
          return (
            <div key={profile.id} className="flex items-start justify-between gap-4 rounded-xl border border-[#ececf0] p-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => {
                setDraft(profile);
                setFixedArgsText(profile.fixedArgs.join('\n'));
              }}>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#52525b]">
                  {profile.name}
                  {!profile.enabled && <span className="text-xs font-normal text-[#a1a1aa]">Disabled</span>}
                </div>
                <p className="mt-1 break-all text-xs text-[#7f8796]">
                  {profile.integrationMode === 'acp-local-stdio' ? profile.executablePath : profile.externalUrlScheme ? `${profile.externalUrlScheme}:` : profile.executablePath}
                </p>
                <p className="mt-1 text-xs text-[#7f8796]">Observed: {observation?.state || 'not tested'}</p>
              </button>
              <button type="button" aria-label={`Delete ${profile.name}`} className="rounded-lg p-2 text-[#a1a1aa] hover:bg-red-50 hover:text-red-600" onClick={async () => {
                if (!runtimeBridge) return setFeedback('Runtime profiles can be deleted in the Omvra desktop app.');
                await runtimeBridge.deleteProfile(profile.id);
                await load();
              }}><Trash2 className="size-4" /></button>
            </div>
          );
        })}
        {!profiles.length && <p className="text-sm text-[#8a8a92]">No runtime profiles configured.</p>}

        <div className="grid gap-3 rounded-xl border border-[#ececf0] p-4 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-xs font-semibold text-[#71717a]">Name</span><Input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={FIELD_CLASS} /></label>
          <label className="space-y-1"><span className="text-xs font-semibold text-[#71717a]">Mode</span><select value={draft.integrationMode} onChange={event => setDraft({ ...draft, integrationMode: event.target.value as AgentRuntimeProfile['integrationMode'] })} className={`${FIELD_CLASS} w-full`}><option value="acp-local-stdio">Local ACP over stdio</option><option value="external-handoff">External handoff</option></select></label>
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Exact executable path</span><Input value={draft.executablePath || ''} placeholder="/absolute/path/to/agent" onChange={event => setDraft({ ...draft, executablePath: event.target.value })} className={FIELD_CLASS} /></label>
          {draft.integrationMode === 'external-handoff' && <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Approved URL scheme (optional)</span><Input value={draft.externalUrlScheme || ''} placeholder="codex" onChange={event => setDraft({ ...draft, externalUrlScheme: event.target.value })} className={FIELD_CLASS} /></label>}
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Fixed arguments (one per line)</span><textarea value={fixedArgsText} onChange={event => setFixedArgsText(event.target.value)} className="min-h-20 w-full rounded-xl border border-[#e5e7eb] p-3 text-sm text-[#71717a]" /></label>
          <div className="flex items-center justify-between sm:col-span-2"><Label className="text-sm text-[#71717a]">Enabled</Label><Switch checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
          <button type="button" onClick={() => void saveProfile()} disabled={busy || !draft.name.trim()} className={`${PRIMARY_BUTTON_CLASS} sm:col-span-2`}><Plus className="size-4" />{draft.id ? 'Update profile' : 'Add profile'}</button>
        </div>
      </section>

      <section className="space-y-4 border-t border-[#ececf0] pt-6" aria-labelledby="runtime-defaults-title">
        <h3 id="runtime-defaults-title" className="text-base font-medium text-[#5f6068]">Defaults and resolution</h3>
        <label className="block space-y-1"><span className="text-xs font-semibold text-[#71717a]">Global default</span><select value={state?.defaults.globalProfileId || ''} onChange={event => void saveDefault('global', event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">Not configured</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-xs font-semibold text-[#71717a]">Project</span><select value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs font-semibold text-[#71717a]">Project default</span><select disabled={!selectedProjectId} value={selectedProjectId ? state?.defaults.projectProfileIds[selectedProjectId] || '' : ''} onChange={event => void saveDefault('project', event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">Use global default</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Execution override</span><select value={executionProfileId} onChange={event => setExecutionProfileId(event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">Use configured default</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        </div>
        <div className="rounded-xl bg-[#f8f8fa] p-3 text-sm text-[#5f6068]">Resolved runtime: <strong>{resolved?.name || 'Missing'}</strong>{resolved && !resolved.enabled ? ' (disabled)' : ''}</div>
      </section>

      <section className="space-y-4 border-t border-[#ececf0] pt-6" aria-labelledby="runtime-actions-title">
        <h3 id="runtime-actions-title" className="text-base font-medium text-[#5f6068]">Connection and handoff</h3>
        <label className="block space-y-1"><span className="text-xs font-semibold text-[#71717a]">Workspace path</span><Input value={workspacePath} placeholder="/absolute/path/to/workspace" onChange={event => setWorkspacePath(event.target.value)} className={FIELD_CLASS} /></label>
        {!resolved ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Configure an enabled runtime before testing or handing off.</p>
        ) : resolved.integrationMode === 'acp-local-stdio' ? (
          <button type="button" onClick={() => void testResolvedConnection()} disabled={busy || !workspacePath.trim()} className={BUTTON_CLASS}>Test connection</button>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1"><span className="text-xs font-semibold text-[#71717a]">Task</span><select value={selectedTaskId} onChange={event => {
              const task = tasks.find(item => item.id === event.target.value);
              setSelectedTaskId(event.target.value);
              setContextReference(task ? `omvra://task/${task.id}` : '');
              setPrompt(task ? `Continue work on task: ${task.title}` : '');
            }} className={`${FIELD_CLASS} w-full`}><option value="">Select task</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
            <label className="block space-y-1"><span className="text-xs font-semibold text-[#71717a]">Context reference</span><Input value={contextReference} onChange={event => setContextReference(event.target.value)} className={FIELD_CLASS} /></label>
            <label className="block space-y-1"><span className="text-xs font-semibold text-[#71717a]">Bounded prompt</span><textarea maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} className="min-h-20 w-full rounded-xl border border-[#e5e7eb] p-3 text-sm text-[#71717a]" /></label>
            <button type="button" onClick={() => void openExternal()} disabled={busy || !workspacePath.trim() || !selectedTask || !contextReference.trim() || !prompt.trim()} className={PRIMARY_BUTTON_CLASS}>Open externally</button>
          </div>
        )}
        {feedback && <p role="status" className="flex items-start gap-2 rounded-xl bg-[#f8f8fa] p-3 text-xs leading-5 text-[#5f6068]"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{feedback}</p>}
      </section>
    </div>
  );
}
