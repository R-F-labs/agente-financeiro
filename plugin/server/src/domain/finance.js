/**
 * Financial math used by the monthly package. Rates are decimals (0.1 = 10%).
 */

/**
 * Converts an annual rate to the equivalent monthly rate.
 * @param {number} annual
 */
export function annualToMonthly(annual) {
  return (1 + annual) ** (1 / 12) - 1;
}

/**
 * Monthly contribution needed to reach `target` from `present` in `months` months.
 * @param {{ present: number, target: number, months: number, monthlyRate: number }} params amounts in cents
 * @returns {number} cents per month (0 when the goal is already reached)
 */
export function requiredMonthlyContribution({ present, target, months, monthlyRate }) {
  if (months <= 0) return Math.max(0, target - present);
  const growth = (1 + monthlyRate) ** months;
  const remaining = target - present * growth;
  if (remaining <= 0) return 0;
  if (monthlyRate === 0) return Math.ceil(remaining / months);
  return Math.ceil((remaining * monthlyRate) / (growth - 1));
}

/**
 * Future value of a present amount plus constant monthly contributions.
 * @param {{ present: number, monthly: number, months: number, monthlyRate: number }} params amounts in cents
 */
export function futureValue({ present, monthly, months, monthlyRate }) {
  if (monthlyRate === 0) return Math.round(present + monthly * months);
  const growth = (1 + monthlyRate) ** months;
  return Math.round(present * growth + (monthly * (growth - 1)) / monthlyRate);
}

/**
 * Brazilian regressive income tax table for fixed income, by holding period in days.
 * @param {number} days
 */
export function fixedIncomeTaxRate(days) {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

/**
 * Simplified Modified Dietz return for one period, assuming flows in the middle of the period.
 * @param {{ openingCents: number, contributionsCents: number, withdrawalsCents: number, closingCents: number }} position
 * @returns {number|null}
 */
export function periodReturn({ openingCents, contributionsCents, withdrawalsCents, closingCents }) {
  const netFlow = contributionsCents - withdrawalsCents;
  const base = openingCents + netFlow / 2;
  if (base <= 0) return null;
  return (closingCents - openingCents - netFlow) / base;
}

/**
 * Chains period returns geometrically.
 * @param {Array<number|null>} returns
 * @returns {number|null}
 */
export function chainReturns(returns) {
  const valid = returns.filter((value) => typeof value === 'number');
  if (valid.length === 0) return null;
  return valid.reduce((acc, value) => acc * (1 + value), 1) - 1;
}
