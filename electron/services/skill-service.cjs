const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST_NAME = 'manifest.json';
const DEFAULT_VERSION = '0.0.0';

function getBundledSkillsRoot({ isPackaged = false, appPath = process.cwd(), resourcesPath = process.resourcesPath } = {}) {
  if (typeof arguments[0]?.skillsRoot === 'string' && arguments[0].skillsRoot.trim()) return path.resolve(arguments[0].skillsRoot);
  return isPackaged ? path.join(resourcesPath, 'skills') : path.join(appPath, 'src', 'skills');
}

function getUserSkillsRoot({ userDataPath } = {}) {
  const root = typeof userDataPath === 'string' && userDataPath.trim() ? userDataPath : process.cwd();
  return path.join(root, 'skills');
}

function normalizeSkillId(value) {
  return typeof value === 'string'
    ? value.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
    : '';
}

function hashFile(filePath) {
  return `sha256-${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function normalizeTrustStatus(value, source) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return source === 'omvra-bundled' ? 'trusted' : 'untrusted';
}

function normalizeSkill(skill, { root, source, manifestPath } = {}) {
  const entrypoint = skill.entrypoint || skill.path;
  const resolvedEntrypoint = entrypoint ? path.resolve(root, entrypoint) : '';
  const safePath = resolvedEntrypoint && (resolvedEntrypoint === root || resolvedEntrypoint.startsWith(`${root}${path.sep}`));
  const integrityHash = skill.integrityHash || (safePath && fs.existsSync(resolvedEntrypoint) ? hashFile(resolvedEntrypoint) : null);
  return {
    ...skill,
    skillId: normalizeSkillId(skill.skillId),
    version: typeof skill.version === 'string' && skill.version.trim() ? skill.version.trim() : DEFAULT_VERSION,
    name: skill.name || skill.skillId,
    summary: skill.summary || '',
    supportedStages: Array.isArray(skill.supportedStages) ? skill.supportedStages : (skill.stages || []),
    supportedPersonas: Array.isArray(skill.supportedPersonas) ? skill.supportedPersonas : (skill.personas || []),
    entrypoint: skill.entrypoint || skill.path,
    path: skill.path || skill.entrypoint,
    source: source || skill.source || 'unknown',
    root,
    manifestPath,
    integrityHash,
    trustStatus: normalizeTrustStatus(skill.trustStatus, source),
  };
}

function readManifest(root) {
  const manifestPath = path.join(root, MANIFEST_NAME);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.skills)) throw new Error('Invalid bundled skills manifest.');
  return { manifest, manifestPath };
}

function listBundledSkills(options = {}) {
  const root = getBundledSkillsRoot(options);
  const { manifest, manifestPath } = readManifest(root);
  return manifest.skills.map(skill => normalizeSkill(skill, { root, source: 'omvra-bundled', manifestPath }));
}

function discoverUserSkills(options = {}, source = 'omvra-user') {
  const root = options.root || getUserSkillsRoot(options);
  if (!fs.existsSync(root)) return [];
  const skills = [];
  const walk = (directory, depth = 0) => {
    if (depth > 2) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(entryPath, depth + 1); continue; }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
      const skillId = normalizeSkillId(entry.name.toLowerCase() === 'skill.md' ? path.basename(directory) : entry.name);
      if (skillId) skills.push(normalizeSkill({ skillId, path: path.relative(root, entryPath), stages: [], personas: [], trustStatus: options.trustStatus }, { root, source }));
    }
  };
  walk(root);
  return skills;
}

function configuredSkillRoots(options = {}) {
  const roots = Array.isArray(options.skillRoots) ? options.skillRoots : [];
  return roots.map((entry, index) => {
    const config = typeof entry === 'string' ? { root: entry } : (entry || {});
    return { ...config, root: typeof config.root === 'string' ? path.resolve(config.root) : '', source: config.source || 'omvra-configured', precedence: index };
  }).filter(entry => entry.root && entry.enabled !== false);
}

function listRootSkills(rootConfig) {
  if (!fs.existsSync(rootConfig.root)) return { skills: [], error: null };
  const manifestPath = path.join(rootConfig.root, MANIFEST_NAME);
  if (fs.existsSync(manifestPath)) {
    try {
      const { manifest, manifestPath: resolvedManifestPath } = readManifest(rootConfig.root);
      return { skills: manifest.skills.map(skill => normalizeSkill(skill, { root: rootConfig.root, source: rootConfig.source, manifestPath: resolvedManifestPath })), error: null };
    } catch (error) {
      return { skills: [], error: { code: 'INVALID_MANIFEST', message: error.message, root: rootConfig.root } };
    }
  }
  return {
    skills: discoverUserSkills({
      root: rootConfig.root,
      trustStatus: rootConfig.trustStatus || (rootConfig.source === 'omvra-configured' ? 'trusted' : undefined),
    }, rootConfig.source),
    error: null,
  };
}

function listAvailableSkills(options = {}) {
  const available = new Map();
  for (const root of configuredSkillRoots(options)) {
    const resolved = listRootSkills(root);
    for (const skill of resolved.skills) available.set(skill.skillId, skill);
  }
  try {
    for (const skill of listBundledSkills(options)) if (!available.has(skill.skillId)) available.set(skill.skillId, skill);
  } catch {
    // A missing bundled catalog must not hide configured or agent-provided skills.
  }
  for (const skill of discoverUserSkills(options)) if (!available.has(skill.skillId)) available.set(skill.skillId, skill);
  return [...available.values()];
}

function readSkillFile(skill, root) {
  const skillPath = path.resolve(root, skill.entrypoint || skill.path);
  if (skillPath !== root && !skillPath.startsWith(`${root}${path.sep}`)) throw new Error(`Skill path escapes root: ${skill.skillId}`);
  return fs.readFileSync(skillPath, 'utf8');
}

function getAvailableSkill(skillId, options = {}) {
  const normalizedId = normalizeSkillId(skillId);
  if (!normalizedId) return null;
  const skill = listAvailableSkills(options).find(candidate => candidate.skillId === normalizedId);
  return skill ? { ...skill, content: readSkillFile(skill, skill.root) } : null;
}

function versionCompatible(required, actual) {
  if (!required) return true;
  if (required === actual) return true;
  const major = value => /^\d+/.exec(String(value))?.[0];
  return required.startsWith('^') && major(required.slice(1)) === major(actual);
}

function normalizeRuntimeSkills(skills = []) {
  return (Array.isArray(skills) ? skills : []).map(skill => {
    const value = typeof skill === 'string' ? { skillId: skill } : skill;
    if (!value || typeof value !== 'object') return null;
    const normalizedId = normalizeSkillId(value.skillId || value.id || value.name);
    if (!normalizedId) return null;
    return normalizeSkill({ ...value, skillId: normalizedId, trustStatus: 'trusted' }, {
      root: typeof value.root === 'string' ? path.resolve(value.root) : '',
      source: 'agent-runtime',
    });
  }).filter(Boolean);
}

function resolveRequiredSkills(requirements = [], options = {}) {
  const requested = Array.isArray(requirements) ? requirements : [];
  let bundled = [];
  const diagnostics = [];
  try {
    bundled = listBundledSkills(options);
  } catch (error) {
    diagnostics.push({ code: 'INVALID_MANIFEST', message: error.message, blocking: false, source: 'omvra-bundled' });
  }
  const configured = configuredSkillRoots(options).map(root => ({ root, ...listRootSkills(root) }));
  diagnostics.push(...configured.flatMap(entry => entry.error ? [{ ...entry.error, code: 'INVALID_MANIFEST', blocking: false }] : []));
  const runtime = normalizeRuntimeSkills(options.agentSkills || options.availableSkills);
  const user = discoverUserSkills(options);
  const blockingResults = [];
  const skills = [];
  for (const requirement of requested) {
    const skillId = normalizeSkillId(requirement?.skillId);
    const candidates = [
      ...configured.flatMap(entry => entry.skills.filter(skill => skill.skillId === skillId)),
      ...bundled.filter(skill => skill.skillId === skillId),
      ...runtime.filter(skill => skill.skillId === skillId),
      ...user.filter(skill => skill.skillId === skillId),
    ];
    const skill = candidates.find(candidate => versionCompatible(requirement?.version, candidate.version)
      && (!requirement?.stage || candidate.supportedStages.includes(requirement.stage))
      && (!requirement?.persona || candidate.supportedPersonas.includes(requirement.persona)));
    if (!skill) {
      const exists = candidates[0];
      blockingResults.push({ code: exists ? 'INCOMPATIBLE_SKILL' : 'MISSING_SKILL', skillId, requirement, blocking: true });
      continue;
    }
    let actualHash;
    if (skill.entrypoint) {
      try {
        actualHash = hashFile(path.resolve(skill.root, skill.entrypoint));
      } catch (error) {
        blockingResults.push({ code: 'INVALID_MANIFEST', skillId, message: error.message, blocking: true });
        continue;
      }
    }
    if (actualHash && skill.integrityHash && skill.integrityHash !== actualHash) {
      blockingResults.push({ code: 'INTEGRITY_FAILURE', skillId, expected: skill.integrityHash, actual: actualHash, blocking: true });
      continue;
    }
    if (skill.trustStatus !== 'trusted') {
      blockingResults.push({ code: 'UNTRUSTED_SKILL', skillId, trustStatus: skill.trustStatus, blocking: true });
      continue;
    }
    skills.push({ skillId, version: skill.version, source: skill.source, root: skill.root, entrypoint: skill.entrypoint, integrityHash: actualHash || skill.integrityHash || null, trustStatus: skill.trustStatus, fallback: skill.source === 'omvra-bundled' && configured.length > 0 ? 'configured-root-miss' : undefined });
  }
  return { ok: blockingResults.length === 0, skills, blockingResults, diagnostics };
}

function collectSkillRequirements(goal) {
  const sources = [goal?.requiredSkills, ...(Array.isArray(goal?.elements) ? goal.elements.map(element => element?.requiredSkills || element?.skillRequirements || (element?.skillId ? [element] : [])) : [])];
  return sources.flatMap(value => Array.isArray(value) ? value : value ? [value] : []).filter(item => item && typeof item === 'object' && item.skillId);
}

module.exports = { getBundledSkillsRoot, getUserSkillsRoot, listBundledSkills, discoverUserSkills, listAvailableSkills, getAvailableSkill, resolveRequiredSkills, collectSkillRequirements, normalizeSkill };
