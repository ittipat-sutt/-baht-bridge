/**
 * Unit Tests for Status & Tracking Domain Logic (status.js)
 * Test runner: Node.js built-in test runner (node:test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Status = require('../status.js');

describe('Status Engine (status.js)', () => {
  const sampleOrder = {
    id: '#BR001',
    customerName: 'คุณปิยะ วัฒนะ',
    fulfillmentStatus: 'pending_purchase',
    paymentStatus: 'unpaid',
    totalThb: 3750,
    goodsThb: 3500,
    shipping: 150,
    fee: 100,
    ratesSnapshot: { USD: 33 },
    items: [
      { id: 'it_1', name: 'Shoes', currency: 'USD', amount: 50, quantity: 1, itemStatus: 'to_buy' },
      { id: 'it_2', name: 'Shirt', currency: 'USD', amount: 20, quantity: 2, itemStatus: 'bought' },
    ],
    payments: [],
    shipments: [],
    history: [],
  };

  test('computePaymentStatus: คำนวณสถานะการชำระเงินตามยอดสะสมถูกต้อง', () => {
    // 1. ไม่มี payment -> unpaid
    assert.equal(Status.computePaymentStatus({ totalThb: 1000, payments: [] }), 'unpaid');

    // 2. จ่ายบางส่วน -> deposit
    assert.equal(
      Status.computePaymentStatus({
        totalThb: 1000,
        payments: [{ amount: 400 }],
      }),
      'deposit'
    );

    // 3. จ่ายครบถ้วน -> paid
    assert.equal(
      Status.computePaymentStatus({
        totalThb: 1000,
        payments: [{ amount: 400 }, { amount: 600 }],
      }),
      'paid'
    );

    // 4. จ่ายเกิน -> paid
    assert.equal(
      Status.computePaymentStatus({
        totalThb: 1000,
        payments: [{ amount: 1200 }],
      }),
      'paid'
    );

    // 5. สถานะ refunded ต้องคงไว้ไม่ถูกคำนวณทับ
    assert.equal(
      Status.computePaymentStatus({
        totalThb: 1000,
        paymentStatus: 'refunded',
        payments: [{ amount: 1000 }],
      }),
      'refunded'
    );
  });

  test('canTransition: ตรวจสอบความถูกต้องของการเปลี่ยนสถานะ fulfillmentStatus', () => {
    // 1. ก้าวไปข้างหน้าทีละขั้น -> อนุญาตได้โดยไม่ต้องกดยืนยัน
    const nextStep = Status.canTransition('pending_purchase', 'purchased');
    assert.equal(nextStep.allowed, true);
    assert.equal(nextStep.requiresConfirmation, false);

    // 2. ข้ามขั้น -> อนุญาตแต่ต้องยืนยัน
    const skipStep = Status.canTransition('draft', 'shipping_intl');
    assert.equal(skipStep.allowed, true);
    assert.equal(skipStep.requiresConfirmation, true);

    // 3. ย้อนสถานะ -> อนุญาตแต่ต้องถามยืนยัน
    const backStep = Status.canTransition('shipping_th', 'arrived_th');
    assert.equal(backStep.allowed, true);
    assert.equal(backStep.requiresConfirmation, true);

    // 4. ยกเลิก (cancelled) จากสถานะทั่วไป -> อนุญาตแต่ต้องยืนยัน
    const cancelCheck = Status.canTransition('purchased', 'cancelled');
    assert.equal(cancelCheck.allowed, true);
    assert.equal(cancelCheck.requiresConfirmation, true);

    // 5. completed ห้ามเปลี่ยนเป็น cancelled เด็ดขาด!
    const completedToCancel = Status.canTransition('completed', 'cancelled');
    assert.equal(completedToCancel.allowed, false);

    // 6. เปลี่ยนเป็นสถานะเดิม -> ไม่อนุญาต
    const sameStep = Status.canTransition('draft', 'draft');
    assert.equal(sameStep.allowed, false);
  });

  test('applyTransition: อัปเดตสถานะแบบ Immutable และบันทึก History ครบถ้วน', () => {
    const updated = Status.applyTransition(sampleOrder, 'purchased', 'สั่งซื้อสำเร็จจากเว็บ US');

    // ไม่แก้ order เดิม
    assert.equal(sampleOrder.fulfillmentStatus, 'pending_purchase');
    assert.equal(sampleOrder.history.length, 0);

    // อัปเดต order ใหม่
    assert.equal(updated.fulfillmentStatus, 'purchased');
    assert.equal(updated.history.length, 1);
    assert.equal(updated.history[0].type, 'status');
    assert.equal(updated.history[0].from, 'pending_purchase');
    assert.equal(updated.history[0].to, 'purchased');
    assert.ok(updated.updatedAt);
  });

  test('addPayment: ตรวจสอบจำนวนเงิน > 0, อัปเดตยอดและ paymentStatus อัตโนมัติ', () => {
    // จำนวนเงิน <= 0 ต้องโยน Error
    assert.throws(() => Status.addPayment(sampleOrder, { amount: 0 }), /มากกว่า 0/);
    assert.throws(() => Status.addPayment(sampleOrder, { amount: -500 }), /มากกว่า 0/);

    // จ่ายเงินมัดจำ
    const p1 = Status.addPayment(sampleOrder, { amount: 1500, note: 'มัดจำ 50%' });
    assert.equal(p1.payments.length, 1);
    assert.equal(p1.payments[0].amount, 1500);
    assert.equal(p1.paymentStatus, 'deposit');

    // จ่ายเงินส่วนที่เหลือจนครบ 3750
    const p2 = Status.addPayment(p1, { amount: 2250, note: 'จ่ายส่วนที่เหลือ' });
    assert.equal(p2.payments.length, 2);
    assert.equal(p2.paymentStatus, 'paid');
    assert.equal(p2.history[0].type, 'payment');
  });

  test('addShipment & getTrackingUrl: จัดการเลขพัสดุและ URL ติดตาม', () => {
    const s1 = Status.addShipment(sampleOrder, {
      carrier: 'Flash Express',
      trackingNo: 'TH0123456789A',
    });

    assert.equal(s1.shipments.length, 1);
    assert.equal(s1.shipments[0].carrier, 'Flash Express');
    assert.equal(s1.shipments[0].trackingNo, 'TH0123456789A');

    // ทดสอบ URL template
    const flashUrl = Status.getTrackingUrl('Flash Express', 'TH0123456789A');
    assert.equal(flashUrl, 'https://www.flashexpress.co.th/tracking/?se=TH0123456789A');

    // ขนส่งที่ไม่ทราบ URL ต้องคืนค่า null
    const otherUrl = Status.getTrackingUrl('อื่นๆ', '99999');
    assert.equal(otherUrl, null);
  });

  test('deriveOrderSummary: สรุปสถานะรายการสินค้าและยอดเงินค้างชำระ', () => {
    const summary = Status.deriveOrderSummary(sampleOrder);
    assert.equal(summary.totalItems, 2);
    assert.equal(summary.totalQuantity, 3);
    assert.equal(summary.boughtCount, 1);
    assert.equal(summary.hasOutOfStock, false);
    assert.equal(summary.remainingThb, 3750);
    assert.equal(summary.isFullyPaid, false);

    // เมื่อมีสินค้า out_of_stock
    const withOos = Status.updateItemStatus(sampleOrder, 'it_1', 'out_of_stock');
    const oosSummary = Status.deriveOrderSummary(withOos);
    assert.equal(oosSummary.hasOutOfStock, true);
    assert.equal(oosSummary.outOfStockCount, 1);
  });

  test('buildShareText: สร้างข้อความแชร์ออเดอร์ให้ลูกค้าครบถ้วน', () => {
    const shareText = Status.buildShareText(sampleOrder);
    assert.ok(shareText.includes('#BR001'));
    assert.ok(shareText.includes('คุณปิยะ'));
    assert.ok(shareText.includes('ยอดรวมสุทธิ'));
    assert.ok(shareText.includes('3,750'));
    assert.ok(shareText.includes('สถานะการชำระ'));
    assert.ok(shareText.includes('ยอดค้างชำระ'));
  });
});

