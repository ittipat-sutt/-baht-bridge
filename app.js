/**
 * BahtBridge — Order & Customer Management Logic
 * Step 2 Improvements:
 * 1. Fixed duplicate item addition bug (prevent double listener binding)
 * 2. Locked exchange rate per order (frozen rateAtOrder, won't drift with live rates)
 * 3. Dynamic editable shipping fee and service fee
 * 4. XSS sanitization for all user inputs & clean initial state
 */

// XSS Sanitizer Helper
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Navigation & Tab Highlighting
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
}

// Exchange Rates & API Integration
const FALLBACK_RATES = { USD: 33.0, JPY: 0.22, KRW: 0.025, CNY: 4.55, EUR: 36.2 };
let exchangeRates = { ...FALLBACK_RATES };
let ratesLastFetched = null;

async function fetchExchangeRates() {
  setApiStatus('loading');
  try {
    const cached = localStorage.getItem('bb_rates_cache');
    if (cached) {
      const { ts, rates } = JSON.parse(cached);
      if (Date.now() - ts < 10 * 60 * 1000) {
        exchangeRates = rates;
        ratesLastFetched = new Date(ts);
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
    localStorage.setItem('bb_rates_cache', JSON.stringify({ ts: Date.now(), rates: newRates }));
    setApiStatus('ok');
  } catch (err) {
    console.warn('Exchange rate API error, using fallback:', err);
    exchangeRates = { ...FALLBACK_RATES };
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

// LocalStorage Order Persistence
const ORDERS_STORAGE_KEY = 'bahtbridge_orders_data';

const defaultOrders = [
  {
    id: '#BR001',
    customerName: 'คุณปิยะ วัฒนะ',
    customerPhone: '081-234-5678',
    customerAddress: 'LINE: @piya',
    createdAt: '2026-11-04T07:30:00.000Z',
    dateFormatted: '4 พ.ย. 2569',
    orderStatus: 'pending',
    paymentStatus: 'paid',
    trackingNumber: '',
    shippingProvider: 'Flash Express',
    shippingFee: 150,
    serviceFee: 100,
    items: [
      { id: 'it_1', name: 'Shoes', currency: 'USD', amount: 50, quantity: 1, exchangeRate: 33.0, convertedPriceTHB: 1650, subtotalTHB: 1650 },
      { id: 'it_2', name: 'Figure', currency: 'JPY', amount: 5000, quantity: 1, exchangeRate: 0.22, convertedPriceTHB: 1100, subtotalTHB: 1100 },
      { id: 'it_3', name: 'Shirt', currency: 'KRW', amount: 30000, quantity: 1, exchangeRate: 0.025, convertedPriceTHB: 750, subtotalTHB: 750 },
    ],
    goodsTotal: 3500,
    grandTotal: 3750,
  },
  {
    id: '#BR002',
    customerName: 'คุณนิดา เกียรติสกุล',
    customerPhone: '089-876-5432',
    customerAddress: 'IG: @nida_shop',
    createdAt: '2026-11-03T09:00:00.000Z',
    dateFormatted: '3 พ.ย. 2569',
    orderStatus: 'completed',
    paymentStatus: 'paid',
    trackingNumber: 'TH0192837465',
    shippingProvider: 'ไปรษณีย์ไทย (EMS)',
    shippingFee: 100,
    serviceFee: 100,
    items: [
      { id: 'it_4', name: 'Headphone', currency: 'USD', amount: 60, quantity: 1, exchangeRate: 33.16, convertedPriceTHB: 1990, subtotalTHB: 1990 },
    ],
    goodsTotal: 1990,
    grandTotal: 2190,
  },
];

function getStoredOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(defaultOrders));
      return defaultOrders;
    }
    return JSON.parse(raw);
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

// Current Draft Products in Create Form (Starts clean!)
let draftProducts = [];
let activeViewingOrder = null;

const money = (amount) => `฿ ${Math.round(amount).toLocaleString('th-TH')}`;

// Calculate item total using its LOCKED rate if present, or live rate if in draft
function getItemTotal(p) {
  const rate = p.exchangeRate !== undefined ? p.exchangeRate : (exchangeRates[p.currency] || 1);
  return p.amount * p.quantity * rate;
}

const calcTotalGoods = (items) => (items || []).reduce((sum, item) => sum + getItemTotal(item), 0);

// Render Draft Products in Create Screen
function renderCreateProducts() {
  const container = document.getElementById('mini-products-list');
  if (!container) return;
  container.innerHTML = '';

  if (draftProducts.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:22px 14px;color:var(--muted);background:#fbfcfe;border:1px dashed #dbe5ef;border-radius:14px;margin-top:12px;font-size:13px">
        🛒 ยังไม่มีสินค้าในออเดอร์นี้<br><small>กรอกชื่อสินค้า ราคา สกุลเงิน แล้วกด <b>＋ เพิ่มสินค้า</b></small>
      </div>
    `;
  } else {
    draftProducts.forEach((product, index) => {
      const [flag] = countryInfo[product.currency] || ['🌐', ''];
      const rate = product.exchangeRate !== undefined ? product.exchangeRate : (exchangeRates[product.currency] || 1);
      const subtotal = getItemTotal(product);
      const card = document.createElement('div');
      card.className = 'mini-product';
      card.innerHTML = `
        <div class="row">
          <span class="product-title">${flag} ${escapeHtml(product.name)}</span>
          <div>
            <b>${Number(product.amount).toLocaleString()} ${escapeHtml(product.currency)} × ${product.quantity}</b>
            <button class="del-btn" onclick="deleteDraftProduct(${index})" title="ลบสินค้านี้">🗑️</button>
          </div>
        </div>
        <div class="convert">
          อัตราแลกเปลี่ยน ${rate} <b>→ ${money(subtotal)}</b>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // Live Summary calculation with editable shipping and service fees
  const goods = calcTotalGoods(draftProducts);
  const shippingInput = document.getElementById('input-shipping-fee');
  const serviceInput = document.getElementById('input-service-fee');
  const shippingFee = shippingInput ? Math.max(0, Number(shippingInput.value) || 0) : 150;
  const serviceFee = serviceInput ? Math.max(0, Number(serviceInput.value) || 0) : 100;

  const goodsEl = document.getElementById('summary-goods');
  const totalEl = document.getElementById('summary-total');
  if (goodsEl) goodsEl.textContent = money(goods);
  if (totalEl) totalEl.textContent = money(goods > 0 ? goods + shippingFee + serviceFee : 0);
}

function deleteDraftProduct(index) {
  draftProducts.splice(index, 1);
  renderCreateProducts();
}

// Setup Form for adding products & selects (Idempotent: binds listener only once!)
let isOrderFormInitialized = false;

function setupOrderForm() {
  if (isOrderFormInitialized) return;
  const create = document.getElementById('create');
  if (!create) return;

  const fieldDisplays = create.querySelectorAll('.field .input:not(input)');
  if (fieldDisplays.length >= 2) {
    fieldDisplays[0].outerHTML = '<select class="input" id="country-select"><option value="USD">🇺🇸 สหรัฐอเมริกา</option><option value="JPY">🇯🇵 ญี่ปุ่น</option><option value="KRW">🇰🇷 เกาหลีใต้</option><option value="CNY">🇨🇳 จีน</option><option value="EUR">🇪🇺 ยุโรป</option></select>';
    fieldDisplays[1].outerHTML = '<select class="input" id="currency-select"><option value="USD">USD</option><option value="JPY">JPY</option><option value="KRW">KRW</option><option value="CNY">CNY</option><option value="EUR">EUR</option></select>';
  }

  const countrySel = document.getElementById('country-select');
  const currencySel = document.getElementById('currency-select');
  if (countrySel && currencySel) {
    countrySel.addEventListener('change', () => { currencySel.value = countrySel.value; });
    currencySel.addEventListener('change', () => { countrySel.value = currencySel.value; });
  }

  const addBtn = document.getElementById('btn-add-product');
  if (addBtn) {
    // Replace with single onclick handler to ensure no duplicate event listener
    addBtn.onclick = () => {
      const nameInput = document.getElementById('product-name');
      const priceInput = document.getElementById('product-price');
      const qtyInput = document.getElementById('product-qty');
      const currency = currencySel ? currencySel.value : 'USD';

      const name = nameInput.value.trim();
      const amount = Number(priceInput.value);
      const quantity = Number(qtyInput.value);

      const errors = [];
      if (!name) errors.push('• ชื่อสินค้า (ห้ามเว้นว่าง)');
      if (!amount || amount <= 0) errors.push('• ราคาสินค้า (ต้องมากกว่า 0)');
      if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) errors.push('• จำนวนสินค้า (ต้องเป็นจำนวนเต็มอย่างน้อย 1)');

      if (errors.length > 0) {
        alert('กรุณากรอกข้อมูลสินค้าให้ถูกต้อง:\n' + errors.join('\n'));
        return;
      }

      // Lock current rate into item upon addition
      const lockedRate = exchangeRates[currency] || 1;
      draftProducts.push({
        id: 'it_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name,
        currency,
        amount,
        quantity,
        exchangeRate: lockedRate,
      });

      nameInput.value = '';
      priceInput.value = '';
      qtyInput.value = '1';
      renderCreateProducts();
    };
  }

  isOrderFormInitialized = true;
}

// Calculate & Prepare Order Detail from Form Inputs with Live API
async function calculateOrder() {
  const custName = (document.getElementById('cust-name')?.value || '').trim();
  const custPhone = (document.getElementById('cust-phone')?.value || '').trim();
  const custAddress = (document.getElementById('cust-address')?.value || '').trim();

  if (!custName) {
    alert('กรุณากรอกชื่อลูกค้าก่อนคำนวณราคา');
    document.getElementById('cust-name')?.focus();
    return;
  }

  if (draftProducts.length === 0) {
    alert('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการก่อนคำนวณราคา');
    document.getElementById('product-name')?.focus();
    return;
  }

  const shippingInput = document.getElementById('input-shipping-fee');
  const serviceInput = document.getElementById('input-service-fee');
  const shippingFee = shippingInput ? Math.max(0, Number(shippingInput.value) || 0) : 150;
  const serviceFee = serviceInput ? Math.max(0, Number(serviceInput.value) || 0) : 100;

  const calcBtn = document.querySelector('#create .sticky .primary');
  if (calcBtn) {
    calcBtn.disabled = true;
    calcBtn.textContent = 'กำลังคำนวณราคา...';
  }

  show('loading');

  try {
    await fetchExchangeRates();
  } catch (err) {
    console.error('Error fetching rates:', err);
  } finally {
    // Snap and lock the exchange rate into all items in draft
    draftProducts.forEach((item) => {
      if (item.exchangeRate === undefined) {
        item.exchangeRate = exchangeRates[item.currency] || 1;
      }
      item.convertedPriceTHB = Math.round(item.amount * item.exchangeRate);
      item.subtotalTHB = Math.round(item.amount * item.exchangeRate * item.quantity);
    });

    const goods = calcTotalGoods(draftProducts);
    const grandTotal = goods + shippingFee + serviceFee;

    activeViewingOrder = {
      id: 'DRAFT',
      customerName: custName,
      customerPhone: custPhone || '-',
      customerAddress: custAddress || '-',
      createdAt: new Date().toISOString(),
      dateFormatted: 'วันนี้',
      orderStatus: 'pending',
      paymentStatus: 'unpaid',
      trackingNumber: '',
      shippingProvider: 'Flash Express',
      shippingFee: shippingFee,
      serviceFee: serviceFee,
      items: JSON.parse(JSON.stringify(draftProducts)),
      goodsTotal: goods,
      grandTotal: grandTotal,
      isDraft: true,
    };

    populateDetailScreen(activeViewingOrder);
    populateCustomerScreen(activeViewingOrder);
    show('detail');

    if (calcBtn) {
      calcBtn.disabled = false;
      calcBtn.textContent = 'คำนวณราคา & บันทึกออเดอร์';
    }
  }
}

// Populate Detail Screen
function populateDetailScreen(order) {
  const title = document.getElementById('detail-order-title');
  if (title) title.textContent = order.isDraft ? 'สรุปคำนวณออเดอร์ใหม่' : `รายละเอียดออเดอร์ ${escapeHtml(order.id)}`;

  const nameEl = document.getElementById('detail-customer-name');
  if (nameEl) nameEl.textContent = order.customerName || '-';

  const contactEl = document.getElementById('detail-customer-contact');
  if (contactEl) {
    contactEl.textContent = `📞 ${order.customerPhone || '-'} · ${order.customerAddress || '-'}`;
  }

  const metaEl = document.getElementById('detail-order-meta');
  if (metaEl) {
    const isDone = order.orderStatus === 'completed' || order.orderStatus === 'ยืนยันแล้ว';
    const statusText = isDone ? 'ยืนยันแล้ว' : 'รอดำเนินการ';
    metaEl.innerHTML = `${escapeHtml(order.dateFormatted || 'วันนี้')} · <span style="color:${isDone ? '#16a36a' : '#ffb020'}">● ${statusText}</span>`;
  }

  const listEl = document.getElementById('detail-items-list');
  if (listEl) {
    listEl.innerHTML = '';
    (order.items || []).forEach((p) => {
      const [flag] = countryInfo[p.currency] || ['🌐'];
      const rate = p.exchangeRate !== undefined ? p.exchangeRate : (exchangeRates[p.currency] || 1);
      const subtotal = getItemTotal(p);
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div class="flag">${flag}</div>
        <div class="item-info">
          <strong>${escapeHtml(p.name)}</strong>
          <small>${Number(p.amount).toLocaleString()} ${escapeHtml(p.currency)} × ${p.quantity} · Rate ${rate} (ล็อกแล้ว)</small>
        </div>
        <div class="price">→ ${money(subtotal)}<small>แปลงแล้ว</small></div>
      `;
      listEl.appendChild(item);
    });
  }

  const goods = order.goodsTotal !== undefined ? order.goodsTotal : calcTotalGoods(order.items);
  const shipping = order.shippingFee !== undefined ? order.shippingFee : (order.shipping || 150);
  const service = order.serviceFee !== undefined ? order.serviceFee : (order.fee || 100);
  const total = order.grandTotal !== undefined ? order.grandTotal : (goods + shipping + service);

  const goodsEl = document.getElementById('detail-summary-goods');
  const shippingEl = document.getElementById('detail-summary-shipping');
  const serviceEl = document.getElementById('detail-summary-service');
  const totalEl = document.getElementById('detail-summary-total');

  if (goodsEl) goodsEl.textContent = money(goods);
  if (shippingEl) shippingEl.textContent = money(shipping);
  if (serviceEl) serviceEl.textContent = money(service);
  if (totalEl) totalEl.textContent = money(total);

  const confirmBtn = document.getElementById('btn-confirm-order');
  if (confirmBtn) {
    confirmBtn.textContent = order.isDraft ? 'บันทึก & ยืนยันออเดอร์' : 'อัปเดตสถานะเป็นสำเร็จ';
  }
}

// Populate Customer View Screen
function populateCustomerScreen(order) {
  const goods = order.goodsTotal !== undefined ? order.goodsTotal : calcTotalGoods(order.items);
  const shipping = order.shippingFee !== undefined ? order.shippingFee : (order.shipping || 150);
  const service = order.serviceFee !== undefined ? order.serviceFee : (order.fee || 100);
  const total = order.grandTotal !== undefined ? order.grandTotal : (goods + shipping + service);

  const idEl = document.getElementById('cust-view-order-id');
  if (idEl) idEl.textContent = order.isDraft ? 'ออเดอร์ใหม่ของคุณ' : `Order ${escapeHtml(order.id)}`;

  const nameEl = document.getElementById('cust-view-name');
  if (nameEl) nameEl.textContent = order.customerName || '-';

  const contactEl = document.getElementById('cust-view-contact');
  if (contactEl) contactEl.textContent = `📞 ${order.customerPhone || '-'}`;

  const dueEl = document.getElementById('cust-view-due');
  if (dueEl) dueEl.textContent = `${Math.round(total).toLocaleString('th-TH')} ฿`;

  const countEl = document.getElementById('cust-view-count');
  if (countEl) countEl.textContent = `${(order.items || []).length} รายการ`;

  const listEl = document.getElementById('customer-items-list');
  if (listEl) {
    listEl.innerHTML = '';
    (order.items || []).forEach((p, idx) => {
      const [flag, country] = countryInfo[p.currency] || ['🌐', 'ต่างประเทศ'];
      const subtotal = getItemTotal(p);
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div class="photo">${productIcons[idx % productIcons.length]}</div>
        <div class="item-info">
          <strong>${escapeHtml(p.name)}</strong>
          <small>${flag} ${country} · ${Number(p.amount).toLocaleString()} ${escapeHtml(p.currency)} (×${p.quantity})</small>
        </div>
        <div class="price">${money(subtotal)}</div>
      `;
      listEl.appendChild(item);
    });
  }

  const sumGoods = document.getElementById('cust-summary-goods');
  const sumShipping = document.getElementById('cust-summary-shipping');
  const sumService = document.getElementById('cust-summary-service');
  const sumTotal = document.getElementById('cust-summary-total');

  if (sumGoods) sumGoods.textContent = money(goods);
  if (sumShipping) sumShipping.textContent = money(shipping);
  if (sumService) sumService.textContent = money(service);
  if (sumTotal) sumTotal.textContent = money(total);
}

// Confirm Order and Persist to LocalStorage
function confirmCurrentOrder() {
  if (!activeViewingOrder) return;

  const orders = getStoredOrders();

  if (activeViewingOrder.isDraft) {
    const nextNumber = String(orders.length + 1).padStart(3, '0');
    const newOrder = {
      ...activeViewingOrder,
      id: `#BR${nextNumber}`,
      createdAt: new Date().toISOString(),
      dateFormatted: 'วันนี้',
      orderStatus: 'pending',
      paymentStatus: 'unpaid',
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
    if (totalEl) totalEl.textContent = money(newOrder.grandTotal);

    // Reset draft form completely
    draftProducts = [];
    const custName = document.getElementById('cust-name');
    const custPhone = document.getElementById('cust-phone');
    const custAddress = document.getElementById('cust-address');
    if (custName) custName.value = '';
    if (custPhone) custPhone.value = '';
    if (custAddress) custAddress.value = '';
    renderCreateProducts();
  } else {
    activeViewingOrder.orderStatus = 'completed';
    const idx = orders.findIndex((o) => o.id === activeViewingOrder.id);
    if (idx !== -1) {
      orders[idx] = activeViewingOrder;
      saveOrdersToStorage(orders);
    }
  }

  renderDashboard();
  renderOrdersList();
  show('success');
}

// View an Order from History
function viewOrderDetail(orderId) {
  const orders = getStoredOrders();
  const found = orders.find((o) => o.id === orderId);
  if (!found) return;

  activeViewingOrder = { ...found, isDraft: false };
  populateDetailScreen(activeViewingOrder);
  populateCustomerScreen(activeViewingOrder);
  show('detail');
}

// Render Dashboard Data dynamically from LocalStorage
function renderDashboard() {
  const orders = getStoredOrders();
  const totalCount = orders.length;
  const pendingCount = orders.filter((o) => o.orderStatus !== 'completed' && o.status !== 'ยืนยันแล้ว').length;
  const totalSales = orders.reduce((sum, o) => {
    const t = o.grandTotal !== undefined ? o.grandTotal : (calcTotalGoods(o.items) + (o.shipping || 150) + (o.fee || 100));
    return sum + t;
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
    const total = order.grandTotal !== undefined ? order.grandTotal : (calcTotalGoods(order.items) + (order.shipping || 150) + (order.fee || 100));
    const isDone = order.orderStatus === 'completed' || order.status === 'ยืนยันแล้ว';
    const card = document.createElement('div');
    card.className = 'order';
    card.onclick = () => viewOrderDetail(order.id);
    card.innerHTML = `
      <div class="order-head">
        <strong>${escapeHtml(order.id)} · ${escapeHtml(order.customerName)}</strong>
        <span class="tag ${isDone ? 'green' : ''}">${isDone ? 'ยืนยันแล้ว' : 'รอดำเนินการ'}</span>
      </div>
      <div class="order-meta">
        ${(order.items || []).length} สินค้า · ${escapeHtml(order.dateFormatted || order.date || 'วันนี้')}
        <span class="money" style="float:right">${money(total)}</span>
      </div>
    `;
    listEl.appendChild(card);
  });
}

// Render Orders List dynamically from LocalStorage
function renderOrdersList() {
  const orders = getStoredOrders();
  const listEl = document.getElementById('orders-list');
  if (!listEl) return;

  const cards = listEl.querySelectorAll('.order');
  cards.forEach((c) => c.remove());

  orders.forEach((order) => {
    const total = order.grandTotal !== undefined ? order.grandTotal : (calcTotalGoods(order.items) + (order.shipping || 150) + (order.fee || 100));
    const isDone = order.orderStatus === 'completed' || order.status === 'ยืนยันแล้ว';
    const card = document.createElement('div');
    card.className = 'order';
    card.dataset.search = `${order.id} ${order.customerName} ${order.customerPhone || ''}`.toLowerCase();
    card.onclick = () => viewOrderDetail(order.id);
    card.innerHTML = `
      <div class="order-head">
        <strong>${escapeHtml(order.id)} · ${escapeHtml(order.customerName)}</strong>
        <span class="tag ${isDone ? 'green' : ''}">${isDone ? 'ยืนยันแล้ว' : 'รอดำเนินการ'}</span>
      </div>
      <div class="order-meta">
        ${(order.items || []).length} สินค้า · ${escapeHtml(order.customerPhone || '-')}
        <span class="money" style="float:right">${money(total)}</span>
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

// Search Filter
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

// Share summary
function shareOrderSummary() {
  if (!activeViewingOrder) return;
  const o = activeViewingOrder;
  const total = o.grandTotal !== undefined ? o.grandTotal : (calcTotalGoods(o.items) + (o.shipping || 150) + (o.fee || 100));
  const text = `🛍️ สรุปออเดอร์ ${o.id || ''}\nลูกค้า: ${o.customerName}\nเบอร์โทร: ${o.customerPhone}\nยอดชำระ: ${money(total)}\n(BahtBridge)`;

  if (navigator.share) {
    navigator.share({ title: 'BahtBridge Order', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      alert('คัดลอกสรุปออเดอร์ไปยัง Clipboard แล้ว!');
    });
  } else {
    alert(text);
  }
}

// Backup / Export Orders Data to JSON file
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

// Restore / Import Orders Data from JSON file
function importOrdersData(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.orders)) {
        alert('รูปแบบไฟล์ไม่ถูกต้อง: ต้องเป็นไฟล์สำรองข้อมูลของ BahtBridge (JSON)');
        return;
      }
      if (confirm(`พบข้อมูลออเดอร์ ${data.orders.length} รายการ คุณต้องการนำเข้าข้อมูลนี้ทับข้อมูลปัจจุบันหรือไม่?`)) {
        saveOrdersToStorage(data.orders);
        renderDashboard();
        renderOrdersList();
        alert(`นำเข้าข้อมูลสำเร็จ! โหลดออเดอร์แล้ว ${data.orders.length} รายการ`);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์สำรอง: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Initialize Application (Single call on DOM ready!)
document.addEventListener('DOMContentLoaded', () => {
  setupOrderForm();
  renderCreateProducts();
  renderDashboard();
  renderOrdersList();
  fetchExchangeRates().then(() => {
    renderCreateProducts();
    renderDashboard();
    renderOrdersList();
  });
});
