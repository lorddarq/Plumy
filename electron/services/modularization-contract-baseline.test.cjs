const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceService = require('./workspace-service.cjs');
const { createRequestDispatcher } = require('./mcp-http-server.cjs');
const { PUBLIC_READ_TOOL_DEFINITIONS, PUBLIC_WRITE_TOOL_DEFINITIONS } = require('./mcp-registry.cjs');
const { makeStoreFromFixture } = require('./test-fixtures.cjs');

const REPO_ROOT = path.resolve(__dirname, '../..');

const WORKSPACE_FACADE_EXPORTS = [
  'COLLABORATION_SCHEMA_VERSION',
  'DEFAULT_MCP_CAPABILITY_PROFILE',
  'DEFAULT_MCP_HOST',
  'DEFAULT_MCP_PATH',
  'DEFAULT_MCP_PORT',
  'GOAL_ARTIFACT_AUDIT_KEY',
  'GOAL_MUTATION_COMMANDS_KEY',
  'GOAL_PROJECT_BINDING_AUDIT_KEY',
  'MCP_AUDIT_LOG_KEY',
  'MCP_BOARD_WATCHERS_KEY',
  'MCP_CAPABILITY_PROFILES',
  'MCP_PROTOCOL_VERSION',
  'MCP_SERVER_NAME',
  'MCP_TASK_REV_FIELD',
  'MILESTONES_KEY',
  'PREFERENCES_KEY',
  'REQUIRES_HUMAN_REVIEW_STATUS_ID',
  'REQUIRES_HUMAN_REVIEW_STATUS_TITLE',
  'TASK_COLLABORATION_EVENTS_KEY',
  'TASK_CONTEXT_ENTRIES_KEY',
  'TASK_CONTEXT_SCHEMA_VERSION',
  'TASK_CONTRIBUTION_ATTEMPTS_KEY',
  'addTaskActivityEntry',
  'addTaskComment',
  'appendMcpAuditLog',
  'appendTaskContextEntry',
  'archiveMcpAuditEntries',
  'assignTaskToPerson',
  'attachTaskFile',
  'buildMcpAgentGuide',
  'buildMcpAuditSummary',
  'buildMcpCapabilitySnapshot',
  'buildMcpInitializeResult',
  'buildMcpListenerStatus',
  'buildMcpPromptCatalog',
  'buildMcpTaskExecutionSchema',
  'completeTaskAndRequestReview',
  'createMilestone',
  'createTask',
  'deleteMilestone',
  'deleteTask',
  'getBoardWatcherState',
  'getGoalById',
  'getMcpAccessTokenStatus',
  'getMcpCapabilityProfile',
  'getMcpPrompt',
  'getMcpServerConfig',
  'getMilestoneById',
  'getTaskById',
  'getTaskCollaborationHistory',
  'getTaskContextEntry',
  'getWorkspaceSnapshot',
  'isMcpAccessTokenExpired',
  'isMcpAgentAccessEnabled',
  'linkMilestoneTasks',
  'listAssignedWorkForAgent',
  'listBoardWatcherStates',
  'listGoals',
  'listKanbanCards',
  'listMcpAuditLog',
  'listMilestones',
  'listTaskContextEntries',
  'listTasks',
  'listTimelineCards',
  'logTaskTime',
  'moveTaskToReadyForHumanReview',
  'moveTaskToStatus',
  'moveTasksToRequiresHumanReviewBoard',
  'pollBoardWatcher',
  'removeTaskAttachment',
  'resolveGoalAgentDispatch',
  'resolveTaskExecutionContext',
  'transitionTaskToUnderReview',
  'transitionTaskContribution',
  'updateGoal',
  'updateGoalArtifactReferences',
  'updateGoalElement',
  'updateGoalProjectBindings',
  'updateMilestone',
  'updateTaskAgentSummary',
  'updateTaskCollaboration',
  'updateTaskCompletionDescription',
  'updateTaskDescription',
  'updateTaskDetails',
].sort();

