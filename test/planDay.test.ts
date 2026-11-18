import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ToolError } from '../src/lib/errors.ts';
import { assessDay, buildPlan, planDayForPlace } from '../src/tools/planDay.ts';
import type { DayForecast, Place } from '../src/types.ts';

const day = (overrides: Partial<DayForecast> = {}): DayForecast => ({
  date: '2026-11-15',
  summary: 'Clear sky',
  tempMaxC: 18,
  tempMinC: 8,
  precipitationMm: 0,
  precipitationProbability: 10,
  windMaxKmh: 12,
  ...overrides,
});

const place = (id: string, indoor: boolean, distanceM: number): Place => ({
  id,
  name: id,
  category: indoor ? 'museum' : 'park',
  latitude: 0,
  longitude: 0,
  distanceM,
  indoor,
});

test('assessDay: nice day is outdoor friendly', () => {
  assert.deepEqual(assessDay(day()), { outdoorFriendly: true, reasons: [] });
});

test('assessDay: collects every reason', () => {
  const result = assessDay(day({ precipitationProbability: 70, precipitationMm: 5, windMaxKmh: 55, tempMaxC: 2 }));
  assert.equal(result.outdoorFriendly, false);
  assert.equal(result.reasons.length, 4);
});

test('assessDay: missing data does not block outdoor plans', () => {
  const result = assessDay(day({ precipitationProbability: null, precipitationMm: null, windMaxKmh: null, tempMaxC: null }));
  assert.equal(result.outdoorFriendly, true);
});

test('assessDay: extreme heat is flagged', () => {
  assert.equal(assessDay(day({ tempMaxC: 37 })).outdoorFriendly, false);
});

test('buildPlan: good weather mixes mostly outdoor stops with indoor ones', () => {
  const places = [
    place('park-1', false, 100),
    place('park-2', false, 200),
    place('park-3', false, 300),
    place('park-4', false, 400),
    place('museum-1', true, 50),
    place('museum-2', true, 60),
  ];
  const plan = buildPlan('Vienna', day(), places, 6);
  assert.equal(plan.outdoorFriendly, true);
  assert.deepEqual(plan.suggestions.map((p) => p.id), ['park-1', 'park-2', 'park-3', 'park-4', 'museum-1', 'museum-2']);
});

test('buildPlan: bad weather suggests indoor places only', () => {
  const places = [place('park-1', false, 10), place('museum-1', true, 300), place('museum-2', true, 100)];
  const plan = buildPlan('Vienna', day({ precipitationProbability: 90 }), places);
  assert.equal(plan.outdoorFriendly, false);
  assert.ok(plan.reasons[0]?.includes('90%'));
  assert.deepEqual(plan.suggestions.map((p) => p.id), ['museum-2', 'museum-1']);
});

test('buildPlan: bad weather with nothing indoors falls back to outdoor places', () => {
  const plan = buildPlan('Vienna', day({ windMaxKmh: 60 }), [place('park-1', false, 10)]);
  assert.deepEqual(plan.suggestions.map((p) => p.id), ['park-1']);
});

const services = (days: DayForecast[], found = true) => ({
  geocoder: {
    geocode: async () =>
      found ? [{ name: 'Wien', displayName: 'Wien, Österreich', latitude: 48.2, longitude: 16.4 }] : [],
  },
  forecasts: { getForecast: async () => days },
  places: { findNearby: async () => [place('park-1', false, 100), place('museum-1', true, 200)] },
});

test('planDayForPlace: uses the first forecast day by default', async () => {
  const plan = await planDayForPlace('Vienna', undefined, services([day({ date: '2026-11-15' }), day({ date: '2026-11-16' })]));
  assert.equal(plan.date, '2026-11-15');
  assert.equal(plan.place, 'Wien, Österreich');
});

test('planDayForPlace: picks the requested date', async () => {
  const plan = await planDayForPlace('Vienna', '2026-11-16', services([day({ date: '2026-11-15' }), day({ date: '2026-11-16' })]));
  assert.equal(plan.date, '2026-11-16');
});

test('planDayForPlace: explains unavailable dates and unknown places', async () => {
  await assert.rejects(
    planDayForPlace('Vienna', '2030-01-01', services([day()])),
    (error: unknown) => error instanceof ToolError && /Available dates/.test(error.message),
  );
  await assert.rejects(planDayForPlace('Nowhere', undefined, services([day()], false)), ToolError);
  await assert.rejects(planDayForPlace('Vienna', '15.11.2026', services([day()])), ToolError);
});
