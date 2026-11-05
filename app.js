/**
 * BahtBridge — Core Application Logic (app.js)
 * Role: Person 3 (Logic & Data Layer)
 * Compliant with DATA_MODEL.md, HTML_CONTRACT.md, and pricing.js
 */

// ─── Toast / Notification Helper ──────────────────────────────────────────────
function notify(message, type = 'info') {
  if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
    window.UI.showToast(message, type);
  } else {
    alert(message);
  }
}

// ─── XSS Prevention ──────────────────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Thai Date / Time Formatter ───────────────────────────────────────────────
function formatThaiDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const day = d.getDate();
  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  const month = thaiMonths[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

function formatThaiDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${formatThaiDate(isoString)} ${time} น.`;
}

// ─── Navigation & Screen Switching ───────────────────────────────────────────
function updateNavActive(screenId) {
  document.querySelectorAll('.bottom .nav').forEach((nav) => {
    nav.classList.remove('on');
    const label = nav.textContent.trim().toLowerCase();
    if (
      (screenId === 'dashboard' && label.includes('dashboard')) ||
      (screenId === 'orders' && label.includes('orders')) ||
      (screenId === 'profile' && label.includes('profile'))
    ) {
      nav.classList.add('on');
    }
  });
}

function show(id) {
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
  }
  updateNavActive(id);

  if (id === 'dashboard') renderDashboard();
  if (id === 'orders') renderOrdersList();
  if (id === 'profile') renderProfile();
}

// ─── Exchange Rates & Live API Integration ────────────────────────────────────
const FALLBACK_RATES = { USD: 33.0, JPY: 0.22, KRW: 0.025, CNY: 4.55, EUR: 36.2 };
let exchangeRates = { ...FALLBACK_RATES };
let ratesLastFetched = null;
let currentRateSource = 'fallback'; // 'api' | 'fallback' | 'manual'

async function fetchExchangeRates() {
  setApiStatus('loading');
  try {
    const cached = localStorage.getItem('bb_rates_cache');
    if (cached) {
      const { ts, rates } = JSON.parse(cached);
      if (Date.now() - ts < 10 * 60 * 1000) {
        exchangeRates = rates;
        ratesLastFetched = new Date(ts);
        currentRateSource = 'api';
        setApiStatus('ok');
        return;
      }
    }

    const res = await fetch('https://api.exchangerate-api.com/v4/latest/THB');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const newRates = {};
    for (const cur of Object.keys(FALLBACK_RATES)) {
      newRates[cur] = data.rates[cur] ? Number((1 / data.rates[cur]).toFixed(4)) : FALLBACK_RATES[cur];
    }
    exchangeRates = newRates;
    ratesLastFetched = new Date();
    currentRateSource = 'api';
    localStorage.setItem('bb_rates_cache', JSON.stringify({ ts: Date.now(), rates: newRates }));
    setApiStatus('ok');
  } catch (err) {
    console.warn('Exchange rate API error, using fallback:', err);
    exchangeRates = { ...FALLBACK_RATES };
    currentRateSource = 'fallback';
    setApiStatus('error');
  }
}

function setApiStatus(state) {
  const el = document.getElementById('api-ok');
  if (!el) return;
  const time = ratesLastFetched
    ? ratesLastFetched.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : 'วันนี้';

  if (state === 'loading') {
    el.className = 'api loading';
    el.innerHTML = '<span class="spin"></span> กำลังดึงอัตราแลกเปลี่ยนจริง...';
  } else if (state === 'ok') {
    el.className = 'api';
    el.style.background = '';
    el.style.color = '';
    el.textContent = `● อัตราแลกเปลี่ยนอัปเดตล่าสุด: ${time} (Live API)`;
  } else {
    el.className = 'api';
    el.style.background = '#fff5f5';
    el.style.color = '#be3940';
    el.textContent = '⚠ ใช้อัตราแลกเปลี่ยนสำรอง (ออฟไลน์)';
  }
}

const countryInfo = {
  USD: ['🇺🇸', 'สหรัฐอเมริกา'],
  JPY: ['🇯🇵', 'ญี่ปุ่น'],
  KRW: ['🇰🇷', 'เกาหลีใต้'],
  CNY: ['🇨🇳', 'จีน'],
  EUR: ['🇪🇺', 'ยุโรป'],
};
const productIcons = ['👟', '🧸', '👕', '🎧', '⌚', '🎒', '🕶️', '💻'];

// ─── LocalStorage Persistence & Settings ──────────────────────────────────────
const ORDERS_STORAGE_KEY = 'bahtbridge_orders_data';
const SETTINGS_STORAGE_KEY = 'bahtbridge_settings';

function getSettings() {
  const defaults = {
    nextOrderNo: 3,
    defaultShipping: 150,
    serviceFeeType: 'fixed', // 'fixed' | 'percent'
    serviceFeeValue: 100,
    rateMarkupPercent: 0,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return Object.assign(defaults, JSON.parse(raw));
    }
  } catch (e) {
    console.error('Error reading settings', e);
  }
  return defaults;
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving settings', e);
  }
}

function getNextOrderId(orders) {
  const settings = getSettings();
  let maxNum = 0;
  (orders || []).forEach((o) => {
    const m = o.id && String(o.id).match(/\d+/);
    if (m) {
      const num = parseInt(m[0], 10);
      if (num > maxNum) maxNum = num;
    }
  });

  let nextNo = settings.nextOrderNo || (maxNum + 1) || 1;
  if (nextNo <= maxNum) {
    nextNo = maxNum + 1;
  }
  settings.nextOrderNo = nextNo + 1;
  saveSettings(settings);

  return `#BR${String(nextNo).padStart(3, '0')}`;
}