const ADMIN_MCP_TOOLS = [
  'agent_resolve_task_context',
  'boards_watch_poll',
  'cards_kanban_list',
  'cards_timeline_list',
  'diagnostics_audit_summary',
  'goals_gc',
  'goals_get',
  'goals_lifecycle',
  'goals_list',
  'goals_update',
  'goals_update_artifacts',
  'goals_update_connector',
  'goals_update_element',
  'goals_update_project_bindings',
  'milestones_create',
  'milestones_delete',
  'milestones_get',
  'milestones_link_tasks',
  'milestones_list',
  'milestones_update',
  'skills_get',
  'skills_list',
  'task_write',
  'tasks_add_activity_entry',
  'tasks_add_comment',
  'tasks_assign',
  'tasks_attach_file',
  'tasks_complete_and_request_review',
  'tasks_collaboration_history',
  'tasks_context_append',
  'tasks_context_get',
  'tasks_context_list',
  'tasks_create',
  'tasks_delete',
  'tasks_get',
  'tasks_list',
  'tasks_log_time',
  'tasks_move_to_ready_for_human_review',
  'tasks_move_to_requires_human_review',
  'tasks_move_to_status',
  'tasks_remove_attachment',
  'tasks_transition_under_review',
  'tasks_transition_contribution',
  'tasks_update',
  'tasks_update_agent_summary',
  'tasks_update_collaboration',
  'tasks_update_completion_description',
  'tasks_update_description',
  'workspace_get_snapshot',
].sort();

const RENDERER_WORKSPACE_KEYS = [
  'omvra.mcp.agentWatchConfigs.v1',
  'omvra.milestones.v1',
  'omvra.people.v1',
  'omvra.preferences.v1',
  'omvra.statusColumns.v1',
  'omvra.swimlanes.v1',
  'omvra.tasks.v1',
].sort();

const IPC_INVOKE_CHANNELS = [
  'agent-configurations/export',
  'agent-runtime/delete-profile',
  'agent-runtime/get-state',
  'agent-runtime/open-external',
  'agent-runtime/resolve',
  'agent-runtime/save-defaults',
  'agent-runtime/save-profile',
  'agent-runtime/test-connection',
  'app/get-runtime-info',
  'attachments/embed',
  'attachments/pick',
  'attachments/reveal',
  'attachments/verify',
  'goal-audit/pick-directory',
  'goal-policy/record-impact',
  'goals/get-runtime',
  'goals/reset-execution',
  'goals/update',
  'goals/update-artifacts',
  'mcp/get-audit-log',
  'mcp/get-audit-summary',
  'mcp/get-capabilities',
  'mcp/get-listener-status',
  'mcp/restart-server',
  'mcp/workspace/snapshot',
  'open-external',
  'skills/pick-directory',
  'store/delete',
  'store/export',
  'store/get',
  'store/set',
  'tasks/export-pdf',
  'updates/check',
  'updates/dismiss',
  'updates/download',
  'updates/get-state',
  'updates/install',
  'updates/set-channel',
].sort();

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function collectFiles(directory, predicate) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath, predicate);
    return predicate(filePath) ? [filePath] : [];
  });
}

function collectMatches(source, expression) {
  return [...source.matchAll(expression)].map(match => match[1]);
}

function assertAcyclicCommonJsModules(relativePaths) {
  const modulePaths = new Set(relativePaths.map(relativePath => path.join(REPO_ROOT, relativePath)));
  const dependencies = new Map([...modulePaths].map(filePath => {
    const requires = collectMatches(fs.readFileSync(filePath, 'utf8'), /require\(['"](\.[^'"]+)['"]\)/g)
      .map(specifier => path.resolve(path.dirname(filePath), specifier))
      .filter(dependencyPath => modulePaths.has(dependencyPath));
    return [filePath, requires];
  }));
  const visiting = new Set();
  const visited = new Set();

  function visit(filePath, chain = []) {
    if (visiting.has(filePath)) {
      assert.fail(`Circular modularization dependency: ${[...chain, filePath]
        .map(item => path.relative(REPO_ROOT, item)).join(' -> ')}`);
    }
    if (visited.has(filePath)) return;
    visiting.add(filePath);
    for (const dependencyPath of dependencies.get(filePath) || []) visit(dependencyPath, [...chain, filePath]);
    visiting.delete(filePath);
    visited.add(filePath);
  }

  for (const filePath of modulePaths) visit(filePath);
}

