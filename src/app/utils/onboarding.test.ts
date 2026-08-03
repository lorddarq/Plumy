import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCompletedOnboarding, persistOnboardingStatus } from './onboarding.ts';

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
