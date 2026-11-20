import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, isIsoDate, monthsBetween, businessDaysBetween, isBusinessDay, brazilianHolidays, shiftMonth } from '../src/lib/dates.js';

test('isIsoDate validates real calendar dates', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate('29/02/2028'), false);
});

test('addMonths clamps to the end of the month', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-10-10', 3), '2027-01-10');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('monthsBetween lists every touched month', () => {
  assert.deepEqual(monthsBetween('2026-08-23', '2026-11-20'), ['2026-08', '2026-09', '2026-10', '2026-11']);
});

test('Brazilian holidays include movable dates', () => {
  const holidays = brazilianHolidays(2026);
  assert.ok(holidays.has('2026-04-03'), 'Good Friday 2026');
  assert.ok(holidays.has('2026-02-16'), 'Carnival Monday 2026');
  assert.ok(holidays.has('2026-06-04'), 'Corpus Christi 2026');
  assert.ok(holidays.has('2026-11-20'));
});

test('business day counting skips weekends and holidays', () => {
  assert.equal(isBusinessDay('2026-11-20'), false);
  assert.equal(isBusinessDay('2026-11-23'), true);
  assert.equal(businessDaysBetween('2026-11-19', '2026-11-23'), 1);
});
