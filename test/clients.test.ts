import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { NominatimClient } from '../src/clients/nominatim.ts';
import { OpenMeteoClient, describeWeatherCode } from '../src/clients/openMeteo.ts';
import { OverpassClient, buildOverpassQuery } from '../src/clients/overpass.ts';
import { ToolError, UpstreamError } from '../src/lib/errors.ts';
import { MinIntervalLimiter } from '../src/lib/rateLimiter.ts';
import { jsonResponse, mockFetch } from './helpers.ts';

afterEach(() => mock.restoreAll());

const noLimit = () => new MinIntervalLimiter(0);

test('Nominatim: parses results, sends the query and caches repeated lookups', async () => {
  const calls = mockFetch(() =>
    jsonResponse([
      { lat: '48.2083', lon: '16.3731', display_name: 'Wien, Österreich', name: 'Wien', address: { country: 'Österreich' } },
      { lat: 'nope', lon: '0', display_name: 'broken' },
    ]),
  );
  const client = new NominatimClient({ limiter: noLimit() });

  const first = await client.geocode('  Vienna ');
  const second = await client.geocode('vienna');

  assert.equal(first.length, 1);
  assert.deepEqual(first[0], {
    name: 'Wien',
    displayName: 'Wien, Österreich',
    latitude: 48.2083,
    longitude: 16.3731,
    country: 'Österreich',
  });
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]?.url ?? '');
  assert.equal(url.searchParams.get('q'), 'Vienna');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
});

test('Nominatim: rejects too-short queries', async () => {
  const client = new NominatimClient({ limiter: noLimit() });
  await assert.rejects(client.geocode(' a '), ToolError);
});

const forecastFixture = {
  daily: {
    time: ['2026-11-15', '2026-11-16'],
    weather_code: [61, 0],
    temperature_2m_max: [9.5, 12],
    temperature_2m_min: [4, 5.5],
    precipitation_sum: [3.2, 0],
    precipitation_probability_max: [80, null],
    wind_speed_10m_max: [18, 10],
  },
};

test('Open-Meteo: maps the daily arrays to day objects', async () => {
  const calls = mockFetch(() => jsonResponse(forecastFixture));
  const client = new OpenMeteoClient();

  const days = await client.getForecast(48.2, 16.4, 2);

  assert.equal(days.length, 2);
  assert.deepEqual(days[0], {
    date: '2026-11-15',
    summary: 'Slight rain',
    tempMaxC: 9.5,
    tempMinC: 4,
    precipitationMm: 3.2,
    precipitationProbability: 80,
    windMaxKmh: 18,
  });
  assert.equal(days[1]?.precipitationProbability, null);
  const url = new URL(calls[0]?.url ?? '');
  assert.equal(url.searchParams.get('forecast_days'), '2');
  assert.match(url.searchParams.get('daily') ?? '', /precipitation_probability_max/);
});

test('Open-Meteo: validates input and handles missing data', async () => {
  const client = new OpenMeteoClient();
  await assert.rejects(client.getForecast(95, 0), ToolError);
  await assert.rejects(client.getForecast(0, 200), ToolError);
  await assert.rejects(client.getForecast(0, 0, 40), ToolError);

  mockFetch(() => jsonResponse({}));
  await assert.rejects(new OpenMeteoClient().getForecast(1, 1), UpstreamError);
});

test('describeWeatherCode handles known, unknown and missing codes', () => {
  assert.equal(describeWeatherCode(95), 'Thunderstorm');
  assert.match(describeWeatherCode(42), /Unknown/);
  assert.equal(describeWeatherCode(null), 'Unknown');
});

test('Overpass: query contains only fixed tags and numbers', () => {
  const query = buildOverpassQuery(48.2, 16.4, ['museum', 'park', 'museum'], 1000, 10);
  assert.equal(query.match(/"tourism"="museum"/g)?.length, 1);
  assert.match(query, /"leisure"="park"/);
  assert.match(query, /around:1000,48.2,16.4/);
  assert.match(query, /out center 30;/);
});

test('Overpass: parses, filters, sorts by distance and limits', async () => {
  const calls = mockFetch(() =>
    jsonResponse({
      elements: [
        { type: 'way', id: 2, center: { lat: 48.215, lon: 16.38 }, tags: { name: 'Far Park', leisure: 'park' } },
        { type: 'node', id: 1, lat: 48.2085, lon: 16.374, tags: { name: 'Near Museum', tourism: 'museum', website: 'https://museum.test' } },
        { type: 'node', id: 3, lat: 48.2085, lon: 16.374, tags: { tourism: 'museum' } },
        { type: 'relation', id: 4, tags: { name: 'No Coordinates', tourism: 'museum' } },
        { type: 'node', id: 5, lat: 48.21, lon: 16.38, tags: { name: 'Wrong Category', shop: 'bakery' } },
      ],
    }),
  );
  const client = new OverpassClient({ limiter: noLimit() });

  const places = await client.findNearby(48.2082, 16.3738, ['museum', 'park'], 1500, 10);

  assert.deepEqual(
    places.map((p) => [p.name, p.indoor]),
    [
      ['Near Museum', true],
      ['Far Park', false],
    ],
  );
  assert.equal(places[0]?.website, 'https://museum.test');
  assert.equal(places[1]?.website, undefined);
  assert.ok((places[0]?.distanceM ?? Infinity) < (places[1]?.distanceM ?? 0));
  assert.equal(calls[0]?.init?.method, 'POST');
  const body = new URLSearchParams(String(calls[0]?.init?.body));
  assert.match(body.get('data') ?? '', /"tourism"="museum"/);

  const limited = await client.findNearby(48.2082, 16.3738, ['museum', 'park'], 1500, 1);
  assert.equal(limited.length, 1);
});

test('Overpass: validates input', async () => {
  const client = new OverpassClient({ limiter: noLimit() });
  await assert.rejects(client.findNearby(0, 0, [], 1000, 10), ToolError);
  await assert.rejects(client.findNearby(0, 0, ['park'], 50, 10), ToolError);
  await assert.rejects(client.findNearby(0, 0, ['park'], 1000, 0), ToolError);
  await assert.rejects(client.findNearby(100, 0, ['park'], 1000, 10), ToolError);
});
