import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task } from '../types.ts';
import {
  buildTimelineViewport,
  buildTimelineViewportGeometry,
  createInitialTimelineWindow,
  createTimelineMonthWidths,
  extendTimelineWindow,
  extendTimelineWindowToDate,
  findTimelineDateIndex,
  getTimelineWindowAddedDayCount,
  getTimelineWindowDates,
  getTimelineWindowScrollCompensation,
  getTimelineViewportMarker,
} from './timelineWindow.ts';

test('timeline window is stable after creation and includes the planning horizon', () => {
  const referenceDate = new Date(2026, 6, 10);
  const window = createInitialTimelineWindow([
    { id: 'past-task', title: 'Historical work', status: 'open', startDate: '2024-02-10', endDate: '2024-02-12' } as Task,
  ], referenceDate);

  assert.deepEqual(window.startDate, new Date(2024, 1, 1));
  assert.deepEqual(window.endDate, new Date(2027, 5, 30));
  assert.equal(getTimelineWindowDates(window, false).some(date => date.getDay() === 0), false);
});

test('timeline window extension prepends and appends whole months', () => {
  const window = { startDate: new Date(2026, 6, 1), endDate: new Date(2026, 7, 31) };

  assert.deepEqual(extendTimelineWindow(window, 'past'), {
    startDate: new Date(2026, 3, 1),
    endDate: new Date(2026, 7, 31),
  });
  assert.deepEqual(extendTimelineWindow(window, 'future'), {
    startDate: new Date(2026, 6, 1),
    endDate: new Date(2026, 10, 30),
  });
  assert.equal(getTimelineWindowAddedDayCount(window, 'past', true), 91);
  assert.equal(getTimelineWindowScrollCompensation(window, 'past', true, 60), 5460);
});

test('timeline window expands to contain reveal dates without moving the opposite edge', () => {
  const window = { startDate: new Date(2026, 6, 1), endDate: new Date(2026, 7, 31) };

  assert.deepEqual(extendTimelineWindowToDate(window, new Date(2026, 1, 14)), {
    startDate: new Date(2026, 1, 1),
    endDate: new Date(2026, 7, 31),
  });
  assert.deepEqual(extendTimelineWindowToDate(window, new Date(2027, 0, 14)), {
    startDate: new Date(2026, 6, 1),
    endDate: new Date(2027, 0, 31),
  });
  assert.equal(extendTimelineWindowToDate(window, new Date(2026, 6, 14)), window);
});

test('timeline viewport owns month visibility, spacers, scroll metrics, and date-pixel geometry', () => {
  const dates = getTimelineWindowDates({
    startDate: new Date(2026, 0, 1),
    endDate: new Date(2026, 1, 28),
  }, true);
  const monthWidths = createTimelineMonthWidths(dates, 10, { '2026-1': 560 });
  const geometry = buildTimelineViewportGeometry({
    dates,
    monthWidths,
    defaultDayWidth: 10,
  });
  const viewport = buildTimelineViewport({
    geometry,
    scrollMetrics: { scrollLeft: 320, viewportWidth: 100 },
    renderBufferPx: 0,
  });

  assert.deepEqual(viewport.visibleMonthRange, {
    startIndex: 1,
    endIndex: 1,
    monthKeys: ['2026-1'],
  });
  assert.deepEqual(viewport.horizontalSpacers, { leadingWidth: 310, trailingWidth: 0 });
  assert.deepEqual(viewport.scrollMetrics, { scrollLeft: 320, viewportWidth: 100 });
  assert.equal(viewport.dateGeometry.dates.length, 59);
  assert.equal(viewport.dateGeometry.dayWidths[31], 20);
  assert.equal(viewport.dateGeometry.dayOffsets[31], 310);
  assert.equal(viewport.dateGeometry.totalWidth, 870);
});

test('timeline viewport date lookup and markers use the shared date-pixel geometry', () => {
  const dates = [new Date(2026, 0, 2), new Date(2026, 0, 5), new Date(2026, 0, 6)];
  const geometry = buildTimelineViewportGeometry({
    dates,
    monthWidths: { '2026-0': 90 },
    defaultDayWidth: 30,
  });
  const viewport = buildTimelineViewport({
    geometry,
    scrollMetrics: { scrollLeft: 0, viewportWidth: 60 },
    renderBufferPx: 0,
  });

  assert.equal(findTimelineDateIndex(dates, new Date(2026, 0, 3), 'start'), 1);
  assert.equal(findTimelineDateIndex(dates, new Date(2026, 0, 3), 'end'), 0);
  assert.deepEqual(getTimelineViewportMarker(viewport.dateGeometry, 1, 30), {
    index: 1,
    left: 30,
    center: 45,
  });
});