const defaultOrders = [
  {
    id: '#BR001',
    customerName: 'คุณปิยะ วัฒนะ',
    customerPhone: '081-234-5678',
    customerAddress: 'LINE: @piya',
    createdAt: '2026-09-24T08:00:00.000Z',
    dateFormatted: '24 ก.ย. 2569',
    date: '24 ก.ย. 2569',
    status: 'กำลังดำเนินการ',
    orderStatus: 'pending',
    paymentStatus: 'unpaid',
    ratesSnapshot: { USD: 33.0, JPY: 0.22, KRW: 0.025, CNY: 4.55, EUR: 36.2 },
    ratesAt: '2026-09-24T08:00:00.000Z',
    rateSource: 'fallback',
    shipping: 150,
    shippingFee: 150,
    fee: 100,
    serviceFee: 100,
    feeType: 'fixed',
    feeValue: 100,
    goodsThb: 3500,
    goodsTotal: 3500,
    totalThb: 3750,
    grandTotal: 3750,
    items: [
      { name: 'Shoes', currency: 'USD', amount: 50, originalPrice: 50, quantity: 1, exchangeRate: 33.0 },
      { name: 'Figure', currency: 'JPY', amount: 5000, originalPrice: 5000, quantity: 1, exchangeRate: 0.22 },
      { name: 'Shirt', currency: 'KRW', amount: 30000, originalPrice: 30000, quantity: 1, exchangeRate: 0.025 },
    ],
  },
  {
    id: '#BR002',
    customerName: 'คุณนิดา เกียรติสกุล',
    customerPhone: '089-876-5432',
    customerAddress: 'IG: @nida_shop',
    createdAt: '2026-09-23T10:30:00.000Z',
    dateFormatted: '23 ก.ย. 2569',
    date: '23 ก.ย. 2569',
    status: 'ยืนยันแล้ว',
    orderStatus: 'completed',
    paymentStatus: 'paid',
    ratesSnapshot: { USD: 33.0, JPY: 0.22, KRW: 0.025, CNY: 4.55, EUR: 36.2 },
    ratesAt: '2026-09-23T10:30:00.000Z',
    rateSource: 'fallback',
    shipping: 110,
    shippingFee: 110,
    fee: 100,
    serviceFee: 100,
    feeType: 'fixed',
    feeValue: 100,
    goodsThb: 1980,
    goodsTotal: 1980,
    totalThb: 2190,
    grandTotal: 2190,
    items: [
      { name: 'Headphone', currency: 'USD', amount: 60, originalPrice: 60, quantity: 1, exchangeRate: 33.0 },
    ],
  },
];

