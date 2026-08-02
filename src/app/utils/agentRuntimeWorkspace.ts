export type AgentRuntimeWorkspaceSource = 'task-override' | 'project-default' | 'global-default' | 'scratch-workspace';

export interface AgentRuntimeWorkspaceResolution {
  workspacePath: string;
  source: AgentRuntimeWorkspaceSource;
}

interface ManagedWorkspaceResult {
  ok: boolean;
  value?: AgentRuntimeWorkspaceResolution;
  error?: string;
}

export function resolveConfiguredAgentWorkspace(
  taskWorkspacePath?: string,
  projectWorkspacePath?: string,
  globalWorkspacePath?: string | null,
): AgentRuntimeWorkspaceResolution | null {
  const taskPath = taskWorkspacePath?.trim();
  if (taskPath) return { workspacePath: taskPath, source: 'task-override' };

  const projectPath = projectWorkspacePath?.trim();
  if (projectPath) return { workspacePath: projectPath, source: 'project-default' };

  const globalPath = globalWorkspacePath?.trim();
  return globalPath ? { workspacePath: globalPath, source: 'global-default' } : null;
}

export async function resolveAgentRuntimeWorkspace(
  taskId: string,
  taskWorkspacePath: string | undefined,
  projectWorkspacePath: string | undefined,
  globalWorkspacePath: string | null | undefined,
  resolveManagedWorkspace: (taskId: string) => Promise<ManagedWorkspaceResult>,
): Promise<AgentRuntimeWorkspaceResolution> {
  const configured = resolveConfiguredAgentWorkspace(taskWorkspacePath, projectWorkspacePath, globalWorkspacePath);
  if (configured) return configured;

  try {
    const managed = await resolveManagedWorkspace(taskId);
    if (!managed.ok || !managed.value) throw new Error(managed.error || 'A scratch workspace could not be prepared.');
    return managed.value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No handler registered for 'agent-runtime/resolve-managed-workspace'")) {
      throw new Error('Restart Omvra to load the managed workspace service, then try Start work again.');
    }
    throw error;
  }
}

export function agentRuntimeWorkspaceSourceLabel(source?: AgentRuntimeWorkspaceSource): string {
  if (source === 'task-override') return 'Task override';
  if (source === 'project-default') return 'Project default';
  if (source === 'global-default') return 'Global location';
  if (source === 'scratch-workspace') return 'Scratch workspace';
  return 'Resolving';
}
