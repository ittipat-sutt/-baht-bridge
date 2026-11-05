# 📑 BahtBridge — HTML Contract Specification

> **เอกสารข้อตกลงและสัญญาโครงสร้าง HTML (Single Source of Truth for DOM Elements)**  
> จัดทำโดย: คนที่ 1 (Lead & Coordinator)  
> เพื่อให้คนที่ 2 (UI / UX / Styling) และคนที่ 3 (Core Logic & Storage & Auth) ใช้เป็นมาตรฐานในการอ้างอิง ID, Class, Attribute และ Event Handlers ตรงกัน 100%

---

## 1. กฎและข้อปฏิบัติร่วมกัน (General Guidelines)

1. **ห้ามเปลี่ยนชื่อ ID หรือ Tag name โดยพลการ:** โค้ด JavaScript และ CSS ต้องยึดถือ ID ตามเอกสารนี้เท่านั้น
2. **การซ่อน/แสดงองค์ประกอบ (Visibility):**
   - ส่วนประกอบที่ต้องการซ่อนเริ่มต้นจะใส่คลาส `hidden` (ให้คนที่ 2 จัดการตกแต่ง `.hidden { display: none !important; }` ใน `styles.css`)
   - หรือควบคุมการแสดงผลผ่าน JavaScript
3. **การป้องกัน XSS:** ห้ามนำข้อความที่ผู้ใช้กรอก (`customerName`, `note`, `address`, etc.) ใส่ลงใน `innerHTML` โดยตรงเด็ดขาด ต้องใช้ `textContent` หรือฟังก์ชัน sanitize เสมอ
4. **ความเข้ากันได้กับการเปลี่ยนหน้า (Screen Switching):**
   - แต่ละหน้าจอจะถูกห่อหุ้มด้วย `<section class="screen" id="<screen-id>">`
   - การสลับหน้าจอจะเรียกใช้ฟังก์ชัน `show('<screen-id>')` ซึ่งจะเพิ่มคลาส `.active` ให้หน้าที่ระบุ

---

## 2. ตารางสรุป ID หน้าจอและองค์ประกอบทั้งหมด (DOM Element Dictionary)

### 2.1 หน้าหลัก (Dashboard) — `section#dashboard`

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `stat-total-orders` | `<b>` | จำนวนออเดอร์ทั้งหมดในระบบ | คนที่ 3 |
| `stat-pending-orders` | `<b>` | จำนวนออเดอร์ที่ยังรอดำเนินการ | คนที่ 3 |
| `stat-total-sales` | `<b>` | ยอดขายรวม (บาท) | คนที่ 3 |
| `dashboard-recent-orders` | `<div>` | รายการออเดอร์ล่าสุด 3 รายการ | คนที่ 3 / คนที่ 2 |

---

### 2.2 หน้าสร้างออเดอร์ใหม่ (Create Order) — `section#create`

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `cust-name` | `<input text>` | ชื่อ-นามสกุลลูกค้า (จำเป็น) | คนที่ 3 |
| `cust-phone` | `<input text>` | เบอร์โทรศัพท์ลูกค้า | คนที่ 3 |
| `cust-address` | `<input text>` | ช่องทางติดต่อ (LINE/IG) หรือที่อยู่จัดส่ง | คนที่ 3 |
| `product-name` | `<input text>` | ชื่อสินค้าที่รับหิ้ว | คนที่ 3 |
| `country-select` | `<select>` | ประเทศต้นทาง (USD, JPY, KRW, CNY, EUR) | คนที่ 3 |
| `currency-select` | `<select>` | สกุลเงินต่างประเทศ | คนที่ 3 |
| `product-price` | `<input number>` | ราคาสินค้าในสกุลเงินต่างประเทศ | คนที่ 3 |
| `product-qty` | `<input number>` | จำนวนชิ้นสินค้า (เริ่มต้น: 1) | คนที่ 3 |
| `btn-add-product` | `<button>` | ปุ่มกดเพิ่มสินค้าลงในรายการชั่วคราว | คนที่ 3 |
| `mini-products-list` | `<div>` | คอนเทนเนอร์แสดงการ์ดสินค้าที่เพิ่มแล้ว | คนที่ 2 / คนที่ 3 |
| `api-ok` | `<div>` | แถบแสดงสถานะเรทแลกเปลี่ยนและการอัปเดต | คนที่ 2 / คนที่ 3 |
| `summary-goods` | `<b>` | ราคาสินค้ารวมเงินบาท | คนที่ 3 |
| `order-shipping` | `<input number>` | **ค่าจัดส่งในไทย** (กรอกแก้ไขได้, ค่าเริ่มต้นจาก Settings) | คนที่ 1 / คนที่ 3 |
| `order-fee` | `<input number>` | **ค่าบริการ/ค่าหิ้ว** (กรอกแก้ไขได้, ค่าเริ่มต้นจาก Settings) | คนที่ 1 / คนที่ 3 |
| `summary-total` | `<b>` | ยอดรวมเงินบาทสุทธิ | คนที่ 3 |