// Migration for existing/legacy orders without snapshots
function migrateOrders(orders) {
  let hasChange = false;
  const nowIso = new Date().toISOString();

  orders.forEach((o) => {
    if (!o.createdAt) {
      o.createdAt = nowIso;
      hasChange = true;
    }
    if (!o.dateFormatted) {
      o.dateFormatted = o.date && !o.date.includes('วันนี้') && !o.date.includes('เมื่อวาน')
        ? o.date
        : formatThaiDate(o.createdAt);
      hasChange = true;
    }
    if (!o.date) {
      o.date = o.dateFormatted;
      hasChange = true;
    }

    // Ensure locked rate snapshot exists
    if (!o.ratesSnapshot) {
      const snap = { ...FALLBACK_RATES };
      if (Array.isArray(o.items)) {
        o.items.forEach((item) => {
          if (item.currency && item.exchangeRate) {
            snap[item.currency] = Number(item.exchangeRate);
          }
        });
      }
      o.ratesSnapshot = snap;
      o.ratesAt = o.createdAt || nowIso;
      o.rateSource = 'fallback';
      hasChange = true;
    }

    if (Array.isArray(o.items)) {
      o.items.forEach((item) => {
        if (item.amount === undefined && item.originalPrice !== undefined) {
          item.amount = item.originalPrice;
          hasChange = true;
        }
        if (item.originalPrice === undefined && item.amount !== undefined) {
          item.originalPrice = item.amount;
          hasChange = true;
        }
      });
    }

    // Ensure goodsThb and totalThb are calculated from ratesSnapshot
    if (typeof Pricing !== 'undefined' && (o.goodsThb === undefined || o.totalThb === undefined)) {
      const totals = Pricing.calcOrderTotals(o);
      o.goodsThb = o.goodsTotal !== undefined ? o.goodsTotal : totals.goodsThb;
      o.totalThb = o.grandTotal !== undefined ? o.grandTotal : (o.total !== undefined ? o.total : totals.totalThb);
      o.goodsTotal = o.goodsThb;
      o.grandTotal = o.totalThb;
      hasChange = true;
    }
  });

  if (hasChange) {
    saveOrdersToStorage(orders);
  }
  return orders;
}

function getStoredOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(defaultOrders));
      return defaultOrders;
    }
    const parsed = JSON.parse(raw);
    return migrateOrders(Array.isArray(parsed) ? parsed : defaultOrders);
  } catch (e) {
    console.error('Error reading localStorage', e);
    return defaultOrders;
  }
}

function saveOrdersToStorage(orders) {
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error('Error saving to localStorage', e);
  }
}

// ─── Draft Products in Create Form ────────────────────────────────────────────
let draftProducts = [];
let activeViewingOrder = null;

