/**
 * BahtBridge — Data Storage Layer (storage.js)
 * Single point of access for localStorage operations.
 * Pure async API matching DATA_MODEL.md specification.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    const Pricing = require('./pricing.js');
    module.exports = factory(Pricing);
  } else {
    // Browser
    const Pricing = root.Pricing || (typeof window !== 'undefined' ? window.Pricing : null);
    const storageApi = factory(Pricing);
    root.StorageService = storageApi;
    root.AppStorage = storageApi;
    // Also attach to window.Storage if not overriding constructor
    try {
      if (typeof window !== 'undefined') {
        window.StorageService = storageApi;
        window.AppStorage = storageApi;
      }
    } catch (_) {}
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Pricing) {
  'use strict';

  const CURRENT_SCHEMA_VERSION = 2;
  const ORDERS_STORAGE_KEY = 'bahtbridge_orders_data';
  const SETTINGS_STORAGE_KEY = 'bahtbridge_settings';

  const FALLBACK_RATES = { USD: 33.0, JPY: 0.22, KRW: 0.025, CNY: 4.55, EUR: 36.2 };

  // Fallback in-memory storage for test/headless environments
  const memoryStore = new Map();
  const memoryStorage = {
    getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
    setItem: (k, v) => memoryStore.set(k, String(v)),
    removeItem: (k) => memoryStore.delete(k),
    clear: () => memoryStore.clear(),
  };

  function getBackend() {
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    return memoryStorage;
  }

  // ─── Thai Date Helper ───────────────────────────────────────────────────────
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

  // ─── Default Data Sets ──────────────────────────────────────────────────────
  const DEFAULT_SETTINGS = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    nextOrderNo: 3,
    defaultShipping: 150,
    serviceFeeType: 'fixed',
    serviceFeeValue: 100,
    rateMarkupPercent: 0,
    merchantName: 'Merchant Shop',
    merchantEmail: 'merchant@example.com',
    merchantPhone: '081-234-5678',
  };

  const DEFAULT_ORDERS = [
    {
      id: '#BR001',
      customerName: 'คุณปิยะ วัฒนะ',
      customerPhone: '081-234-5678',
      customerAddress: 'LINE: @piya',
      createdAt: '2026-09-24T08:00:00.000Z',
      dateFormatted: '24 ก.ย. 2569',
      date: '24 ก.ย. 2569',
      orderStatus: 'pending',
      paymentStatus: 'unpaid',
      status: 'กำลังดำเนินการ',
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
        { id: 'it_1', name: 'Shoes', currency: 'USD', amount: 50, originalPrice: 50, quantity: 1, exchangeRate: 33.0, convertedPriceTHB: 1650, subtotalTHB: 1650 },
        { id: 'it_2', name: 'Figure', currency: 'JPY', amount: 5000, originalPrice: 5000, quantity: 1, exchangeRate: 0.22, convertedPriceTHB: 1100, subtotalTHB: 1100 },
        { id: 'it_3', name: 'Shirt', currency: 'KRW', amount: 30000, originalPrice: 30000, quantity: 1, exchangeRate: 0.025, convertedPriceTHB: 750, subtotalTHB: 750 },
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
      orderStatus: 'completed',
      paymentStatus: 'paid',
      status: 'ยืนยันแล้ว',
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
        { id: 'it_4', name: 'Headphone', currency: 'USD', amount: 60, originalPrice: 60, quantity: 1, exchangeRate: 33.0, convertedPriceTHB: 1980, subtotalTHB: 1980 },
      ],
    },
  ];

  // ─── Idempotent Migration Engine (v1 -> v2) ─────────────────────────────────
  function migrateOrder(order) {
    if (!order || typeof order !== 'object') return order;
    const nowIso = new Date().toISOString();

    // 1. Ensure createdAt & dateFormatted
    if (!order.createdAt) {
      order.createdAt = nowIso;
    }
    if (!order.dateFormatted) {
      order.dateFormatted = order.date && !order.date.includes('วันนี้') && !order.date.includes('เมื่อวาน')
        ? order.date
        : formatThaiDate(order.createdAt);
    }
    if (!order.date) {
      order.date = order.dateFormatted;
    }

    // 2. Ensure Status Enums mapping
    if (!order.orderStatus) {
      order.orderStatus = order.status === 'ยืนยันแล้ว' ? 'completed' : 'pending';
    }
    if (!order.status) {
      order.status = order.orderStatus === 'completed' ? 'ยืนยันแล้ว' : 'กำลังดำเนินการ';
    }
    if (!order.paymentStatus) {
      order.paymentStatus = order.orderStatus === 'completed' ? 'paid' : 'unpaid';
    }

    // 3. Ensure Rates Snapshot
    if (!order.ratesSnapshot) {
      const snap = { ...FALLBACK_RATES };
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          if (item.currency && item.exchangeRate) {
            snap[item.currency] = Number(item.exchangeRate);
          }
        });
      }
      order.ratesSnapshot = snap;
      order.ratesAt = order.createdAt || nowIso;
      order.rateSource = 'fallback';
    }

    // 4. Ensure Items Structure
    if (Array.isArray(order.items)) {
      order.items = order.items.map((item, idx) => {
        const amount = Number(item.amount ?? item.originalPrice ?? 0);
        const originalPrice = amount;
        const quantity = Number(item.quantity) || 1;
        const currency = item.currency || 'USD';
        const exchangeRate = Number(item.exchangeRate ?? order.ratesSnapshot?.[currency] ?? 1);
        const convertedPriceTHB = Math.round(amount * exchangeRate * 100) / 100;
        const subtotalTHB = Math.round(convertedPriceTHB * quantity * 100) / 100;

        return {
          id: item.id || `item_${idx + 1}`,
          name: item.name || '',
          currency,
          originalPrice,
          amount,
          quantity,
          exchangeRate,
          convertedPriceTHB,
          subtotalTHB,
        };
      });
    } else {
      order.items = [];
    }

    // 5. Calculate and align monetary totals
    const shipping = Number(order.shipping ?? order.shippingFee ?? 0);
    const fee = Number(order.fee ?? order.serviceFee ?? 0);
    order.shipping = shipping;
    order.shippingFee = shipping;
    order.fee = fee;
    order.serviceFee = fee;

    if (Pricing && typeof Pricing.calcOrderTotals === 'function') {
      const totals = Pricing.calcOrderTotals(order);
      order.goodsThb = totals.goodsThb;
      order.totalThb = totals.totalThb;
      order.goodsTotal = totals.goodsThb;
      order.grandTotal = totals.totalThb;
    } else {
      const goods = order.items.reduce((s, it) => s + (it.subtotalTHB || 0), 0);
      order.goodsThb = goods;
      order.totalThb = goods + shipping + fee;
      order.goodsTotal = goods;
      order.grandTotal = goods + shipping + fee;
    }

    return order;
  }

  function migrateOrdersList(orders) {
    if (!Array.isArray(orders)) return [];
    return orders.map(migrateOrder);
  }

  // ─── Core Storage API (All Async) ───────────────────────────────────────────

  /**
   * Fetch all orders from storage (runs migration idempotently).
   * @returns {Promise<Array>}
   */
  async function getOrders() {
    const backend = getBackend();
    try {
      const raw = backend.getItem(ORDERS_STORAGE_KEY);
      if (!raw) {
        const initial = migrateOrdersList(DEFAULT_ORDERS);
        backend.setItem(ORDERS_STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(raw);
      const orders = Array.isArray(parsed) ? parsed : DEFAULT_ORDERS;
      const migrated = migrateOrdersList(orders);
      return migrated;
    } catch (err) {
      console.error('storage.getOrders error:', err);
      return migrateOrdersList(DEFAULT_ORDERS);
    }
  }

  /**
   * Fetch a single order by ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async function getOrder(id) {
    if (!id) return null;
    const orders = await getOrders();
    const found = orders.find((o) => o.id === id);
    return found ? { ...found } : null;
  }

  /**
   * Save (insert or update) an order.
   * @param {Object} order
   * @returns {Promise<Object>}
   */
  async function saveOrder(order) {
    if (!order || typeof order !== 'object') {
      throw new Error('saveOrder: Invalid order object');
    }
    const backend = getBackend();
    const orders = await getOrders();
    const settings = await getSettings();

    const migrated = migrateOrder({ ...order });

    // If order has no ID or is a DRAFT, assign next ID
    if (!migrated.id || migrated.id === 'DRAFT') {
      let maxNum = 0;
      orders.forEach((o) => {
        const m = o.id && String(o.id).match(/\d+/);
        if (m) {
          const num = parseInt(m[0], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      let nextNo = settings.nextOrderNo || (maxNum + 1) || 1;
      if (nextNo <= maxNum) nextNo = maxNum + 1;
      migrated.id = `#BR${String(nextNo).padStart(3, '0')}`;

      settings.nextOrderNo = nextNo + 1;
      await saveSettings(settings);
    }

    const idx = orders.findIndex((o) => o.id === migrated.id);
    if (idx !== -1) {
      orders[idx] = migrated;
    } else {
      orders.unshift(migrated);
    }

    backend.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    return migrated;
  }

  /**
   * Delete an order by ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async function deleteOrder(id) {
    if (!id) return false;
    const backend = getBackend();
    const orders = await getOrders();
    const initLen = orders.length;
    const remaining = orders.filter((o) => o.id !== id);

    if (remaining.length !== initLen) {
      backend.setItem(ORDERS_STORAGE_KEY, JSON.stringify(remaining));
      return true;
    }
    return false;
  }

  /**
   * Fetch application settings.
   * @returns {Promise<Object>}
   */
  async function getSettings() {
    const backend = getBackend();
    try {
      const raw = backend.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign({}, DEFAULT_SETTINGS, parsed, {
          schemaVersion: CURRENT_SCHEMA_VERSION,
        });
      }
    } catch (err) {
      console.error('storage.getSettings error:', err);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save application settings.
   * @param {Object} newSettings
   * @returns {Promise<Object>}
   */
  async function saveSettings(newSettings) {
    const backend = getBackend();
    const current = await getSettings();
    const merged = Object.assign({}, current, newSettings, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    backend.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  /**
   * Export all system data (orders, settings, schema version).
   * @returns {Promise<Object>}
   */
  async function exportAll() {
    const orders = await getOrders();
    const settings = await getSettings();

    return {
      app: 'BahtBridge',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      ordersCount: orders.length,
      settings,
      orders,
    };
  }

  /**
   * Import data from backup object.
   * @param {Object} dataObj
   * @param {{ mode?: 'merge'|'replace' }} [options={ mode: 'merge' }]
   * @returns {Promise<{ success: boolean, imported: number, skipped: number, total: number }>}
   */
  async function importAll(dataObj, options = {}) {
    if (!dataObj || typeof dataObj !== 'object') {
      throw new Error('รูปแบบไฟล์ไม่ถูกต้อง: ข้อมูลต้องเป็น JSON Object');
    }

    // Validate format
    if (dataObj.app && dataObj.app !== 'BahtBridge') {
      throw new Error('รูปแบบไฟล์ไม่ถูกต้อง: ไฟล์ไม่ใช่ของแอปพลิเคชัน BahtBridge');
    }

    if (!Array.isArray(dataObj.orders)) {
      throw new Error('รูปแบบไฟล์ไม่ถูกต้อง: ไม่พบรายการคำสั่งซื้อ (orders array)');
    }

    const mode = options.mode || 'merge';
    const backend = getBackend();
    const currentOrders = await getOrders();
    const incomingOrders = migrateOrdersList(dataObj.orders);

    let finalOrders = [];
    let imported = 0;
    let skipped = 0;

    if (mode === 'replace') {
      finalOrders = incomingOrders;
      imported = incomingOrders.length;
      skipped = 0;
    } else {
      // Merge mode: skip existing order IDs
      const existingIds = new Set(currentOrders.map((o) => o.id));
      const toAdd = [];

      for (const item of incomingOrders) {
        if (existingIds.has(item.id)) {
          skipped++;
        } else {
          existingIds.add(item.id);
          toAdd.push(item);
          imported++;
        }
      }
      finalOrders = [...toAdd, ...currentOrders];
    }

    // Save orders
    backend.setItem(ORDERS_STORAGE_KEY, JSON.stringify(finalOrders));

    // Restore settings if present
    if (dataObj.settings && typeof dataObj.settings === 'object') {
      await saveSettings(dataObj.settings);
    }

    return {
      success: true,
      imported,
      skipped,
      total: finalOrders.length,
    };
  }

  return {
    getOrders,
    getOrder,
    saveOrder,
    deleteOrder,
    getSettings,
    saveSettings,
    exportAll,
    importAll,
    migrateOrder,
    migrateOrdersList,
    _memoryStorage: memoryStorage,
    _getBackend: getBackend,
  };
});