---

### 2.3 หน้ารายละเอียดออเดอร์ (Order Detail) — `section#detail`

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `detail-order-title` | `<h1>` | หัวข้อหน้ารายละเอียดออเดอร์ | คนที่ 2 / คนที่ 3 |
| `detail-customer-name` | `<b>` | ชื่อลูกค้า | คนที่ 3 |
| `detail-customer-contact`| `<div>` | เบอร์โทรและช่องทางติดต่อลูกค้า | คนที่ 3 |
| `detail-order-meta` | `<div>` | วันที่สร้างและสถานะสรุป | คนที่ 3 |
| `status-bar` | `<div>` | **Stepper/แถบแสดงสถานะสินค้า** (มี `data-field="fulfillmentStatus"`) | คนที่ 2 (`status-ui.js`) |
| `payment-badge` | `<span>` | **Badge แสดงสถานะการชำระเงิน** (`unpaid`, `partial`, `paid`, `refunded`) | คนที่ 2 (`status-ui.js`) |
| `detail-api-badge` | `<div>` | แถบแจ้งสถานะเรทแลกเปลี่ยน (ออนไลน์) | คนที่ 3 |
| `detail-fallback-warning`| `<div>` | แถบเตือนกรณีใช้เรทออฟไลน์ | คนที่ 3 |
| `detail-items-list` | `<div>` | คอนเทนเนอร์แสดงรายการสินค้าพร้อมรูปธงและราคา THB | คนที่ 2 / คนที่ 3 |
| `detail-summary-goods` | `<b>` | ราคาสินค้ารวม (บาท) | คนที่ 3 |
| `detail-summary-shipping`| `<b>` | ค่าจัดส่ง (บาท) | คนที่ 3 |
| `detail-summary-fee` | `<b>` | ค่าบริการ (บาท) | คนที่ 3 |
| `detail-summary-total` | `<b>` | ยอดรวมสุทธิ (บาท) | คนที่ 3 |
| `payment-section` | `<div>` | **กล่องประวัติการเงิน** ห่อหุ้มยอดและรายการชำระเงิน | คนที่ 2 / คนที่ 3 |
| `pay-total` | `<b>` | ยอดเงินรวมที่ต้องชำระ | คนที่ 3 |
| `pay-paid` | `<b>` | ยอดเงินที่ลูกค้าชำระมาแล้ว | คนที่ 3 |
| `pay-due` | `<b>` | ยอดเงินค้างชำระ | คนที่ 3 |
| `btn-add-payment` | `<button>` | ปุ่มกดเพื่อเปิดฟอร์มเพิ่มยอดชำระเงิน | คนที่ 2 / คนที่ 3 |
| `payments-list` | `<div>` | รายการประวัติการชำระเงินแต่ละงวด | คนที่ 2 / คนที่ 3 |
| `payment-form` | `<div>` | ฟอร์มบันทึกยอดชำระเงิน (คลาส `hidden`) | คนที่ 2 / คนที่ 3 |
| `pay-amount` | `<input number>` | ช่องกรอกจำนวนเงินที่ชำระ (บาท) | คนที่ 3 |
| `pay-note` | `<input text>` | ช่องกรอกหมายเหตุการชำระ เช่น "โอนเข้า KBANK" | คนที่ 3 |
| `btn-save-payment` | `<button>` | ปุ่มกดบันทึกรายการชำระเงิน | คนที่ 3 |
| `shipments-section` | `<div>` | **กล่องข้อมูลการจัดส่ง & เลขพัสดุ** | คนที่ 2 / คนที่ 3 |
| `shipments-list` | `<div>` | รายการพัสดุและเลขแทร็กกิ้ง | คนที่ 2 / คนที่ 3 |
| `btn-add-shipment` | `<button>` | ปุ่มกดเพื่อเปิดฟอร์มเพิ่มพัสดุ | คนที่ 2 / คนที่ 3 |
| `shipment-form` | `<div>` | ฟอร์มเพิ่มข้อมูลพัสดุ (คลาส `hidden`) | คนที่ 2 / คนที่ 3 |
| `ship-carrier` | `<input text>` | ผู้ให้บริการขนส่ง เช่น Flash, Kerry, EMS | คนที่ 3 |
| `ship-trackingno` | `<input text>` | เลขพัสดุ Tracking Number | คนที่ 3 |
| `ship-date` | `<input date>` | วันที่จัดส่งพัสดุ | คนที่ 3 |
| `ship-note` | `<input text>` | หมายเหตุพัสดุ | คนที่ 3 |
| `btn-save-shipment` | `<button>` | ปุ่มกดบันทึกข้อมูลพัสดุ | คนที่ 3 |
| `history-list` | `<div>` | **กล่องประวัติกิจกรรม (Audit Log / Activity Timeline)** | คนที่ 2 / คนที่ 3 |
| `btn-confirm-order` | `<button>` | ปุ่มยืนยันออเดอร์ | คนที่ 3 |
| `status-sheet` | `<div>` | **Bottom Sheet** สำหรับเลือกเปลี่ยนสถานะออเดอร์ | คนที่ 2 (`status-ui.js`) |
| `status-options` | `<div>` | คอนเทนเนอร์รายการปุ่มเลือกสถานะ | คนที่ 2 (`status-ui.js`) |
| `btn-close-sheet` | `<button>` | ปุ่มปิด Bottom Sheet | คนที่ 2 (`status-ui.js`) |

