const test = require('node:test');
const assert = require('node:assert/strict');

const {
  READ_TOOL_DEFINITIONS,
  WRITE_TOOL_DEFINITIONS,
  PUBLIC_READ_TOOL_DEFINITIONS,
  PUBLIC_WRITE_TOOL_DEFINITIONS,
  toCanonicalToolName,
  isKnownWriteToolName,
} = require('./mcp-registry.cjs');

// toCanonicalToolName/isKnownWriteToolName back the capability-profile gate in
// mcp-handlers.cjs: a write tool that this function fails to recognize would
// bypass the read-only block, so every write/read definition's classification
// is checked explicitly rather than spot-checked.

test('every write tool definition is classified as a write tool', () => {
  for (const tool of WRITE_TOOL_DEFINITIONS) {
    assert.equal(isKnownWriteToolName(tool.name), true, `expected "${tool.name}" to be a known write tool`);
  }
});

test('no read tool definition is classified as a write tool', () => {
  for (const tool of READ_TOOL_DEFINITIONS) {
    assert.equal(isKnownWriteToolName(tool.name), false, `expected "${tool.name}" to NOT be classified as a write tool`);
  }
});

test('public tool names are the underscore form of their canonical dotted name', () => {
  for (const tool of [...PUBLIC_READ_TOOL_DEFINITIONS, ...PUBLIC_WRITE_TOOL_DEFINITIONS]) {
    assert.ok(!tool.name.includes('.'), `public tool name "${tool.name}" should not contain a dot`);
  }
});

test('every public tool name round-trips back to a real canonical definition via its alias', () => {
  const canonicalNames = new Set([...READ_TOOL_DEFINITIONS, ...WRITE_TOOL_DEFINITIONS].map(tool => tool.name));
  for (const tool of [...PUBLIC_READ_TOOL_DEFINITIONS, ...PUBLIC_WRITE_TOOL_DEFINITIONS]) {
    const canonical = toCanonicalToolName(tool.name);
    assert.ok(canonicalNames.has(canonical), `alias for public name "${tool.name}" resolved to unknown canonical tool "${canonical}"`);
  }
});

test('unrecognized tool names pass through toCanonicalToolName unchanged', () => {
  assert.equal(toCanonicalToolName('not_a_real_tool'), 'not_a_real_tool');
});

test('canonical (dotted) names are also accepted directly, not only their public alias', () => {
  for (const tool of [...READ_TOOL_DEFINITIONS, ...WRITE_TOOL_DEFINITIONS]) {
    assert.equal(toCanonicalToolName(tool.name), tool.name);
  }
});