const money = (amount) => `฿ ${Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Live Order Summary Calculation in Create Screen
function renderCreateSummary() {
  const settings = getSettings();
  const shippingInput = document.getElementById('order-shipping');
  const feeInput = document.getElementById('order-fee');

  const shipping = shippingInput ? Number(shippingInput.value) || 0 : (settings.defaultShipping || 0);
  const fee = feeInput ? Number(feeInput.value) || 0 : (settings.serviceFeeValue || 0);

  const snapshot = Pricing.lockRates(exchangeRates, settings.rateMarkupPercent || 0);
  const draftOrder = {
    items: draftProducts,
    ratesSnapshot: snapshot,
    shipping,
    feeType: 'fixed',
    feeValue: fee,
  };

  const totals = Pricing.calcOrderTotals(draftOrder);

  const goodsEl = document.getElementById('summary-goods');
  const totalEl = document.getElementById('summary-total');
  if (goodsEl) goodsEl.textContent = money(totals.goodsThb);
  if (totalEl) totalEl.textContent = money(totals.totalThb);
}

// Render Draft Products in Create Screen
function renderCreateProducts() {
  const container = document.getElementById('mini-products-list');
  if (!container) return;
  container.innerHTML = '';

  const settings = getSettings();
  const snapshot = Pricing.lockRates(exchangeRates, settings.rateMarkupPercent || 0);

  draftProducts.forEach((product, index) => {
    const [flag] = countryInfo[product.currency] || ['🌐', ''];
    const rate = snapshot[product.currency] || 1;
    const subtotal = Pricing.round2(product.amount * product.quantity * rate);

    const card = document.createElement('div');
    card.className = 'mini-product';
    card.innerHTML = `
      <div class="row">
        <span class="product-title">${flag} ${esc(product.name)}</span>
        <div>
          <b>${product.amount.toLocaleString()} ${esc(product.currency)} × ${product.quantity}</b>
          <button class="del-btn" onclick="deleteDraftProduct(${index})" title="ลบสินค้านี้">🗑️</button>
        </div>
      </div>
      <div class="convert">
        อัตราแลกเปลี่ยน ${rate} <b>→ ${money(subtotal)}</b>
      </div>
    `;
    container.appendChild(card);
  });

  renderCreateSummary();
}

function deleteDraftProduct(index) {
  draftProducts.splice(index, 1);
  renderCreateProducts();
}

// ─── Setup Form (Direct Select, Dynamic Fees) ─────────────────────────────────
function setupOrderForm() {
  const settings = getSettings();

  // Initialize dynamic shipping and fee inputs from settings
  const shippingInput = document.getElementById('order-shipping');
  const feeInput = document.getElementById('order-fee');
  if (shippingInput && !shippingInput.value) {
    shippingInput.value = settings.defaultShipping ?? 150;
  }
  if (feeInput && !feeInput.value) {
    feeInput.value = settings.serviceFeeValue ?? 100;
  }

  const countrySel = document.getElementById('country-select');
  const currencySel = document.getElementById('currency-select');

  if (countrySel && currencySel) {
    countrySel.onchange = () => {
      currencySel.value = countrySel.value;
    };
    currencySel.onchange = () => {
      countrySel.value = currencySel.value;
    };
  }

  const addBtn = document.getElementById('btn-add-product');
  if (addBtn) {
    addBtn.onclick = () => {
      const nameInput = document.getElementById('product-name');
      const priceInput = document.getElementById('product-price');
      const qtyInput = document.getElementById('product-qty');
      const currency = currencySel ? currencySel.value : 'USD';

      const name = nameInput.value.trim();
      const amount = Number(priceInput.value);
      const quantity = Number(qtyInput.value);

      const errors = [];
      if (!name) errors.push('• ชื่อสินค้า');
      if (!amount || amount <= 0) errors.push('• ราคาสินค้า (ต้องมากกว่า 0)');
      if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) errors.push('• จำนวนสินค้า (ต้องเป็นจำนวนเต็มอย่างน้อย 1)');

      if (errors.length > 0) {
        notify('กรุณากรอกข้อมูลสินค้าให้ถูกต้อง:\n' + errors.join('\n'), 'warning');
        return;
      }

      draftProducts.push({
        name,
        currency,
        amount,
        originalPrice: amount,
        quantity,
      });

      nameInput.value = '';
      priceInput.value = '';
      qtyInput.value = '1';
      renderCreateProducts();
    };
  }
}

// ─── Calculate & Prepare Order Detail (Lock Rates) ────────────────────────────
async function calculateOrder() {
  const custName = (document.getElementById('cust-name')?.value || '').trim();
  const custPhone = (document.getElementById('cust-phone')?.value || '').trim();
  const custAddress = (document.getElementById('cust-address')?.value || '').trim();

  if (!custName) {
    notify('กรุณากรอกชื่อลูกค้าก่อนคำนวณราคา', 'warning');
    document.getElementById('cust-name')?.focus();
    return;
  }

  if (draftProducts.length === 0) {
    notify('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning');
    return;
  }

  const calcBtn = document.querySelector('#create .sticky .primary');
  if (calcBtn) {
    calcBtn.disabled = true;
    calcBtn.textContent = 'กำลังคำนวณ...';
  }

  show('loading');

  try {
    await fetchExchangeRates();
  } catch (err) {
    console.error('Error fetching rates:', err);
  } finally {
    const settings = getSettings();
    const ratesSnapshot = Pricing.lockRates(exchangeRates, settings.rateMarkupPercent || 0);

    const shippingInput = document.getElementById('order-shipping');
    const feeInput = document.getElementById('order-fee');
    const shipping = shippingInput ? Number(shippingInput.value) || 0 : (settings.defaultShipping || 150);
    const fee = feeInput ? Number(feeInput.value) || 0 : (settings.serviceFeeValue || 100);

    const draftOrder = {
      id: 'DRAFT',
      customerName: custName,
      customerPhone: custPhone || '-',
      customerAddress: custAddress || '-',
      createdAt: new Date().toISOString(),
      dateFormatted: formatThaiDate(new Date().toISOString()),
      date: 'วันนี้',
      status: 'กำลังดำเนินการ',
      orderStatus: 'pending',
      paymentStatus: 'unpaid',
      ratesSnapshot,
      ratesAt: new Date().toISOString(),
      rateSource: currentRateSource, // 'api' | 'fallback'
      shipping,
      shippingFee: shipping,
      fee,
      serviceFee: fee,
      feeType: 'fixed',
      feeValue: fee,
      items: draftProducts.map((p) => ({
        ...p,
        exchangeRate: ratesSnapshot[p.currency] || 1,
      })),
      isDraft: true,
    };

    const totals = Pricing.calcOrderTotals(draftOrder);
    draftOrder.goodsThb = totals.goodsThb;
    draftOrder.totalThb = totals.totalThb;
    draftOrder.goodsTotal = totals.goodsThb;
    draftOrder.grandTotal = totals.totalThb;

    activeViewingOrder = draftOrder;

    populateDetailScreen(activeViewingOrder);
    populateCustomerScreen(activeViewingOrder);
    show('detail');

    if (calcBtn) {
      calcBtn.disabled = false;
      calcBtn.textContent = 'คำนวณราคา & บันทึกออเดอร์';
    }
  }
}

// ─── Allow Merchant to Manually Adjust Exchange Rate ─────────────────────────
function updateManualRate(currency, newRateVal) {
  if (!activeViewingOrder) return;
  const newRate = Number(newRateVal);
  if (!newRate || newRate <= 0) {
    notify('กรุณาระบุอัตราแลกเปลี่ยนที่มากกว่า 0', 'warning');
    return;
  }

  activeViewingOrder.ratesSnapshot[currency] = newRate;
  activeViewingOrder.rateSource = 'manual';

  // Recalculate totals
  const totals = Pricing.calcOrderTotals(activeViewingOrder);
  activeViewingOrder.goodsThb = totals.goodsThb;
  activeViewingOrder.totalThb = totals.totalThb;
  activeViewingOrder.goodsTotal = totals.goodsThb;
  activeViewingOrder.grandTotal = totals.totalThb;

  populateDetailScreen(activeViewingOrder);
  populateCustomerScreen(activeViewingOrder);
  notify(`อัปเดตอัตราแลกเปลี่ยน ${currency} = ${newRate} (Manual) สำเร็จ`, 'success');
}

// ─── Populate Detail Screen ───────────────────────────────────────────────────
function populateDetailScreen(order) {
  const totals = Pricing.calcOrderTotals(order);

  const title = document.getElementById('detail-order-title');
  if (title) title.textContent = order.isDraft ? 'สรุปคำนวณออเดอร์ใหม่' : `รายละเอียดออเดอร์ ${order.id}`;

  const nameEl = document.getElementById('detail-customer-name');
  if (nameEl) nameEl.textContent = order.customerName;

  const contactEl = document.getElementById('detail-customer-contact');
  if (contactEl) {
    contactEl.textContent = `📞 ${order.customerPhone} · ${order.customerAddress}`;
  }

  const metaEl = document.getElementById('detail-order-meta');
  if (metaEl) {
    const displayDate = order.dateFormatted || order.date || formatThaiDate(order.createdAt);
    const statusText = order.status || (order.orderStatus === 'completed' ? 'ยืนยันแล้ว' : 'กำลังดำเนินการ');
    const lockedTime = order.ratesAt ? formatThaiDateTime(order.ratesAt) : displayDate;
    const rateSourceTag = order.rateSource === 'manual'
      ? '<span style="color:#2389ec">● เรทระบุเอง</span>'
      : (order.rateSource === 'api' ? '<span style="color:#16a36a">● เรทสด</span>' : '<span style="color:#df4c53">● เรทสำรอง</span>');

    metaEl.innerHTML = `${esc(displayDate)} · <span style="color:${statusText === 'ยืนยันแล้ว' ? '#16a36a' : '#ffb020'}">● ${esc(statusText)}</span><br><small style="color:#8ba3c7">ล็อกเรทเมื่อ: ${esc(lockedTime)} (${rateSourceTag})</small>`;
  }

  // Fallback / Manual Warning Banner with inline editor
  const fallbackWarnEl = document.getElementById('detail-fallback-warning');
  if (fallbackWarnEl) {
    if (order.rateSource === 'fallback' || order.rateSource === 'manual') {
      fallbackWarnEl.style.display = 'block';
      const currencies = [...new Set(order.items.map((i) => i.currency || 'USD'))];
      const inputsHtml = currencies
        .map(
          (c) => `
          <label style="font-size:12px;display:inline-flex;align-items:center;gap:4px;margin-right:10px">
            <b>${esc(c)}:</b>
            <input type="number" step="0.0001" value="${order.ratesSnapshot?.[c] ?? FALLBACK_RATES[c] ?? 1}"
              style="width:85px;height:28px;padding:2px 6px;border-radius:6px;border:1px solid #d0d7de"
              onchange="updateManualRate('${esc(c)}', this.value)" />
          </label>
        `
        )
        .join('');

      fallbackWarnEl.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px">
          ${order.rateSource === 'manual' ? '✏️ กำลังใช้อัตราแลกเปลี่ยนที่ระบุเอง (Manual)' : '⚠️ ใช้อัตราแลกเปลี่ยนสำรอง (ออฟไลน์) กรุณาตรวจสอบหรือแก้เรท:'}
        </div>
        <div style="margin-top:6px">${inputsHtml}</div>
      `;
    } else {
      fallbackWarnEl.style.display = 'none';
    }
  }

  // Render items using lines from Pricing.calcOrderTotals (guaranteed sum match!)
  const listEl = document.getElementById('detail-items-list');
  if (listEl) {
    listEl.innerHTML = '';
    totals.lines.forEach((line) => {
      const [flag] = countryInfo[line.currency] || ['🌐'];
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div class="flag">${flag}</div>
        <div class="item-info">
          <strong>${esc(line.name)}</strong>
          <small>${line.amount.toLocaleString()} ${esc(line.currency)} × ${line.quantity} · Rate ${line.rate}</small>
        </div>
        <div class="price">→ ${money(line.subtotalThb)}<small>แปลงแล้ว</small></div>
      `;
      listEl.appendChild(item);
    });
  }

  // Populate dynamic summary
  const goodsEl = document.getElementById('detail-summary-goods');
  const shipEl = document.getElementById('detail-summary-shipping');
  const feeEl = document.getElementById('detail-summary-fee');
  const totalEl = document.getElementById('detail-summary-total');

  if (goodsEl) goodsEl.textContent = money(totals.goodsThb);
  if (shipEl) shipEl.textContent = money(totals.shipping);
  if (feeEl) feeEl.textContent = money(totals.fee);
  if (totalEl) totalEl.textContent = money(totals.totalThb);

  const confirmBtn = document.getElementById('btn-confirm-order');
  if (confirmBtn) {
    confirmBtn.textContent = order.isDraft ? 'บันทึก & ยืนยันออเดอร์' : 'อัปเดตสถานะเป็นยืนยันแล้ว';
  }
}

// ─── Populate Customer View Screen ────────────────────────────────────────────
function populateCustomerScreen(order) {
  const totals = Pricing.calcOrderTotals(order);

  const idEl = document.getElementById('cust-view-order-id');
  if (idEl) idEl.textContent = order.isDraft ? 'ออเดอร์ใหม่ของคุณ' : `Order ${order.id}`;

  const nameEl = document.getElementById('cust-view-name');
  if (nameEl) nameEl.textContent = order.customerName;

  const contactEl = document.getElementById('cust-view-contact');
  if (contactEl) contactEl.textContent = `📞 ${order.customerPhone}`;

  const dueEl = document.getElementById('cust-view-due');
  if (dueEl) dueEl.textContent = money(totals.totalThb);

  const countEl = document.getElementById('cust-view-count');
  if (countEl) countEl.textContent = `${totals.lines.length} รายการ`;

  const listEl = document.getElementById('customer-items-list');
  if (listEl) {
    listEl.innerHTML = '';
    totals.lines.forEach((line, idx) => {
      const [flag, country] = countryInfo[line.currency] || ['🌐', 'ต่างประเทศ'];
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div class="photo">${productIcons[idx % productIcons.length]}</div>
        <div class="item-info">
          <strong>${esc(line.name)}</strong>
          <small>${flag} ${country} · ${line.amount.toLocaleString()} ${esc(line.currency)} (×${line.quantity})</small>
        </div>
        <div class="price">${money(line.subtotalThb)}</div>
      `;
      listEl.appendChild(item);
    });
  }

  const sumGoods = document.getElementById('cust-summary-goods');
  const sumShip = document.getElementById('cust-summary-shipping');
  const sumFee = document.getElementById('cust-summary-fee');
  const sumTotal = document.getElementById('cust-summary-total');

  if (sumGoods) sumGoods.textContent = money(totals.goodsThb);
  if (sumShip) sumShip.textContent = money(totals.shipping);
  if (sumFee) sumFee.textContent = money(totals.fee);
  if (sumTotal) sumTotal.textContent = money(totals.totalThb);
}