test('workspace service keeps the characterized compatibility facade', () => {
  assert.deepEqual(Object.keys(workspaceService).sort(), WORKSPACE_FACADE_EXPORTS);
  assert.equal(workspaceService.MCP_TASK_REV_FIELD, '__mcpRevision');
});

test('admin MCP profile advertises the characterized public tool names', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set('omvra.preferences.v1', {
    mcpAgentAccessEnabled: true,
    mcpCapabilityProfile: 'admin',
  });
  const dispatch = createRequestDispatcher(store);
  const response = dispatch({
    jsonrpc: '2.0',
    id: 'modularization-contract-tools',
    method: 'tools/list',
    params: {},
  }, { transport: 'stdio', headers: {} });

  assert.deepEqual(response.result.tools.map(tool => tool.name).sort(), ADMIN_MCP_TOOLS);
});

test('HTTP and stdio dispatch advertise the shared MCP registry', () => {
  const store = makeStoreFromFixture('workspace-basic');
  store.set('omvra.preferences.v1', {
    mcpAgentAccessEnabled: true,
    mcpCapabilityProfile: 'admin',
  });
  const dispatch = createRequestDispatcher(store);
  const request = {
    jsonrpc: '2.0',
    id: 'modularization-shared-registry',
    method: 'tools/list',
    params: {},
  };
  const expectedNames = [...PUBLIC_READ_TOOL_DEFINITIONS, ...PUBLIC_WRITE_TOOL_DEFINITIONS]
    .map(tool => tool.name)
    .sort();

  for (const transport of ['http', 'stdio']) {
    const response = dispatch(request, { transport, headers: {} });
    assert.deepEqual(response.result.tools.map(tool => tool.name).sort(), expectedNames);
  }
});

