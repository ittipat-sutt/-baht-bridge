/**
 * BahtBridge — Firebase Firestore & Auth Service (firebase-db.js)
 * Real-time synchronization with Google Cloud Firestore + Google Sign-In Auth
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
  let auth = null;
  let currentUser = null;
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
      auth = window.firebase.auth();
      isInitialized = true;
      console.log('🔥 [FirebaseDB] Connected to Cloud Firestore & Auth:', cfg.projectId);

      // Listen for auth state change
      auth.onAuthStateChanged((user) => {
        currentUser = user;
        if (user) {
          console.log('👤 [Firebase] User signed in:', user.displayName, user.email);
          onUserSignedIn(user);
        } else {
          console.log('👤 [Firebase] No user signed in');
          updateSyncStatus(true);
        }
      });

      setupAuthButtons();
      updateSyncStatus(true);
    } catch (err) {
      console.warn('⚠️ [FirebaseDB] Initialization failed:', err);
    }

    return db;
  }

  function onUserSignedIn(user) {
    updateSyncStatus(true);
    if (typeof document === 'undefined') return;

    // อัปเดต UI Profile
    const nameEl = document.getElementById('profile-merchant-name');
    if (nameEl && user.displayName) nameEl.textContent = user.displayName;

    const emailEl = document.getElementById('profile-merchant-email');
    if (emailEl && user.email) emailEl.textContent = user.email;

    // อัปเดต Avatar ทักทาย
    const avatarEl = document.querySelector('.avatar');
    if (avatarEl && user.displayName) avatarEl.textContent = user.displayName[0].toUpperCase();

    // แสดง Toast แจ้งเตือน
    if (window.UI && window.UI.showToast) {
      window.UI.showToast(`ยินดีต้อนรับ, ${user.displayName || user.email} 👋`, 'success');
    }
  }

  function updateSyncStatus(connected) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('sync-indicator');
    if (!el) return;

    el.classList.remove('hidden');
    el.style.display = 'block';

    if (currentUser) {
      el.style.background = '#e5f7ef';
      el.style.color = '#11885b';
      el.textContent = `🟢 บัญชี: ${currentUser.displayName || currentUser.email} (ซิงค์คลาวด์)`;
    } else if (connected) {
      el.style.background = '#e5f7ef';
      el.style.color = '#11885b';
      el.textContent = '🟢 เชื่อมต่อ Cloud Firestore แล้ว (ซิงค์เรียลไทม์)';
    } else {
      el.style.background = '#feebc8';
      el.style.color = '#c05621';
      el.textContent = '🟡 ออฟไลน์ (บันทึกในเครื่อง Local Database)';
    }
  }

  // ─── Google Sign-In ─────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    if (!auth) init();
    if (!auth) {
      alert('Firebase ยังไม่ได้ตั้งค่า');
      return;
    }

    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');

      // ใช้ signInWithPopup
      const result = await auth.signInWithPopup(provider);
      currentUser = result.user;
      if (typeof window !== 'undefined' && window.show) {
        window.show('dashboard');
      }
    } catch (err) {
      console.error('Google Sign-in error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        alert('เข้าสู่ระบบด้วย Google ไม่สำเร็จ: ' + err.message);
      }
    }
  }

  async function signOut() {
    if (auth) {
      try {
        await auth.signOut();
      } catch (e) {
        console.warn(e);
      }
    }
    currentUser = null;
    updateSyncStatus(true);
    if (window.UI && window.UI.showToast) {
      window.UI.showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    }
  }

  function setupAuthButtons() {
    if (typeof document === 'undefined') return;
    const googleBtn = document.getElementById('btn-login-google');
    if (googleBtn) {
      googleBtn.onclick = signInWithGoogle;
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.onclick = signOut;
    }
  }

  // ─── CRUD Methods for Orders ────────────────────────────────────────────────

  async function saveOrder(order) {
    if (!order || !order.id) return;
    const firestore = init();
    if (!firestore || !navigator.onLine) {
      updateSyncStatus(false);
      return;
    }

    try {
      const cleanOrder = JSON.parse(JSON.stringify(order));
      cleanOrder.updatedAt = new Date().toISOString();
      if (currentUser) {
        cleanOrder.userId = currentUser.uid;
        cleanOrder.userEmail = currentUser.email;
      }

      await firestore.collection('orders').doc(cleanOrder.id).set(cleanOrder, { merge: true });
      updateSyncStatus(true);
      console.log('🔥 [Firestore] Saved order:', cleanOrder.id);
    } catch (err) {
      console.warn('⚠️ [Firestore] saveOrder error:', err);
      updateSyncStatus(false);
    }
  }

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
    signInWithGoogle,
    signOut,
    saveOrder,
    getOrders,
    deleteOrder,
    saveSettings,
    updateSyncStatus,
    getCurrentUser: () => currentUser,
    _getDb: () => db,
  };
});
