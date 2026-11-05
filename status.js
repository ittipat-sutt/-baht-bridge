/**
 * BahtBridge — Order Status, Payment & Tracking Logic (status.js)
 * Pure domain logic (No DOM dependencies). Universal CommonJS & Browser module.
 * Owner: Person 2 (Front-end UI & Status Specialist)
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Status = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ─── Status Dictionaries & Steps ──────────────────────────────────────────

  const FULFILLMENT_STEPS = [
    'draft',
    'pending_purchase',
    'purchased',
    'shipping_intl',
    'arrived_th',
    'shipping_th',
    'completed',
  ];

  const FULFILLMENT_LABELS = {
    draft: 'ร่าง',
    pending_purchase: 'รอสั่งซื้อ',
    purchased: 'ซื้อแล้ว',
    shipping_intl: 'กำลังส่งมาไทย',
    arrived_th: 'ถึงไทยแล้ว',
    shipping_th: 'กำลังจัดส่งในไทย',
    completed: 'สำเร็จ',
    cancelled: 'ยกเลิก',
  };

  const PAYMENT_LABELS = {
    unpaid: 'ยังไม่จ่าย',
    deposit: 'มัดจำแล้ว',
    paid: 'จ่ายครบ',
    refunded: 'คืนเงินแล้ว',
  };

  const ITEM_STATUS_LABELS = {
    to_buy: 'รอกดซื้อ',
    bought: 'ซื้อแล้ว',
    out_of_stock: 'สินค้าหมด',
    substituted: 'เปลี่ยนสินค้า',
  };

  // ─── Carrier Tracking Config ──────────────────────────────────────────────

  const CARRIERS = {
    'Flash Express': {
      name: 'Flash Express',
      urlTemplate: 'https://www.flashexpress.co.th/tracking/?se={trackingNo}',
    },
    'ไปรษณีย์ไทย': {
      name: 'ไปรษณีย์ไทย',
      urlTemplate: 'https://track.thailandpost.co.th/?trackNumber={trackingNo}',
    },
    'Kerry Express': {
      name: 'Kerry Express',
      urlTemplate: 'https://th.kerryexpress.com/th/track/?track={trackingNo}',
    },
    'J&T Express': {
      name: 'J&T Express',
      urlTemplate: 'https://www.jtexpress.co.th/trajectoryQuery?bills={trackingNo}',
    },
    'DHL Express': {
      name: 'DHL Express',
      urlTemplate: 'https://www.dhl.com/th-th/home/tracking/tracking-express.html?submit=1&tracking-id={trackingNo}',
    },
    'อื่นๆ': {
      name: 'อื่นๆ',
      urlTemplate: null,
    },
  };

  /**
   * Resolve tracking URL for a given carrier and tracking number.
   * @param {string} carrier
   * @param {string} trackingNo
   * @returns {string|null}
   */
  function getTrackingUrl(carrier, trackingNo) {
    if (!trackingNo) return null;
    const cleanNo = String(trackingNo).trim();
    if (!cleanNo) return null;

    const info = CARRIERS[carrier];
    if (info && info.urlTemplate) {
      return info.urlTemplate.replace('{trackingNo}', encodeURIComponent(cleanNo));
    }
    return null;
  }

  // ─── Payment Status Calculation ───────────────────────────────────────────

  /**
   * Computes payment status from payments array against totalThb.
   * Note: 'refunded' is explicitly set and preserved.
   * @param {Object} order
   * @returns {'unpaid'|'deposit'|'paid'|'refunded'}
   */
  function computePaymentStatus(order) {
    if (!order) return 'unpaid';
    if (order.paymentStatus === 'refunded') {
      return 'refunded';
    }

    const totalThb = Number(order.totalThb || 0);
    const payments = Array.isArray(order.payments) ? order.payments : [];
    const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Rounding safety margin
    if (totalPaid <= 0) {
      return 'unpaid';
    }
    if (totalPaid >= totalThb - 0.01) {
      return 'paid';
    }
    return 'deposit';
  }

  // ─── State Machine & Transitions ──────────────────────────────────────────

  /**
   * Validates whether fulfillment status can transition from -> to.
   * Business rules:
   * 1. Forward progression step-by-step is allowed without confirmation.
   * 2. Backward step requires explicit confirmation.
   * 3. 'cancelled' is allowed from any step except 'completed'.
   *
   * @param {string} from
   * @param {string} to
   * @returns {{ allowed: boolean, requiresConfirmation: boolean, reason?: string }}
   */
  function canTransition(from, to) {
    if (!from || !to) {
      return { allowed: false, requiresConfirmation: false, reason: 'สถานะไม่ถูกต้อง' };
    }
    if (from === to) {
      return { allowed: false, requiresConfirmation: false, reason: 'อยู่ในสถานะนี้อยู่แล้ว' };
    }
    if (from === 'completed' && to === 'cancelled') {
      return { allowed: false, requiresConfirmation: false, reason: 'ไม่สามารถยกเลิกออเดอร์ที่สำเร็จแล้วได้' };
    }
    if (to === 'cancelled') {
      return { allowed: true, requiresConfirmation: true, reason: 'ต้องการยกเลิกคำสั่งซื้อใช่หรือไม่?' };
    }
    if (from === 'cancelled') {
      return { allowed: true, requiresConfirmation: true, reason: 'ต้องการเปิดออเดอร์ที่ยกเลิกไปแล้วขึ้นมาใหม่ใช่หรือไม่?' };
    }

    const fromIdx = FULFILLMENT_STEPS.indexOf(from);
    const toIdx = FULFILLMENT_STEPS.indexOf(to);

    if (fromIdx === -1 || toIdx === -1) {
      return { allowed: false, requiresConfirmation: false, reason: 'ไม่พบสถานะที่ระบุในระบบ' };
    }

    if (toIdx === fromIdx + 1) {
      return { allowed: true, requiresConfirmation: false };
    }

    if (toIdx < fromIdx) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: `คุณกำลังจะย้อนสถานะจาก "${FULFILLMENT_LABELS[from] || from}" กลับไป "${FULFILLMENT_LABELS[to] || to}" ยืนยันหรือไม่?`,
      };
    }

    // Skipping steps forward
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: `คุณกำลังจะข้ามขั้นตอนไปยัง "${FULFILLMENT_LABELS[to] || to}" ยืนยันหรือไม่?`,
    };
  }

  /**
   * Apply fulfillment status transition immutably.
   * @param {Object} order
   * @param {string} toStatus
   * @param {string} [note='']
   * @returns {Object} new updated order object
   */
  function applyTransition(order, toStatus, note = '') {
    const check = canTransition(order.fulfillmentStatus, toStatus);
    if (!check.allowed) {
      throw new Error(check.reason || 'ไม่สามารถเปลี่ยนสถานะได้');
    }

    const nowIso = new Date().toISOString();
    const history = Array.isArray(order.history) ? [...order.history] : [];

    history.unshift({
      ts: nowIso,
      type: 'status',
      from: order.fulfillmentStatus,
      to: toStatus,
      note: note || `เปลี่ยนสถานะเป็น ${FULFILLMENT_LABELS[toStatus] || toStatus}`,
    });

    return {
      ...order,
      fulfillmentStatus: toStatus,
      updatedAt: nowIso,
      history,
    };
  }

  /**
   * Add a payment record to the order immutably.
   * @param {Object} order
   * @param {{ amount: number, paidAt?: string, note?: string }} paymentInput
   * @returns {Object} new updated order object
   */
  function addPayment(order, paymentInput) {
    const amount = Number(paymentInput && paymentInput.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('จำนวนเงินที่ชำระต้องมากกว่า 0 บาท');
    }

    const nowIso = new Date().toISOString();
    const newPayment = {
      id: 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      amount: Math.round(amount * 100) / 100,
      paidAt: paymentInput.paidAt || nowIso,
      note: paymentInput.note ? String(paymentInput.note).trim() : '',
    };

    const payments = Array.isArray(order.payments) ? [...order.payments, newPayment] : [newPayment];
    const prevPaymentStatus = order.paymentStatus || 'unpaid';

    const interimOrder = { ...order, payments };
    const nextPaymentStatus = computePaymentStatus(interimOrder);

    const history = Array.isArray(order.history) ? [...order.history] : [];
    history.unshift({
      ts: nowIso,
      type: 'payment',
      from: prevPaymentStatus,
      to: nextPaymentStatus,
      note: `บันทึกชำระเงิน ฿${newPayment.amount.toLocaleString('th-TH')} (${newPayment.note || 'ไม่มีหมายเหตุ'})`,
    });

    return {
      ...order,
      payments,
      paymentStatus: nextPaymentStatus,
      updatedAt: nowIso,
      history,
    };
  }

  /**
   * Add a shipment/tracking number to the order immutably.
   * @param {Object} order
   * @param {{ carrier?: string, trackingNo: string, shippedAt?: string, note?: string }} shipmentInput
   * @returns {Object} new updated order object
   */
  function addShipment(order, shipmentInput) {
    const trackingNo = String(shipmentInput && shipmentInput.trackingNo || '').trim();
    if (!trackingNo) {
      throw new Error('กรุณากรอกเลขพัสดุ (Tracking Number)');
    }

    const carrier = shipmentInput.carrier || 'Flash Express';
    const nowIso = new Date().toISOString();
    const newShipment = {
      id: 'ship_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      carrier,
      trackingNo,
      shippedAt: shipmentInput.shippedAt || nowIso,
      note: shipmentInput.note ? String(shipmentInput.note).trim() : '',
    };

    const shipments = Array.isArray(order.shipments) ? [...order.shipments, newShipment] : [newShipment];
    const history = Array.isArray(order.history) ? [...order.history] : [];

    history.unshift({
      ts: nowIso,
      type: 'shipment',
      from: null,
      to: trackingNo,
      note: `เพิ่มเลขพัสดุ: ${carrier} ${trackingNo}`,
    });

    return {
      ...order,
      shipments,
      updatedAt: nowIso,
      history,
    };
  }

  /**
   * Remove a shipment by ID immutably.
   * @param {Object} order
   * @param {string} shipmentId
   * @returns {Object} new updated order object
   */
  function removeShipment(order, shipmentId) {
    const shipments = (order.shipments || []).filter((s) => s.id !== shipmentId);
    const nowIso = new Date().toISOString();
    const history = Array.isArray(order.history) ? [...order.history] : [];

    history.unshift({
      ts: nowIso,
      type: 'shipment',
      from: shipmentId,
      to: null,
      note: 'ลบรายการพัสดุ',
    });

    return {
      ...order,
      shipments,
      updatedAt: nowIso,
      history,
    };
  }

  /**
   * Update item status immutably.
   * @param {Object} order
   * @param {string} itemId
   * @param {'to_buy'|'bought'|'out_of_stock'|'substituted'} newItemStatus
   * @param {string} [note='']
   * @returns {Object} new updated order object
   */
  function updateItemStatus(order, itemId, newItemStatus, note = '') {
    const items = (order.items || []).map((item) => {
      if (item.id === itemId) {
        return { ...item, itemStatus: newItemStatus };
      }
      return item;
    });

    const nowIso = new Date().toISOString();
    const history = Array.isArray(order.history) ? [...order.history] : [];

    history.unshift({
      ts: nowIso,
      type: 'item',
      from: itemId,
      to: newItemStatus,
      note: note || `เปลี่ยนสถานะสินค้าเป็น "${ITEM_STATUS_LABELS[newItemStatus] || newItemStatus}"`,
    });

    return {
      ...order,
      items,
      updatedAt: nowIso,
      history,
    };
  }

  // ─── Order Summary & Calculations ─────────────────────────────────────────

  /**
   * Derives operational summary metrics from an order.
   * @param {Object} order
   * @returns {Object}
   */
  function deriveOrderSummary(order) {
    if (!order) {
      return {
        totalItems: 0,
        totalQuantity: 0,
        boughtCount: 0,
        outOfStockCount: 0,
        hasOutOfStock: false,
        totalThb: 0,
        paidThb: 0,
        remainingThb: 0,
        isFullyPaid: false,
      };
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
    const boughtCount = items.filter((it) => it.itemStatus === 'bought').length;
    const outOfStockCount = items.filter((it) => it.itemStatus === 'out_of_stock').length;
    const hasOutOfStock = outOfStockCount > 0;

    const totalThb = Number(order.totalThb || 0);
    const payments = Array.isArray(order.payments) ? order.payments : [];
    const paidThb = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const remainingThb = Math.max(0, Math.round((totalThb - paidThb) * 100) / 100);

    return {
      totalItems,
      totalQuantity,
      boughtCount,
      outOfStockCount,
      hasOutOfStock,
      totalThb,
      paidThb,
      remainingThb,
      isFullyPaid: remainingThb <= 0.01,
    };
  }

  // ─── Customer Share Text Builder ──────────────────────────────────────────

  /**
   * Generates a clean, ready-to-share summary text for LINE / IG.
   * @param {Object} order
   * @returns {string}
   */
  function buildShareText(order) {
    if (!order) return '';

    const summary = deriveOrderSummary(order);
    const fulfillmentLabel = FULFILLMENT_LABELS[order.fulfillmentStatus] || order.fulfillmentStatus || 'รอดำเนินการ';
    const paymentLabel = PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus || 'ยังไม่จ่าย';

    const items = Array.isArray(order.items) ? order.items : [];
    const itemsLines = items
      .map((it, idx) => {
        const flag = it.currency === 'USD' ? '🇺🇸' : it.currency === 'JPY' ? '🇯🇵' : it.currency === 'KRW' ? '🇰🇷' : it.currency === 'CNY' ? '🇨🇳' : '🇪🇺';
        const priceThb = it.convertedPriceTHB || it.subtotalTHB || Math.round(Number(it.amount || 0) * (order.ratesSnapshot?.[it.currency] || 33));
        return `  ${idx + 1}. ${flag} ${it.name} (${Number(it.amount || 0).toLocaleString()} ${it.currency} × ${it.quantity || 1}) ➜ ฿${Number(priceThb).toLocaleString('th-TH')}`;
      })
      .join('\n');

    const shipments = Array.isArray(order.shipments) && order.shipments.length > 0
      ? order.shipments.map((s) => `  • ${s.carrier}: ${s.trackingNo}`).join('\n')
      : null;

    let text = `📦 รายละเอียดคำสั่งซื้อ ${order.id || ''}\n`;
    text += `👤 ลูกค้า: ${order.customerName || 'ลูกค้า'}\n`;
    text += `--------------------------------\n`;
    text += `🛒 รายการสินค้า:\n${itemsLines || '  (ไม่มีรายการสินค้า)'}\n\n`;
    text += `💰 ราคาสินค้ารวม: ฿${Number(order.goodsThb || 0).toLocaleString('th-TH')}\n`;
    text += `🚚 ค่าจัดส่ง: ฿${Number(order.shipping || 0).toLocaleString('th-TH')}\n`;
    text += `💼 ค่าบริการ/ค่าหิ้ว: ฿${Number(order.fee || 0).toLocaleString('th-TH')}\n`;
    text += `💵 ยอดรวมสุทธิ: ฿${Number(summary.totalThb).toLocaleString('th-TH')}\n`;
    text += `--------------------------------\n`;
    text += `💳 สถานะการชำระ: ${paymentLabel} (จ่ายแล้ว ฿${Number(summary.paidThb).toLocaleString('th-TH')})\n`;

    if (summary.remainingThb > 0) {
      text += `⏳ ยอดค้างชำระ: ฿${Number(summary.remainingThb).toLocaleString('th-TH')}\n`;
    }

    text += `📍 สถานะออเดอร์: ${fulfillmentLabel}\n`;

    if (shipments) {
      text += `🚚 เลขพัสดุติดตาม:\n${shipments}\n`;
    }

    text += `--------------------------------\n`;
    text += `🙏 ขอบคุณที่ไว้วางใจใช้บริการ BahtBridge ครับ/ค่ะ`;

    return text;
  }

  // ─── Module Exports ───────────────────────────────────────────────────────

  return {
    FULFILLMENT_STEPS,
    FULFILLMENT_LABELS,
    PAYMENT_LABELS,
    ITEM_STATUS_LABELS,
    CARRIERS,
    getTrackingUrl,
    computePaymentStatus,
    canTransition,
    applyTransition,
    addPayment,
    addShipment,
    removeShipment,
    updateItemStatus,
    deriveOrderSummary,
    buildShareText,
  };
});
