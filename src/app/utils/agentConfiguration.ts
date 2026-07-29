import type { Person } from '../types.ts';

export const AGENT_CONFIGURATION_KIND = 'omvra-agent-configurations';
export const AGENT_CONFIGURATION_VERSION = 1;

export interface PortableAgentConfiguration {
  id?: string;
  name: string;
  role: string;
  agentInstructions?: string;
  agentOperationalInstructions?: string;
  availableForSubagentDelegation?: boolean;
}

export interface AgentConfigurationFile {
  kind: typeof AGENT_CONFIGURATION_KIND;
  version: typeof AGENT_CONFIGURATION_VERSION;
  exportedAt: string;
  agents: PortableAgentConfiguration[];
}

export function buildAgentConfigurationFile(people: Person[], exportedAt = new Date().toISOString()): AgentConfigurationFile {
  return {
    kind: AGENT_CONFIGURATION_KIND,
    version: AGENT_CONFIGURATION_VERSION,
    exportedAt,
    agents: people.filter(person => person.kind === 'agentic').map(({ id, name, role, agentInstructions, agentOperationalInstructions, availableForSubagentDelegation }) => ({
      id,
      name,
      role,
      ...(agentInstructions ? { agentInstructions } : {}),
      ...(agentOperationalInstructions ? { agentOperationalInstructions } : {}),
      ...(availableForSubagentDelegation ? { availableForSubagentDelegation: true } : {}),
    })),
  };
}

export function parseAgentConfigurationFile(value: unknown): { ok: true; agents: PortableAgentConfiguration[] } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'This file does not contain agent configurations.' };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== AGENT_CONFIGURATION_KIND || candidate.version !== AGENT_CONFIGURATION_VERSION) {
    return { ok: false, error: 'This file is not a supported Omvra agent configuration export.' };
  }
  if (!Array.isArray(candidate.agents)) {
    return { ok: false, error: 'The agent configuration export must contain an agents array.' };
  }

  const ids = new Set<string>();
  const agents: PortableAgentConfiguration[] = [];
  for (const value of candidate.agents) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'Each agent configuration must be an object.' };
    }
    const agent = value as Record<string, unknown>;
    if (agent.id !== undefined && (typeof agent.id !== 'string' || !agent.id.trim() || ids.has(agent.id))) {
      return { ok: false, error: 'Agent configuration IDs must be unique text values.' };
    }
    if (typeof agent.name !== 'string' || !agent.name.trim() || typeof agent.role !== 'string' || !agent.role.trim()) {
      return { ok: false, error: 'Every agent configuration must include a name and role.' };
    }
    if (agent.agentInstructions !== undefined && typeof agent.agentInstructions !== 'string') {
      return { ok: false, error: 'Behavior instructions must be text.' };
    }
    if (agent.agentOperationalInstructions !== undefined && typeof agent.agentOperationalInstructions !== 'string') {
      return { ok: false, error: 'Operational instructions must be text.' };
    }
    if (agent.availableForSubagentDelegation !== undefined && typeof agent.availableForSubagentDelegation !== 'boolean') {
      return { ok: false, error: 'Subagent delegation availability must be true or false.' };
    }

    const id = typeof agent.id === 'string' ? agent.id.trim() : undefined;
    if (id) ids.add(id);
    agents.push({
      ...(id ? { id } : {}),
      name: agent.name.trim(),
      role: agent.role.trim(),
      ...(typeof agent.agentInstructions === 'string' && agent.agentInstructions.trim() ? { agentInstructions: agent.agentInstructions.trim() } : {}),
      ...(typeof agent.agentOperationalInstructions === 'string' && agent.agentOperationalInstructions.trim() ? { agentOperationalInstructions: agent.agentOperationalInstructions.trim() } : {}),
      ...(agent.availableForSubagentDelegation === true ? { availableForSubagentDelegation: true } : {}),
    });
  }

  return { ok: true, agents };
}
