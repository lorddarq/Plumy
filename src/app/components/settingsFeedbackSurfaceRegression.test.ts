import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const readModule = (relativePath: string) => readFileSync(resolve(appDirectory, relativePath), 'utf8');

test('[Settings feedback] an MCP server restart failure uses a persistent, actionable toast instead of a silent or auto-dismissing one', () => {
  const source = readModule('../hooks/useMcpPanelState.ts');
  const failurePayload = "description: result?.error || 'Check the server settings and try again.',\n            duration: 10_000,\n            closeButton: true,";
  const catchPayload = "description: error instanceof Error ? error.message : 'Check the server settings and try again.',\n        duration: 10_000,\n        closeButton: true,";
  assert.ok(
    source.includes(failurePayload),
    '[Settings > MCP Access] a reported restart failure must show its concrete error, stay for 10s, and offer a close button so the failure is never missed',
  );
  assert.ok(
    source.includes(catchPayload),
    '[Settings > MCP Access] an unexpected restart exception must use the same persistent, actionable toast contract as a reported failure',
  );
  assert.doesNotMatch(source, /window\.alert/, '[Settings > MCP Access] must never fall back to a native browser alert for restart feedback');
});

test('[Settings feedback] agent configuration import/export surfaces success and failure through toasts, never native alerts', () => {
  const source = readModule('settings/PeopleSettingsSections.tsx');
  assert.match(
    source,
    /toast\.success\('Successfully exported', \{/,
    '[Settings > People] a successful export must show a success toast naming the outcome',
  );
  assert.match(
    source,
    /toast\.success\('Successfully imported', \{/,
    '[Settings > People] a successful import must show a success toast naming the outcome',
  );
  assert.match(
    source,
    /toast\.error\(result\.error \|\| 'Agent configurations could not be saved\.'\);/,
    '[Settings > People] a save failure must surface the concrete server-reported error, not a generic message only',
  );
  assert.match(
    source,
    /toast\.error\('That file could not be read as JSON\.'\);/,
    '[Settings > People] an unreadable import file must name the specific problem (invalid JSON), not fail silently',
  );
  assert.doesNotMatch(source, /window\.alert/, '[Settings > People] must never fall back to a native browser alert for import/export feedback');
});
