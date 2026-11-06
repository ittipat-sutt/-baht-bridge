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

    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Merchant');

    // อัปเดต UI Profile
    const nameEl = document.getElementById('profile-merchant-name');
    if (nameEl) nameEl.textContent = displayName;

    const emailEl = document.getElementById('profile-merchant-email');
    if (emailEl && user.email) emailEl.textContent = user.email;

    const cardNameEl = document.getElementById('profile-card-name');
    if (cardNameEl) cardNameEl.textContent = displayName;

    const cardEmailEl = document.getElementById('profile-card-email');
    if (cardEmailEl && user.email) cardEmailEl.textContent = user.email;

    const avatarBig = document.getElementById('profile-avatar');
    if (avatarBig) avatarBig.textContent = displayName[0].toUpperCase();

    // อัปเดต Avatar Header
    const avatarEl = document.querySelector('.avatar');
    if (avatarEl) avatarEl.textContent = displayName[0].toUpperCase();

    const helloEl = document.querySelector('.hello');
    if (helloEl) helloEl.textContent = `สวัสดี, ${displayName} 👋`;

    // ซ่อนข้อความ error ในหน้าล็อกอิน (ถ้ามี)
    setLoginMsg('', false);

    // แสดง Toast แจ้งเตือน
    if (window.UI && window.UI.showToast) {
      window.UI.showToast(`ยินดีต้อนรับ, ${displayName} 👋`, 'success');
    }
  }

  function updateSyncStatus(connected) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('sync-indicator');
    if (!el) return;

    el.classList.remove('hidden');
    el.style.display = 'block';

    if (currentUser) {
      const label = currentUser.displayName || currentUser.email;
      el.style.background = '#e5f7ef';
      el.style.color = '#11885b';
      el.textContent = `🟢 บัญชี: ${label} (ซิงค์คลาวด์ Firestore)`;
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

  function setLoginMsg(msg, isError = false) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('login-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? 'var(--red, #df4c53)' : 'var(--blue, #2389ec)';
  }

  // ─── Email & Password Sign-In ───────────────────────────────────────────────
  async function signInWithEmail(email, password) {
    if (!auth) init();
    if (!auth) {
      const msg = 'ระบบ Firebase ยังไม่ได้ตั้งค่า';
      setLoginMsg(msg, true);
      return { success: false, error: msg };
    }

    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      const msg = 'กรุณากรอกอีเมลที่ถูกต้อง';
      setLoginMsg(msg, true);
      return { success: false, error: msg };
    }

    if (!password || password.length < 6) {
      const msg = 'กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัวอักษร';
      setLoginMsg(msg, true);
      return { success: false, error: msg };
    }

    setLoginMsg('กำลังเข้าสู่ระบบ...', false);

    try {
      const result = await auth.signInWithEmailAndPassword(cleanEmail, password);
      currentUser = result.user;
      setLoginMsg('เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าหลัก...', false);
      if (typeof window !== 'undefined' && window.show) {
        setTimeout(() => window.show('dashboard'), 350);
      }
      return { success: true, user: result.user };
    } catch (err) {
      console.error('Email sign-in error:', err);
      let thMsg = 'เข้าสู่ระบบไม่สำเร็จ: ' + err.message;
      if (err.code === 'auth/user-not-found') {
        thMsg = 'ไม่พบบัญชีผู้ใช้นี้ กรุณากด "สมัครสมาชิกใหม่"';
      } else if (err.code === 'auth/wrong-password') {
        thMsg = 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
      } else if (err.code === 'auth/invalid-email') {
        thMsg = 'รูปแบบอีเมลไม่ถูกต้อง';
      } else if (err.code === 'auth/invalid-credential') {
        thMsg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
      } else if (err.code === 'auth/too-many-requests') {
        thMsg = 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
      }
      setLoginMsg(thMsg, true);
      if (window.UI && window.UI.showToast) {
        window.UI.showToast(thMsg, 'error');
      }
      return { success: false, error: thMsg };
    }
  }

  // ─── Email & Password Sign-Up ───────────────────────────────────────────────
  async function signUpWithEmail(email, password) {
    if (!auth) init();
    if (!auth) {
      const msg = 'ระบบ Firebase ยังไม่ได้ตั้งค่า';
      setLoginMsg(msg, true);
      return { success: false, error: msg };
    }

    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      const msg = 'กรุณากรอกอีเมลที่ถูกต้องสำหรับการสมัคร';
      setLoginMsg(msg, true);
      return { success: false, error: msg };
    }

    if (!password || password.length < 6) {
      const msg = 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
      setLoginMsg(msg, true);
      return { success: false, error: msg };
    }

    setLoginMsg('กำลังสร้างบัญชีผู้ใช้ใหม่...', false);

    try {
      const result = await auth.createUserWithEmailAndPassword(cleanEmail, password);
      currentUser = result.user;
      setLoginMsg('สร้างบัญชีและเข้าสู่ระบบสำเร็จ!', false);
      if (window.UI && window.UI.showToast) {
        window.UI.showToast(`ยินดีต้อนรับสมาชิกใหม่: ${cleanEmail} 🎉`, 'success');
      }
      if (typeof window !== 'undefined' && window.show) {
        setTimeout(() => window.show('dashboard'), 350);
      }
      return { success: true, user: result.user };
    } catch (err) {
      console.error('Email sign-up error:', err);
      let thMsg = 'สมัครสมาชิกไม่สำเร็จ: ' + err.message;
      if (err.code === 'auth/email-already-in-use') {
        thMsg = 'อีเมลนี้ถูกใช้งานแล้ว กรุณากด "เข้าสู่ระบบ" แทน';
      } else if (err.code === 'auth/weak-password') {
        thMsg = 'รหัสผ่านง่ายเกินไป ต้องมีอย่างน้อย 6 ตัวอักษร';
      } else if (err.code === 'auth/invalid-email') {
        thMsg = 'รูปแบบอีเมลไม่ถูกต้อง';
      }
      setLoginMsg(thMsg, true);
      if (window.UI && window.UI.showToast) {
        window.UI.showToast(thMsg, 'error');
      }
      return { success: false, error: thMsg };
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

    if (typeof document !== 'undefined') {
      const nameEl = document.getElementById('profile-merchant-name');
      if (nameEl) nameEl.textContent = 'Merchant Shop';
      const emailEl = document.getElementById('profile-merchant-email');
      if (emailEl) emailEl.textContent = 'merchant@example.com';
      const cardNameEl = document.getElementById('profile-card-name');
      if (cardNameEl) cardNameEl.textContent = 'Merchant Shop';
      const cardEmailEl = document.getElementById('profile-card-email');
      if (cardEmailEl) cardEmailEl.textContent = 'merchant@example.com';
      const avatarBig = document.getElementById('profile-avatar');
      if (avatarBig) avatarBig.textContent = 'M';
      const avatarEl = document.querySelector('.avatar');
      if (avatarEl) avatarEl.textContent = 'M';
      const helloEl = document.querySelector('.hello');
      if (helloEl) helloEl.textContent = 'สวัสดี, Merchant 👋';
    }

    if (window.UI && window.UI.showToast) {
      window.UI.showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    }
  }

  function setupAuthButtons() {
    if (typeof document === 'undefined') return;

    // Login with Email & Password
    const emailLoginBtn = document.getElementById('btn-login-password');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');

    if (emailLoginBtn && emailInput && passwordInput) {
      emailLoginBtn.onclick = () => {
        signInWithEmail(emailInput.value, passwordInput.value);
      };

      // Enter key support
      passwordInput.onkeyup = (e) => {
        if (e.key === 'Enter') {
          signInWithEmail(emailInput.value, passwordInput.value);
        }
      };
    }

    // Sign Up with Email & Password
    const signUpBtn = document.getElementById('btn-signup-email');
    if (signUpBtn && emailInput && passwordInput) {
      signUpBtn.onclick = () => {
        signUpWithEmail(emailInput.value, passwordInput.value);
      };
    }

    // Google Sign-In
    const googleBtn = document.getElementById('btn-login-google');
    if (googleBtn) {
      googleBtn.onclick = signInWithGoogle;
    }

    // Logout
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
    signInWithEmail,
    signUpWithEmail,
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
