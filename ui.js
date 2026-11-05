/**
 * BahtBridge UI Utility Module
 * Vanilla JS components: Toast notifications, Bottom Sheets, and Confirm Dialogs.
 * Owner: Person 2 (UI/CSS Specialist)
 */
(function () {
  'use strict';

  /**
   * Retrieves or lazily creates the #toast-root element inside the phone viewport.
   * @returns {HTMLElement}
   */
  function getToastRoot() {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      const phone = document.querySelector('.phone') || document.body;
      phone.appendChild(root);
    }
    return root;
  }

  /**
   * Display a floating toast notification.
   * Uses textContent exclusively to guarantee XSS safety.
   *
   * @param {string} msg - The message to display.
   * @param {'info'|'success'|'error'} [type='info'] - Notification style variant.
   * @param {number} [ms=3000] - Duration in milliseconds before auto-dismissal.
   * @returns {() => void} Dismiss function.
   */
  function showToast(msg, type = 'info', ms = 3000) {
    const root = getToastRoot();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    if (type === 'success') {
      icon.textContent = '✓';
    } else if (type === 'error') {
      icon.textContent = '✕';
    } else {
      icon.textContent = 'ℹ';
    }

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = String(msg || '');

    toast.appendChild(icon);
    toast.appendChild(text);
    root.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 350);
    };

    const timer = setTimeout(dismiss, ms);

    toast.addEventListener('click', () => {
      clearTimeout(timer);
      dismiss();
    });

    return dismiss;
  }

  /**
   * Open a bottom sheet modal and lock scrolling on background screens.
   * @param {string} id - The DOM ID of the bottom sheet element.
   */
  function openSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;

    sheet.classList.add('active', 'open');
    sheet.setAttribute('aria-hidden', 'false');

    // Lock scrolling on all screens or screen-body
    document.querySelectorAll('.screen').forEach((scr) => {
      scr.classList.add('sheet-locked');
    });

    // Ensure backdrop exists and attaches close handler
    let backdrop = sheet.querySelector('.sheet-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sheet-backdrop';
      sheet.insertBefore(backdrop, sheet.firstChild);
    }

    if (!backdrop._boundDismiss) {
      backdrop._boundDismiss = () => closeSheet(id);
      backdrop.addEventListener('click', backdrop._boundDismiss);
    }
  }

  /**
   * Close a bottom sheet modal and unlock background scrolling.
   * @param {string} id - The DOM ID of the bottom sheet element.
   */
  function closeSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;

    sheet.classList.remove('active', 'open');
    sheet.setAttribute('aria-hidden', 'true');

    // Check if any other sheet is still active before unlocking scroll
    const hasOtherOpenSheets = !!document.querySelector('.sheet.active, .sheet.open');
    if (!hasOtherOpenSheets) {
      document.querySelectorAll('.screen').forEach((scr) => {
        scr.classList.remove('sheet-locked');
      });
    }
  }

  /**
   * Show a modal confirmation dialog.
   * @param {string} msg - The confirmation prompt message.
   * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled.
   */
  function confirmDialog(msg) {
    return new Promise((resolve) => {
      let overlay = document.getElementById('ui-confirm-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ui-confirm-modal';
        overlay.className = 'modal-backdrop';

        const card = document.createElement('div');
        card.className = 'modal-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        const title = document.createElement('div');
        title.className = 'modal-title';
        title.textContent = 'ยืนยันการดำเนินการ';

        const body = document.createElement('p');
        body.className = 'modal-body';

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'outline modal-cancel';
        cancelBtn.textContent = 'ยกเลิก';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'primary modal-confirm';
        confirmBtn.textContent = 'ตกลง';

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);

        card.appendChild(title);
        card.appendChild(body);
        card.appendChild(actions);

        overlay.appendChild(card);

        const phone = document.querySelector('.phone') || document.body;
        phone.appendChild(overlay);
      }

      const bodyEl = overlay.querySelector('.modal-body');
      bodyEl.textContent = String(msg || 'คุณต้องการดำเนินการต่อหรือไม่?');

      const cancelBtn = overlay.querySelector('.modal-cancel');
      const confirmBtn = overlay.querySelector('.modal-confirm');

      function cleanup(result) {
        overlay.classList.remove('active');
        cancelBtn.onclick = null;
        confirmBtn.onclick = null;
        overlay.onclick = null;
        resolve(result);
      }

      cancelBtn.onclick = () => cleanup(false);
      confirmBtn.onclick = () => cleanup(true);
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup(false);
        }
      };

      overlay.classList.add('active');
      confirmBtn.focus();
    });
  }

  // Export to global window object
  window.UI = {
    showToast,
    openSheet,
    closeSheet,
    confirmDialog
  };
})();
