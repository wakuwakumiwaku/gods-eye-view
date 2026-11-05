import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStationStatus } from './gbfsStations.js';
import { composeCatalog, coreTools } from '../tools/index.js';

const document = (fields, version = '3.0') => ({
  version,
  data: {
    stations: [
      {
        station_id: 'fixture',
        num_docks_available: 8,
        is_installed: true,
        is_renting: true,
        is_returning: true,
        last_reported: '2026-01-01T00:00:00Z',
        ...fields,
      },
    ],
  },
});

test('GBFS v3 vehicle counts remain available, including an explicitly empty station', () => {
  for (const count of [4, 0]) {
    const payload = document({ num_vehicles_available: count });
    const before = structuredClone(payload);
    const status = parseStationStatus(payload).get('fixture');
    assert.equal(status.bikesAvailable, count);
    assert.equal(status.docksAvailable, 8);
    assert.equal(status.isRenting, true);
    assert.deepEqual(payload, before);
  }
});

test('legacy bike counts and numeric-string compatibility still work', () => {
  for (const count of [4, 0, '7']) {
    assert.equal(
      parseStationStatus(document({ num_bikes_available: count }, '2.3')).get(
        'fixture',
      ).bikesAvailable,
      Number(count),
    );
  }
  assert.equal(
    parseStationStatus(document({})).get('fixture').bikesAvailable,
    null,
  );
});

test('the current vehicle field takes precedence over a transitional legacy field', () => {
  assert.equal(
    parseStationStatus(
      document({ num_vehicles_available: 0, num_bikes_available: 5 }),
    ).get('fixture').bikesAvailable,
    0,
  );
});

test('the public bike-share query reports actual v3 availability instead of unknown', async () => {
  const station = {
    station_id: 'fixture',
    name: [{ language: 'en', text: 'Fixture Square' }],
    lat: 30.267,
    lon: -97.743,
    capacity: 12,
  };
  const system = {
    id: 'fixture',
    city: 'Fixture City',
    centerLat: station.lat,
    centerLon: station.lon,
    loadRadiusKm: 30,
    provider: 'Synthetic Bikes',
    stationInformationUrl: 'https://example.invalid/information',
    stationStatusUrl: 'https://example.invalid/status',
  };
  const requested = [];
  const catalog = composeCatalog({
    tools: coreTools,
    services: {
      bikeshare: {
        systems: [system],
        async getStations(url) {
          requested.push(url);
          return url === system.stationInformationUrl
            ? { version: '3.0', data: { stations: [station] } }
            : document({ num_vehicles_available: 4 });
        },
      },
    },
  });
  const result = await catalog.call('get_bike_share', {
    area: { lat: station.lat, lon: station.lon, radius_km: 2 },
  });
  assert.equal(result.data.rows.length, 1);
  assert.equal(result.data.rows[0].bikes_available, 4);
  assert.match(result.summary, /with 4 bikes available/);
  assert.deepEqual(requested.sort(), [
    system.stationInformationUrl,
    system.stationStatusUrl,
  ]);
});
