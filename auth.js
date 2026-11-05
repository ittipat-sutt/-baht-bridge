/**
 * BahtBridge — Authentication Service (auth.js)
 * Handles Supabase Magic Link, Google OAuth, Deep Linking, and Account Management.
 * Compliant with DATA_MODEL.md & HTML_CONTRACT.md
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AuthService = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  let supabaseClient = null;
  let currentUser = null;

  // ─── Initialize Supabase Client ─────────────────────────────────────────────
  function getSupabase() {
    if (supabaseClient) return supabaseClient;

    const config = (typeof window !== 'undefined' && window.__CONFIG__) ? window.__CONFIG__ : {};
    const supabaseLib = (typeof window !== 'undefined' && window.supabase) ? window.supabase : null;

    if (
      supabaseLib &&
      config.SUPABASE_URL &&
      config.SUPABASE_ANON_KEY &&
      !config.SUPABASE_URL.includes('placeholder')
    ) {
      supabaseClient = supabaseLib.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return supabaseClient;
  }

  // ─── Capacitor & Deep Linking Helper ────────────────────────────────────────
  function isNativeCapacitor() {
    return (
      typeof window !== 'undefined' &&
      Boolean(window.Capacitor?.isNativePlatform?.())
    );
  }

  function getRedirectUrl() {
    if (isNativeCapacitor()) {
      // Deep link scheme configured in AndroidManifest.xml
      return 'bahtbridge://auth/callback';
    }
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4173';
  }

  // ─── Toast / Notification Helper ────────────────────────────────────────────
  function notify(msg, type = 'info') {
    if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
      window.UI.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  // ─── Check / Get Current User ───────────────────────────────────────────────
  async function getCurrentUser() {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data: { user } } = await sb.auth.getUser();
      currentUser = user;
      return user;
    } catch (err) {
      console.warn('getCurrentUser error:', err);
      return null;
    }
  }

  function isAuthenticated() {
    return Boolean(currentUser);
  }

  // ─── Sign In: Email Magic Link ──────────────────────────────────────────────
  async function signInWithEmail(email) {
    const sb = getSupabase();
    if (!sb) {
      notify('กรุณาตั้งค่า Supabase URL และ Anon Key ใน config.js ก่อนเข้าสู่ระบบ', 'error');
      return { success: false, error: 'Supabase not configured' };
    }

    const trimmed = (email || '').trim();
    if (!trimmed || !trimmed.includes('@')) {
      notify('กรุณากรอกอีเมลที่ถูกต้อง', 'warning');
      return { success: false, error: 'Invalid email' };
    }

    try {
      const { error } = await sb.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: getRedirectUrl(),
        },
      });

      if (error) throw error;
      notify(`ระบบส่ง Magic Link ไปยัง ${trimmed} แล้ว กรุณาตรวจสอบอีเมลของคุณ`, 'success');
      return { success: true };
    } catch (err) {
      console.error('signInWithEmail error:', err);
      notify(`เข้าสู่ระบบไม่สำเร็จ: ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  }

  // ─── Sign In: Google OAuth (with Capacitor System Browser Handling) ─────────
  async function signInWithGoogle() {
    const sb = getSupabase();
    if (!sb) {
      notify('กรุณาตั้งค่า Supabase URL และ Anon Key ใน config.js ก่อนเข้าสู่ระบบ', 'error');
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const redirectTo = getRedirectUrl();

      if (isNativeCapacitor()) {
        // บน Capacitor: Google บล็อกการล็อกอินใน In-App WebView
        // จึงต้องเปิดเบราว์เซอร์จริงของระบบ (Chrome / Safari) แล้วดีดกลับด้วย deep link
        const { data, error } = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;

        if (data?.url) {
          if (window.Capacitor?.Plugins?.Browser) {
            await window.Capacitor.Plugins.Browser.open({ url: data.url });
          } else {
            window.open(data.url, '_system');
          }
        }
      } else {
        // บนเบราว์เซอร์ทั่วไป
        const { error } = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
          },
        });
        if (error) throw error;
      }
      return { success: true };
    } catch (err) {
      console.error('signInWithGoogle error:', err);
      notify(`ล็อกอินด้วย Google ไม่สำเร็จ: ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  }

  // ─── Sign Out ───────────────────────────────────────────────────────────────
  async function signOut() {
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch (err) {
        console.warn('SignOut remote error:', err);
      }
    }

    // ล้างข้อมูลแคชในเครื่องทั้งหมดเมื่อออกจากระบบ
    try {
      localStorage.removeItem('bahtbridge_orders_data');
      localStorage.removeItem('bahtbridge_settings');
      localStorage.removeItem('bb_offline_queue');
      localStorage.removeItem('bb_initial_import_prompted');
    } catch (_) {}

    currentUser = null;
    notify('ออกจากระบบและล้างข้อมูลแคชในเครื่องเรียบร้อยแล้ว', 'info');

    // รีเฟรชหน้าจอเพื่อสลับกลับสู่โหมดออฟไลน์
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  // ─── Delete Account (Double Confirmation) ───────────────────────────────────
  async function deleteAccount() {
    const sb = getSupabase();
    if (!sb || !currentUser) {
      notify('ไม่พบเซสชันผู้ใช้ปัจจุบัน', 'warning');
      return;
    }

    // ยืนยันสองครั้งเพื่อความปลอดภัย
    const firstConfirm = confirm('⚠️ คำเตือน: คุณต้องการลบบัญชีและข้อมูลทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้');
    if (!firstConfirm) return;

    const secondConfirm = confirm('🚨 ยืนยันครั้งสุดท้าย: ข้อมูลคำสั่งซื้อ ลูกค้า และการตั้งค่าทั้งหมดของคุณจะถูกลบถาวรทันที ยืนยันลบบัญชีใช่หรือไม่?');
    if (!secondConfirm) return;

    try {
      // ลบข้อมูลร้านค้าในตาราง merchants (Cascade RLS จะลบ orders, items, settings อัตโนมัติ)
      const { error } = await sb
        .from('merchants')
        .delete()
        .eq('merchant_id', currentUser.id);

      if (error) {
        console.warn('Delete merchant error:', error);
      }

      await signOut();
      notify('ลบบัญชีและข้อมูลทั้งหมดสำเร็จ', 'success');
    } catch (err) {
      console.error('deleteAccount error:', err);
      notify(`เกิดข้อผิดพลาดในการลบบัญชี: ${err.message}`, 'error');
    }
  }

  // ─── Prompt Initial Import from LocalStorage ────────────────────────────────
  async function checkInitialImportPrompt(userId) {
    if (!userId || typeof localStorage === 'undefined') return;

    const key = `bb_imported_${userId}`;
    if (localStorage.getItem(key)) return;

    try {
      const raw = localStorage.getItem('bahtbridge_orders_data');
      if (raw) {
        const localOrders = JSON.parse(raw);
        if (Array.isArray(localOrders) && localOrders.length > 0) {
          const wantImport = confirm(
            `พบข้อมูลออเดอร์ในเครื่อง ${localOrders.length} รายการ คุณต้องการนำเข้าข้อมูลขึ้นบัญชีคลาวด์ของคุณหรือไม่?`
          );
          if (wantImport && window.SupabaseStorage) {
            await window.SupabaseStorage.importAll(
              { orders: localOrders },
              { mode: 'merge' }
            );
            notify(`นำเข้าออเดอร์ ${localOrders.length} รายการขึ้นบัญชีคลาวด์เรียบร้อย`, 'success');
          }
        }
      }
      localStorage.setItem(key, 'true');
    } catch (err) {
      console.warn('Initial import prompt error:', err);
    }
  }

  // ─── Setup Auth UI Event Listeners ──────────────────────────────────────────
  function setupAuthUI() {
    // ปุ่ม Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.style.display = '';
      logoutBtn.onclick = signOut;
    }

    // ปุ่ม Delete Account
    const deleteBtn = document.getElementById('btn-delete-account');
    if (deleteBtn) {
      deleteBtn.onclick = deleteAccount;
    }

    // ปุ่ม Login Email
    const loginEmailBtn = document.getElementById('btn-login-email');
    if (loginEmailBtn) {
      loginEmailBtn.onclick = async () => {
        const input = document.getElementById('login-email-input');
        if (input) await signInWithEmail(input.value);
      };
    }

    // ปุ่ม Login Google
    const loginGoogleBtn = document.getElementById('btn-login-google');
    if (loginGoogleBtn) {
      loginGoogleBtn.onclick = signInWithGoogle;
    }
  }

  // ─── Init Listener on Startup ───────────────────────────────────────────────
  async function init() {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { data: { user } } = await sb.auth.getUser();
      currentUser = user;

      if (user) {
        await checkInitialImportPrompt(user.id);
      }

      sb.auth.onAuthStateChange(async (event, session) => {
        currentUser = session?.user || null;
        if (event === 'SIGNED_IN' && session?.user) {
          await checkInitialImportPrompt(session.user.id);
          if (typeof window !== 'undefined' && window.show) {
            window.show('dashboard');
          }
        }
      });
    } catch (err) {
      console.warn('Auth init error:', err);
    }

    setupAuthUI();
  }

  return {
    init,
    getSupabase,
    getCurrentUser,
    isAuthenticated,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    deleteAccount,
    setupAuthUI,
    _setSupabaseClient: (c) => { supabaseClient = c; },
  };
});