// ─── Confirm Order & Persist ──────────────────────────────────────────────────
function confirmCurrentOrder() {
  if (!activeViewingOrder) return;

  const orders = getStoredOrders();

  if (activeViewingOrder.isDraft) {
    const newId = getNextOrderId(orders);
    const nowIso = new Date().toISOString();
    const thaiDate = formatThaiDate(nowIso);

    // Compute final totals via Pricing
    const totals = Pricing.calcOrderTotals(activeViewingOrder);

    const newOrder = {
      ...activeViewingOrder,
      id: newId,
      createdAt: nowIso,
      dateFormatted: thaiDate,
      date: thaiDate,
      status: 'กำลังดำเนินการ',
      orderStatus: 'pending',
      paymentStatus: 'unpaid',
      goodsThb: totals.goodsThb,
      totalThb: totals.totalThb,
      goodsTotal: totals.goodsThb,
      grandTotal: totals.totalThb,
      shipping: totals.shipping,
      shippingFee: totals.shipping,
      fee: totals.fee,
      serviceFee: totals.fee,
      isDraft: false,
    };

    orders.unshift(newOrder);
    saveOrdersToStorage(orders);
    activeViewingOrder = newOrder;

    const idEl = document.getElementById('success-order-id');
    const nameEl = document.getElementById('success-customer-name');
    const phoneEl = document.getElementById('success-customer-phone');
    const totalEl = document.getElementById('success-order-total');

    if (idEl) idEl.textContent = newOrder.id;
    if (nameEl) nameEl.textContent = newOrder.customerName;
    if (phoneEl) phoneEl.textContent = newOrder.customerPhone;
    if (totalEl) totalEl.textContent = money(newOrder.totalThb);

    // Reset draft form
    draftProducts = [];
    const custName = document.getElementById('cust-name');
    const custPhone = document.getElementById('cust-phone');
    const custAddress = document.getElementById('cust-address');
    if (custName) custName.value = '';
    if (custPhone) custPhone.value = '';
    if (custAddress) custAddress.value = '';
    renderCreateProducts();
  } else {
    activeViewingOrder.status = 'ยืนยันแล้ว';
    activeViewingOrder.orderStatus = 'completed';
    const idx = orders.findIndex((o) => o.id === activeViewingOrder.id);
    if (idx !== -1) {
      orders[idx] = activeViewingOrder;
      saveOrdersToStorage(orders);
    }
  }

  renderDashboard();
  renderOrdersList();
  renderProfile();
  show('success');
}

