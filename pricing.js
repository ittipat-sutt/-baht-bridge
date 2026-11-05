/**
 * BahtBridge — Pricing Engine (pricing.js)
 * Pure calculation functions, no DOM access.
 * Compliant with DATA_MODEL.md
 */

/**
 * Round a number to 2 decimal places accurately.
 * @param {number} num
 * @returns {number}
 */
function round2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

/**
 * Lock live exchange rates with an optional percentage markup.
 * @param {Object} liveRates - Currency rate map e.g. { USD: 33.0, JPY: 0.22 }
 * @param {number} [markupPercent=0] - Percentage markup e.g. 5 for 5%
 * @returns {Object} ratesSnapshot
 */
function lockRates(liveRates = {}, markupPercent = 0) {
  const snapshot = {};
  const multiplier = 1 + (Number(markupPercent) || 0) / 100;
  for (const [currency, rate] of Object.entries(liveRates)) {
    const raw = Number(rate) * multiplier;
    // Keep 6 decimal places for rate precision
    snapshot[currency] = Math.round((raw + Number.EPSILON) * 1000000) / 1000000;
  }
  return snapshot;
}

/**
 * Convert an amount in a given currency to THB using ratesSnapshot.
 * @param {number} amount
 * @param {string} currency
 * @param {Object} ratesSnapshot
 * @returns {number} Converted THB rounded to 2 decimal places
 */
function convertToThb(amount, currency, ratesSnapshot = {}) {
  const num = Number(amount) || 0;
  if (!currency || currency.toUpperCase() === 'THB') {
    return round2(num);
  }
  const rate = Number(ratesSnapshot[currency]) || 1;
  return round2(num * rate);
}

/**
 * Calculate service fee based on goods total in THB and fee settings.
 * @param {number} goodsThb
 * @param {'fixed'|'percent'} [feeType='fixed']
 * @param {number} [feeValue=0]
 * @returns {number}
 */
function calcFee(goodsThb, feeType = 'fixed', feeValue = 0) {
  const goods = Number(goodsThb) || 0;
  const val = Number(feeValue) || 0;
  if (feeType === 'percent' || feeType === 'percentage') {
    return round2((goods * val) / 100);
  }
  return round2(val);
}

/**
 * Calculate complete order totals including per-line item breakdown.
 * Guarantees that:
 * 1. sum of line subtotals equals goodsThb exactly
 * 2. goodsThb + shipping + fee equals totalThb exactly
 * @param {Object} order
 * @returns {{ goodsThb: number, shipping: number, fee: number, totalThb: number, lines: Array }}
 */
function calcOrderTotals(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const ratesSnapshot = order.ratesSnapshot || {};

  const lines = items.map((item, idx) => {
    const amount = Number(item.amount ?? item.originalPrice ?? 0);
    const quantity = Number(item.quantity) || 1;
    const currency = item.currency || 'USD';
    const rate = Number(ratesSnapshot[currency] ?? item.exchangeRate ?? 1);

    const unitThb = round2(amount * rate);
    const subtotalThb = round2(amount * quantity * rate);

    return {
      id: item.id || `item_${idx + 1}`,
      name: item.name || '',
      currency,
      amount,
      quantity,
      rate,
      unitThb,
      subtotalThb,
    };
  });

  const goodsThb = round2(lines.reduce((sum, line) => sum + line.subtotalThb, 0));
  const shipping = round2(Number(order.shipping ?? order.shippingFee ?? 0));
  const feeType = order.feeType || order.serviceFeeType || 'fixed';
  const feeValue = Number(order.feeValue ?? order.fee ?? order.serviceFee ?? 0);
  const fee = round2(calcFee(goodsThb, feeType, feeValue));
  const totalThb = round2(goodsThb + shipping + fee);

  return {
    goodsThb,
    shipping,
    fee,
    totalThb,
    lines,
  };
}

const Pricing = {
  round2,
  lockRates,
  convertToThb,
  calcFee,
  calcOrderTotals,
};

if (typeof window !== 'undefined') {
  window.Pricing = Pricing;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pricing;
}

