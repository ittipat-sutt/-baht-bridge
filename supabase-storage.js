/**
 * BahtBridge — Supabase Cloud Storage Layer (supabase-storage.js)
 * Implements the identical API as storage.js with Offline Queue & Last-Write-Wins Sync.
 * Auto-switches: Uses Supabase when logged in, falls back to localStorage when logged out/offline.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const LocalStorageService = require('./storage.js');
    const Pricing = require('./pricing.js');
    module.exports = factory(LocalStorageService, Pricing);
  } else {
    const LocalStorageService = root.StorageService || root.AppStorage;
    const Pricing = root.Pricing || (typeof window !== 'undefined' ? window.Pricing : null);
    const api = factory(LocalStorageService, Pricing);
    root.SupabaseStorage = api;
    // Replace window.StorageService / window.AppStorage with the unified router
    root.StorageService = api;
    root.AppStorage = api;
    if (typeof window !== 'undefined') {
      window.StorageService = api;
      window.AppStorage = api;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LocalStorageService, Pricing) {
  'use strict';

  const OFFLINE_QUEUE_KEY = 'bb_offline_queue';

  function getSupabaseClient() {
    if (typeof window !== 'undefined' && window.AuthService) {
      return window.AuthService.getSupabase();
    }
    return null;
  }

  function isUserLoggedIn() {
    if (typeof window !== 'undefined' && window.AuthService) {
      return window.AuthService.isAuthenticated();
    }
    return false;
  }

  // ─── Sync Indicator UI Helper ───────────────────────────────────────────────
  function updateSyncIndicator(status, message) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('sync-indicator');
    if (!el) return;

    if (status === 'synced') {
      el.className = 'status-line';
      el.style.background = '#e5f7ef';
      el.style.color = '#11885b';
      el.textContent = message || '🟢 ซิงค์คลาวด์แล้ว';
    } else if (status === 'syncing') {
      el.className = 'status-line';
      el.style.background = '#fff8e6';
      el.style.color = '#b7791f';
      el.textContent = message || '🟡 กำลังซิงค์...';
    } else if (status === 'offline') {
      el.className = 'status-line';
      el.style.background = '#feebc8';
      el.style.color = '#c05621';
      el.textContent = message || '🔴 ออฟไลน์ (บันทึกในเครื่อง)';
    }
  }

  // ─── Offline Queue Management ───────────────────────────────────────────────
  function getOfflineQueue() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveOfflineQueue(queue) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (_) {}
  }

  function enqueueAction(action, payload) {
    const queue = getOfflineQueue();
    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      action, // 'saveOrder' | 'deleteOrder' | 'saveSettings'
      payload,
      queuedAt: new Date().toISOString(),
    });
    saveOfflineQueue(queue);
    updateSyncIndicator('offline', `🔴 ออฟไลน์ (รอซิงค์ ${queue.length} รายการ)`);
  }

  // ─── Background Sync Engine (Last Write Wins) ───────────────────────────────
  async function processOfflineQueue() {
    const sb = getSupabaseClient();
    if (!sb || !isUserLoggedIn() || !navigator.onLine) return;

    const queue = getOfflineQueue();
    if (queue.length === 0) {
      updateSyncIndicator('synced');
      return;
    }

    updateSyncIndicator('syncing', `🟡 กำลังซิงค์ ${queue.length} รายการ...`);

    const remaining = [];
    for (const item of queue) {
      try {
        if (item.action === 'saveOrder') {
          await pushOrderToSupabase(item.payload, sb);
        } else if (item.action === 'deleteOrder') {
          await sb.from('orders').delete().eq('id', item.payload.id);
        } else if (item.action === 'saveSettings') {
          await pushSettingsToSupabase(item.payload, sb);
        }
      } catch (err) {
        console.warn('Queue sync item failed, keeping in queue:', err);
        remaining.push(item);
      }
    }

    saveOfflineQueue(remaining);

    if (remaining.length === 0) {
      updateSyncIndicator('synced', '🟢 ซิงค์คลาวด์สำเร็จ');
    } else {
      updateSyncIndicator('offline', `🔴 เหลือรอซิงค์ ${remaining.length} รายการ`);
    }
  }

  // ─── Helper: Push Order to Supabase ─────────────────────────────────────────
  async function pushOrderToSupabase(order, sb) {
    const nowIso = new Date().toISOString();

    // Check existing remote order for Last-Write-Wins comparison
    const { data: remoteExisting } = await sb
      .from('orders')
      .select('updated_at')
      .eq('id', order.id)
      .maybeSingle();

    if (remoteExisting && remoteExisting.updated_at) {
      const localUpdated = new Date(order.updated_at || order.createdAt || nowIso).getTime();
      const remoteUpdated = new Date(remoteExisting.updated_at).getTime();
      if (remoteUpdated > localUpdated) {
        // Remote is newer, respect Last Write Wins and do not overwrite
        return;
      }
    }

    // 1. Upsert Orders table
    const orderPayload = {
      id: order.id,
      customer_name: order.customerName,
      customer_phone: order.customerPhone || '',
      customer_address: order.customerAddress || '',
      created_at: order.createdAt || nowIso,
      date_formatted: order.dateFormatted || '',
      order_status: order.orderStatus || (order.status === 'ยืนยันแล้ว' ? 'completed' : 'pending'),
      payment_status: order.paymentStatus || (order.status === 'ยืนยันแล้ว' ? 'paid' : 'unpaid'),
      tracking_number: order.trackingNumber || '',
      shipping_provider: order.shippingProvider || 'Flash Express',
      rates_snapshot: order.ratesSnapshot || {},
      rates_at: order.ratesAt || order.createdAt || nowIso,
      rate_source: order.rateSource || 'fallback',
      goods_total: Number(order.goodsThb ?? order.goodsTotal ?? 0),
      shipping_fee: Number(order.shipping ?? order.shippingFee ?? 150),
      service_fee: Number(order.fee ?? order.serviceFee ?? 100),
      grand_total: Number(order.totalThb ?? order.grandTotal ?? 0),
      notes: order.notes || '',
      updated_at: nowIso,
    };

    const { error: orderErr } = await sb.from('orders').upsert(orderPayload);
    if (orderErr) throw orderErr;

    // 2. Upsert Order Items
    if (Array.isArray(order.items) && order.items.length > 0) {
      const itemsPayload = order.items.map((it, idx) => ({
        id: it.id || `item_${idx + 1}`,
        order_id: order.id,
        name: it.name,
        currency: it.currency || 'USD',
        original_price: Number(it.amount ?? it.originalPrice ?? 0),
        quantity: Number(it.quantity) || 1,
        exchange_rate: Number(it.exchangeRate ?? order.ratesSnapshot?.[it.currency] ?? 1),
        converted_price_thb: Math.round(Number(it.amount ?? it.originalPrice ?? 0) * Number(it.exchangeRate ?? 1) * 100) / 100,
        subtotal_thb: Number(it.subtotalTHB ?? (Number(it.amount ?? 0) * Number(it.quantity ?? 1) * Number(it.exchangeRate ?? 1))),
        updated_at: nowIso,
      }));

      const { error: itemsErr } = await sb.from('order_items').upsert(itemsPayload);
      if (itemsErr) throw itemsErr;
    }
  }

  // ─── Helper: Push Settings to Supabase ──────────────────────────────────────
  async function pushSettingsToSupabase(settings, sb) {
    const payload = {
      schema_version: settings.schemaVersion || 2,
      next_order_no: settings.nextOrderNo || 1,
      default_shipping: settings.defaultShipping ?? 150,
      service_fee_type: settings.serviceFeeType || 'fixed',
      service_fee_value: settings.serviceFeeValue ?? 100,
      rate_markup_percent: settings.rateMarkupPercent ?? 0,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from('settings').upsert(payload, { onConflict: 'merchant_id' });
    if (error) throw error;
  }

  // ─── Unified Storage API (Matching storage.js exactly) ──────────────────────

  async function getOrders() {
    const sb = getSupabaseClient();
    if (!sb || !isUserLoggedIn() || !navigator.onLine) {
      return LocalStorageService.getOrders();
    }

    try {
      const { data, error } = await sb
        .from('orders')
        .select(`
          id, customer_name, customer_phone, customer_address,
          created_at, date_formatted, order_status, payment_status,
          tracking_number, shipping_provider, rates_snapshot, rates_at,
          rate_source, goods_total, shipping_fee, service_fee, grand_total,
          notes, updated_at,
          order_items (
            id, name, currency, original_price, quantity,
            exchange_rate, converted_price_thb, subtotal_thb
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map back to application Order object format
      const orders = (data || []).map((row) => ({
        id: row.id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerAddress: row.customer_address,
        createdAt: row.created_at,
        dateFormatted: row.date_formatted,
        date: row.date_formatted,
        orderStatus: row.order_status,
        status: row.order_status === 'completed' ? 'ยืนยันแล้ว' : 'กำลังดำเนินการ',
        paymentStatus: row.payment_status,
        trackingNumber: row.tracking_number,
        shippingProvider: row.shipping_provider,
        ratesSnapshot: row.rates_snapshot,
        ratesAt: row.rates_at,
        rateSource: row.rate_source,
        shipping: Number(row.shipping_fee),
        shippingFee: Number(row.shipping_fee),
        fee: Number(row.service_fee),
        serviceFee: Number(row.service_fee),
        feeType: 'fixed',
        feeValue: Number(row.service_fee),
        goodsThb: Number(row.goods_total),
        goodsTotal: Number(row.goods_total),
        totalThb: Number(row.grand_total),
        grandTotal: Number(row.grand_total),
        notes: row.notes,
        updated_at: row.updated_at,
        items: (row.order_items || []).map((it) => ({
          id: it.id,
          name: it.name,
          currency: it.currency,
          originalPrice: Number(it.original_price),
          amount: Number(it.original_price),
          quantity: it.quantity,
          exchangeRate: Number(it.exchange_rate),
          convertedPriceTHB: Number(it.converted_price_thb),
          subtotalTHB: Number(it.subtotal_thb),
        })),
      }));

      // Cache locally for offline availability
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bahtbridge_orders_data', JSON.stringify(orders));
      }

      updateSyncIndicator('synced');
      return orders;
    } catch (err) {
      console.warn('Supabase getOrders failed, fallback to local storage:', err);
      updateSyncIndicator('offline');
      return LocalStorageService.getOrders();
    }
  }

  async function getOrder(id) {
    if (!id) return null;
    const orders = await getOrders();
    return orders.find((o) => o.id === id) || null;
  }

  async function saveOrder(order) {
    // 1. Always save locally first (ensures instant responsive UI and offline safety)
    const savedLocal = await LocalStorageService.saveOrder(order);

    const sb = getSupabaseClient();
    if (!sb || !isUserLoggedIn() || !navigator.onLine) {
      // Enqueue for later synchronization
      enqueueAction('saveOrder', savedLocal);
      return savedLocal;
    }

    try {
      updateSyncIndicator('syncing');
      await pushOrderToSupabase(savedLocal, sb);
      updateSyncIndicator('synced');
    } catch (err) {
      console.warn('Push to Supabase failed, enqueued for offline sync:', err);
      enqueueAction('saveOrder', savedLocal);
    }

    return savedLocal;
  }

  async function deleteOrder(id) {
    const localResult = await LocalStorageService.deleteOrder(id);

    const sb = getSupabaseClient();
    if (!sb || !isUserLoggedIn() || !navigator.onLine) {
      enqueueAction('deleteOrder', { id });
      return localResult;
    }

    try {
      await sb.from('orders').delete().eq('id', id);
      updateSyncIndicator('synced');
    } catch (err) {
      enqueueAction('deleteOrder', { id });
    }

    return localResult;
  }

  async function getSettings() {
    const sb = getSupabaseClient();
    if (!sb || !isUserLoggedIn() || !navigator.onLine) {
      return LocalStorageService.getSettings();
    }

    try {
      const { data, error } = await sb.from('settings').select('*').maybeSingle();
      if (error) throw error;

      if (data) {
        const mapped = {
          schemaVersion: data.schema_version,
          nextOrderNo: data.next_order_no,
          defaultShipping: Number(data.default_shipping),
          serviceFeeType: data.service_fee_type,
          serviceFeeValue: Number(data.service_fee_value),
          rateMarkupPercent: Number(data.rate_markup_percent),
        };
        await LocalStorageService.saveSettings(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase getSettings failed, using local settings:', err);
    }
    return LocalStorageService.getSettings();
  }

  async function saveSettings(newSettings) {
    const saved = await LocalStorageService.saveSettings(newSettings);

    const sb = getSupabaseClient();
    if (!sb || !isUserLoggedIn() || !navigator.onLine) {
      enqueueAction('saveSettings', saved);
      return saved;
    }

    try {
      await pushSettingsToSupabase(saved, sb);
    } catch (err) {
      enqueueAction('saveSettings', saved);
    }
    return saved;
  }

  async function exportAll() {
    // Uses standard storage export
    return LocalStorageService.exportAll();
  }

  async function importAll(obj, options = {}) {
    const result = await LocalStorageService.importAll(obj, options);
    // If logged in, queue all imported orders to sync to cloud
    const orders = await LocalStorageService.getOrders();
    for (const o of orders) {
      await saveOrder(o);
    }
    return result;
  }

  // ─── Network Status Listeners ───────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      processOfflineQueue();
    });
    window.addEventListener('offline', () => {
      updateSyncIndicator('offline');
    });
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
    processOfflineQueue,
    getOfflineQueue,
    updateSyncIndicator,
  };
});
