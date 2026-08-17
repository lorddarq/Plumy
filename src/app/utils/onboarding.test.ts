import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { hasCompletedOnboarding, persistOnboardingStatus } from './onboarding.ts';

const utilsDirectory = dirname(fileURLToPath(import.meta.url));

test('onboarding completion is versioned and dismissals suppress first-run replay', async () => {
  const values = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  };

  assert.equal(await hasCompletedOnboarding(), false);
  await persistOnboardingStatus('dismissed');
  assert.equal(await hasCompletedOnboarding(), true);
  assert.deepEqual(JSON.parse(values.get('omvra.onboarding.v1')!), { version: 1, status: 'dismissed' });
});

test('onboarding restores focus to a stable control when its opener was removed', () => {
  const source = readFileSync(resolve(utilsDirectory, '../components/OnboardingDialog.tsx'), 'utf8');

  assert.match(source, /previousFocus\?\.isConnected/);
  assert.match(source, /previousFocus !== document\.body/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /\[aria-label="Open preferences"\]/);
});
