/**
 * BahtBridge — Backup & Restore Module (backup.js)
 * Handles data export, import, schema validation, and lastBackupAt tracking.
 * Interacts only via StorageService (DATA_MODEL.md).
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    const backupApi = factory();
    root.BackupModule = backupApi;
    if (typeof window !== 'undefined') {
      window.BackupModule = backupApi;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getStorage() {
    if (typeof window !== 'undefined') {
      return window.StorageService || window.AppStorage || null;
    }
    return null;
  }

  function notify(message, type = 'success') {
    if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
      UI.showToast(message, type);
      return;
    }

    if (typeof document !== 'undefined') {
      const root = document.getElementById('toast-root');
      if (root) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText =
          'background:#102d5c;color:#fff;padding:10px 18px;border-radius:24px;' +
          'box-shadow:0 6px 16px rgba(0,0,0,0.18);font-size:14px;font-weight:600;' +
          'margin-bottom:8px;pointer-events:auto;transition:opacity 0.3s;max-width:90vw;text-align:center';
        if (type === 'error') toast.style.background = '#df4c53';
        toast.textContent = message;
        root.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 2800);
        return;
      }
      alert(message);
    }
  }

  /**
   * Validate backup file content.
   * Pure function for unit tests.
   * @param {string|Object} rawContent
   * @returns {{ valid: boolean, error?: string, data?: Object, ordersCount?: number, schemaVersion?: number }}
   */
  function validateBackupFileContent(rawContent) {
    if (!rawContent) {
      return { valid: false, error: 'ไม่พบข้อมูลในไฟล์สำรอง' };
    }

    let parsed;
    if (typeof rawContent === 'string') {
      try {
        parsed = JSON.parse(rawContent);
      } catch (err) {
        return { valid: false, error: 'ไฟล์ไม่ใช่รูปแบบ JSON ที่ถูกต้อง' };
      }
    } else if (typeof rawContent === 'object') {
      parsed = rawContent;
    } else {
      return { valid: false, error: 'โครงสร้างข้อมูลต้องเป็น JSON Object' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, error: 'โครงสร้างข้อมูลต้องเป็น JSON Object' };
    }

    if (parsed.app && parsed.app !== 'BahtBridge') {
      return { valid: false, error: 'ไฟล์นี้ไม่ได้มาจากแอปพลิเคชัน BahtBridge' };
    }

    if (!Array.isArray(parsed.orders)) {
      return { valid: false, error: 'ไม่พบรายการคำสั่งซื้อ (orders array) ในไฟล์สำรอง' };
    }

    return {
      valid: true,
      data: parsed,
      ordersCount: parsed.orders.length,
      schemaVersion: parsed.schemaVersion || 1,
      exportedAt: parsed.exportedAt || null,
    };
  }

  /**
   * Format date into bahtbridge-backup-YYYYMMDD.json filename.
   */
  function getBackupFilename(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `bahtbridge-backup-${yyyy}${mm}${dd}.json`;
  }

  /**
   * Check if running inside Capacitor native container.
   */
  function isCapacitorNative() {
    return (
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  }

  /**
   * Perform backup download or share.
   */
  async function performBackup() {
    const storage = getStorage();
    if (!storage) {
      notify('ไม่พบโมดูลจัดเก็บข้อมูล', 'error');
      return;
    }

    try {
      const dump = await storage.exportAll();
      const filename = getBackupFilename(new Date());
      const jsonString = JSON.stringify(dump, null, 2);

      // Record lastBackupAt
      const nowIso = new Date().toISOString();
      await storage.saveSettings({ lastBackupAt: nowIso });
      await renderLastBackupStatus();

      // Native Capacitor check
      if (isCapacitorNative() && window.Capacitor.Plugins) {
        const { Filesystem, Share } = window.Capacitor.Plugins;
        if (Filesystem && Share) {
          try {
            const writeResult = await Filesystem.writeFile({
              path: filename,
              data: jsonString,
              directory: 'CACHE',
              encoding: 'utf8',
            });

            await Share.share({
              title: 'สำรองข้อมูล BahtBridge',
              text: `ไฟล์สำรองข้อมูลออเดอร์ BahtBridge (${dump.ordersCount} รายการ)`,
              url: writeResult.uri,
              dialogTitle: 'บันทึกหรือแชร์ไฟล์สำรองข้อมูล',
            });
            notify(`✅ บันทึกและแชร์ข้อมูลเรียบร้อยแล้ว (${dump.ordersCount} รายการ)`, 'success');
            return;
          } catch (capErr) {
            console.warn('Capacitor native share failed, falling back to web download:', capErr);
          }
        }
      }

      // Web Browser Download Fallback
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notify(`✅ สำรองข้อมูลเรียบร้อยแล้ว (${dump.ordersCount} รายการ)`, 'success');
    } catch (err) {
      console.error('Backup error:', err);
      notify('❌ เกิดข้อผิดพลาดในการสำรองข้อมูล', 'error');
    }
  }

  /**
   * Process selected backup file for import.
   */
  async function handleImportFile(file) {
    if (!file) return;

    const storage = getStorage();
    if (!storage) {
      notify('ไม่พบโมดูลจัดเก็บข้อมูล', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const validation = validateBackupFileContent(content);

        if (!validation.valid) {
          notify(`❌ ไม่สามารถนำเข้าได้: ${validation.error}`, 'error');
          return;
        }

        const count = validation.ordersCount;
        const confirmMsg =
          `พบข้อมูลออเดอร์จำนวน ${count} รายการในไฟล์สำรอง\n\n` +
          `ต้องการนำเข้าข้อมูลแบบใด?\n` +
          `• กด [OK / ตกลง] เพื่อรวมข้อมูลเดิม (Merge - ข้ามออเดอร์ที่รหัสซ้ำกัน)\n` +
          `• กด [Cancel / ยกเลิก] เพื่อเขียนทับข้อมูลทั้งหมด (Replace)`;

        const isMerge = window.confirm(confirmMsg);

        let mode = 'merge';
        if (!isMerge) {
          // Double confirmation for destructive replace
          const doubleConfirm = window.confirm(
            `⚠️ คำเตือนสำคัญ:\n` +
            `คุณเลือก "เขียนทับข้อมูลทั้งหมด" (Replace)\n` +
            `ข้อมูลออเดอร์ปัจจุบันในเครื่องจะถูกลบและแทนที่ด้วยข้อมูลจากไฟล์\n\n` +
            `ยืนยันจะเขียนทับข้อมูลจริงหรือไม่?`
          );

          if (!doubleConfirm) {
            notify('ยกเลิกการนำเข้าข้อมูลแล้ว', 'success');
            return;
          }
          mode = 'replace';
        }

        const res = await storage.importAll(validation.data, { mode });
        notify(
          `✅ นำเข้าข้อมูลสำเร็จ: นำเข้า ${res.imported} รายการ (ข้ามซ้ำ ${res.skipped} รายการ)`,
          'success'
        );

        // Update dashboard / orders if open
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderOrdersList === 'function') renderOrdersList();
        await renderLastBackupStatus();
      } catch (err) {
        console.error('Import processing error:', err);
        notify(`❌ เกิดข้อผิดพลาด: ${err.message}`, 'error');
      }
    };

    reader.onerror = () => {
      notify('❌ ไม่สามารถอ่านไฟล์ที่เลือกได้', 'error');
    };

    reader.readAsText(file);
  }

  /**
   * Render lastBackupAt in #last-backup element.
   */
  async function renderLastBackupStatus() {
    const storage = getStorage();
    if (!storage || typeof document === 'undefined') return;

    const el = document.getElementById('last-backup');
    if (!el) return;

    try {
      const s = await storage.getSettings();
      if (!s.lastBackupAt) {
        el.innerHTML = '<span style="color:#df4c53">ยังไม่เคยสำรองข้อมูล (⚠️ แนะนำให้สำรองข้อมูลทันที)</span>';
        return;
      }

      const backupDate = new Date(s.lastBackupAt);
      const diffMs = Date.now() - backupDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const dateStr = backupDate.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      if (diffDays >= 7) {
        el.innerHTML = `<span style="color:#e67e22">${dateStr} (⚠️ เกิน 7 วันแล้ว ควรสำรองข้อมูลใหม่)</span>`;
      } else {
        el.innerHTML = `<span style="color:var(--green,#16a36a)">${dateStr}</span>`;
      }
    } catch (err) {
      console.error('Failed to render last backup status:', err);
    }
  }

  /**
   * Initialize Backup UI Event Listeners.
   */
  function initBackupUI() {
    if (typeof document === 'undefined') return;

    const backupBtn = document.getElementById('btn-backup');
    if (backupBtn) {
      backupBtn.onclick = (e) => {
        e.preventDefault();
        performBackup();
      };
    }

    const importBtn = document.getElementById('btn-import');
    const fileInput = document.getElementById('import-file');

    if (importBtn && fileInput) {
      importBtn.onclick = (e) => {
        e.preventDefault();
        fileInput.value = ''; // Reset input
        fileInput.click();
      };

      fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleImportFile(file);
      };
    }

    // Auto-render status
    renderLastBackupStatus();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBackupUI);
    } else {
      initBackupUI();
    }
  }

  return {
    validateBackupFileContent,
    getBackupFilename,
    performBackup,
    handleImportFile,
    renderLastBackupStatus,
    initBackupUI,
  };
});
