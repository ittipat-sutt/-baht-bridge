/**
 * BahtBridge — Order Status, Payment & Tracking UI (status-ui.js)
 * Handles DOM rendering, modal sheets, payment recording, shipment tracking,
 * item status management, and activity timeline.
 * Owner: Person 2 (Front-end UI & Status Specialist)
 */

(function () {
  'use strict';

  // Reference global services
  const Status = window.Status;
  const UI = window.UI;
  const Storage = window.StorageService || window.AppStorage;

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(num) {
    return `฿ ${Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function formatThaiDateTime(isoString) {
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
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month} ${year} ${time} น.`;
  }

  // ─── Status Sheet (Bottom Sheet for Status Changes) ─────────────────────────

  function ensureStatusSheet() {
    let sheet = document.getElementById('status-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'status-sheet';
      sheet.className = 'sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-hidden', 'true');
      sheet.innerHTML = `
        <div class="sheet-backdrop"></div>
        <div class="sheet-content">
          <div class="sheet-handle"></div>
          <div class="sheet-title">
            <span>เปลี่ยนสถานะคำสั่งซื้อ</span>
            <button class="sheet-close" id="btn-close-sheet" type="button" aria-label="ปิด">✕</button>
          </div>
          <p class="sub" style="margin-bottom:14px;font-size:12px">เลือกสถานะการดำเนินการของคำสั่งซื้อนี้</p>
          <div id="status-options" style="display:flex;flex-direction:column;gap:8px"></div>
        </div>
      `;
      const phone = document.querySelector('.phone') || document.body;
      phone.appendChild(sheet);
    }

    // Attach or re-attach close listeners
    sheet.querySelectorAll('.sheet-close, #btn-close-sheet').forEach((el) => {
      el.onclick = () => UI.closeSheet('status-sheet');
    });
    const backdrop = sheet.querySelector('.sheet-backdrop');
    if (backdrop) {
      backdrop.onclick = () => UI.closeSheet('status-sheet');
    }

    return sheet;
  }

  function renderStatusSheetOptions(order, onStatusUpdated) {
    const sheet = ensureStatusSheet();
    const container = sheet.querySelector('#status-options') || sheet.querySelector('#status-sheet-options');
    if (!container) return;
    container.innerHTML = '';

    const allStatuses = [
      ...Status.FULFILLMENT_STEPS,
      'cancelled',
    ];

    allStatuses.forEach((st) => {
      const isCurrent = order.fulfillmentStatus === st;
      const transitionCheck = Status.canTransition(order.fulfillmentStatus, st);
      const label = Status.FULFILLMENT_LABELS[st] || st;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = isCurrent ? 'primary' : 'outline';
      btn.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;text-align:left;width:100%;min-height:44px;margin-bottom:6px';
      
      const badgeHtml = `<span class="badge" data-status="${esc(st)}">${esc(label)}</span>`;
      btn.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          ${badgeHtml}
          ${isCurrent ? '<span style="font-size:11px;font-weight:700">(สถานะปัจจุบัน)</span>' : ''}
        </div>
        <span style="font-size:14px">${isCurrent ? '✓' : '›'}</span>
      `;

      if (isCurrent) {
        btn.disabled = true;
      } else if (!transitionCheck.allowed) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
      } else {
        btn.onclick = async () => {
          if (window.requireAuth && !window.requireAuth('เปลี่ยนสถานะออเดอร์')) return;
          UI.closeSheet('status-sheet');
          if (transitionCheck.requiresConfirmation) {
            const confirmed = await UI.confirmDialog(transitionCheck.reason || `ยืนยันการเปลี่ยนสถานะเป็น "${label}" ใช่หรือไม่?`);
            if (!confirmed) return;
          }

          try {
            const updated = Status.applyTransition(order, st);
            const currentStorage = window.StorageService || window.AppStorage || Storage;
            await currentStorage.saveOrder(updated);

            // ซิงค์ Firestore เบื้องหลัง
            if (typeof window !== 'undefined' && window.FirebaseDB && window.FirebaseDB.saveOrder) {
              window.FirebaseDB.saveOrder(updated).catch(() => {});
            }

            UI.showToast(`เปลี่ยนสถานะเป็น "${label}" เรียบร้อย`, 'success');
            if (typeof onStatusUpdated === 'function') {
              onStatusUpdated(updated);
            }
          } catch (err) {
            UI.showToast(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ', 'error');
          }
        };
      }

      container.appendChild(btn);
    });
  }

  // ─── Mount Status Management in Detail Screen ───────────────────────────────

  /**
   * Mounts the full order status, payment, tracking, and timeline controls into the Detail screen.
   * @param {Object} order - The current viewing order.
   * @param {Function} [onOrderChange] - Callback when order is updated.
   */
  function mount(order, onOrderChange) {
    if (!order) return;

    let container = document.getElementById('status-ui-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'status-ui-container';

      // Insert right after .detail-head or before .summary in #detail
      const detailScreen = document.getElementById('detail');
      if (!detailScreen) return;
      const detailHead = detailScreen.querySelector('.detail-head');
      if (detailHead) {
        detailHead.insertAdjacentElement('afterend', container);
      } else {
        detailScreen.appendChild(container);
      }
    }

    renderDetailStatusSection(container, order, (newOrder) => {
      // Re-render status section
      mount(newOrder, onOrderChange);
      // Trigger parent callback or app.js refresher
      if (typeof onOrderChange === 'function') {
        onOrderChange(newOrder);
      }
      if (typeof window.viewOrderDetail === 'function' && !newOrder.isDraft) {
        window.viewOrderDetail(newOrder.id);
      }
    });
  }

  function renderDetailStatusSection(container, order, refresh) {
    const summary = Status.deriveOrderSummary(order);
    const fulfillmentLabel = Status.FULFILLMENT_LABELS[order.fulfillmentStatus] || order.fulfillmentStatus || 'รอสั่งซื้อ';
    const paymentLabel = Status.PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus || 'ยังไม่จ่าย';

    // ─── 1. Status Stepper ──────────────────────────────────────────────────
    let stepperHtml = '';
    if (order.fulfillmentStatus === 'cancelled') {
      stepperHtml = `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:12px;margin:12px 0;text-align:center;color:#b91c1c;font-size:13px;font-weight:600">
          ❌ คำสั่งซื้อนี้ถูกยกเลิกแล้ว
        </div>
      `;
    } else {
      const currentIdx = Status.FULFILLMENT_STEPS.indexOf(order.fulfillmentStatus);
      const stepsHtml = Status.FULFILLMENT_STEPS.map((stepKey, idx) => {
        const stepLabel = Status.FULFILLMENT_LABELS[stepKey];
        let stepClass = 'step';
        let iconContent = idx + 1;

        if (idx < currentIdx) {
          stepClass += ' completed';
          iconContent = '✓';
        } else if (idx === currentIdx) {
          stepClass += ' active';
        }

        return `
          <div class="${stepClass}">
            <div class="step-icon">${iconContent}</div>
            <div class="step-label">${esc(stepLabel)}</div>
          </div>
        `;
      }).join('');

      stepperHtml = `<div class="stepper">${stepsHtml}</div>`;
    }

    // ─── 2. Warning Banner (Out of stock) ───────────────────────────────────
    let alertHtml = '';
    if (summary.hasOutOfStock) {
      alertHtml = `
        <div style="background:#fff3cd;border:1px solid #ffeeba;border-radius:12px;padding:10px 14px;margin:12px 0;display:flex;align-items:center;gap:8px;color:#856404;font-size:12px;font-weight:600">
          <span>⚠️</span>
          <span>มีสินค้าในออเดอร์นี้ ${summary.outOfStockCount} รายการที่ <b>หมดสต็อก</b> กรุณาติดต่อลูกค้า</span>
        </div>
      `;
    }

    // ─── 3. Payment Summary & History ───────────────────────────────────────
    const paymentsList = Array.isArray(order.payments) ? order.payments : [];
    const paymentsHtml = paymentsList.length > 0
      ? paymentsList.map((p) => `
          <div class="payment-item">
            <div>
              <strong style="color:var(--navy);font-size:14px">฿ ${Number(p.amount).toLocaleString('th-TH')}</strong>
              <small style="display:block;color:var(--muted);font-size:11px">${esc(formatThaiDateTime(p.paidAt))}</small>
            </div>
            <span style="font-size:12px;color:#475569">${esc(p.note || 'ชำระเงิน')}</span>
          </div>
        `).join('')
      : '<p class="muted" style="font-size:12px;text-align:center;margin:10px 0">ยังไม่มีประวัติการชำระเงิน</p>';

    // ─── 4. Shipments & Tracking ────────────────────────────────────────────
    const shipmentsList = Array.isArray(order.shipments) ? order.shipments : [];
    const shipmentsHtml = shipmentsList.length > 0
      ? shipmentsList.map((s) => {
          const trackUrl = Status.getTrackingUrl(s.carrier, s.trackingNo);
          return `
            <div class="shipment-card">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong style="font-size:13px;color:var(--navy)">📦 ${esc(s.carrier)}</strong>
                <button class="outline" type="button" style="width:auto;padding:3px 8px;font-size:11px;color:var(--red,#df4c53);border-color:#fecaca" onclick="window.StatusUI.removeShipmentClick('${esc(order.id)}', '${esc(s.id)}')">ลบ</button>
              </div>
              <div class="tracking-row">
                <span class="tracking-number">${esc(s.trackingNo)}</span>
                <div style="display:flex;gap:6px">
                  <button class="btn-copy-tracking" type="button" onclick="window.StatusUI.copyTracking('${esc(s.trackingNo)}')">📋 คัดลอก</button>
                  ${trackUrl ? `<a href="${esc(trackUrl)}" target="_blank" rel="noopener noreferrer" class="btn-copy-tracking" style="text-decoration:none;background:var(--sky);color:var(--blue)">🔍 ติดตาม</a>` : ''}
                </div>
              </div>
              <small style="display:block;color:var(--muted);font-size:11px;margin-top:6px">จัดส่งเมื่อ: ${esc(formatThaiDateTime(s.shippedAt))}</small>
            </div>
          `;
        }).join('')
      : '<p class="muted" style="font-size:12px;text-align:center;margin:10px 0">ยังไม่มีเลขพัสดุ</p>';

    // ─── 5. Activity Timeline (#history-list) ───────────────────────────────
    const historyList = Array.isArray(order.history) ? order.history : [];
    const timelineHtml = historyList.length > 0
      ? historyList.map((h) => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-time">${esc(formatThaiDateTime(h.ts))}</div>
            <div class="timeline-title">${esc(h.note || h.type)}</div>
          </div>
        `).join('')
      : '<p class="muted" style="font-size:12px;text-align:center;margin:10px 0">ยังไม่มีประวัติกิจกรรม</p>';

    // ─── Assemble HTML ──────────────────────────────────────────────────────
    container.innerHTML = `
      <!-- Status Banner & Change Button -->
      <div style="background:#ffffff;border:1px solid var(--line);border-radius:18px;padding:16px;margin:14px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:4px">สถานะการดำเนินการ</div>
            <span class="badge" id="status-badge-trigger" data-status="${esc(order.fulfillmentStatus || 'pending_purchase')}" style="font-size:12px;padding:6px 12px;cursor:pointer" title="แตะเพื่อเปลี่ยนสถานะ">
              ${esc(fulfillmentLabel)} ▾
            </span>
          </div>
          <button class="secondary" type="button" style="width:auto;padding:8px 14px;font-size:12px" id="btn-open-status-sheet">
            ⚙️ เปลี่ยนสถานะ
          </button>
        </div>
        <div id="stepper-trigger" style="cursor:pointer" title="แตะเพื่อเปลี่ยนสถานะ">${stepperHtml}</div>
        ${alertHtml}
      </div>

      <!-- Payment Management Section -->
      <div class="form-card" style="margin-bottom:14px">
        <div class="section-title" style="margin-top:0">
          <span>💳 การชำระเงิน</span>
          <span class="badge" data-payment="${esc(order.paymentStatus || 'unpaid')}">${esc(paymentLabel)}</span>
        </div>
        
        <div class="stats" style="margin-bottom:14px">
          <div class="stat">
            <span class="muted" style="font-size:11px">จ่ายแล้ว</span>
            <b style="color:var(--green);font-size:17px">${money(summary.paidThb)}</b>
          </div>
          <div class="stat">
            <span class="muted" style="font-size:11px">${summary.overpaidThb > 0 ? 'โอนเกิน (ต้องทอน)' : 'ค้างชำระ'}</span>
            <b style="color:${summary.overpaidThb > 0 ? 'var(--blue, #2389ec)' : (summary.remainingThb > 0 ? 'var(--red)' : 'var(--muted)')};font-size:17px">
              ${summary.overpaidThb > 0 ? money(summary.overpaidThb) : money(summary.remainingThb)}
            </b>
          </div>
        </div>

        <div id="payment-form-toggle" style="margin-bottom:10px">
          <button class="outline" type="button" style="font-size:13px;padding:9px" onclick="document.getElementById('add-payment-box').classList.toggle('hidden')">
            ＋ บันทึกการชำระเงิน
          </button>
        </div>

        <!-- Add Payment Sub-form -->
        <div id="add-payment-box" class="hidden" style="background:#f8fbff;border:1px solid #dcebf9;border-radius:14px;padding:12px;margin-bottom:12px">
          <div class="field">
            <label>จำนวนเงิน (บาท) <span style="color:var(--red)">*</span></label>
            <input type="number" step="0.01" class="input" id="pay-amount-input" placeholder="เช่น ${summary.remainingThb || 1000}" value="${summary.remainingThb > 0 ? summary.remainingThb : ''}" />
          </div>
          <div class="field">
            <label>หมายเหตุการชำระ</label>
            <input type="text" class="input" id="pay-note-input" placeholder="เช่น โอน KBank สลิปครบ" />
          </div>
          <button class="primary" type="button" style="padding:10px;font-size:13px" id="btn-submit-payment">
            บันทึกยอดเงิน
          </button>
        </div>

        <!-- Payment History List -->
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin:12px 0 8px">ประวัติการชำระเงิน</div>
        <div id="payments-history-list">${paymentsHtml}</div>
      </div>

      <!-- Shipment & Tracking Section -->
      <div class="form-card" style="margin-bottom:14px">
        <div class="section-title" style="margin-top:0">
          <span>🚚 ขนส่งและพัสดุ</span>
          <span class="muted" style="font-size:12px">${shipmentsList.length} พัสดุ</span>
        </div>

        <div id="shipment-form-toggle" style="margin-bottom:10px">
          <button class="outline" type="button" style="font-size:13px;padding:9px" onclick="document.getElementById('add-shipment-box').classList.toggle('hidden')">
            ＋ เพิ่มเลขพัสดุ
          </button>
        </div>

        <!-- Add Shipment Sub-form -->
        <div id="add-shipment-box" class="hidden" style="background:#f8fbff;border:1px solid #dcebf9;border-radius:14px;padding:12px;margin-bottom:12px">
          <div class="field">
            <label>ผู้ให้บริการขนส่ง</label>
            <select class="input" id="ship-carrier-select">
              <option value="Flash Express">Flash Express</option>
              <option value="ไปรษณีย์ไทย">ไปรษณีย์ไทย (Thailand Post)</option>
              <option value="Kerry Express">Kerry Express / KEX</option>
              <option value="J&T Express">J&T Express</option>
              <option value="DHL Express">DHL Express</option>
              <option value="อื่นๆ">อื่นๆ</option>
            </select>
          </div>
          <div class="field">
            <label>เลขพัสดุ (Tracking No.) <span style="color:var(--red)">*</span></label>
            <input type="text" class="input" id="ship-tracking-input" placeholder="เช่น TH0123456789A" />
          </div>
          <button class="primary" type="button" style="padding:10px;font-size:13px" id="btn-submit-shipment">
            บันทึกเลขพัสดุ
          </button>
        </div>

        <!-- Shipments List -->
        <div id="shipments-active-list">${shipmentsHtml}</div>
      </div>

      <!-- Activity Timeline Section -->
      <div class="form-card" style="margin-bottom:14px">
        <div class="section-title" style="margin-top:0">
          <span>📜 ประวัติกิจกรรม</span>
        </div>
        <div id="history-list">${timelineHtml}</div>
      </div>
    `;

    // ─── Attach Event Listeners ─────────────────────────────────────────────

    // Open Status Sheet
    const triggerStatusSheet = () => {
      renderStatusSheetOptions(order, refresh);
      UI.openSheet('status-sheet');
    };

    const openStatusBtn = container.querySelector('#btn-open-status-sheet');
    if (openStatusBtn) openStatusBtn.onclick = triggerStatusSheet;
    const badgeTrigger = container.querySelector('#status-badge-trigger');
    if (badgeTrigger) badgeTrigger.onclick = triggerStatusSheet;
    const stepperTrigger = container.querySelector('#stepper-trigger');
    if (stepperTrigger) stepperTrigger.onclick = triggerStatusSheet;

    // Submit Payment
    const submitPayBtn = container.querySelector('#btn-submit-payment');
    if (submitPayBtn) {
      submitPayBtn.onclick = async () => {
        if (window.requireAuth && !window.requireAuth('บันทึกการชำระเงิน')) return;
        const amtInput = container.querySelector('#pay-amount-input');
        const noteInput = container.querySelector('#pay-note-input');
        const amt = Number(amtInput?.value);

        if (!amt || amt <= 0) {
          UI.showToast('กรุณาระบุจำนวนเงินที่มากกว่า 0', 'error');
          amtInput?.focus();
          return;
        }

        try {
          const updated = Status.addPayment(order, { amount: amt, note: noteInput?.value });
          await Storage.saveOrder(updated);
          UI.showToast(`บันทึกชำระเงิน ${money(amt)} สำเร็จ`, 'success');
          refresh(updated);
        } catch (err) {
          UI.showToast(err.message || 'บันทึกชำระเงินไม่สำเร็จ', 'error');
        }
      };
    }

    // Submit Shipment
    const submitShipBtn = container.querySelector('#btn-submit-shipment');
    if (submitShipBtn) {
      submitShipBtn.onclick = async () => {
        if (window.requireAuth && !window.requireAuth('เพิ่มข้อมูลพัสดุ')) return;
        const carrierSelect = container.querySelector('#ship-carrier-select');
        const trackingInput = container.querySelector('#ship-tracking-input');
        const trackingNo = (trackingInput?.value || '').trim();

        if (!trackingNo) {
          UI.showToast('กรุณากรอกเลขพัสดุ', 'error');
          trackingInput?.focus();
          return;
        }

        try {
          const updated = Status.addShipment(order, {
            carrier: carrierSelect?.value || 'Flash Express',
            trackingNo,
          });
          await Storage.saveOrder(updated);
          UI.showToast('เพิ่มเลขพัสดุเรียบร้อย', 'success');
          refresh(updated);
        } catch (err) {
          UI.showToast(err.message || 'เพิ่มเลขพัสดุไม่สำเร็จ', 'error');
        }
      };
    }

    // Enhance Item list with item-status toggles
    enhanceDetailItems(order, refresh);
  }

  function enhanceDetailItems(order, refresh) {
    const listEl = document.getElementById('detail-items-list');
    if (!listEl) return;

    const itemEls = listEl.querySelectorAll('.item');
    itemEls.forEach((el, idx) => {
      const itemData = order.items && order.items[idx];
      if (!itemData) return;

      let statusBadge = el.querySelector('.item-status-wrapper');
      if (!statusBadge) {
        statusBadge = document.createElement('div');
        statusBadge.className = 'item-status-wrapper';
        statusBadge.style.marginTop = '6px';
        const infoEl = el.querySelector('.item-info');
        if (infoEl) infoEl.appendChild(statusBadge);
      }

      const st = itemData.itemStatus || 'to_buy';
      const label = Status.ITEM_STATUS_LABELS[st] || st;

      statusBadge.innerHTML = `
        <button type="button" class="item-status" data-status="${esc(st)}" style="border:none;cursor:pointer;font-family:inherit" title="แตะเพื่อเปลี่ยนสถานะสินค้า">
          ${esc(label)} ▾
        </button>
      `;

      statusBadge.querySelector('button').onclick = async (e) => {
        e.stopPropagation();
        if (window.requireAuth && !window.requireAuth('เปลี่ยนสถานะสินค้า')) return;
        const cycle = ['to_buy', 'bought', 'out_of_stock', 'substituted'];
        const nextSt = cycle[(cycle.indexOf(st) + 1) % cycle.length];

        try {
          const updated = Status.updateItemStatus(order, itemData.id, nextSt);
          await Storage.saveOrder(updated);
          UI.showToast(`เปลี่ยนสถานะสินค้าเป็น "${Status.ITEM_STATUS_LABELS[nextSt]}"`, 'info');
          refresh(updated);
        } catch (err) {
          UI.showToast(err.message || 'เปลี่ยนสถานะสินค้าไม่สำเร็จ', 'error');
        }
      };
    });
  }

  // ─── Orders List Filter Chips (#status-filter) ──────────────────────────────

  let currentFilter = 'all';

  /**
   * Mounts the #status-filter chips bar into the #orders screen.
   * @param {Array<Object>} orders - List of all orders.
   * @param {Function} onFilterChange - Callback function passing filtered orders list.
   */
  function mountOrdersFilter(orders, onFilterChange) {
    const ordersScreen = document.getElementById('orders');
    if (!ordersScreen) return;

    let filterBar = document.getElementById('status-filter');
    if (!filterBar) {
      filterBar = document.createElement('div');
      filterBar.id = 'status-filter';
      // Insert after the search input or after .sub in #orders
      const sub = ordersScreen.querySelector('.sub');
      if (sub) {
        sub.insertAdjacentElement('afterend', filterBar);
      } else {
        ordersScreen.insertBefore(filterBar, ordersScreen.firstChild);
      }
    }

    // Categorization counts
    const counts = {
      all: orders.length,
      unpaid: orders.filter((o) => o.paymentStatus === 'unpaid' || o.paymentStatus === 'deposit').length,
      pending: orders.filter((o) => o.fulfillmentStatus === 'pending_purchase').length,
      incoming: orders.filter((o) => ['purchased', 'shipping_intl', 'arrived_th'].includes(o.fulfillmentStatus)).length,
      sent: orders.filter((o) => ['shipping_th', 'completed'].includes(o.fulfillmentStatus)).length,
    };

    const chips = [
      { key: 'all', label: 'ทั้งหมด', count: counts.all },
      { key: 'unpaid', label: 'ค้างจ่าย', count: counts.unpaid },
      { key: 'pending', label: 'รอสั่งซื้อ', count: counts.pending },
      { key: 'incoming', label: 'กำลังมา', count: counts.incoming },
      { key: 'sent', label: 'จัดส่งแล้ว', count: counts.sent },
    ];

    filterBar.innerHTML = chips.map((c) => `
      <div class="chip ${currentFilter === c.key ? 'active' : ''}" data-filter="${esc(c.key)}">
        <span>${esc(c.label)}</span>
        <span class="chip-count">${c.count}</span>
      </div>
    `).join('');

    filterBar.querySelectorAll('.chip').forEach((chip) => {
      chip.onclick = () => {
        currentFilter = chip.getAttribute('data-filter');
        filterBar.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        let filtered = orders;
        if (currentFilter === 'unpaid') {
          filtered = orders.filter((o) => o.paymentStatus === 'unpaid' || o.paymentStatus === 'deposit');
        } else if (currentFilter === 'pending') {
          filtered = orders.filter((o) => o.fulfillmentStatus === 'pending_purchase');
        } else if (currentFilter === 'incoming') {
          filtered = orders.filter((o) => ['purchased', 'shipping_intl', 'arrived_th'].includes(o.fulfillmentStatus));
        } else if (currentFilter === 'sent') {
          filtered = orders.filter((o) => ['shipping_th', 'completed'].includes(o.fulfillmentStatus));
        }

        if (typeof onFilterChange === 'function') {
          onFilterChange(filtered);
        }
      };
    });
  }

  // ─── Dashboard Stats Integration ──────────────────────────────────────────

  /**
   * Mounts status and total receivable metrics into Dashboard.
   * @param {Array<Object>} orders
   */
  function mountDashboard(orders) {
    if (!Array.isArray(orders)) return;

    let totalReceivable = 0;
    orders.forEach((o) => {
      if (o.fulfillmentStatus !== 'cancelled') {
        const summary = Status.deriveOrderSummary(o);
        totalReceivable += summary.remainingThb;
      }
    });

    let receivableCard = document.getElementById('stat-total-receivable');
    if (!receivableCard) {
      const statsGrid = document.querySelector('#dashboard .stats');
      if (statsGrid) {
        const card = document.createElement('div');
        card.className = 'stat';
        card.innerHTML = `
          <span class="muted" style="font-size:12px">⏳ ยอดค้างรับรวม</span>
          <b id="stat-total-receivable" style="color:var(--red,#df4c53)">${money(totalReceivable)}</b>
        `;
        statsGrid.appendChild(card);
      }
    } else {
      receivableCard.textContent = money(totalReceivable);
    }
  }

  // ─── Helper Actions Attached to Window ──────────────────────────────────────

  async function removeShipmentClick(orderId, shipmentId) {
    if (window.requireAuth && !window.requireAuth('ลบข้อมูลพัสดุ')) return;
    const confirmed = await UI.confirmDialog('ต้องการลบรายการพัสดุนี้ใช่หรือไม่?');
    if (!confirmed) return;

    try {
      const order = await Storage.getOrder(orderId);
      if (!order) return;
      const updated = Status.removeShipment(order, shipmentId);
      await Storage.saveOrder(updated);
      UI.showToast('ลบรายการพัสดุเรียบร้อย', 'info');
      mount(updated);
    } catch (err) {
      UI.showToast('ลบพัสดุไม่สำเร็จ', 'error');
    }
  }

  function copyTracking(trackingNo) {
    if (!trackingNo) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(trackingNo).then(() => {
        UI.showToast(`คัดลอก ${trackingNo} แล้ว`, 'success');
      });
    } else {
      UI.showToast(`เลขพัสดุ: ${trackingNo}`, 'info');
    }
  }

  // Export to global window object
  window.StatusUI = {
    mount,
    mountOrdersFilter,
    mountDashboard,
    removeShipmentClick,
    copyTracking,
  };
})();

