const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const LocalStorageService = require('../storage.js');
const SupabaseStorage = require('../supabase-storage.js');
const AuthService = require('../auth.js');

describe('SupabaseStorage Layer Mocked Tests', () => {
  beforeEach(() => {
    LocalStorageService._memoryStorage.clear();
  });

  test('Fallback to LocalStorage when unauthenticated', async () => {
    const settings = await SupabaseStorage.getSettings();
    assert.equal(settings.schemaVersion, 2);

    await SupabaseStorage.saveSettings({ merchantName: 'Offline Shop' });
    const updatedSettings = await SupabaseStorage.getSettings();
    assert.equal(updatedSettings.merchantName, 'Offline Shop');

    const orders = await SupabaseStorage.getOrders();
    assert.ok(Array.isArray(orders));

    const newOrder = await SupabaseStorage.saveOrder({
      customerName: 'คุณสมศักดิ์',
      items: [{ name: 'Test', currency: 'USD', amount: 50, quantity: 1, exchangeRate: 35 }],
    });
    assert.ok(newOrder.id);

    const fetched = await SupabaseStorage.getOrder(newOrder.id);
    assert.equal(fetched.customerName, 'คุณสมศักดิ์');

    await SupabaseStorage.deleteOrder(newOrder.id);
    const afterDelete = await SupabaseStorage.getOrder(newOrder.id);
    assert.equal(afterDelete, null);
  });

  test('Export and Import through SupabaseStorage', async () => {
    const dump = await SupabaseStorage.exportAll();
    assert.equal(dump.app, 'BahtBridge');
    assert.ok(Array.isArray(dump.orders));

    const importRes = await SupabaseStorage.importAll(
      {
        orders: [{ id: '#BR999', customerName: 'นำเข้าพิเศษ' }],
        settings: { merchantName: 'นำเข้าร้าน' },
      },
      { mode: 'merge' }
    );
    assert.equal(importRes.success, true);
  });

  test('Online Supabase sync flow with mock client and queue processing', async () => {
    let ordersDb = [];
    let itemsDb = [];
    let settingsDb = {};

    const mockSb = {
      from: (tbl) => {
        if (tbl === 'orders') {
          return {
            upsert: async (payload) => {
              ordersDb = ordersDb.filter(o => o.id !== payload.id);
              ordersDb.push(payload);
              return { error: null };
            },
            delete: () => ({
              eq: async (f, v) => {
                ordersDb = ordersDb.filter(o => o[f] !== v);
                return { error: null };
              },
            }),
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
                single: async () => ({
                  data: ordersDb[0] ? { ...ordersDb[0], order_items: itemsDb } : null,
                  error: null,
                }),
              }),
              order: async () => ({
                data: ordersDb.map(o => ({
                  id: o.id,
                  customer_name: o.customer_name,
                  order_items: itemsDb.filter(it => it.order_id === o.id),
                })),
                error: null,
              }),
            }),
          };
        }
        if (tbl === 'order_items') {
          return {
            upsert: async (payload) => {
              itemsDb.push(...payload);
              return { error: null };
            },
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (tbl === 'settings') {
          return {
            upsert: async (payload) => {
              settingsDb = { ...payload };
              return { error: null };
            },
            select: () => ({
              single: async () => ({
                data: settingsDb.schema_version ? settingsDb : null,
                error: null,
              }),
            }),
          };
        }
        return {};
      },
    };

    if (!global.window) global.window = {};
    global.window.AuthService = {
      getSupabase: () => mockSb,
      isAuthenticated: () => true,
    };
    global.navigator = { onLine: true };

    // Test saving order to Supabase
    const saved = await SupabaseStorage.saveOrder({
      id: '#BR-ONLINE-01',
      customerName: 'ผู้ใช้คลาวด์',
      items: [{ name: 'Cloud Item', amount: 100, currency: 'USD', quantity: 1, exchangeRate: 35 }],
    });
    assert.equal(saved.customerName, 'ผู้ใช้คลาวด์');

    // Test getOrders from Supabase
    const onlineOrders = await SupabaseStorage.getOrders();
    assert.ok(onlineOrders.length > 0);

    // Test getOrder from Supabase
    const singleOrder = await SupabaseStorage.getOrder('#BR-ONLINE-01');
    assert.ok(singleOrder);

    // Test saveSettings to Supabase
    await SupabaseStorage.saveSettings({ defaultShipping: 300, rateMarkupPercent: 5 });
    const onlineSettings = await SupabaseStorage.getSettings();
    assert.ok(onlineSettings.defaultShipping);

    // Test trigger sync queue
    await SupabaseStorage.processOfflineQueue();

    // Test deleteOrder from Supabase
    await SupabaseStorage.deleteOrder('#BR-ONLINE-01');

    // Reset window.AuthService mock
    global.window.AuthService = {
      getSupabase: () => null,
      isAuthenticated: () => false,
    };
  });
});