---

### 2.4 หน้ารายการออเดอร์ทั้งหมด (Orders List) — `section#orders`

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `status-filter` | `<div>` | **แถบชิปสำหรับกรองสถานะออเดอร์** | คนที่ 2 / คนที่ 3 |
| `order-search` | `<input text>` | ค้นหาออเดอร์ด้วยชื่อลูกค้า หรือเลขออเดอร์ | คนที่ 3 |
| `orders-list` | `<div>` | คอนเทนเนอร์แสดงการ์ดรายการออเดอร์ | คนที่ 2 / คนที่ 3 |
| `empty-orders` | `<div>` | กล่องแสดงกรณีค้นหาไม่พบ หรือยังไม่มีออเดอร์ | คนที่ 2 |

#### ข้อกำหนดของชิปตัวกรองใน `#status-filter`:
แต่ละปุ่มต้องมี Attribute `data-filter` ดังนี้:
- `data-filter="all"`: ทั้งหมด
- `data-filter="unpaid"`: ยังไม่ชำระ / ค้างชำระ
- `data-filter="pending"`: รอดำเนินการซื้อ
- `data-filter="incoming"`: กำลังขนส่ง / ระหว่างประเทศ
- `data-filter="sent"`: ส่งสินค้าแล้ว

---

### 2.5 หน้าตั้งค่าระบบ (Settings) — `section#settings`

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `set-default-shipping`| `<input number>` | ค่าจัดส่งเริ่มต้น (บาท) | คนที่ 1 (`settings-ui.js`) |
| `set-fee-type` | `<select>` | ประเภทค่าบริการ: `fixed` (บาท) หรือ `percent` (%) | คนที่ 1 (`settings-ui.js`) |
| `set-fee-value` | `<input number>` | มูลค่าค่าบริการ | คนที่ 1 (`settings-ui.js`) |
| `set-markup` | `<input number>` | เปอร์เซ็นต์บวกเพิ่มเรทแลกเปลี่ยน (% Markup) | คนที่ 1 (`settings-ui.js`) |
| `btn-save-settings` | `<button>` | ปุ่มกดบันทึกการตั้งค่า | คนที่ 1 (`settings-ui.js`) |
| `btn-backup` | `<button>` | **ปุ่มส่งออกและสำรองข้อมูล** (Download JSON / Share) | คนที่ 1 (`backup.js`) |
| `btn-import` | `<button>` | **ปุ่มนำเข้าข้อมูล** (Trigger `#import-file`) | คนที่ 1 (`backup.js`) |
| `import-file` | `<input file>` | ช่องเลือกไฟล์ `.json` ที่ซ่อนไว้ | คนที่ 1 (`backup.js`) |
| `last-backup` | `<b>` | วันเวลาที่ทำการสำรองข้อมูลล่าสุด | คนที่ 1 (`backup.js`) |

