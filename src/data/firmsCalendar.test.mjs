import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquisitionMsUtc,
  filterTrailing24h,
  parseFirmsCsv,
} from 'gods-eye-view/sources/firms-csv';

for (const date of ['2026-02-29', '2024-02-30', '2026-04-31', '1900-02-29']) {
  test(`FIRMS acquisition rejects nonexistent calendar date ${date}`, () => {
    assert.ok(Number.isNaN(acquisitionMsUtc(date, '1200')));
  });
}

test('FIRMS acquisition retains leap days and month-end UTC times', () => {
  for (const [date, time] of [
    ['2024-02-29', '45'],
    ['2000-02-29', '0'],
    ['2026-04-30', '2359'],
  ]) {
    const hhmm = time.padStart(4, '0');
    assert.equal(
      acquisitionMsUtc(date, time),
      Date.parse(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`),
    );
  }
});

test('FIRMS trailing window never turns an impossible date into a recent fire', () => {
  const records = parseFirmsCsv(
    [
      'latitude,longitude,acq_date,acq_time,confidence,frp',
      '38,-121,2026-02-29,1200,n,5',
      '39,-122,2026-03-01,1200,n,6',
    ].join('\n'),
  );
  assert.equal(records.length, 2);
  const kept = filterTrailing24h(records, Date.parse('2026-03-01T12:00:00Z'));
  assert.deepEqual(kept, [records[1]]);
  assert.equal(kept[0], records[1]);
});
