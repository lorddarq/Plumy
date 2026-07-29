const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { getBundledSkillsRoot, getUserSkillsRoot, listBundledSkills, listAvailableSkills, getAvailableSkill, resolveRequiredSkills } = require('./skill-service.cjs');

const skillsRoot = path.resolve(__dirname, '../../src/skills');

test('bundled skill catalog resolves from the local source tree', () => {
  assert.equal(getBundledSkillsRoot({ skillsRoot }), skillsRoot);
  const skills = listBundledSkills({ skillsRoot });
  assert.ok(skills.length >= 15);
  assert.ok(skills.some(skill => skill.skillId === 'business-problem-framing'));
  assert.ok(skills.every(skill => skill.source === 'omvra-bundled'));
});

test('bundled skill reads are constrained to manifest entries', () => {
  const skill = getAvailableSkill('process-modeler', { skillsRoot, userDataPath: path.resolve(__dirname, '../../.tmp-skill-user-data') });
  assert.equal(skill.skillId, 'process-modeler');
  assert.match(skill.content, /process model/i);
  assert.equal(getAvailableSkill('not-installed', { skillsRoot, userDataPath: path.resolve(__dirname, '../../.tmp-skill-user-data') }), null);
});

test('user-local skills are discovered outside the packaged bundle', () => {
  const userDataPath = path.resolve(__dirname, '../../.tmp-skill-user-data');
  const userSkillsRoot = getUserSkillsRoot({ userDataPath });
  const fs = require('node:fs');
  fs.mkdirSync(path.join(userSkillsRoot, 'custom'), { recursive: true });
  fs.writeFileSync(path.join(userSkillsRoot, 'custom', 'release-readiness.md'), '# Release readiness\n');
  const skills = listAvailableSkills({ skillsRoot, userDataPath });
  assert.ok(skills.some(skill => skill.skillId === 'release-readiness' && skill.source === 'omvra-user'));
  fs.rmSync(path.resolve(__dirname, '../../.tmp-skill-user-data'), { recursive: true, force: true });
});

test('required skills resolve bundled metadata and explicit local overrides in order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-skills-'));
  const entrypoint = path.join(root, 'override.md');
  fs.writeFileSync(entrypoint, '# Override\n');
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1, skills: [{
    skillId: 'process-modeler', version: '1.2.0', name: 'Override', summary: 'Local override',
    supportedStages: ['qa'], supportedPersonas: ['qa'], entrypoint: 'override.md', trustStatus: 'trusted',
  }] }));
  const resolved = resolveRequiredSkills([{ skillId: 'process-modeler', version: '^1.0.0', stage: 'qa', persona: 'qa' }], { skillsRoot, skillRoots: [{ root }] });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.skills[0].source, 'omvra-configured');
  assert.equal(resolved.skills[0].version, '1.2.0');
  fs.rmSync(root, { recursive: true, force: true });
});

test('configured external skills resolve from SKILL.md without a manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-skills-'));
  const skillRoot = path.join(root, 'external-review');
  fs.mkdirSync(skillRoot);
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# External review\n');

  const options = { skillsRoot, skillRoots: [{ root }] };
  const available = getAvailableSkill('external-review', options);
  assert.equal(available.source, 'omvra-configured');
  assert.equal(available.manifestPath, undefined);
  assert.equal(available.trustStatus, 'trusted');
  assert.match(available.content, /External review/);

  const resolved = resolveRequiredSkills([{ skillId: 'external-review' }], options);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.skills[0].source, 'omvra-configured');
  assert.equal(resolved.skills[0].trustStatus, 'trusted');

  const blocked = resolveRequiredSkills([{ skillId: 'external-review' }], {
    skillsRoot,
    skillRoots: [{ root, trustStatus: 'untrusted' }],
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockingResults[0].code, 'UNTRUSTED_SKILL');
  fs.rmSync(root, { recursive: true, force: true });
});

test('required skill failures are typed and block setup without installation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-skills-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), '{"schemaVersion": 9}');
  const invalid = resolveRequiredSkills([{ skillId: 'missing-skill' }], { skillsRoot, skillRoots: [{ root }] });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.blockingResults[0].code, 'MISSING_SKILL');
  assert.equal(invalid.diagnostics.some(item => item.code === 'INVALID_MANIFEST'), true);

  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1, skills: [{
    skillId: 'untrusted', version: '1.0.0', entrypoint: 'untrusted.md', trustStatus: 'untrusted',
  }, { skillId: 'tampered', version: '1.0.0', entrypoint: 'tampered.md', trustStatus: 'trusted', integrityHash: 'sha256-invalid' }] }));
  fs.writeFileSync(path.join(root, 'untrusted.md'), '# Untrusted\n');
  fs.writeFileSync(path.join(root, 'tampered.md'), '# Tampered\n');
  const failed = resolveRequiredSkills([{ skillId: 'untrusted' }, { skillId: 'tampered' }, { skillId: 'not-there' }], { skillsRoot, skillRoots: [{ root }] });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.blockingResults.map(item => item.code), ['UNTRUSTED_SKILL', 'INTEGRITY_FAILURE', 'MISSING_SKILL']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('malformed bundled manifests produce a typed resolver result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-skills-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), '{"schemaVersion": 9}');
  const result = resolveRequiredSkills([{ skillId: 'process-modeler' }], { skillsRoot: root });
  assert.equal(result.ok, false);
  assert.equal(result.blockingResults[0].code, 'MISSING_SKILL');
  assert.equal(result.diagnostics[0].code, 'INVALID_MANIFEST');
  fs.rmSync(root, { recursive: true, force: true });
});

test('configured skills remain usable when the bundled catalog is unavailable', () => {
  const bundledRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-bundled-skills-'));
  const configuredRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-configured-skills-'));
  fs.writeFileSync(path.join(configuredRoot, 'local.md'), '# Local skill\n');
  fs.writeFileSync(path.join(configuredRoot, 'manifest.json'), JSON.stringify({ schemaVersion: 1, skills: [{
    skillId: 'local-skill', version: '1.0.0', entrypoint: 'local.md', supportedStages: ['implementation'], supportedPersonas: ['backend-engineer'], trustStatus: 'trusted',
  }] }));
  fs.writeFileSync(path.join(bundledRoot, 'manifest.json'), '{"schemaVersion": 9}');

  const result = resolveRequiredSkills([{ skillId: 'local-skill', stage: 'implementation', persona: 'backend-engineer' }], {
    skillsRoot: bundledRoot,
    skillRoots: [{ root: configuredRoot }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skills[0].source, 'omvra-configured');
  assert.equal(result.diagnostics.some(item => item.code === 'INVALID_MANIFEST'), true);

  fs.rmSync(bundledRoot, { recursive: true, force: true });
  fs.rmSync(configuredRoot, { recursive: true, force: true });
});

test('agent-provided skills remain usable when bundled resolution is unavailable', () => {
  const bundledRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omvra-bundled-skills-'));
  const result = resolveRequiredSkills([{ skillId: 'agent-skill', version: '^2.0.0' }], {
    skillsRoot: bundledRoot,
    agentSkills: [{ skillId: 'agent-skill', version: '2.1.0' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skills[0].source, 'agent-runtime');
  assert.equal(result.skills[0].trustStatus, 'trusted');
  fs.rmSync(bundledRoot, { recursive: true, force: true });
});