---

### 2.6 หน้าเข้าสู่ระบบ (Login) — `section#login`

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `login-email` | `<input email>` | ช่องกรอกอีเมลสำหรับเข้าสู่ระบบ | คนที่ 3 (`auth.js`) |
| `btn-login-email` | `<button>` | ปุ่มส่งลิงก์เข้าสู่ระบบ Magic Link ทางอีเมล | คนที่ 3 (`auth.js`) |
| `btn-login-google` | `<button>` | ปุ่มเข้าสู่ระบบผ่าน Google OAuth | คนที่ 3 (`auth.js`) |
| `login-msg` | `<div>` | ข้อความแจ้งผลการส่งอีเมลหรือข้อผิดพลาด | คนที่ 3 (`auth.js`) |

---

### 2.7 หน้าโปรไฟล์และบัญชี (Profile) — `section#profile`

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `profile-total-orders` | `<b>` | จำนวนออเดอร์ทั้งหมดของร้าน | คนที่ 3 |
| `profile-confirmed-orders`| `<b>` | จำนวนออเดอร์ที่ยืนยันแล้ว | คนที่ 3 |
| `profile-total-sales` | `<b>` | ยอดขายสะสมของร้าน (บาท) | คนที่ 3 |
| `sync-indicator` | `<div>` | แถบแจ้งเตือนสถานะการซิงค์คลาวด์ (ซ่อนคลาส `hidden`) | คนที่ 3 (`auth.js`) |
| `btn-logout` | `<button>` | ปุ่มกดออกจากระบบ | คนที่ 3 (`auth.js`) |
| `btn-delete-account` | `<button>` | ปุ่มกดลบบัญชีและข้อมูลทั้งหมด | คนที่ 3 (`auth.js`) |

---

### 2.8 คอนเทนเนอร์การแจ้งเตือน (Toast Notification)

| Element ID | ประเภทแท็ก | หน้าที่ / ข้อมูลที่แสดงผล | จัดการโดย |
|:---|:---|:---|:---|
| `toast-root` | `<div>` | Root Container สำหรับ Pop-up Toast Message อยู่ท้าย body | คนที่ 2 (`ui.js`) |

---

## 3. สรุปความสัมพันธ์และกฎการทำงานร่วมกัน

1. **คนที่ 2 (UI):** 
   - สามารถเขียน Style CSS สำหรับ Component ต่างๆ เช่น Stepper ใน `#status-bar`, Chips ใน `#status-filter`, Badges ใน `#payment-badge`, Bottom Sheet ใน `#status-sheet`, และ Toast ใน `#toast-root`
   - ใช้คลาส `.hidden { display: none !important; }` เป็นหลักในการซ่อน element
2. **คนที่ 3 (Logic & Supabase):**
   - ดึง Element จากตารางนี้ด้วย `document.getElementById(...)` โดยตรง
   - ผูก Event Listener กับปุ่มต่างๆ เช่น `#btn-add-payment`, `#btn-save-payment`, `#btn-add-shipment`, `#btn-save-shipment`, `#order-search`, `#status-filter`
3. **คนที่ 1 (Lead):**
   - พัฒนาโมดูล `settings-ui.js` และ `backup.js` ผูกกับ Element ในหัวข้อ **2.5**