test('MCP transport and handler modules keep their characterized boundaries', () => {
  const transportSource = read('electron/services/mcp-http-server.cjs');
  const handlerSource = [
    read('electron/services/mcp-handlers.cjs'),
    read('electron/services/mcp-resource-handlers.cjs'),
  ].join('\n');

  assert.doesNotMatch(handlerSource, /http\.createServer|server\.listen|Access-Control-Allow-Origin/);
  assert.doesNotMatch(transportSource, /\b(createTask|updateTaskDetails|createMilestone|linkMilestoneTasks)\s*\(/);
  assert.match(transportSource, /require\('\.\/mcp-registry\.cjs'\)/);
  assert.match(transportSource, /require\('\.\/mcp-audit-adapter\.cjs'\)/);
});

test('renderer workspace provider keeps its public exports and persistence keys', () => {
  const storeDirectory = path.join(REPO_ROOT, 'src/app/store');
  const storeSource = collectFiles(storeDirectory, filePath => /\.(ts|tsx)$/.test(filePath))
    .map(filePath => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
  const workspaceStoreSource = read('src/app/store/workspaceStore.tsx');
  const storageKeys = [...new Set(collectMatches(storeSource, /['\"](omvra\.[A-Za-z0-9.-]+\.v\d+)['\"]/g))]
    .filter(key => RENDERER_WORKSPACE_KEYS.includes(key))
    .sort();

  assert.deepEqual(storageKeys, RENDERER_WORKSPACE_KEYS);
  assert.match(workspaceStoreSource, /export function WorkspaceStoreProvider\(/);
  assert.match(workspaceStoreSource, /export function useWorkspaceStore\(/);
  assert.match(workspaceStoreSource, /export function createDefaultAppPreferences\(/);
  assert.match(storeSource, /window\.electron\?\.storeExport\?\.\(\)/);
  assert.match(storeSource, /window\.electron\?\.onStoreChanged\?\.\(/);
});

test('preload invoke channels exactly match registered IPC handlers', () => {
  const preloadSource = read('electron/preload.cjs');
  const invokeChannels = [...new Set(collectMatches(preloadSource, /ipcRenderer\.invoke\('([^']+)'/g))].sort();
  const registrarFiles = [
    path.join(REPO_ROOT, 'electron/main.cjs'),
    ...collectFiles(path.join(REPO_ROOT, 'electron/ipc'), filePath => filePath.endsWith('.cjs')),
    ...collectFiles(path.join(REPO_ROOT, 'electron/services'), filePath => filePath.endsWith('-ipc.cjs')),
  ];
  const registeredChannels = [...new Set(registrarFiles.flatMap(filePath => (
    collectMatches(fs.readFileSync(filePath, 'utf8'), /ipcMain\.handle\('([^']+)'/g)
  )))].sort();

  assert.deepEqual(invokeChannels, IPC_INVOKE_CHANNELS);
  assert.deepEqual(registeredChannels, IPC_INVOKE_CHANNELS);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('electron'/);
  for (const eventChannel of ['store/did-change', 'updates/state-changed', 'goals/runtime-changed']) {
    assert.match(preloadSource, new RegExp(eventChannel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Electron main composes IPC registrars while retaining application lifecycle ownership', () => {
  const mainSource = read('electron/main.cjs');
  const registrarSource = [
    'store.cjs',
    'goals.cjs',
    'documents.cjs',
    'attachments.cjs',
    'external-links.cjs',
    'agent-runtime.cjs',
    'runtime.cjs',
  ].map(fileName => read(`electron/ipc/${fileName}`)).join('\n');

  assert.doesNotMatch(mainSource, /ipcMain\.handle\(/);
  assert.match(mainSource, /new BrowserWindow\(/);
  assert.match(mainSource, /app\.whenReady\(\)/);
  assert.doesNotMatch(registrarSource, /require\(['"]\.\.\/services\/(?:workspace|goal-[^'"]+)-service\.cjs['"]\)/);
});

test('modularization extension boundaries remain acyclic with one domain rule owner', () => {
  const domainFiles = collectFiles(
    path.join(REPO_ROOT, 'electron/domain'),
    filePath => filePath.endsWith('.cjs') && !filePath.endsWith('.test.cjs'),
  );
  const domainSource = domainFiles.map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
  const adapterSource = [
    read('electron/services/mcp-handlers.cjs'),
    read('electron/services/mcp-resource-handlers.cjs'),
    read('electron/services/mcp-http-server.cjs'),
  ].join('\n');

  assert.doesNotMatch(domainSource, /require\(['"](?:\.\.\/ipc|\.\.\/services\/mcp-|\.\.\/main|\.\.\/\.\.\/src\/app)/);
  assert.doesNotMatch(adapterSource, /store\.(?:get|set)\(['"]omvra\.(?:tasks|milestones|people)\.v\d+/);
  assert.doesNotMatch(adapterSource, /['"](?:DEPENDENCY_CYCLE|TASK_REFERENCE_NOT_FOUND|INVALID_TASK_REFERENCE)['"]/);

  assertAcyclicCommonJsModules([
    ...domainFiles.map(filePath => path.relative(REPO_ROOT, filePath)),
    'electron/services/workspace-service.cjs',
    'electron/services/mcp-registry.cjs',
    'electron/services/mcp-handlers.cjs',
    'electron/services/mcp-resource-handlers.cjs',
    'electron/services/mcp-response.cjs',
    'electron/services/mcp-audit-adapter.cjs',
    'electron/services/mcp-http-server.cjs',
    'electron/ipc/mcp.cjs',
    'electron/ipc/store.cjs',
    'electron/ipc/goals.cjs',
    'electron/ipc/documents.cjs',
    'electron/ipc/attachments.cjs',
    'electron/ipc/external-links.cjs',
    'electron/ipc/runtime.cjs',
    'electron/main.cjs',
  ]);
});
