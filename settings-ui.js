/**
 * BahtBridge — Settings UI Module (settings-ui.js)
 * Manages Settings screen form loading, validation, and saving.
 * Interacts only via StorageService (DATA_MODEL.md).
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    const settingsUi = factory();
    root.SettingsUI = settingsUi;
    if (typeof window !== 'undefined') {
      window.SettingsUI = settingsUi;
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
   * Validate settings payload.
   * Pure function suitable for unit tests.
   * @param {Object} data
   * @returns {{ valid: boolean, error?: string, sanitized?: Object }}
   */
  function validateSettings(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'ข้อมูลการตั้งค่าไม่ถูกต้อง' };
    }

    const defaultShipping = Number(data.defaultShipping);
    if (isNaN(defaultShipping) || defaultShipping < 0) {
      return { valid: false, error: 'ค่าจัดส่งเริ่มต้นต้องเป็นตัวเลขที่ไม่ติดลบ' };
    }

    const feeType = data.serviceFeeType === 'percent' ? 'percent' : 'fixed';
    const feeValue = Number(data.serviceFeeValue);
    if (isNaN(feeValue) || feeValue < 0) {
      return { valid: false, error: 'ค่าบริการต้องเป็นตัวเลขที่ไม่ติดลบ' };
    }
    if (feeType === 'percent' && feeValue > 100) {
      return { valid: false, error: 'ค่าบริการแบบเปอร์เซ็นต์ต้องไม่เกิน 100%' };
    }

    const markup = Number(data.rateMarkupPercent ?? 0);
    if (isNaN(markup) || markup < 0 || markup > 100) {
      return { valid: false, error: 'ส่วนต่างเรทแลกเปลี่ยน (% Markup) ต้องอยู่ระหว่าง 0 - 100%' };
    }

    return {
      valid: true,
      sanitized: {
        defaultShipping: Math.round(defaultShipping * 100) / 100,
        serviceFeeType: feeType,
        serviceFeeValue: Math.round(feeValue * 100) / 100,
        rateMarkupPercent: Math.round(markup * 100) / 100,
      },
    };
  }

  /**
   * Load current settings from StorageService into form inputs.
   */
  async function loadSettings() {
    const storage = getStorage();
    if (!storage || typeof document === 'undefined') return;

    try {
      const s = await storage.getSettings();

      const shippingInput = document.getElementById('set-default-shipping');
      const feeTypeSelect = document.getElementById('set-fee-type');
      const feeValueInput = document.getElementById('set-fee-value');
      const markupInput = document.getElementById('set-markup');

      if (shippingInput) shippingInput.value = s.defaultShipping ?? 150;
      if (feeTypeSelect) feeTypeSelect.value = s.serviceFeeType ?? 'fixed';
      if (feeValueInput) feeValueInput.value = s.serviceFeeValue ?? 100;
      if (markupInput) markupInput.value = s.rateMarkupPercent ?? 0;
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  /**
   * Read form inputs, validate, and persist via StorageService.
   */
  async function saveSettings() {
    const storage = getStorage();
    if (!storage || typeof document === 'undefined') return;

    const shippingInput = document.getElementById('set-default-shipping');
    const feeTypeSelect = document.getElementById('set-fee-type');
    const feeValueInput = document.getElementById('set-fee-value');
    const markupInput = document.getElementById('set-markup');

    const rawData = {
      defaultShipping: shippingInput ? shippingInput.value : 150,
      serviceFeeType: feeTypeSelect ? feeTypeSelect.value : 'fixed',
      serviceFeeValue: feeValueInput ? feeValueInput.value : 100,
      rateMarkupPercent: markupInput ? markupInput.value : 0,
    };

    const validation = validateSettings(rawData);
    if (!validation.valid) {
      notify(validation.error, 'error');
      return false;
    }

    try {
      await storage.saveSettings(validation.sanitized);
      notify('✅ บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      notify('❌ เกิดข้อผิดพลาดในการบันทึกการตั้งค่า', 'error');
      return false;
    }
  }

  /**
   * Initialize Settings UI listeners.
   */
  function initSettingsUI() {
    if (typeof document === 'undefined') return;

    const saveBtn = document.getElementById('btn-save-settings');
    if (saveBtn) {
      saveBtn.onclick = async (e) => {
        e.preventDefault();
        await saveSettings();
      };
    }

    // Auto-load when ready
    loadSettings();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSettingsUI);
    } else {
      initSettingsUI();
    }
  }

  return {
    validateSettings,
    loadSettings,
    saveSettings,
    initSettingsUI,
    notify,
  };
});
