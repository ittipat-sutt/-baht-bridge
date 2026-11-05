# 📐 BahtBridge — Data Model Specification
> **เอกสารข้อกำหนดโครงสร้างข้อมูลมาตรฐาน (Data Model)**  
> เพื่อให้ทุกคนในทีม (คนที่ 1, คนที่ 2, คนที่ 3) ใช้ชื่อฟิลด์ ตัวแปร และสถานะตรงกัน 100%

---

## 1. โครงสร้างออเดอร์ (`Order`)

ออเดอร์แต่ละรายการจะถูกจัดเก็บในรูปแบบ JavaScript Object ดังนี้:

```typescript
interface Order {
  id: string;                  // รหัสออเดอร์ เช่น "#BR001", "#BR002"
  customerName: string;        // ชื่อ-นามสกุลลูกค้า (ห้ามเว้นว่าง)
  customerPhone: string;       // เบอร์โทรศัพท์ลูกค้า เช่น "081-234-5678"
  customerAddress: string;     // ที่อยู่จัดส่ง หรือ ช่องทางติดต่อ (LINE / IG)
  createdAt: string;           // วันเวลาที่สร้างออเดอร์ เช่น "2026-11-05T14:30:00.000Z"
  dateFormatted: string;       // วันที่แสดงผลภาษาไทย เช่น "5 พ.ย. 2569"
  
  // สถานะสินค้า & สถานะการชำระเงิน (ดูข้อ 3)
  orderStatus: OrderStatus;    // "pending" | "ordered" | "arrived_th" | "shipped" | "completed" | "cancelled"
  paymentStatus: PaymentStatus;// "unpaid" | "paid" | "refunded"
  
  // ข้อมูลการจัดส่ง & Tracking
  trackingNumber: string;      // เลขพัสดุ เช่น "TH0123456789" (เว้นว่างได้ถ้ายังไม่ส่ง)
  shippingProvider: string;    // ผู้ให้บริการ เช่น "Flash Express", "Kerry", "ไปรษณีย์ไทย"
  
  // รายการสินค้า & การเงิน
  items: OrderItem[];          // รายการสินค้าทั้งหมดในออเดอร์
  goodsTotal: number;          // ราคาสินค้ารวมทุกชิ้น (แปลงเป็นบาทแล้ว)
  shippingFee: number;         // ค่าจัดส่งในไทย (แม่ค้ากรอกเองได้, ค่าเริ่มต้น: 150)
  serviceFee: number;          // ค่าบริการ / ค่าหิ้ว (แม่ค้ากรอกเองได้, ค่าเริ่มต้น: 100)
  grandTotal: number;          // ยอดรวมสุทธิที่ลูกค้าต้องชำระ (goodsTotal + shippingFee + serviceFee)
  
  notes: string;               // หมายเหตุเพิ่มเติม (เว้นว่างได้)
}
```

---

## 2. โครงสร้างสินค้าในออเดอร์ (`OrderItem`)

```typescript
interface OrderItem {
  id: string;                  // รหัสสินค้าเฉพาะ เช่น "item_1730812345"
  name: string;                // ชื่อสินค้า เช่น "Shoes", "Figure"
  currency: "USD" | "JPY" | "KRW" | "CNY" | "EUR"; // สกุลเงินต้นทาง
  originalPrice: number;       // ราคาสินค้าในสกุลเงินต้นทาง เช่น 50, 5000
  quantity: number;            // จำนวนชิ้น (ต้องเป็นจำนวนเต็ม >= 1)
  exchangeRate: number;        // **เรทที่ล็อกไว้ ณ วันที่สั่งซื้อ** เช่น 33.0, 0.22 (ห้ามเปลี่ยนตามเรทปัจจุบัน)
  convertedPriceTHB: number;   // ราคาต่อชิ้นแปลงเป็นบาท (originalPrice * exchangeRate)
  subtotalTHB: number;         // ราคารวมของรายการนี้ (convertedPriceTHB * quantity)
}
```

---

## 3. มาตรฐานสถานะ (Status Enums)

### 3.1 สถานะคำสั่งซื้อ (`orderStatus`)

| ค่าในโค้ด (Value) | ข้อความแสดงผล (Thai) | คลาส CSS | คำอธิบาย |
|:---|:---|:---|:---|
| `pending` | `รอดำเนินการ` | `tag tag-pending` | สร้างออเดอร์แล้ว ยังไม่ได้กดซื้อของ |
| `ordered` | `สั่งซื้อแล้ว` | `tag tag-ordered` | แม่ค้ากดสั่งซื้อสินค้าจากต่างประเทศแล้ว |
| `arrived_th` | `สินค้าถึงไทย` | `tag tag-arrived` | สินค้าส่งมาถึงไทยแล้ว เตรียมแพ็ก |
| `shipped` | `จัดส่งแล้ว` | `tag tag-shipped` | ส่งพัสดุให้ลูกค้าแล้ว (มีเลข Tracking) |
| `completed` | `สำเร็จ` | `tag green` | ลูกค้าได้รับสินค้าเรียบร้อย |
| `cancelled` | `ยกเลิก` | `tag tag-cancelled` | ยกเลิกออเดอร์ |

### 3.2 สถานะการชำระเงิน (`paymentStatus`)

| ค่าในโค้ด (Value) | ข้อความแสดงผล (Thai) | คลาส CSS | คำอธิบาย |
|:---|:---|:---|:---|
| `unpaid` | `ยังไม่ชำระ` | `badge badge-unpaid` | รอลูกค้าโอนเงิน |
| `paid` | `ชำระแล้ว` | `badge badge-paid` | ลูกค้าแนบสลิป/โอนเงินเรียบร้อย |
| `refunded` | `คืนเงินแล้ว` | `badge badge-refunded` | คืนเงินลูกค้ากรณีสินค้าหมด |

---

## 4. คีย์ใน LocalStorage

| Key | ประเภทข้อมูล | คำอธิบาย |
|:---|:---|:---|
| `bahtbridge_orders_data` | `Order[]` (JSON string) | รายการออเดอร์ทั้งหมดในระบบ |
| `bb_rates_cache` | `{ ts: number, rates: object }` | แคชอัตราแลกเปลี่ยนสด (หมดอายุใน 10 นาที) |

---

## 5. รูปแบบไฟล์สำรองข้อมูล (Backup JSON Schema)

เมื่อผู้ใช้กด **"สำรองข้อมูล" (Backup)** ระบบจะ Export ไฟล์ชื่อ `bahtbridge-backup-YYYY-MM-DD.json` รูปแบบดังนี้:

```json
{
  "version": "1.0",
  "exportedAt": "2026-11-05T14:30:00.000Z",
  "appName": "BahtBridge",
  "ordersCount": 2,
  "orders": [
    {
      "id": "#BR001",
      "customerName": "คุณปิยะ วัฒนะ",
      "customerPhone": "081-234-5678",
      "customerAddress": "LINE: @piya",
      "createdAt": "2026-11-05T07:30:00.000Z",
      "dateFormatted": "5 พ.ย. 2569",
      "orderStatus": "pending",
      "paymentStatus": "paid",
      "trackingNumber": "",
      "shippingProvider": "Flash Express",
      "items": [
        {
          "id": "item_1",
          "name": "Shoes",
          "currency": "USD",
          "originalPrice": 50,
          "quantity": 1,
          "exchangeRate": 33.0,
          "convertedPriceTHB": 1650,
          "subtotalTHB": 1650
        }
      ],
      "goodsTotal": 1650,
      "shippingFee": 150,
      "serviceFee": 100,
      "grandTotal": 1900,
      "notes": ""
    }
  ]
}
```

