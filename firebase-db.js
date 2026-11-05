/**
 * BahtBridge — Firebase Firestore Storage Service (firebase-db.js)
 * Real-time synchronization with Google Cloud Firestore + Offline Fallback
 * Compliant with DATA_MODEL.md & HTML_CONTRACT.md
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FirebaseDB = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  let db = null;
  let isInitialized = false;

  function getConfig() {
    return (typeof window !== 'undefined' && window.__CONFIG__?.FIREBASE_CONFIG)
      ? window.__CONFIG__.FIREBASE_CONFIG
      : null;
  }

  function init() {
    if (isInitialized) return db;

    const cfg = getConfig();
    if (!cfg || typeof window === 'undefined' || !window.firebase) {
      return null;
    }

    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(cfg);
      }
      db = window.firebase.firestore();
      isInitialized = true;
      console.log('🔥 [FirebaseDB] Connected to Cloud Firestore:', cfg.projectId);
      updateSyncStatus(true);
    } catch (err) {
      console.warn('⚠️ [FirebaseDB] Initialization failed:', err);
    }

    return db;
  }

  function updateSyncStatus(connected) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('sync-indicator');
    if (!el) return;

    el.classList.remove('hidden');
    el.style.display = 'block';

    if (connected) {
      el.style.background = '#e5f7ef';
      el.style.color = '#11885b';
      el.textContent = '🟢 เชื่อมต่อ Cloud Firestore แล้ว (ซิงค์เรียลไทม์)';
    } else {
      el.style.background = '#feebc8';
      el.style.color = '#c05621';
      el.textContent = '🟡 ออฟไลน์ (บันทึกในเครื่อง Local Database)';
    }
  }

  // ─── CRUD Methods for Orders ────────────────────────────────────────────────

  /**
   * บันทึกหรืออัปเดตออเดอร์ขึ้น Firestore
   * @param {Object} order
   */
  async function saveOrder(order) {
    if (!order || !order.id) return;
    const firestore = init();
    if (!firestore || !navigator.onLine) {
      updateSyncStatus(false);
      return;
    }

    try {
      // คัดลอกและแปลงเป็น Object ที่ Firestore ยอมรับ
      const cleanOrder = JSON.parse(JSON.stringify(order));
      cleanOrder.updatedAt = new Date().toISOString();

      await firestore.collection('orders').doc(cleanOrder.id).set(cleanOrder, { merge: true });
      updateSyncStatus(true);
      console.log('🔥 [Firestore] Saved order:', cleanOrder.id);
    } catch (err) {
      console.warn('⚠️ [Firestore] saveOrder error:', err);
      updateSyncStatus(false);
    }
  }

  /**
   * ดึงรายการออเดอร์ทั้งหมดจาก Firestore
   * @returns {Promise<Array>}
   */
  async function getOrders() {
    const firestore = init();
    if (!firestore || !navigator.onLine) return null;

    try {
      const snap = await firestore.collection('orders').orderBy('createdAt', 'desc').get();
      const list = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      updateSyncStatus(true);
      return list;
    } catch (err) {
      console.warn('⚠️ [Firestore] getOrders error:', err);
      updateSyncStatus(false);
      return null;
    }
  }

  /**
   * ลบออเดอร์จาก Firestore
   * @param {string} orderId
   */
  async function deleteOrder(orderId) {
    if (!orderId) return;
    const firestore = init();
    if (!firestore || !navigator.onLine) return;

    try {
      await firestore.collection('orders').doc(orderId).delete();
      console.log('🔥 [Firestore] Deleted order:', orderId);
    } catch (err) {
      console.warn('⚠️ [Firestore] deleteOrder error:', err);
    }
  }

  /**
   * บันทึกการตั้งค่าร้านค้าขึ้น Firestore
   * @param {Object} settings
   */
  async function saveSettings(settings) {
    const firestore = init();
    if (!firestore || !navigator.onLine) return;

    try {
      await firestore.collection('settings').doc('merchant_settings').set(settings, { merge: true });
    } catch (err) {
      console.warn('⚠️ [Firestore] saveSettings error:', err);
    }
  }

  return {
    init,
    saveOrder,
    getOrders,
    deleteOrder,
    saveSettings,
    updateSyncStatus,
    _getDb: () => db,
  };
});

