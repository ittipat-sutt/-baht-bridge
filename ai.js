/**
 * BahtBridge — AI Service (ai.js)
 * Gemini API integration for AI-powered pricing advice, order analysis, and shopping trip organizer.
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
  // รายชื่อโมเดลเรียงตามลำดับ (Auto-Fallback เมื่อโมเดลใดติด Rate-limit หรือ High Demand)
  const CANDIDATE_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3.8-flash',
    'gemini-1.5-flash',
  ];

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
   * ส่ง prompt ไปยัง Gemini API พร้อมระบบ Auto-Fallback ลองโมเดลถัดไปทันที
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async function callGemini(prompt) {
    const key = getApiKey();
    if (!key) throw new Error('GEMINI_API_KEY ไม่ได้ตั้งค่า');

    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            console.log(`🤖 [Gemini AI] Success with model: ${model}`);
            return text.trim();
          }
        }

        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${res.status}`;
        console.warn(`⚠️ [Gemini AI] Model ${model} returned: ${errMsg}, trying next...`);
        lastError = new Error(errMsg);
      } catch (networkErr) {
        console.warn(`⚠️ [Gemini AI] Model ${model} network error: ${networkErr.message}`);
        lastError = networkErr;
      }
    }

    throw lastError || new Error('ไม่สามารถเรียกใช้งานโมเดล AI ได้');
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

  // ─── Feature 3: จัดกลุ่มรายการซื้อตามร้านสำหรับรอบทริป (Shopping Trip Grouping) ─
  /**
   * รวมสินค้าจากทุกออเดอร์แล้วจัดกลุ่มตามร้าน/ย่านการค้า เพื่อนำไปเดินช้อปจริง
   * @param {Array} orders - รายการออเดอร์ทั้งหมด
   * @returns {Promise<Array<{storeName: string, category: string, locationTip: string, items: Array<{name: string, totalQty: number, orders: Array<string>}>}>>}
   */
  async function groupShoppingTrip(orders) {
    if (!orders || orders.length === 0) {
      throw new Error('ไม่พบข้อมูลออเดอร์สำหรับจัดทริปซื้อสินค้า');
    }

    // รวม items ทั้งหมดที่มีในออเดอร์ (เฉพาะสถานะ pending/confirmed หรือทั้งหมด)
    const allItems = [];
    orders.forEach(o => {
      const orderId = o.id || 'N/A';
      const custName = o.customerName || 'ไม่ระบุชื่อ';
      (o.items || []).forEach(it => {
        allItems.push({
          name: it.name || 'สินค้าไม่ระบุชื่อ',
          currency: it.currency || 'USD',
          amount: it.amount || 0,
          quantity: it.quantity || 1,
          orderId,
          customerName: custName,
        });
      });
    });

    if (allItems.length === 0) {
      throw new Error('ไม่มีรายการสินค้าในระบบที่จะนำมาจัดกลุ่ม');
    }

    const itemsSummary = JSON.stringify(allItems);

    const prompt = `คุณเป็นผู้ช่วยไกด์และจัดระบบการช้อปปิ้งของ Reseller/แม่ค้าหิ้วสินค้าต่างประเทศมืออาชีพ
นี่คือรายการสินค้าทั้งหมดที่ลูกค้าฝากซื้อจากออเดอร์ต่างๆ:
${itemsSummary}

หน้าที่ของคุณ:
1. วิเคราะห์สินค้าแต่ละชิ้นว่าควรไปซื้อที่ไหน (เช่น Nike Store / ABC Mart / Don Quijote / Pop Mart / ร้านสะดวกซื้อ / ห้างสรรพสินค้า / ร้านยา Matsumoto / ร้านอนิเมะ Animate ฯลฯ)
2. รวมจำนวนชิ้นของสินค้าที่เหมือนกันหรือประเภทเดียวกันในร้านนั้น (เช่น สินค้าเดียวกันจากคนละลูกค้า ให้รวมจำนวนชิ้นพร้อมระบุว่าของลูกค้าคนไหนบ้าง)
3. ให้คำแนะนำสั้นๆ เกี่ยวกับสถานที่หรือทริคในการซื้อสินค้าร้านนั้นเพื่อประหยัดเวลา

ตอบในรูปแบบ JSON เป็น Array ของหมวดร้านค้าเท่านั้น (ไม่มี markdown fences อื่น):
[
  {
    "storeName": "ชื่อร้านหรือสถานที่ (เช่น Don Quijote / ABC-Mart / ร้านยา)",
    "category": "หมวดสินค้า เช่น รองเท้า/สกินแคร์/ฟิกเกอร์",
    "locationTip": "ทริคหรือพิกัดแนะนำ เช่น แนะนำสาขาใหญ่ชิบุย่าเพื่อของครบ",
    "items": [
      {
        "name": "ชื่อสินค้า",
        "totalQty": 2,
        "customerBreakdown": "คุณปิยะ (1), คุณสมชาย (1)"
      }
    ]
  }
]`;

    const raw = await callGemini(prompt);
    console.log('🤖 [Gemini Shopping Trip Response]:', raw);

    // Clean markdown code blocks if present (```json ... ```)
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
      // First try direct parse
      return JSON.parse(cleaned);
    } catch (_) {
      // Second try: extract array bracket [...]
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      // Third try: if model returned an object with stores/items key { "stores": [...] }
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsedObj = JSON.parse(objMatch[0]);
        if (Array.isArray(parsedObj.stores)) return parsedObj.stores;
        if (Array.isArray(parsedObj.trips)) return parsedObj.trips;
        if (Array.isArray(parsedObj.data)) return parsedObj.data;
      }
      throw new Error('AI ตอบกลับด้วยข้อความที่ไม่ตรงรูปแบบ JSON');
    }
  }

  // ─── UI: แสดง AI Shopping Trip Modal/Panel ─────────────────────────────────
  async function showShoppingTripPlan() {
    const btn = document.getElementById('btn-ai-trip');
    const panel = document.getElementById('ai-trip-panel');
    if (!panel) return;

    if (!isConfigured()) {
      notify('กรุณาตั้งค่า GEMINI_API_KEY ใน config.js เพื่อใช้ฟีเจอร์ AI', 'warning');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '🤖 กำลังจัดกลุ่มทริป...'; }
    panel.style.display = 'block';
    panel.innerHTML = '<div style="text-align:center;padding:20px;color:#1976d2">🛍️ AI กำลังวิเคราะห์และจัดกลุ่มร้านค้าจากทุกออเดอร์...</div>';

    try {
      let orders = [];
      if (typeof StorageService !== 'undefined' && StorageService.getOrders) {
        orders = await StorageService.getOrders();
      } else if (typeof Storage !== 'undefined' && Storage.getOrders) {
        orders = await Storage.getOrders();
      } else {
        const raw = localStorage.getItem('bahtbridge_orders_data');
        orders = raw ? JSON.parse(raw) : [];
      }

      const stores = await groupShoppingTrip(orders);
      let html = `
        <div style="background:#fff;border:1px solid #c8e6f8;border-radius:14px;padding:16px;box-shadow:0 6px 16px rgba(13,110,253,.08)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #edf2f7;padding-bottom:8px">
            <b style="font-size:15px;color:#102d5c">🛍️ รายการช้อปรอบทริปแยกตามร้าน</b>
            <span style="font-size:12px;background:#e8f4fd;color:#0d6efd;padding:3px 8px;border-radius:12px;font-weight:600">${stores.length} พิกัด</span>
          </div>`;

      stores.forEach(store => {
        html += `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:700;font-size:14px;color:#1e293b">🏬 ${store.storeName}</span>
              <span style="font-size:11px;background:#e2e8f0;color:#475569;padding:2px 6px;border-radius:6px">${store.category || 'ทั่วไป'}</span>
            </div>
            ${store.locationTip ? `<div style="font-size:11px;color:#059669;margin-top:2px">💡 ${store.locationTip}</div>` : ''}
            <div style="margin-top:8px;border-top:1px dashed #cbd5e1;padding-top:6px">`;

        (store.items || []).forEach(it => {
          html += `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:4px;font-size:12px">
              <div>
                <span style="font-weight:600;color:#334155">• ${it.name}</span>
                <div style="font-size:11px;color:#64748b;margin-left:8px">ลูกค้า: ${it.customerBreakdown || '-'}</div>
              </div>
              <span style="font-weight:700;color:#0d6efd;white-space:nowrap;margin-left:8px">× ${it.totalQty}</span>
            </div>`;
        });

        html += `</div></div>`;
      });

      html += `
        <button class="outline" style="width:100%;margin-top:4px;font-size:12px;padding:8px" onclick="document.getElementById('ai-trip-panel').style.display='none'">
          ปิดหน้าต่างรายการช้อป
        </button>
      </div>`;

      panel.innerHTML = html;
    } catch (err) {
      panel.innerHTML = `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;font-size:13px;color:#856404">⚠️ จัดกลุ่มไม่สำเร็จ: ${err.message}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🛍️ AI จัดกลุ่มซื้อตามร้าน (รอบทริป)'; }
    }
  }

  // ─── UI: แสดง AI Suggestion ใน Create Order Screen ─────────────────────────
  async function showPriceSuggestion() {
    const btn = document.getElementById('btn-ai-suggest');
    const panel = document.getElementById('ai-suggestion-panel');
    if (!panel) return;

    if (!isConfigured()) {
      notify('กรุณาตั้งค่า GEMINI_API_KEY ใน config.js เพื่อใช้ฟีเจอร์ AI', 'warning');
      return;
    }

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

    if (btn) { btn.disabled = true; btn.textContent = '🤖 กำลังวิเคราะห์...'; }
    panel.style.display = 'block';
    panel.innerHTML = '<div style="text-align:center;padding:16px;color:#5b7fa6">⏳ AI กำลังคำนวณราคาแนะนำ...</div>';

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

  // ─── UI: แสดงผลวิเคราะห์ธุรกิจใน Dashboard ──────────────────────────────────
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
      if (typeof StorageService !== 'undefined' && StorageService.getOrders) {
        orders = await StorageService.getOrders();
      } else if (typeof Storage !== 'undefined' && Storage.getOrders) {
        orders = await Storage.getOrders();
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

    const tripBtn = document.getElementById('btn-ai-trip');
    if (tripBtn) tripBtn.onclick = showShoppingTripPlan;
  }

  return {
    init,
    isConfigured,
    suggestSellingPrice,
    analyzeOrders,
    groupShoppingTrip,
    showPriceSuggestion,
    showOrderAnalysis,
    showShoppingTripPlan,
    _callGemini: callGemini,
  };
});
