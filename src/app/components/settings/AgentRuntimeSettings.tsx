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
  const [globalWorkspacePath, setGlobalWorkspacePath] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [contextReference, setContextReference] = useState('');
  const [prompt, setPrompt] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const runtimeBridge = window.electron?.agentRuntime;

  const load = async () => {
    if (!runtimeBridge) {
      setState({ schemaVersion: 1, profiles: [], defaults: { acpRuntimeAccessEnabled: true, globalProfileId: null, globalWorkspacePath: null, projectProfileIds: {} }, observations: {} });
      setFeedback('Agent runtime execution is available in the Omvra desktop app.');
      return;
    }
    const result = await runtimeBridge.getState();
    if (result.ok && result.value) {
      setState(result.value);
      setGlobalWorkspacePath(result.value.defaults.globalWorkspacePath || '');
    }
    else setFeedback(result.error || 'Unable to load runtime profiles.');
  };

  useEffect(() => { void load(); }, []);

  const profiles = state?.profiles || [];
  const acpRuntimeAccessEnabled = state?.defaults.acpRuntimeAccessEnabled !== false;
  const draftObservation = draft.id ? state?.observations[draft.id] : undefined;
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
      modelPreference: draft.modelPreference?.trim() || undefined,
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

  const saveGlobalWorkspacePath = async () => {
    if (!state || !runtimeBridge) return setFeedback('Runtime defaults can be saved in the Omvra desktop app.');
    setBusy(true);
    const result = await runtimeBridge.saveDefaults({
      ...state.defaults,
      globalWorkspacePath: globalWorkspacePath.trim() || null,
    });
    setBusy(false);
    if (!result.ok) return setFeedback(result.error || 'Unable to save the global working location.');
    setFeedback(globalWorkspacePath.trim() ? 'Global working location saved.' : 'Global working location cleared; repo-less tasks will use isolated scratch workspaces.');
    await load();
  };

  const toggleAcpRuntimeAccess = async (enabled: boolean) => {
    if (!state || !runtimeBridge) return setFeedback('ACP runtime access can be changed in the Omvra desktop app.');
    setBusy(true);
    const result = await runtimeBridge.saveDefaults({ ...state.defaults, acpRuntimeAccessEnabled: enabled });
    setBusy(false);
    if (!result.ok) return setFeedback(result.error || 'Unable to change ACP runtime access.');
    setFeedback(enabled ? 'Runtime access enabled.' : 'Runtime access disabled; connected agent access remains available.');
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
    setFeedback(result.ok ? `Connection ready: ${result.observation?.implementationName || resolved?.name || 'agent runtime'}.` : result.error || `Connection state: ${result.state}.`);
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

      <section className="space-y-2 rounded-xl border border-[#ececf0] p-4" aria-labelledby="runtime-access-toggle-title">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h3 id="runtime-access-toggle-title" className="text-base font-medium text-[#5f6068]">Allow runtime connections</h3>
            <p className="text-xs leading-5 text-[#7f8796]">When off, Omvra cannot start or hand off work to configured runtimes. Connected agent access and ordinary task/Goal behavior remain available.</p>
          </div>
          <Switch checked={acpRuntimeAccessEnabled} disabled={busy} aria-label="Toggle runtime connections" onCheckedChange={toggleAcpRuntimeAccess} />
        </div>
      </section>

      {acpRuntimeAccessEnabled && <>
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
                  {profile.integrationMode !== 'external-handoff' ? profile.executablePath : profile.externalUrlScheme ? `${profile.externalUrlScheme}:` : profile.executablePath}
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
          <label className="space-y-1"><span className="text-xs font-semibold text-[#71717a]">Mode</span><select value={draft.integrationMode} onChange={event => { const integrationMode = event.target.value as AgentRuntimeProfile['integrationMode']; setDraft({ ...draft, integrationMode, ...(integrationMode === 'codex-app-server-stdio' ? {} : { approvalPolicy: undefined }) }); }} className={`${FIELD_CLASS} w-full`}><option value="codex-app-server-stdio">Codex app-server over stdio</option><option value="claude-stream-json-stdio">Claude stream-json over stdio</option><option value="acp-local-stdio">ACP agent over stdio</option><option value="external-handoff">External handoff</option></select></label>
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Exact executable path</span><Input value={draft.executablePath || ''} placeholder="/absolute/path/to/agent" onChange={event => setDraft({ ...draft, executablePath: event.target.value })} className={FIELD_CLASS} />{draft.integrationMode === 'codex-app-server-stdio' && <span className="block text-xs leading-5 text-[#7f8796]">Select the installed Codex executable. Omvra launches its native app-server protocol automatically; no ACP adapter is required.</span>}{draft.integrationMode === 'claude-stream-json-stdio' && <span className="block text-xs leading-5 text-[#7f8796]">Select the installed Claude executable. Omvra uses Claude's native stream-json protocol; no ACP adapter is required.</span>}{draft.integrationMode === 'acp-local-stdio' && <span className="block text-xs leading-5 text-[#7f8796]">Works with any native ACP executable. Add required launch arguments one per line—for OpenCode, use <code>acp</code>.</span>}</label>
          {draft.integrationMode === 'external-handoff' && <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Approved URL scheme (optional)</span><Input value={draft.externalUrlScheme || ''} placeholder="codex" onChange={event => setDraft({ ...draft, externalUrlScheme: event.target.value })} className={FIELD_CLASS} /></label>}
          {draft.integrationMode === 'codex-app-server-stdio' && <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Approval prompts</span><select value={draft.approvalPolicy || ''} onChange={event => setDraft({ ...draft, approvalPolicy: (event.target.value || undefined) as AgentRuntimeProfile['approvalPolicy'] })} className={`${FIELD_CLASS} w-full`}><option value="">Use Codex default</option><option value="on-request">Ask when needed</option><option value="untrusted">Ask for untrusted actions</option><option value="never">Never ask</option></select><span className="block text-xs leading-5 text-[#7f8796]">Controls Codex runtime approval prompts for sessions started with this profile. Omvra lifecycle approval gates remain separate.</span>{draft.approvalPolicy === 'never' && <span className="block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Codex will not ask before permitted actions. Sandbox, filesystem, network, and Omvra MCP access restrictions still apply.</span>}</label>}
          {draft.integrationMode !== 'external-handoff' && <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Preferred model (optional)</span>{draftObservation?.models?.length ? <select value={draft.modelPreference || ''} onChange={event => setDraft({ ...draft, modelPreference: event.target.value || undefined })} className={`${FIELD_CLASS} w-full`}><option value="">Use runtime default</option>{draftObservation.models.map(model => <option key={model.id} value={model.id}>{model.id}{model.isDefault ? ' (default)' : ''}</option>)}</select> : <Input value={draft.modelPreference || ''} placeholder="Test connection to load advertised models" disabled={draft.id !== '' && draft.integrationMode !== 'claude-stream-json-stdio' && draftObservation?.modelSelection !== 'supported'} onChange={event => setDraft({ ...draft, modelPreference: event.target.value })} className={FIELD_CLASS} />}<span className="block text-xs leading-5 text-[#7f8796]">{draftObservation?.modelSelection === 'unsupported' ? 'This runtime does not advertise model selection.' : draftObservation?.models?.length ? 'Choose one of the models advertised by this runtime.' : 'Test the connection to load advertised models. Claude uses its native --model option when configured.'} A missing model blocks the session instead of silently switching models.</span></label>}
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Fixed arguments (one per line)</span><textarea value={fixedArgsText} onChange={event => setFixedArgsText(event.target.value)} className="min-h-20 w-full rounded-xl border border-[#e5e7eb] p-3 text-sm text-[#71717a]" /></label>
          <div className="flex items-center justify-between sm:col-span-2"><Label className="text-sm text-[#71717a]">Enabled</Label><Switch checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
          <button type="button" onClick={() => void saveProfile()} disabled={busy || !draft.name.trim()} className={`${PRIMARY_BUTTON_CLASS} sm:col-span-2`}><Plus className="size-4" />{draft.id ? 'Update profile' : 'Add profile'}</button>
        </div>
      </section>

      <section className="space-y-4 border-t border-[#ececf0] pt-6" aria-labelledby="runtime-defaults-title">
        <h3 id="runtime-defaults-title" className="text-base font-medium text-[#5f6068]">Defaults and resolution</h3>
        <label className="block space-y-1"><span className="text-xs font-semibold text-[#71717a]">Global default</span><select value={state?.defaults.globalProfileId || ''} onChange={event => void saveDefault('global', event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">Not configured</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <div className="space-y-2">
          <Label htmlFor="global-runtime-workspace" className="text-xs font-semibold text-[#71717a]">Global working location</Label>
          <div className="flex gap-2">
            <Input id="global-runtime-workspace" value={globalWorkspacePath} placeholder="/absolute/path/to/shared-workspace" onChange={event => setGlobalWorkspacePath(event.target.value)} className={`${FIELD_CLASS} min-w-0 flex-1`} />
            <button type="button" onClick={() => void saveGlobalWorkspacePath()} disabled={busy} className={BUTTON_CLASS}>Save location</button>
          </div>
          <p className="text-xs leading-5 text-[#7f8796]">Fallback for tasks in any project that have no task or project folder. This does not filter project lists. Leave empty to use an isolated Omvra scratch workspace per task.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-xs font-semibold text-[#71717a]">Project</span><select value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs font-semibold text-[#71717a]">Project default</span><select disabled={!selectedProjectId} value={selectedProjectId ? state?.defaults.projectProfileIds[selectedProjectId] || '' : ''} onChange={event => void saveDefault('project', event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">Use global default</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-[#71717a]">Execution override</span><select value={executionProfileId} onChange={event => setExecutionProfileId(event.target.value)} className={`${FIELD_CLASS} w-full`}><option value="">Use configured default</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        </div>
        <div className="rounded-xl bg-[#f8f8fa] p-3 text-sm text-[#5f6068]">Resolved runtime: <strong>{resolved?.name || 'Missing'}</strong>{resolved && !resolved.enabled ? ' (disabled)' : ''}</div>
      </section>

      <section className="space-y-4 border-t border-[#ececf0] pt-6" aria-labelledby="runtime-actions-title">
        <h3 id="runtime-actions-title" className="text-base font-medium text-[#5f6068]">Connection and handoff</h3>
        <label className="block space-y-1"><span className="text-xs font-semibold text-[#71717a]">Project/repository folder</span><Input value={workspacePath} placeholder="/absolute/path/to/project" onChange={event => setWorkspacePath(event.target.value)} className={FIELD_CLASS} /><span className="block text-xs leading-5 text-[#7f8796]">Local folder used as the agent runtime's working directory.</span></label>
        {!resolved ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Configure an enabled runtime before testing or handing off.</p>
        ) : resolved.integrationMode !== 'external-handoff' ? (
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
      </>}
      {!acpRuntimeAccessEnabled && feedback && <p role="status" className="flex items-start gap-2 rounded-xl bg-[#f8f8fa] p-3 text-xs leading-5 text-[#5f6068]"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{feedback}</p>}
    </div>
  );
}