// View an Order from History (Calculates strictly from order.ratesSnapshot!)
function viewOrderDetail(orderId) {
  const orders = getStoredOrders();
  const found = orders.find((o) => o.id === orderId);
  if (!found) return;

  activeViewingOrder = { ...found, isDraft: false };
  populateDetailScreen(activeViewingOrder);
  populateCustomerScreen(activeViewingOrder);
  show('detail');
}

// ─── Render Dashboard ─────────────────────────────────────────────────────────
function renderDashboard() {
  const orders = getStoredOrders();
  const totalCount = orders.length;
  const pendingCount = orders.filter((o) => o.status === 'กำลังดำเนินการ' || o.orderStatus === 'pending').length;
  const totalSales = orders.reduce((sum, o) => {
    const totals = Pricing.calcOrderTotals(o);
    return sum + totals.totalThb;
  }, 0);

  const totalEl = document.getElementById('stat-total-orders');
  const pendingEl = document.getElementById('stat-pending-orders');
  const salesEl = document.getElementById('stat-total-sales');

  if (totalEl) totalEl.textContent = totalCount;
  if (pendingEl) pendingEl.textContent = pendingCount;
  if (salesEl) salesEl.textContent = money(totalSales);

  const listEl = document.getElementById('dashboard-recent-orders');
  if (!listEl) return;
  listEl.innerHTML = '';

  const recents = orders.slice(0, 3);
  recents.forEach((order) => {
    const totals = Pricing.calcOrderTotals(order);
    const displayDate = order.dateFormatted || order.date || formatThaiDate(order.createdAt);
    const statusText = order.status || (order.orderStatus === 'completed' ? 'ยืนยันแล้ว' : 'กำลังดำเนินการ');

    const card = document.createElement('div');
    card.className = 'order';
    card.onclick = () => viewOrderDetail(order.id);
    card.innerHTML = `
      <div class="order-head">
        <strong>${esc(order.id)} · ${esc(order.customerName)}</strong>
        <span class="tag ${statusText === 'ยืนยันแล้ว' ? 'green' : ''}">${esc(statusText)}</span>
      </div>
      <div class="order-meta">
        ${order.items.length} สินค้า · ${esc(displayDate)}
        <span class="money" style="float:right">${money(totals.totalThb)}</span>
      </div>
    `;
    listEl.appendChild(card);
  });
}

