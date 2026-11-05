/**
 * BahtBridge — Integration Tests (integration.test.js)
 * Tests the full order creation flow: add items → calculate → save → load
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const Pricing = require('../pricing.js');
const Storage = require('../storage.js');

describe('Integration — Full Order Flow', () => {
  const sampleRates = { USD: 35.0, JPY: 0.23, KRW: 0.026 };
  let initialCount = 0;

  before(async () => {
    const orders = await Storage.getOrders();
    initialCount = orders.length;
  });

  test('สร้างออเดอร์ใหม่และบันทึกลง storage', async () => {
    const order = {
      customerName: 'ทดสอบ Integration',
      customerPhone: '0812345678',
      items: [
        { name: 'Sneakers', currency: 'USD', amount: 80, quantity: 2 },
      ],
      ratesSnapshot: sampleRates,
      shipping: 200,
      feeType: 'fixed',
      feeValue: 100,
      fulfillmentStatus: 'pending',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString(),
    };

    // คำนวณยอด
    const totals = Pricing.calcOrderTotals(order);
    assert.equal(totals.goodsThb, 5600); // 80 * 2 * 35
    assert.equal(totals.totalThb, 5900); // 5600 + 200 + 100

    // บันทึก
    const saved = await Storage.saveOrder({ ...order, ...totals });
    assert.ok(saved.id);
    const orders = await Storage.getOrders();
    assert.equal(orders.length, initialCount + 1);
    
    const found = orders.find(o => o.id === saved.id);
    assert.ok(found);
    assert.equal(found.customerName, 'ทดสอบ Integration');
  });

  test('อัปเดตสถานะออเดอร์', async () => {
    const orders = await Storage.getOrders();
    const target = orders.find(o => o.customerName === 'ทดสอบ Integration');
    assert.ok(target);

    const updated = { ...target, fulfillmentStatus: 'confirmed', paymentStatus: 'paid' };
    await Storage.saveOrder(updated);

    const reloaded = await Storage.getOrders();
    const found = reloaded.find(o => o.id === target.id);
    assert.equal(found.fulfillmentStatus, 'confirmed');
    assert.equal(found.paymentStatus, 'paid');
  });

  test('สร้างหลายออเดอร์ และโหลดครบทุกรายการ', async () => {
    const beforeCount = (await Storage.getOrders()).length;
    for (let i = 2; i <= 4; i++) {
      await Storage.saveOrder({
        customerName: `ลูกค้า ${i}`,
        customerPhone: `08${i}0000000`,
        items: [{ name: `สินค้า ${i}`, currency: 'JPY', amount: 1000 * i, quantity: 1 }],
        ratesSnapshot: sampleRates,
        shipping: 100,
        feeType: 'fixed',
        feeValue: 50,
        fulfillmentStatus: 'pending',
        paymentStatus: 'unpaid',
      });
    }

    const orders = await Storage.getOrders();
    assert.equal(orders.length, beforeCount + 3);
  });

  test('ลบออเดอร์ออกจาก storage', async () => {
    const orders = await Storage.getOrders();
    const target = orders.find(o => o.customerName === 'ลูกค้า 4');
    assert.ok(target);

    await Storage.deleteOrder(target.id);
    const afterOrders = await Storage.getOrders();
    assert.equal(afterOrders.length, orders.length - 1);
    assert.equal(afterOrders.find(o => o.id === target.id), undefined);
  });

  test('คำนวณหลายสกุลเงินในออเดอร์เดียว → ยอดรวมถูกต้อง', () => {
    const mixedOrder = {
      ratesSnapshot: sampleRates,
      shipping: 0,
      feeType: 'percent',
      feeValue: 5,
      items: [
        { name: 'US Item', currency: 'USD', amount: 100, quantity: 1 }, // 3500 THB
        { name: 'JP Item', currency: 'JPY', amount: 10000, quantity: 1 }, // 2300 THB
        { name: 'KR Item', currency: 'KRW', amount: 50000, quantity: 1 }, // 1300 THB
      ],
    };
    const totals = Pricing.calcOrderTotals(mixedOrder);
    assert.equal(totals.goodsThb, 7100); // 3500 + 2300 + 1300
    assert.equal(totals.fee, 355); // 5% of 7100
    assert.equal(totals.totalThb, 7455); // 7100 + 0 + 355
  });
});
