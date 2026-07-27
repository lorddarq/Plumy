import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidRetryTarget } from '../utils/goalCanvas.ts';
import { GOAL_TEMPLATES, instantiateGoalTemplate } from './goalTemplates.ts';

test('ships thirty-one valid goal templates with remapped graph references', () => {
  assert.equal(GOAL_TEMPLATES.length, 31);

  GOAL_TEMPLATES.forEach((template, index) => {
    let id = 0;
    const goal = instantiateGoalTemplate(template, prefix => `${prefix}_${index}_${id++}`);
    const elementIds = new Set(goal.elements.map(element => element.id));
    const root = goal.elements.find(element => element.type === 'goal');

    assert.ok(root, `${template.id} should include a goal root`);
    assert.equal(new Set(goal.elements.map(element => element.id)).size, goal.elements.length);
    assert.ok(goal.title.length > 0);
    goal.elements.filter(element => element.type === 'connector').forEach(connection => {
      assert.ok(connection.sourceId && elementIds.has(connection.sourceId), `${template.id} has a missing connector source`);
      assert.ok(connection.targetId && elementIds.has(connection.targetId), `${template.id} has a missing connector target`);
    });
  });
});

test('every template defines usable intake, agent work, deliverables, and acceptance', () => {
  GOAL_TEMPLATES.forEach(workflow => {
    assert.ok(workflow.elements.some(element => element.type === 'human-input'), `${workflow.id} should gather user context`);
    assert.ok(workflow.elements.some(element => element.type === 'agent'), `${workflow.id} should define agent work`);
    assert.ok(workflow.elements.some(element => element.type === 'deliverable' && element.deliverySpec?.instructions.trim()), `${workflow.id} should define a durable deliverable`);
    assert.ok(workflow.elements.some(element => element.type === 'approval-gate'), `${workflow.id} should require explicit acceptance`);
  });
});

test('every retry is bounded and returns to a valid earlier node', () => {
  GOAL_TEMPLATES.forEach(workflow => {
    workflow.elements.filter(element => element.type === 'retry').forEach(retry => {
      assert.ok(retry.retryMaxAttempts, `${workflow.id} should bound retries`);
      const returnEdge = workflow.elements.find(element => element.type === 'connector' && element.sourceId === retry.id);
      assert.ok(returnEdge?.targetId, `${workflow.id} should define a retry return edge`);
      assert.equal(isValidRetryTarget(workflow.elements, retry.id, returnEdge.targetId), true, `${workflow.id} should retry an earlier node`);
    });
  });
});

test('specialist research and implementation templates orchestrate multiple agents', () => {
  const expectedAgentCounts: Record<string, number> = {
    'competitive-analysis': 5,
    'implement-figma-website': 5,
    'ux-audit-product': 3,
    'market-research-product-market': 5,
    'define-evidence-based-personas': 3,
    'research-prospective-client': 5,
  };

  Object.entries(expectedAgentCounts).forEach(([templateId, minimum]) => {
    const workflow = GOAL_TEMPLATES.find(candidate => candidate.id === templateId);
    assert.ok(workflow, `${templateId} should exist`);
    assert.ok(workflow.elements.filter(element => element.type === 'agent').length >= minimum, `${templateId} should orchestrate at least ${minimum} agents`);
  });

  assert.equal(GOAL_TEMPLATES.find(template => template.id === 'ship-product-release')?.title, 'Release an existing product version');
  assert.equal(GOAL_TEMPLATES.find(template => template.id === 'release-new-feature')?.title, 'Design, build, and release a feature in an existing product');
});
