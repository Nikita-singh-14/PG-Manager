import test from 'node:test';
import assert from 'node:assert/strict';
import { prorateMonth } from '../src/lib/proration.js';

const p = (month, checkIn, checkOut = null, monthlyRate = 6000) => prorateMonth({ monthlyRate, month, checkIn, checkOut });

test('full month = exactly the monthly rate (30, 31 and 28 day months)', () => {
  assert.deepEqual(p('2026-04', '2026-01-01'), { daysOccupied: 30, daysInMonth: 30, amount: 6000 });
  assert.equal(p('2026-05', '2026-01-01').amount, 6000);
  assert.equal(p('2026-02', '2026-01-01').amount, 6000);
});

test('move-in mid-month charges from check-in day to month end, inclusive', () => {
  // 11 Apr..30 Apr = 20 days of 30 -> 6000 * 20/30 = 4000
  assert.deepEqual(p('2026-04', '2026-04-11'), { daysOccupied: 20, daysInMonth: 30, amount: 4000 });
});

test('move-out mid-month charges from month start to check-out day, inclusive', () => {
  // 1 Apr..10 Apr = 10 days -> 2000
  assert.deepEqual(p('2026-04', '2026-01-01', '2026-04-10'), { daysOccupied: 10, daysInMonth: 30, amount: 2000 });
});

test('move-in and move-out in the same month; single-day stay', () => {
  assert.equal(p('2026-05', '2026-05-10', '2026-05-20', 3100).daysOccupied, 11);
  assert.equal(p('2026-05', '2026-05-10', '2026-05-20', 3100).amount, 1100);
  assert.deepEqual(p('2026-05', '2026-05-31', '2026-05-31', 3100), { daysOccupied: 1, daysInMonth: 31, amount: 100 });
});

test('leap-year February uses 29 days, normal February 28', () => {
  assert.equal(p('2028-02', '2028-02-15', null, 5800).daysOccupied, 15); // 15..29
  assert.equal(p('2028-02', '2028-02-15', null, 5800).amount, 3000);    // 5800*15/29
  assert.equal(p('2026-02', '2026-02-15', null, 5600).daysOccupied, 14); // 15..28
  assert.equal(p('2026-02', '2026-02-15', null, 5600).amount, 2800);
});

test('rounds to nearest rupee, half up, without float error', () => {
  assert.equal(p('2026-04', '2026-04-21', null, 5000).amount, 1667); // 1666.67
  assert.equal(p('2026-04', '2026-04-11', null, 5000).amount, 3333); // 3333.33
  assert.equal(p('2026-04', '2026-04-30', null, 4515).amount, 151);  // exactly 150.5 -> 151
});

test('months outside the stay cost nothing', () => {
  assert.equal(p('2026-03', '2026-04-11').amount, 0);                 // before check-in
  assert.equal(p('2026-06', '2026-01-01', '2026-04-10').amount, 0);   // after check-out
  assert.equal(p('2026-06', '2026-01-01', '2026-04-10').daysOccupied, 0);
});
