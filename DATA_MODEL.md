# 📐 BahtBridge — Data Model Specification (Schema Version 2)

> **เอกสารข้อตกลงกลางของโครงสร้างข้อมูล (Single Source of Truth)**  
> สมาชิกทุกคนในทีม (คนที่ 1, คนที่ 2, คนที่ 3) ต้องยึดถือชื่อฟิลด์ ตัวแปร สถานะ และประเภทข้อมูลตามเอกสารนี้อย่างเคร่งครัด  
> ⚠️ **กติกาการแก้ไขเอกสารนี้:** การแก้ไขฟิลด์หรือสถานะใดๆ ต้องเปิด Pull Request และได้รับความเห็นชอบจากทุกคนในทีมก่อนเท่านั้น

---

## 1. หลักการสำคัญ (Core Principles)

1. **การคำนวณเงินบาท:** ตัวเลขเงินบาท (`goodsThb`, `totalThb`, `shipping`, `fee`, `amount`) จะถูกปัดเศษทศนิยมไม่เกิน 2 ตำแหน่ง **ที่ `pricing.js` เพียงที่เดียวเท่านั้น** เพื่อป้องกันปัญหาตัวเลขคลาดเคลื่อนสะสม
2. **จำนวนเงินสกุลต่างประเทศ:** เก็บเป็นตัวเลขทศนิยมตามที่ผู้ใช้กรอกจริง (ห้ามปัดเศษทิ้ง)
3. **การบันทึกวันเวลา:** ทุกฟิลด์ที่เกี่ยวกับเวลา (`createdAt`, `updatedAt`, `paidAt`, `shippedAt`, `ratesAt`, `ts`, `lastBackupAt`) ต้องจัดเก็บในรูปแบบ **ISO 8601 String** เสมอ เช่น `"2026-11-05T14:30:00.000Z"`
4. **เวอร์ชันสกีมา:** `schemaVersion = 2`
5. **ID:** รหัสอ้างอิงของ Order, Item, Payment และ Shipment ต้องเป็น **String** เสมอ

---

## 2. โครงสร้างคำสั่งซื้อ (`Order`)

```typescript
interface Order {
  id: string;                     // รหัสแสดงผล เช่น "#BR001", "#BR002"
  orderNo: number;                // ลำดับจำนวนเต็มสำหรับจัดเรียงและสร้าง id ถัดไป เช่น 1, 2, 3
  customerName: string;           // ชื่อ-นามสกุลลูกค้า (ห้ามเว้นว่าง)
  customerPhone: string;          // เบอร์โทรศัพท์ลูกค้า เช่น "081-234-5678"
  customerAddress: string;        // ที่อยู่จัดส่ง หรือ ช่องทางติดต่อ (LINE / IG)
  createdAt: string;              // เวลาที่สร้างออเดอร์ (ISO String)
  updatedAt: string;              // เวลาที่แก้ไขออเดอร์ล่าสุด (ISO String)
  
  // สถานะ (ดูข้อ 6)
  fulfillmentStatus: FulfillmentStatus; // สถานะการดำเนินการสินค้า
  paymentStatus: PaymentStatus;         // สถานะการชำระเงิน
  
  // รายการสินค้า
  items: Item[];                  // รายการสินค้าทั้งหมดในออเดอร์
  
  // ค่าธรรมเนียมและการเงิน
  shipping: number;               // ค่าจัดส่งในไทย (บาท)
  fee: number;                    // ค่าบริการ/ค่าหิ้วสุทธิ (บาท)
  feeType: "fixed" | "percent";   // รูปแบบการคิดค่าบริการ: ยอดคงที่ หรือ เปอร์เซ็นต์
  feeValue: number;               // ตัวเลขค่าบริการที่ตั้งค่าไว้ เช่น 100 หรือ 10 (%)
  
  // สแนปช็อตอัตราแลกเปลี่ยน (LOCKED RATES)
  ratesSnapshot: Record<string, number>; // เรทที่ล็อกไว้ ณ เวลาสั่งซื้อ เช่น { "USD": 33.1, "JPY": 0.22 }
  ratesAt: string;                // เวลาที่ดึงเรทชุดนี้ (ISO String)
  rateSource: "api" | "fallback" | "manual"; // ที่มาของเรท
  
  // ยอดคำนวณสุทธิ (บาท)
  goodsThb: number;               // ผลรวมราคาสินค้าทุกชิ้นแปลงเป็นเงินบาท
  totalThb: number;               // ยอดชำระสุทธิ (goodsThb + shipping + fee)
  
  // รายการบันทึกย่อย
  payments: Payment[];            // ประวัติการชำระเงิน
  shipments: Shipment[];          // ประวัติการจัดส่งและ Tracking
  history: HistoryEntry[];        // ประวัติกิจกรรมและการเปลี่ยนสถานะ
  
  note: string;                   // หมายเหตุเพิ่มเติม
}
```