// ─── Render Orders List ───────────────────────────────────────────────────────
function renderOrdersList() {
  const orders = getStoredOrders();
  const listEl = document.getElementById('orders-list');
  if (!listEl) return;

  const cards = listEl.querySelectorAll('.order');
  cards.forEach((c) => c.remove());

  orders.forEach((order) => {
    const totals = Pricing.calcOrderTotals(order);
    const statusText = order.status || (order.orderStatus === 'completed' ? 'ยืนยันแล้ว' : 'กำลังดำเนินการ');

    const card = document.createElement('div');
    card.className = 'order';
    card.dataset.search = `${order.id} ${order.customerName} ${order.customerPhone || ''}`.toLowerCase();
    card.onclick = () => viewOrderDetail(order.id);
    card.innerHTML = `
      <div class="order-head">
        <strong>${esc(order.id)} · ${esc(order.customerName)}</strong>
        <span class="tag ${statusText === 'ยืนยันแล้ว' ? 'green' : ''}">${esc(statusText)}</span>
      </div>
      <div class="order-meta">
        ${order.items.length} สินค้า · ${esc(order.customerPhone || '-')}
        <span class="money" style="float:right">${money(totals.totalThb)}</span>
      </div>
    `;
    const emptyEl = document.getElementById('empty-orders');
    if (emptyEl) {
      listEl.insertBefore(card, emptyEl);
    } else {
      listEl.appendChild(card);
    }
  });

  const searchInput = document.getElementById('order-search');
  if (searchInput && searchInput.value) {
    filterOrders(searchInput.value);
  }
}

