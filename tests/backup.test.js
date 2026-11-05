const { describe, it } = require('node:test');
const assert = require('node:assert');
const Backup = require('../backup.js');
const Settings = require('../settings-ui.js');

describe('Backup & Restore Module (backup.js)', () => {
  it('validateBackupFileContent: ผ่านเมื่อไฟล์ถูกต้องสมบูรณ์', () => {
    const validJson = JSON.stringify({
      app: 'BahtBridge',
      schemaVersion: 2,
      exportedAt: '2026-11-06T00:00:00.000Z',
      ordersCount: 2,
      orders: [
        { id: '#BR001', customerName: 'คุณปิยะ' },
        { id: '#BR002', customerName: 'คุณสมชาย' },
      ],
      settings: { defaultShipping: 150 },
    });

    const res = Backup.validateBackupFileContent(validJson);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.ordersCount, 2);
    assert.strictEqual(res.schemaVersion, 2);
    assert.strictEqual(res.exportedAt, '2026-11-06T00:00:00.000Z');
  });

  it('validateBackupFileContent: ดักจับไฟล์ที่ไม่ใช่ JSON', () => {
    const invalidText = '<html><body>Not a JSON</body></html>';
    const res = Backup.validateBackupFileContent(invalidText);
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /JSON/);
  });

  it('validateBackupFileContent: ดักจับข้อมูลที่ไม่ใช่ของ BahtBridge', () => {
    const wrongAppJson = JSON.stringify({
      app: 'OtherShopApp',
      orders: [],
    });
    const res = Backup.validateBackupFileContent(wrongAppJson);
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /BahtBridge/);
  });

  it('validateBackupFileContent: ดักจับไฟล์ที่ไม่มี orders array', () => {
    const missingOrders = JSON.stringify({
      app: 'BahtBridge',
      items: [1, 2, 3],
    });
    const res = Backup.validateBackupFileContent(missingOrders);
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /orders/);
  });

  it('validateBackupFileContent: ดักจับข้อมูลว่างเปล่า (empty input)', () => {
    const res = Backup.validateBackupFileContent('');
    assert.strictEqual(res.valid, false);
  });

  it('getBackupFilename: สร้างชื่อไฟล์ในรูปแบบ bahtbridge-backup-YYYYMMDD.json ถูกต้อง', () => {
    const fixedDate = new Date(2026, 10, 6); // Month 10 is November in JS (0-indexed)
    const filename = Backup.getBackupFilename(fixedDate);
    assert.strictEqual(filename, 'bahtbridge-backup-20261106.json');
  });
});

describe('Settings UI Validation (settings-ui.js)', () => {
  it('validateSettings: ผ่านเมื่อค่าถูกต้อง', () => {
    const valid = {
      defaultShipping: '150',
      serviceFeeType: 'fixed',
      serviceFeeValue: '100',
      rateMarkupPercent: '5',
    };
    const res = Settings.validateSettings(valid);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.sanitized.defaultShipping, 150);
    assert.strictEqual(res.sanitized.serviceFeeType, 'fixed');
    assert.strictEqual(res.sanitized.serviceFeeValue, 100);
    assert.strictEqual(res.sanitized.rateMarkupPercent, 5);
  });

  it('validateSettings: ค่าจัดส่งติดลบต้องแจ้ง error', () => {
    const res = Settings.validateSettings({
      defaultShipping: -50,
      serviceFeeType: 'fixed',
      serviceFeeValue: 100,
    });
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /ค่าจัดส่ง/);
  });

  it('validateSettings: ค่าบริการเปอร์เซ็นต์เกิน 100% ต้องแจ้ง error', () => {
    const res = Settings.validateSettings({
      defaultShipping: 100,
      serviceFeeType: 'percent',
      serviceFeeValue: 150,
    });
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /100%/);
  });

  it('validateSettings: % Markup ติดลบหรือเกิน 100 ต้องแจ้ง error', () => {
    const resNegative = Settings.validateSettings({
      defaultShipping: 100,
      serviceFeeType: 'fixed',
      serviceFeeValue: 50,
      rateMarkupPercent: -5,
    });
    assert.strictEqual(resNegative.valid, false);

    const resOver = Settings.validateSettings({
      defaultShipping: 100,
      serviceFeeType: 'fixed',
      serviceFeeValue: 50,
      rateMarkupPercent: 120,
    });
    assert.strictEqual(resOver.valid, false);
  });
});