### 📄 ตัวอย่าง Order (JSON):
```json
{
  "id": "#BR001",
  "orderNo": 1,
  "customerName": "คุณสมใจ ใจดี",
  "customerPhone": "081-234-5678",
  "customerAddress": "LINE: @somjai_d",
  "createdAt": "2026-11-05T07:30:00.000Z",
  "updatedAt": "2026-11-05T08:15:00.000Z",
  "fulfillmentStatus": "pending_purchase",
  "paymentStatus": "paid",
  "items": [
    {
      "id": "it_101",
      "name": "รองเท้าวิ่ง",
      "currency": "USD",
      "amount": 50,
      "quantity": 1,
      "itemStatus": "to_buy",
      "actualPrice": 50,
      "note": "สีขาว ไซส์ 42"
    }
  ],
  "shipping": 150,
  "fee": 100,
  "feeType": "fixed",
  "feeValue": 100,
  "ratesSnapshot": {
    "USD": 33.15,
    "JPY": 0.221,
    "KRW": 0.025,
    "CNY": 4.58,
    "EUR": 36.25
  },
  "ratesAt": "2026-11-05T07:30:00.000Z",
  "rateSource": "api",
  "goodsThb": 1657.5,
  "totalThb": 1907.5,
  "payments": [
    {
      "id": "pay_1",
      "amount": 1907.5,
      "paidAt": "2026-11-05T08:00:00.000Z",
      "note": "โอนผ่าน KBank สลิปครบ"
    }
  ],
  "shipments": [],
  "history": [
    {
      "ts": "2026-11-05T07:30:00.000Z",
      "type": "created",
      "from": null,
      "to": "draft",
      "note": "สร้างออเดอร์ใหม่"
    },
    {
      "ts": "2026-11-05T08:00:00.000Z",
      "type": "payment",
      "from": "unpaid",
      "to": "paid",
      "note": "ชำระเงินเต็มจำนวน 1,907.50 บาท"
    }
  ],
  "note": "ฝากซื้อกล่องรองเท้าด้วย"
}
```

---

## 3. โครงสร้างสินค้า (`Item`)

```typescript
interface Item {
  id: string;                                                      // รหัสสินค้าเฉพาะ เช่น "it_123"
  name: string;                                                    // ชื่อสินค้า
  currency: "USD" | "JPY" | "KRW" | "CNY" | "EUR";                // สกุลเงินต่างประเทศ
  amount: number;                                                  // ราคาต่อหน่วยในสกุลเงินต่างประเทศ
  quantity: number;                                                // จำนวนชิ้น (จำนวนเต็ม >= 1)
  itemStatus: "to_buy" | "bought" | "out_of_stock" | "substituted";// สถานะการจัดซื้อรายชิ้น
  actualPrice?: number;                                            // ราคาซื้อจริง (กรณีมีส่วนลด/ราคาปรับเปลี่ยน)
  note?: string;                                                   // รายละเอียดเพิ่มเติม (เช่น ไซส์, สี)
}
```

---

## 4. โครงสร้างการเงินและการจัดส่ง (`Payment` & `Shipment`)

```typescript
interface Payment {
  id: string;          // รหัสการชำระเงิน เช่น "pay_1"
  amount: number;      // ยอดเงินที่ชำระ (บาท)
  paidAt: string;      // เวลาที่ชำระ (ISO String)
  note?: string;       // หมายเหตุ เช่น ธนาคาร, เลขอ้างอิงสลิป
}

interface Shipment {
  id: string;          // รหัสการส่ง เช่น "ship_1"
  carrier: string;     // ผู้ให้บริการขนส่ง เช่น "Flash Express", "Kerry", "ไปรษณีย์ไทย"
  trackingNo: string;  // เลขพัสดุ (Tracking Number)
  shippedAt: string;   // เวลาที่จัดส่ง (ISO String)
  note?: string;       // หมายเหตุการจัดส่ง
}
```

---

## 5. ประวัติกิจกรรม (`HistoryEntry`)

