/**
 * BahtBridge — AI Service (ai.js)
 * Gemini API integration for AI-powered pricing advice and order analysis.
 * Owner: คนที่ 3 (Suvijak248)
 * Compliant with DATA_MODEL.md & HTML_CONTRACT.md
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AIService = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────────────────────────────
  const GEMINI_MODEL = 'gemini-2.0-flash';
  const GEMINI_ENDPOINT =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL +
    ':generateContent';

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function getApiKey() {
    const cfg =
      (typeof window !== 'undefined' && window.__CONFIG__) ? window.__CONFIG__ : {};
    return cfg.GEMINI_API_KEY || '';
  }

  function isConfigured() {
    const key = getApiKey();
    return key && !key.includes('placeholder') && key.length > 10;
  }

  function notify(msg, type) {
    if (typeof window !== 'undefined' && window.UI && window.UI.showToast) {
      window.UI.showToast(msg, type || 'info');
    } else {
      console.log('[AI]', msg);
    }
  }

  /**
   * ส่ง prompt ไปยัง Gemini API และรับ text response
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async function callGemini(prompt) {
    const key = getApiKey();
    if (!key) throw new Error('GEMINI_API_KEY ไม่ได้ตั้งค่า');

    const res = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
  }

  // ─── Feature 1: แนะนำราคาขาย ────────────────────────────────────────────────
  /**
   * ให้ AI แนะนำราคาขายปลีกและ markup ที่เหมาะสม
   * @param {{goodsThb: number, shipping: number, fee: number, totalThb: number, items: Array}} orderSummary
   * @returns {Promise<{advice: string, suggestedPrice: number, markup: number}>}
   */
  async function suggestSellingPrice(orderSummary) {
    const { goodsThb, shipping, fee, totalThb, items } = orderSummary;
    const itemNames = (items || []).map(i => `${i.name || 'สินค้า'} (${i.currency} ${i.amount} × ${i.quantity})`).join(', ');

    const prompt = `คุณเป็นที่ปรึกษาธุรกิจ Pre-order สำหรับ reseller ไทย
    
ข้อมูลต้นทุนออเดอร์:
- สินค้า: ${itemNames || 'ไม่ระบุ'}
- ต้นทุนสินค้า (แปลงเป็นบาท): ฿${goodsThb.toLocaleString('th-TH')}
- ค่าจัดส่ง: ฿${shipping.toLocaleString('th-TH')}
- ค่าบริการ/ค่าหิ้ว: ฿${fee.toLocaleString('th-TH')}
- ต้นทุนรวมทั้งหมด: ฿${totalThb.toLocaleString('th-TH')}

กรุณาแนะนำ:
1. ราคาขายปลีกที่เหมาะสม (บาท) — เพื่อให้มีกำไรสุทธิประมาณ 15-25%
2. เปอร์เซ็นต์ markup ที่แนะนำ
3. เหตุผลสั้นๆ (1-2 ประโยค)

ตอบเป็นภาษาไทย รูปแบบ JSON เท่านั้น:
{"suggestedPrice": <ตัวเลข>, "markup": <เปอร์เซ็นต์>, "advice": "<คำแนะนำ>"}`;

    const raw = await callGemini(prompt);
    // extract JSON from response (may have markdown fences)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI ตอบกลับในรูปแบบที่ไม่ถูกต้อง');
    return JSON.parse(match[0]);
  }

  // ─── Feature 2: สรุปยอดขายรายเดือน ─────────────────────────────────────────
  /**
   * ให้ AI วิเคราะห์ trend และสรุปภาพรวมธุรกิจจากข้อมูลออเดอร์
   * @param {Array} orders - รายการออเดอร์ทั้งหมด
   * @returns {Promise<string>} - คำแนะนำ / บทสรุป
   */
  async function analyzeOrders(orders) {
    if (!orders || orders.length === 0) {
      return 'ยังไม่มีข้อมูลออเดอร์เพียงพอสำหรับการวิเคราะห์';
    }

    const totalRevenue = orders.reduce((s, o) => s + (o.totalThb || 0), 0);
    const confirmed = orders.filter(o => o.fulfillmentStatus === 'confirmed').length;
    const pending = orders.filter(o => o.fulfillmentStatus === 'pending').length;
    const currencies = [...new Set(
      orders.flatMap(o => (o.items || []).map(i => i.currency))
    )];

    const prompt = `คุณเป็นนักวิเคราะห์ธุรกิจ Pre-order สำหรับ reseller ไทย

สถิติธุรกิจปัจจุบัน:
- ออเดอร์ทั้งหมด: ${orders.length} รายการ
- ยืนยันแล้ว: ${confirmed} รายการ
- รอดำเนินการ: ${pending} รายการ
- ยอดขายรวม: ฿${totalRevenue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
- สกุลเงินที่ซื้อบ่อย: ${currencies.join(', ') || 'ไม่มีข้อมูล'}

กรุณาวิเคราะห์และแนะนำ:
1. จุดแข็งของธุรกิจนี้
2. สิ่งที่ควรปรับปรุง
3. โอกาสในการเพิ่มรายได้

ตอบเป็นภาษาไทย กระชับ ไม่เกิน 5 ประโยค`;

    return await callGemini(prompt);
  }

  // ─── UI: แสดง AI Panel ใน Create Order Screen ───────────────────────────────
  /**
   * แสดงผลคำแนะนำ AI ในหน้าสร้างออเดอร์
   * เรียกจาก onclick ของปุ่ม #btn-ai-suggest
   */
  async function showPriceSuggestion() {
    const btn = document.getElementById('btn-ai-suggest');
    const panel = document.getElementById('ai-suggestion-panel');
    if (!panel) return;

    if (!isConfigured()) {
      notify('กรุณาตั้งค่า GEMINI_API_KEY ใน config.js เพื่อใช้ฟีเจอร์ AI', 'warning');
      return;
    }

    // อ่านค่าจากฟอร์ม
    const goodsEl = document.getElementById('summary-goods');
    const totalEl = document.getElementById('summary-total');
    const shippingEl = document.getElementById('order-shipping');
    const feeEl = document.getElementById('order-fee');

    const goodsText = (goodsEl ? goodsEl.textContent : '').replace(/[฿,\s]/g, '');
    const totalText = (totalEl ? totalEl.textContent : '').replace(/[฿,\s]/g, '');
    const goodsThb = parseFloat(goodsText) || 0;
    const totalThb = parseFloat(totalText) || 0;
    const shipping = parseFloat(shippingEl ? shippingEl.value : '0') || 0;
    const fee = parseFloat(feeEl ? feeEl.value : '0') || 0;

    if (totalThb <= 0) {
      notify('กรุณาเพิ่มสินค้าก่อนขอคำแนะนำ AI', 'warning');
      return;
    }

    // โหลด
    if (btn) { btn.disabled = true; btn.textContent = '🤖 กำลังวิเคราะห์...'; }
    panel.style.display = 'block';
    panel.innerHTML = '<div style="text-align:center;padding:16px;color:#5b7fa6">⏳ AI กำลังคำนวณราคาแนะนำ...</div>';

    // รวบรวม items จาก mini-products-list (ถ้า window.currentItems มีอยู่)
    const items = (typeof window !== 'undefined' && window.currentItems) ? window.currentItems : [];

    try {
      const result = await suggestSellingPrice({ goodsThb, shipping, fee, totalThb, items });
      const price = Number(result.suggestedPrice || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
      const markup = Number(result.markup || 0).toFixed(1);
      const advice = result.advice || '';

      panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#e8f4fd,#f0f9ff);border:1px solid #bde0f7;border-radius:12px;padding:14px 16px">
          <div style="font-size:11px;font-weight:700;color:#1976d2;letter-spacing:.5px;margin-bottom:8px">🤖 AI แนะนำราคาขาย</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:13px;color:#5b7fa6">ราคาขายแนะนำ</span>
            <b style="font-size:20px;color:#0d6efd">฿ ${price}</b>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:13px;color:#5b7fa6">กำไรที่ได้</span>
            <span style="font-size:14px;color:#16a36a;font-weight:600">+${markup}%</span>
          </div>
          <div style="font-size:12px;color:#5b7fa6;border-top:1px solid #c8e6f8;padding-top:8px">${advice}</div>
        </div>`;
    } catch (err) {
      panel.innerHTML = `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;font-size:13px;color:#856404">⚠️ AI ไม่สามารถวิเคราะห์ได้: ${err.message}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 AI แนะนำราคาขาย'; }
    }
  }

  /**
   * แสดงผลวิเคราะห์ธุรกิจในหน้า Dashboard
   * เรียกจาก onclick ของปุ่ม #btn-ai-analyze
   */
  async function showOrderAnalysis() {
    const btn = document.getElementById('btn-ai-analyze');
    const panel = document.getElementById('ai-analysis-panel');
    if (!panel) return;

    if (!isConfigured()) {
      notify('กรุณาตั้งค่า GEMINI_API_KEY ใน config.js เพื่อใช้ฟีเจอร์ AI', 'warning');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '🤖 กำลังวิเคราะห์...'; }
    panel.style.display = 'block';
    panel.innerHTML = '<div style="text-align:center;padding:16px;color:#5b7fa6">⏳ AI กำลังวิเคราะห์ธุรกิจ...</div>';

    try {
      let orders = [];
      if (typeof Storage !== 'undefined' && Storage.loadOrders) {
        orders = await Storage.loadOrders();
      } else {
        const raw = localStorage.getItem('bahtbridge_orders_data');
        orders = raw ? JSON.parse(raw) : [];
      }

      const analysis = await analyzeOrders(orders);
      panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#f0fff4,#e8f9f0);border:1px solid #b2dfdb;border-radius:12px;padding:14px 16px">
          <div style="font-size:11px;font-weight:700;color:#2e7d32;letter-spacing:.5px;margin-bottom:8px">🤖 AI วิเคราะห์ธุรกิจ</div>
          <div style="font-size:13px;color:#3d6b4f;line-height:1.6">${analysis.replace(/\n/g, '<br>')}</div>
        </div>`;
    } catch (err) {
      panel.innerHTML = `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;font-size:13px;color:#856404">⚠️ AI ไม่สามารถวิเคราะห์ได้: ${err.message}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 วิเคราะห์ธุรกิจ AI'; }
    }
  }

  // ─── Init: bind buttons when DOM ready ──────────────────────────────────────
  function init() {
    const suggestBtn = document.getElementById('btn-ai-suggest');
    if (suggestBtn) suggestBtn.onclick = showPriceSuggestion;

    const analyzeBtn = document.getElementById('btn-ai-analyze');
    if (analyzeBtn) analyzeBtn.onclick = showOrderAnalysis;
  }

  return {
    init,
    isConfigured,
    suggestSellingPrice,
    analyzeOrders,
    showPriceSuggestion,
    showOrderAnalysis,
    _callGemini: callGemini, // exposed for testing
  };
});

