import { getJSON, setJSON } from './storage.ts';

export const ONBOARDING_VERSION = 1;
const ONBOARDING_KEY = 'omvra.onboarding.v1';

export type OnboardingStatus = 'completed' | 'dismissed';
export interface OnboardingRecord { version: number; status: OnboardingStatus; }

export async function hasCompletedOnboarding(): Promise<boolean> {
  const record = await getJSON<OnboardingRecord>(ONBOARDING_KEY, null);
  return record?.version === ONBOARDING_VERSION && (record.status === 'completed' || record.status === 'dismissed');
}

export function persistOnboardingStatus(status: OnboardingStatus): Promise<void> {
  return setJSON(ONBOARDING_KEY, { version: ONBOARDING_VERSION, status });
}