```typescript
interface HistoryEntry {
  ts: string;          // เวลาที่เกิดกิจกรรม (ISO String)
  type: "status" | "payment" | "shipment" | "item" | "created" | "migrated";
  from: string | null; // สถานะหรือค่าเดิมก่อนเปลี่ยน
  to: string;          // สถานะหรือค่าใหม่
  note?: string;       // คำอธิบายเพิ่มเติม
}
```

---

## 6. นิยามสถานะและป้ายแสดงผล (Status Definitions)

### 6.1 สถานะการดำเนินการสินค้า (`fulfillmentStatus`)

| Key | ป้ายแสดงผล (Thai) | ความหมาย |
|:---|:---|:---|
| `draft` | **ร่าง** | สร้างไว้แต่ยังไม่ได้ยืนยันเปิดออเดอร์ |
| `pending_purchase` | **รอสั่งซื้อ** | ลูกค้ายืนยันแล้ว แม่ค้ารอกดสั่งซื้อสินค้า |
| `purchased` | **ซื้อแล้ว** | แม่ค้ากดสั่งซื้อสินค้าจากต่างประเทศสำเร็จแล้ว |
| `shipping_intl` | **กำลังส่งมาไทย** | สินค้าอยู่ระหว่างการขนส่งข้ามประเทศ |
| `arrived_th` | **ถึงไทยแล้ว** | พัสดุมาถึงไทยแล้ว อยู่ระหว่างคัดแยก/แพ็ก |
| `shipping_th` | **กำลังจัดส่งในไทย**| ส่งให้ขนส่งในไทยแล้ว (มีเลข Tracking) |
| `completed` | **สำเร็จ** | ลูกค้าได้รับสินค้าเรียบร้อยแล้ว |
| `cancelled` | **ยกเลิก** | ยกเลิกออเดอร์ |

### 6.2 สถานะการชำระเงิน (`paymentStatus`)

| Key | ป้ายแสดงผล (Thai) | ความหมาย |
|:---|:---|:---|
| `unpaid` | **ยังไม่จ่าย** | ยังไม่มีประวัติการชำระเงิน (ผลรวม payments = 0) |
| `deposit` | **มัดจำแล้ว** | ชำระเงินมาแล้วบางส่วน (0 < ผลรวม payments < totalThb) |
| `paid` | **จ่ายครบ** | ชำระเงินครบถ้วนแล้ว (ผลรวม payments >= totalThb) |
| `refunded` | **คืนเงินแล้ว** | คืนเงินลูกค้าแล้วกรณีสินค้าหมดหรือยกเลิก |

> **กฎการเปลี่ยนสถานะ (Business Rules):**
> 1. `paymentStatus` จะถูกคำนวณอัตโนมัติจากผลรวมของรายการ `payments` เทียบกับ `totalThb` (ยกเว้นสถานะ `refunded` ที่ตั้งค่าเองโดยตรง)
> 2. การย้อนสถานะ (เช่น จาก `completed` กลับมา `shipping_th`) ต้องมีกล่องข้อความยืนยัน (`confirm dialog`) เสมอ
> 3. สามารถเปลี่ยนเป็น `cancelled` ได้จากทุกสถานะ **ยกเว้นสถานะ `completed`**

---

## 7. โครงสร้างการตั้งค่าระบบ (`Settings`)

```typescript
interface Settings {
  defaultShipping: number;         // ค่าจัดส่งเริ่มต้น (บาท) เช่น 150
  serviceFeeType: "fixed" | "percent"; // ประเภทค่าบริการเริ่มต้น
  serviceFeeValue: number;         // ค่าบริการเริ่มต้น เช่น 100 หรือ 10
  rateMarkupPercent: number;       // บวกส่วนต่างอัตราแลกเปลี่ยนเพิ่มกี่ % (0 = ตาม API)
  nextOrderNo: number;             // ลำดับเลขออเดอร์ถัดไป เช่น 3
  lastBackupAt: string | null;     // วันเวลาที่กดสำรองข้อมูลครั้งล่าสุด (ISO String)
}
```

### 📄 ตัวอย่าง Settings (JSON):
```json
{
  "defaultShipping": 150,
  "serviceFeeType": "fixed",
  "serviceFeeValue": 100,
  "rateMarkupPercent": 0,
  "nextOrderNo": 3,
  "lastBackupAt": "2026-11-05T14:30:00.000Z"
}
```

---

## 8. สเปกฟังก์ชัน `storage.js` API

