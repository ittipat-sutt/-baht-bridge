const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Pricing = require('../pricing.js');

describe('Pricing Engine (pricing.js)', () => {
  const sampleRates = {
    USD: 33.0,
    JPY: 0.22,
    KRW: 0.025,
    CNY: 4.55,
    EUR: 36.2,
  };

  test('convertToThb: แปลงสกุลเงินถูกต้องตามเรท', () => {
    assert.equal(Pricing.convertToThb(100, 'USD', sampleRates), 3300);
    assert.equal(Pricing.convertToThb(5000, 'JPY', sampleRates), 1100);
    assert.equal(Pricing.convertToThb(20000, 'KRW', sampleRates), 500);
    assert.equal(Pricing.convertToThb(500, 'THB', sampleRates), 500);
  });

  test('lockRates: บวก markup เปอร์เซ็นต์ถูกต้อง', () => {
    // ไม่มี markup -> เรทเดิม
    const noMarkup = Pricing.lockRates(sampleRates, 0);
    assert.equal(noMarkup.USD, 33.0);
    assert.equal(noMarkup.JPY, 0.22);

    // markup 5% -> 33 * 1.05 = 34.65
    const markup5 = Pricing.lockRates(sampleRates, 5);
    assert.equal(markup5.USD, 34.65);
    assert.equal(markup5.JPY, 0.231);
  });

  test('calcFee: ค่าบริการ fixed และ percent ถูกต้อง', () => {
    // Fixed fee
    assert.equal(Pricing.calcFee(2500, 'fixed', 150), 150);
    assert.equal(Pricing.calcFee(0, 'fixed', 50), 50);

    // Percentage fee: 10% ของ 3,500 = 350
    assert.equal(Pricing.calcFee(3500, 'percent', 10), 350);
    // Percentage fee: 7.5% ของ 1,234.50 = 92.59
    assert.equal(Pricing.calcFee(1234.5, 'percent', 7.5), 92.59);
  });

  test('round2: ปัดเศษทศนิยม 2 ตำแหน่งอย่างแม่นยำ', () => {
    assert.equal(Pricing.round2(10.254), 10.25);
    assert.equal(Pricing.round2(10.256), 10.26);
    assert.equal(Pricing.round2(10.255), 10.26);
    assert.equal(Pricing.round2(0), 0);
  });

  test('calcOrderTotals: ออเดอร์หลายสกุลเงิน ยอดรายบรรทัดรวมกันต้องเท่ากับยอดรวมสินค้าเป๊ะ', () => {
    const order = {
      ratesSnapshot: sampleRates,
      shipping: 120,
      feeType: 'fixed',
      feeValue: 80,
      items: [
        { name: 'US Shoes', currency: 'USD', amount: 49.99, quantity: 2 }, // 49.99 * 2 * 33 = 3299.34
        { name: 'JP Figure', currency: 'JPY', amount: 3333, quantity: 1 },  // 3333 * 0.22 = 733.26
        { name: 'KR Shirt', currency: 'KRW', amount: 15555, quantity: 3 },  // 15555 * 3 * 0.025 = 1166.625 -> 1166.63
      ],
    };

    const result = Pricing.calcOrderTotals(order);

    // ตรวจสอบแต่ละบรรทัด
    assert.equal(result.lines.length, 3);
    assert.equal(result.lines[0].subtotalThb, 3299.34);
    assert.equal(result.lines[1].subtotalThb, 733.26);
    assert.equal(result.lines[2].subtotalThb, 1166.63);

    // ผลรวมของทุกบรรทัดต้องเท่ากับ goodsThb เป๊ะ ไม่คลาดเคลื่อน
    const sumOfLines = Pricing.round2(
      result.lines.reduce((s, line) => s + line.subtotalThb, 0)
    );
    assert.equal(result.goodsThb, sumOfLines);
    assert.equal(result.goodsThb, 5199.23);

    // ตรวจสอบยอดรวมสุทธิ (goodsThb + shipping + fee)
    assert.equal(result.shipping, 120);
    assert.equal(result.fee, 80);
    assert.equal(result.totalThb, 5399.23);
    assert.equal(result.totalThb, Pricing.round2(result.goodsThb + result.shipping + result.fee));
  });

  test('calcOrderTotals: คำนวณถูกต้องกับค่าบริการแบบคิดเป็นเปอร์เซ็นต์', () => {
    const order = {
      ratesSnapshot: { USD: 33.0 },
      shipping: 50,
      feeType: 'percent',
      feeValue: 10, // 10%
      items: [
        { name: 'Gadget', currency: 'USD', amount: 100, quantity: 1 },
      ],
    };

    const result = Pricing.calcOrderTotals(order);
    assert.equal(result.goodsThb, 3300);
    assert.equal(result.shipping, 50);
    assert.equal(result.fee, 330); // 10% of 3300
    assert.equal(result.totalThb, 3680);
  });
});

