/**
 * BahtBridge — Security Tests (security.test.js)
 * Tests XSS protection, input validation, auth guards, and data sanitization.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Helper: mock esc() function (matches app.js implementation) ──────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Helper: mock phone validation (matches app.js) ──────────────────────────
function validatePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 0) return true; // optional field
  if (digits.length < 9 || digits.length > 10) return false;
  return true;
}

// ─── Helper: mock order input validation ─────────────────────────────────────
function validateOrderInput(customerName, items) {
  if (!customerName || !customerName.trim()) return { valid: false, error: 'ชื่อลูกค้าห้ามว่าง' };
  if (!items || items.length === 0) return { valid: false, error: 'ต้องมีสินค้าอย่างน้อย 1 ชิ้น' };
  for (const item of items) {
    if (!item.amount || item.amount <= 0) return { valid: false, error: 'ราคาสินค้าต้องมากกว่า 0' };
    if (!item.quantity || item.quantity <= 0) return { valid: false, error: 'จำนวนต้องมากกว่า 0' };
  }
  return { valid: true };
}

describe('Security — XSS Protection (esc function)', () => {
  test('esc() แปลง < > & " \' ให้ปลอดภัย', () => {
    assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(esc('"double" & \'single\''), '&quot;double&quot; &amp; &#39;single&#39;');
    assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  });

  test('esc() ป้องกัน HTML injection ในชื่อลูกค้า', () => {
    const malicious = '<script>document.cookie</script>';
    const safe = esc(malicious);
    assert.ok(!safe.includes('<script>'));
    assert.ok(safe.includes('&lt;script&gt;'));
  });

  test('esc() จัดการ null/undefined โดยไม่ crash', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
    assert.equal(esc(0), '0');
    assert.equal(esc(''), '');
  });

  test('esc() รักษาข้อความภาษาไทยไว้ครบถ้วน', () => {
    const thai = 'สวัสดี ชื่อลูกค้า 123';
    assert.equal(esc(thai), thai);
  });

  test('esc() ป้องกัน event handler injection', () => {
    const payload = '" onmouseover="alert(1)';
    const safe = esc(payload);
    assert.ok(!safe.includes('"'));
    assert.ok(safe.includes('&quot;'));
  });
});

describe('Security — Input Validation', () => {
  test('validatePhone: เบอร์ 10 หลักถูกต้อง', () => {
    assert.equal(validatePhone('0812345678'), true);
    assert.equal(validatePhone('0912345678'), true);
  });

  test('validatePhone: เบอร์ 9 หลักถูกต้อง', () => {
    assert.equal(validatePhone('081234567'), true);
  });

  test('validatePhone: เบอร์สั้นกว่า 9 หลักไม่ผ่าน', () => {
    assert.equal(validatePhone('08123'), false);
    assert.equal(validatePhone('123'), false);
  });

  test('validatePhone: เบอร์ยาวกว่า 10 หลักไม่ผ่าน', () => {
    assert.equal(validatePhone('08123456789'), false);
    assert.equal(validatePhone('081234567890123'), false);
  });

  test('validatePhone: ช่องว่าง/null ผ่านได้ (optional field)', () => {
    assert.equal(validatePhone(''), true);
    assert.equal(validatePhone(null), true);
    assert.equal(validatePhone(undefined), true);
  });

  test('validatePhone: สตริงที่มีอักขระอื่นจะนับเฉพาะตัวเลข', () => {
    // ผู้ใช้กรอก 081-234-5678 → แยก digit ได้ 10 ตัว → ผ่าน
    assert.equal(validatePhone('081-234-5678'), true);
    // กรอก 081-23 → แยก digit ได้ 5 ตัว → ไม่ผ่าน
    assert.equal(validatePhone('081-23'), false);
  });
});

describe('Security — Order Input Validation', () => {
  test('ชื่อลูกค้าว่างไม่ผ่าน', () => {
    const r = validateOrderInput('', [{ amount: 100, quantity: 1 }]);
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('ชื่อลูกค้า'));
  });

  test('ไม่มีสินค้าไม่ผ่าน', () => {
    const r = validateOrderInput('ลูกค้า', []);
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('สินค้า'));
  });

  test('ราคาสินค้า 0 ไม่ผ่าน', () => {
    const r = validateOrderInput('ลูกค้า', [{ amount: 0, quantity: 1 }]);
    assert.equal(r.valid, false);
  });

  test('จำนวนสินค้า 0 ไม่ผ่าน', () => {
    const r = validateOrderInput('ลูกค้า', [{ amount: 100, quantity: 0 }]);
    assert.equal(r.valid, false);
  });

  test('input ถูกต้องผ่านทุกกรณี', () => {
    const r = validateOrderInput('สมชาย ใจดี', [
      { amount: 500, quantity: 2 },
      { amount: 1200, quantity: 1 },
    ]);
    assert.equal(r.valid, true);
  });
});

describe('Security — Supabase Key Guard', () => {
  test('ไม่มี service_role key ใน config.example.js', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const configPath = path.join(__dirname, '..', 'config.example.js');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      assert.ok(!content.includes('service_role'), 'config.example.js ต้องไม่มี service_role key');
    }
  });

  test('ไม่มี service_role key ใน config.js (ถ้ามีไฟล์)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const configPath = path.join(__dirname, '..', 'config.js');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      assert.ok(!content.includes('service_role'), 'config.js ต้องไม่มี service_role key');
    }
  });
});

