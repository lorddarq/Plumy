const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function addIfDirectory(values, candidate, filesystem) {
  if (typeof candidate === 'string' && candidate && filesystem.existsSync(candidate)) values.push(candidate);
}

function buildRuntimeEnvironment(baseEnvironment = process.env, options = {}) {
  const filesystem = options.filesystem || fs;
  const homeDirectory = options.homeDirectory || os.homedir();
  const candidates = [...(options.candidatePaths || [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/opt/homebrew/opt/node/bin',
    '/usr/local/bin',
    '/usr/local/sbin',
    path.join(homeDirectory, '.local', 'bin'),
    '/usr/local/opt/node/bin',
    path.join(homeDirectory, '.volta', 'bin'),
    path.join(homeDirectory, '.asdf', 'shims'),
    path.join(homeDirectory, '.fnm', 'current', 'bin'),
  ])];

  try {
    const nvmVersionsPath = path.join(homeDirectory, '.nvm', 'versions', 'node');
    for (const version of filesystem.readdirSync(nvmVersionsPath)) {
      candidates.push(path.join(nvmVersionsPath, version, 'bin'));
    }
  } catch {
    // Node version managers are optional; keep the inherited environment intact.
  }

  const inheritedPath = typeof baseEnvironment.PATH === 'string' ? baseEnvironment.PATH.split(path.delimiter) : [];
  const runtimePath = [...inheritedPath];
  for (const candidate of candidates) addIfDirectory(runtimePath, candidate, filesystem);
  return {
    ...baseEnvironment,
    // GUI-launched packaged apps can omit HOME even when terminal-launched
    // dev sessions inherit it. Claude uses HOME to resolve ~/.claude.json.
    HOME: typeof baseEnvironment.HOME === 'string' && baseEnvironment.HOME.trim() ? baseEnvironment.HOME : homeDirectory,
    PATH: [...new Set(runtimePath.filter(Boolean))].join(path.delimiter),
  };
}

module.exports = { buildRuntimeEnvironment };
