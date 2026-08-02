export type AgentRuntimeWorkspaceSource = 'task-override' | 'project-default' | 'global-default' | 'scratch-workspace';

export interface AgentRuntimeWorkspaceResolution {
  workspacePath: string;
  source: AgentRuntimeWorkspaceSource;
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

export function resolveAgentRuntimeWorkspace(
  taskWorkspacePath: string | undefined,
  projectWorkspacePath: string | undefined,
  globalWorkspacePath: string | null | undefined,
): AgentRuntimeWorkspaceResolution {
  const configured = resolveConfiguredAgentWorkspace(taskWorkspacePath, projectWorkspacePath, globalWorkspacePath);
  if (configured) return configured;
  throw new Error('Configure a repository folder on the task or project before starting work.');
}

export function agentRuntimeWorkspaceSourceLabel(source?: AgentRuntimeWorkspaceSource): string {
  if (source === 'task-override') return 'Task override';
  if (source === 'project-default') return 'Project default';
  if (source === 'global-default') return 'Global location';
  if (source === 'scratch-workspace') return 'Scratch workspace';
  return 'Resolving';
}
