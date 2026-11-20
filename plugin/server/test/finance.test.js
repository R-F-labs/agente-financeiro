import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualToMonthly, requiredMonthlyContribution, futureValue, fixedIncomeTaxRate, periodReturn, chainReturns } from '../src/domain/finance.js';

test('annual to monthly rate', () => {
  assert.ok(Math.abs(annualToMonthly(0.12) - 0.009489) < 1e-6);
});

test('required contribution reaches the target', () => {
  const monthlyRate = 0.008;
  const monthly = requiredMonthlyContribution({ present: 100000, target: 1200000, months: 24, monthlyRate });
  const reached = futureValue({ present: 100000, monthly, months: 24, monthlyRate });
  assert.ok(reached >= 1200000 && reached - 1200000 < 100);
});

test('required contribution is zero when already reached', () => {
  assert.equal(requiredMonthlyContribution({ present: 2000, target: 1000, months: 12, monthlyRate: 0.01 }), 0);
});

test('regressive income tax table', () => {
  assert.equal(fixedIncomeTaxRate(100), 0.225);
  assert.equal(fixedIncomeTaxRate(361), 0.175);
  assert.equal(fixedIncomeTaxRate(800), 0.15);
});

test('period return discounts contributions', () => {
  const r = periodReturn({ openingCents: 1000000, contributionsCents: 100000, withdrawalsCents: 0, closingCents: 1110000 });
  assert.ok(Math.abs(r - 10000 / 1050000) < 1e-9);
  assert.ok(Math.abs(chainReturns([0.01, 0.01]) - 0.0201) < 1e-12);
  assert.equal(chainReturns([null, null]), null);
});