// ─── Render Profile Statistics ────────────────────────────────────────────────
function renderProfile() {
  const orders = getStoredOrders();
  const totalOrders = orders.length;
  const confirmedOrders = orders.filter((o) => o.status === 'ยืนยันแล้ว' || o.orderStatus === 'completed').length;
  const totalSales = orders.reduce((sum, o) => {
    const totals = Pricing.calcOrderTotals(o);
    return sum + totals.totalThb;
  }, 0);

  const totalEl = document.getElementById('profile-total-orders');
  const confEl = document.getElementById('profile-confirmed-orders');
  const salesEl = document.getElementById('profile-total-sales');

  if (totalEl) totalEl.textContent = totalOrders;
  if (confEl) confEl.textContent = confirmedOrders;
  if (salesEl) salesEl.textContent = money(totalSales);
}

// ─── Check Capacitor Environment ──────────────────────────────────────────────
function checkCapacitorEnvironment() {
  const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
  const apkLink = document.querySelector('a[href$=".apk"]');
  if (apkLink && isNative) {
    apkLink.style.display = 'none';
  }
}

// ─── Search Filter ────────────────────────────────────────────────────────────
function filterOrders(query) {
  const q = query.toLowerCase().trim();
  const cards = document.querySelectorAll('#orders-list .order');
  let found = 0;
  cards.forEach((card) => {
    const text = (card.dataset.search || card.textContent).toLowerCase();
    const isMatch = !q || text.includes(q);
    card.style.display = isMatch ? '' : 'none';
    if (isMatch) found++;
  });
  const empty = document.getElementById('empty-orders');
  if (empty) empty.style.display = found === 0 ? 'block' : 'none';
}

// ─── Share Summary ────────────────────────────────────────────────────────────
function shareOrderSummary() {
  if (!activeViewingOrder) return;
  const o = activeViewingOrder;
  const totals = Pricing.calcOrderTotals(o);
  const text = `🛍️ สรุปออเดอร์ ${o.id || ''}\nลูกค้า: ${o.customerName}\nเบอร์โทร: ${o.customerPhone}\nยอดชำระ: ${money(totals.totalThb)}\n(BahtBridge)`;

  if (navigator.share) {
    navigator.share({ title: 'BahtBridge Order', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      notify('คัดลอกสรุปออเดอร์ไปยัง Clipboard แล้ว!', 'success');
    });
  } else {
    notify(text, 'info');
  }
}

// ─── Backup & Restore ─────────────────────────────────────────────────────────
function exportOrdersData() {
  const orders = getStoredOrders();
  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appName: 'BahtBridge',
    ordersCount: orders.length,
    orders: orders,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `bahtbridge-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importOrdersData(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.orders)) {
        notify('รูปแบบไฟล์ไม่ถูกต้อง: ต้องเป็นไฟล์สำรองข้อมูลของ BahtBridge (JSON)', 'error');
        return;
      }
      if (confirm(`พบข้อมูลออเดอร์ ${data.orders.length} รายการ คุณต้องการนำเข้าข้อมูลนี้ทับข้อมูลปัจจุบันหรือไม่?`)) {
        saveOrdersToStorage(data.orders);
        renderDashboard();
        renderOrdersList();
        renderProfile();
        notify(`นำเข้าข้อมูลสำเร็จ! โหลดออเดอร์แล้ว ${data.orders.length} รายการ`, 'success');
      }
    } catch (err) {
      notify('เกิดข้อผิดพลาดในการอ่านไฟล์สำรอง: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Initialize Application ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupOrderForm();
  renderCreateProducts();
  renderDashboard();
  renderOrdersList();
  renderProfile();
  checkCapacitorEnvironment();

  fetchExchangeRates().then(() => {
    renderCreateProducts();
    renderDashboard();
    renderOrdersList();
    renderProfile();
  });
});
