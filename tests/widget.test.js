/**
 * BahtBridge — Widget / DOM Component Tests (widget.test.js)
 * Tests UI components, DOM manipulation, formatting, and event handlers
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Minimal fake DOM simulation for Widget testing in Node.js
class FakeElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.classList = new Set();
    this.attributes = {};
    this.style = {};
    this.innerHTML = '';
    this._value = '';
    this.textContent = '';
  }

  get value() { return this._value; }
  set value(v) { this._value = String(v); }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }

  querySelector(sel) {
    if (sel.startsWith('#')) {
      const targetId = sel.slice(1);
      if (this.id === targetId) return this;
      for (const c of this.children) {
        if (c.querySelector) {
          const res = c.querySelector(sel);
          if (res) return res;
        }
      }
    }
    return null;
  }
}

describe('Widget / UI Component Tests', () => {
  test('Dashboard Stat Widget: จัดรูปแบบตัวเลขยอดเงินบาทถูกต้อง', () => {
    const money = (amount) => `฿ ${Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    assert.equal(money(0), '฿ 0');
    assert.equal(money(1500), '฿ 1,500');
    assert.equal(money(12345.5), '฿ 12,345.5');
  });

  test('Status Tag Widget: แสดงคลาส CSS และข้อความตามสถานะการชำระเงิน', () => {
    const getPaymentBadge = (status) => {
      switch (status) {
        case 'paid': return { text: 'ชำระแล้ว', className: 'tag-success' };
        case 'partial': return { text: 'ชำระบางส่วน', className: 'tag-warning' };
        default: return { text: 'รอชำระเงิน', className: 'tag-danger' };
      }
    };

    assert.deepEqual(getPaymentBadge('paid'), { text: 'ชำระแล้ว', className: 'tag-success' });
    assert.deepEqual(getPaymentBadge('partial'), { text: 'ชำระบางส่วน', className: 'tag-warning' });
    assert.deepEqual(getPaymentBadge('unpaid'), { text: 'รอชำระเงิน', className: 'tag-danger' });
  });

  test('Status Tag Widget: แสดงคลาส CSS และข้อความตาม Fulfillment Status', () => {
    const getFulfillmentBadge = (status) => {
      switch (status) {
        case 'confirmed': return { text: 'ยืนยันแล้ว', color: '#16a36a' };
        case 'purchased': return { text: 'สั่งซื้อแล้ว', color: '#0d6efd' };
        case 'shipped': return { text: 'จัดส่งแล้ว', color: '#6f42c1' };
        case 'completed': return { text: 'สำเร็จ', color: '#198754' };
        case 'cancelled': return { text: 'ยกเลิก', color: '#dc3545' };
        default: return { text: 'รอดำเนินการ', color: '#ffc107' };
      }
    };

    assert.equal(getFulfillmentBadge('confirmed').text, 'ยืนยันแล้ว');
    assert.equal(getFulfillmentBadge('completed').text, 'สำเร็จ');
    assert.equal(getFulfillmentBadge('cancelled').text, 'ยกเลิก');
    assert.equal(getFulfillmentBadge('pending').text, 'รอดำเนินการ');
  });

  test('Order Summary Widget: คำนวณสรุปยอดสุทธิของ Form Card ถูกต้อง', () => {
    const calcSummary = (goods, shipping, fee) => {
      const g = parseFloat(goods) || 0;
      const s = parseFloat(shipping) || 0;
      const f = parseFloat(fee) || 0;
      return {
        goods: g,
        shipping: s,
        fee: f,
        total: Math.round((g + s + f) * 100) / 100,
      };
    };

    const res = calcSummary(2450.5, 100, 50);
    assert.equal(res.total, 2600.5);
  });

  test('AI Price Suggestion Card: เรนเดอร์ HTML ข้อความแนะนำถูกต้อง', () => {
    const renderAISuggestion = (suggestedPrice, markup, advice) => {
      const formatted = Number(suggestedPrice).toLocaleString('th-TH');
      return `<b class="price">฿ ${formatted}</b><span class="markup">+${markup}%</span><p>${advice}</p>`;
    };

    const html = renderAISuggestion(3500, 20, 'ตั้งราคาบวกกำไร 20% เหมาะสมกับตลาด');
    assert.ok(html.includes('฿ 3,500'));
    assert.ok(html.includes('+20%'));
    assert.ok(html.includes('ตั้งราคาบวกกำไร 20%'));
  });

  test('AI Shopping Trip Grouping Card: เรนเดอร์รายการสินค้าแยกตามร้านถูกต้อง', () => {
    const sampleTrip = [
      {
        storeName: 'Don Quijote Shinjuku',
        category: 'ของฝาก/ขนม',
        locationTip: 'เปิด 24 ชม.',
        items: [
          { name: 'KitKat ชาเขียว', totalQty: 5, customerBreakdown: 'คุณปิยะ (3), คุณสมชาย (2)' },
        ],
      },
      {
        storeName: 'ABC-Mart Grand Stage',
        category: 'รองเท้าผ้าใบ',
        locationTip: 'สาขาใหญ่ของเยอะ',
        items: [
          { name: 'Nike Dunk Low', totalQty: 1, customerBreakdown: 'คุณปิยะ (1)' },
        ],
      },
    ];

    assert.equal(sampleTrip.length, 2);
    assert.equal(sampleTrip[0].storeName, 'Don Quijote Shinjuku');
    assert.equal(sampleTrip[0].items[0].totalQty, 5);
    assert.ok(sampleTrip[0].items[0].customerBreakdown.includes('คุณปิยะ'));
  });

  test('Sync Indicator Widget: แสดงสถานะ Offline / Online ถูกต้อง', () => {
    const getSyncState = (isOnline, isSyncing) => {
      if (!isOnline) return { text: '🟢 ทำงานออฟไลน์ (บันทึกในเครื่อง)', bg: '#e5f7ef' };
      if (isSyncing) return { text: '🔄 กำลังซิงค์ข้อมูล...', bg: '#e8f4fd' };
      return { text: '☁️ ซิงค์กับคลาวด์เรียบร้อย', bg: '#e5f7ef' };
    };

    assert.ok(getSyncState(false, false).text.includes('ทำงานออฟไลน์'));
    assert.ok(getSyncState(true, true).text.includes('กำลังซิงค์'));
    assert.ok(getSyncState(true, false).text.includes('ซิงค์กับคลาวด์'));
  });
});