ทุกฟังก์ชันต้องทำงานแบบอะซิงโครนัส (`async/await`) คืนค่าเป็น Promise:

```javascript
// ออเดอร์
async function getOrders(): Promise<Order[]>
async function getOrder(id: string): Promise<Order | null>
async function saveOrder(order: Order): Promise<Order>
async function deleteOrder(id: string): Promise<boolean>

// ตั้งค่า
async function getSettings(): Promise<Settings>
async function saveSettings(s: Partial<Settings>): Promise<Settings>

// สำรองและกู้คืนข้อมูล
async function exportAll(): Promise<{ version: string, exportedAt: string, orders: Order[], settings: Settings }>
async function importAll(obj: object, mode: 'merge' | 'replace'): Promise<{ success: boolean, importedCount: number, mode: 'merge' | 'replace' }>
```

---

## 9. การย้ายข้อมูลจากเวอร์ชัน 1 (Migration from schemaVersion 1)

หากพบข้อมูลเดิมใน `localStorage` ที่ยังเป็นสกีมา v1 ให้ทำการแปลงค่าอัตโนมัติดังนี้:
- สถานะเดิม `"กำลังดำเนินการ"` หรือ `"ยืนยันแล้ว"` ➜ แปลงเป็น `fulfillmentStatus: "pending_purchase"`
- `paymentStatus` ➜ `"unpaid"`
- `payments` ➜ `[]`
- `shipments` ➜ `[]`
- `ratesSnapshot` ➜ ค่า fallback เดิม `{ USD: 33, JPY: 0.22, KRW: 0.025, CNY: 4.55, EUR: 36.2 }`
- `rateSource` ➜ `"fallback"`
- `createdAt` ➜ เวลาที่เริ่มทำการ Migrate
- `history` ➜ เพิ่ม 1 รายการ:
  ```json
  {
    "ts": "2026-11-05T15:00:00.000Z",
    "type": "migrated",
    "from": "v1",
    "to": "v2",
    "note": "Auto-migrated from schemaVersion 1"
  }
  ```

---

## 10. ตารางเทียบฟิลด์กับคอลัมน์ฐานข้อมูล (Supabase snake_case)

| ฟิลด์ใน JavaScript (`Order`) | คอลัมน์ฐานข้อมูล PostgreSQL (`orders`) | Data Type |
|:---|:---|:---|
| `id` | `id` | `TEXT PRIMARY KEY` |
| `orderNo` | `order_no` | `BIGINT` |
| `customerName` | `customer_name` | `TEXT NOT NULL` |
| `customerPhone` | `customer_phone` | `TEXT` |
| `customerAddress` | `customer_address` | `TEXT` |
| `createdAt` | `created_at` | `TIMESTAMPTZ NOT NULL` |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ NOT NULL` |
| `fulfillmentStatus` | `fulfillment_status` | `TEXT NOT NULL` |
| `paymentStatus` | `payment_status` | `TEXT NOT NULL` |
| `items` | `items` | `JSONB NOT NULL DEFAULT '[]'` |
| `shipping` | `shipping` | `NUMERIC(10, 2) NOT NULL` |
| `fee` | `fee` | `NUMERIC(10, 2) NOT NULL` |
| `feeType` | `fee_type` | `TEXT NOT NULL` |
| `feeValue` | `fee_value` | `NUMERIC(10, 2) NOT NULL` |
| `ratesSnapshot` | `rates_snapshot` | `JSONB NOT NULL` |
| `ratesAt` | `rates_at` | `TIMESTAMPTZ` |
| `rateSource` | `rate_source` | `TEXT NOT NULL` |
| `goodsThb` | `goods_thb` | `NUMERIC(10, 2) NOT NULL` |
| `totalThb` | `total_thb` | `NUMERIC(10, 2) NOT NULL` |
| `payments` | `payments` | `JSONB DEFAULT '[]'` |
| `shipments` | `shipments` | `JSONB DEFAULT '[]'` |
| `history` | `history` | `JSONB DEFAULT '[]'` |
| `note` | `note` | `TEXT` |

---

## 11. กติกาและข้อบังคับ

1. **ห้ามแก้ไขไฟล์ของสมาชิกคนอื่น** นอกเหนือจากไฟล์ที่ตนเองเป็นเจ้าของ
2. ทุกครั้งที่มีการแก้ไข `DATA_MODEL.md` ต้องเปิดเป็น Pull Request แยกต่างหาก และได้รับ Approve จากสมาชิกครบทั้งทีมก่อน Merge
