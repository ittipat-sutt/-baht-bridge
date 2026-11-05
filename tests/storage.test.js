const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const StorageService = require('../storage.js');

describe('Storage Layer (storage.js)', () => {
  beforeEach(() => {
    StorageService._memoryStorage.clear();
  });

  test('getSettings & saveSettings: บันทึกและอ่านการตั้งค่า พร้อม schemaVersion = 2', async () => {
    const s1 = await StorageService.getSettings();
    assert.equal(s1.schemaVersion, 2);
    assert.equal(s1.defaultShipping, 150);

    await StorageService.saveSettings({ defaultShipping: 200, merchantName: 'Test Shop' });
    const s2 = await StorageService.getSettings();
    assert.equal(s2.defaultShipping, 200);
    assert.equal(s2.merchantName, 'Test Shop');
    assert.equal(s2.schemaVersion, 2);
  });

  test('getOrders & saveOrder & getOrder & deleteOrder: จัดการออเดอร์ CRUD ครบวงจรแบบ async', async () => {
    const initialOrders = await StorageService.getOrders();
    assert.ok(initialOrders.length >= 2);

    const newOrder = {
      customerName: 'สมชาย รักดี',
      customerPhone: '089-999-8888',
      items: [{ name: 'Book', currency: 'USD', amount: 20, quantity: 1, exchangeRate: 33.0 }],
      shipping: 50,
      fee: 20,
    };

    const saved = await StorageService.saveOrder(newOrder);
    assert.ok(saved.id.startsWith('#BR'));
    assert.equal(saved.customerName, 'สมชาย รักดี');
    assert.ok(saved.createdAt);
    assert.ok(saved.ratesSnapshot);

    const fetched = await StorageService.getOrder(saved.id);
    assert.equal(fetched.id, saved.id);
    assert.equal(fetched.customerPhone, '089-999-8888');

    // Update existing order
    fetched.customerPhone = '081-111-2222';
    await StorageService.saveOrder(fetched);
    const updated = await StorageService.getOrder(saved.id);
    assert.equal(updated.customerPhone, '081-111-2222');

    // Delete order
    const delResult = await StorageService.deleteOrder(saved.id);
    assert.equal(delResult, true);
    const afterDel = await StorageService.getOrder(saved.id);
    assert.equal(afterDel, null);
  });

  test('Migration: แปลงข้อมูลเก่า v1 -> v2 ครบถ้วน (ratesSnapshot, ISO date, Status enums)', () => {
    const legacyOrder = {
      id: '#BR099',
      customerName: 'คุณสมศรี',
      date: '10 ม.ค. 2568',
      status: 'ยืนยันแล้ว',
      items: [
        { name: 'Toy', currency: 'JPY', amount: 1000, quantity: 2 },
      ],
    };

    const migrated = StorageService.migrateOrder(legacyOrder);
    assert.ok(migrated.createdAt);
    assert.ok(migrated.ratesSnapshot);
    assert.equal(migrated.rateSource, 'fallback');
    assert.equal(migrated.orderStatus, 'completed');
    assert.equal(migrated.paymentStatus, 'paid');
    assert.ok(migrated.goodsThb > 0);
    assert.ok(migrated.totalThb > 0);
  });

  test('Idempotency: การรัน migration ซ้ำต้องได้ผลลัพธ์เดิม ไม่เปลี่ยนข้อมูลที่สมบูรณ์แล้ว', () => {
    const legacyOrder = {
      id: '#BR088',
      customerName: 'คุณสมหมาย',
      date: '15 ก.พ. 2568',
      status: 'กำลังดำเนินการ',
      items: [{ name: 'Cap', currency: 'USD', amount: 15, quantity: 1, exchangeRate: 33.0 }],
    };

    const firstRun = StorageService.migrateOrder(legacyOrder);
    const snapshotStr1 = JSON.stringify(firstRun);

    const secondRun = StorageService.migrateOrder(firstRun);
    const snapshotStr2 = JSON.stringify(secondRun);

    const thirdRun = StorageService.migrateOrder(secondRun);
    const snapshotStr3 = JSON.stringify(thirdRun);

    assert.equal(snapshotStr1, snapshotStr2);
    assert.equal(snapshotStr2, snapshotStr3);
  });

  test('exportAll & importAll: สำรองและนำเข้าข้อมูลได้เท่าเดิม (merge และ replace)', async () => {
    await StorageService.getOrders();
    const backup = await StorageService.exportAll();

    assert.equal(backup.app, 'BahtBridge');
    assert.equal(backup.schemaVersion, 2);
    assert.ok(Array.isArray(backup.orders));
    assert.ok(backup.settings);

    // Test replace mode: ล้างข้อมูลเดิมและนำเข้ากลับ
    StorageService._memoryStorage.clear();
    const replaceRes = await StorageService.importAll(backup, { mode: 'replace' });
    assert.equal(replaceRes.success, true);
    assert.equal(replaceRes.imported, backup.orders.length);
    assert.equal(replaceRes.skipped, 0);

    const restoredOrders = await StorageService.getOrders();
    assert.equal(restoredOrders.length, backup.orders.length);

    // Test merge mode: ส่งไฟล์เดิมเข้ามาซ้ำ ทุกตัวต้องถูก skip เพราะ ID ชนกัน
    const mergeRes = await StorageService.importAll(backup, { mode: 'merge' });
    assert.equal(mergeRes.success, true);
    assert.equal(mergeRes.imported, 0);
    assert.equal(mergeRes.skipped, backup.orders.length);
  });
});
