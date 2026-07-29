import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentConfigurationFile, parseAgentConfigurationFile } from './agentConfiguration.ts';

test('agent configuration round-trips the complete portable agent roster', () => {
  const file = buildAgentConfigurationFile([{
    id: 'agent-1', name: 'Researcher', role: 'Research', kind: 'agentic', agentInstructions: 'Find evidence.', agentOperationalInstructions: 'Cite sources.', availableForSubagentDelegation: true,
  }], '2026-07-23T00:00:00.000Z');

  assert.deepEqual(parseAgentConfigurationFile(file), { ok: true, agents: file.agents });
  assert.deepEqual(file.agents, [{ id: 'agent-1', name: 'Researcher', role: 'Research', agentInstructions: 'Find evidence.', agentOperationalInstructions: 'Cite sources.', availableForSubagentDelegation: true }]);
});

test('agent configuration parser rejects unsupported files', () => {
  assert.equal(parseAgentConfigurationFile({ kind: 'other', version: 1, name: 'Agent', role: 'Role' }).ok, false);
});
