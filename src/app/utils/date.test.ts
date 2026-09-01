import assert from 'node:assert/strict';
import test from 'node:test';
import { updateTimelineDateRangeByKeyboard } from './date.ts';

test('keyboard Timeline dates move and resize by visible days without losing the authored duration', () => {
  assert.deepEqual(
    updateTimelineDateRangeByKeyboard('2026-09-04', '2026-09-07', 'move', 1, false),
    { startDate: '2026-09-07', endDate: '2026-09-10' },
  );
  assert.deepEqual(
    updateTimelineDateRangeByKeyboard('2026-09-07', '2026-09-09', 'resize-start', -1, false),
    { startDate: '2026-09-04', endDate: '2026-09-09' },
  );
  assert.deepEqual(
    updateTimelineDateRangeByKeyboard('2026-09-07', '2026-09-09', 'resize-end', 1, false),
    { startDate: '2026-09-07', endDate: '2026-09-10' },
  );
  assert.equal(
    updateTimelineDateRangeByKeyboard('2026-09-07', '2026-09-07', 'resize-start', 1, true),
    null,
  );
});
