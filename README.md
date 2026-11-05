# ฿ BahtBridge

แอปพลิเคชันมือถือ (PWA + Capacitor Android) สำหรับแม่ค้ารับหิ้วและพรีออเดอร์สินค้าต่างประเทศ คำนวณอัตราแลกเปลี่ยนเป็นเงินบาท ล็อกเรทออเดอร์ บันทึกข้อมูลลูกค้า และจัดการสถานะพัสดุครบวงจร

---

## 🚀 การติดตั้งและรันโปรเจกต์ (Getting Started)

### 1. ติดตั้ง Dependencies
ต้องรันคำสั่งนี้ก่อนใช้งานครั้งแรก:
```bash
npm install
```

### 2. รัน Local Development Server (พอร์ต 4173)
เปิดเบราว์เซอร์ไปที่ `http://localhost:4173`:
```bash
npm start
```
*(หากต้องการเปิดบนมือถือ ให้ใช้อุปกรณ์ที่ต่อ Wi-Fi เดียวกัน แล้วเปิด `http://<IPv4 ของคอมพิวเตอร์>:4173`)*

### 3. Build ไฟล์สำหรับแอป (Web Assets)
คำสั่งนี้จะล้างและคัดลอกไฟล์ไปยัง `www/` พร้อมอัปเดต Service Worker Cache อัตโนมัติ:
```bash
npm run build
```

### 4. ซิงค์ไปยัง Android Project (Capacitor)
```bash
npm run cap:build
```

### 5. วิธีสร้างไฟล์ติดตั้ง Android (`.apk`)
รันคำสั่งต่อไปนี้ในโฟลเดอร์ `android/`:
```bash
cd android
.\gradlew.bat assembleDebug
```
เมื่อสร้างเสร็จ ไฟล์ติดตั้งจะอยู่ที่:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 👥 ข้อตกลงการแบ่งงานและเจ้าของไฟล์ (File Ownership)

เพื่อป้องกัน Code Conflict ใน Git ทีมงานแต่ละคนมีหน้าที่รับผิดชอบไฟล์เฉพาะส่วนอย่างเคร่งครัด:

| สมาชิก | ไฟล์ที่ดูแลรับผิดชอบ |
|:---|:---|
| **คนที่ 1 (Lead & Coordinator)** | `index.html` (โครงสร้าง), `README.md`, `DATA_MODEL.md`, `HTML_CONTRACT.md`, `build.js`, `sw.js`, `settings-ui.js`, `backup.js` |
| **คนที่ 2 (UI / UX / Styling)** | `styles.css`, `ui.js`, `status.js`, `status-ui.js` |
| **คนที่ 3 (Core Logic & Database)** | `app.js`, `pricing.js`, `storage.js`, `auth.js`, `supabase-storage.js`, `supabase/`, `tests/` |

---

## 🌿 กติกา Branch, Pull Request และ Commit

1. **ห้าม Push ตรงเข้า `main` เด็ดขาด:**  
   Branch `main` ถูกล็อกด้วย Branch Protection Rule ทุกการเปลี่ยนแปลงต้องทำผ่าน **Pull Request** และได้รับการรีวิวอย่างน้อย 1 คน
2. **การตั้งชื่อ Branch:**
   - `feature/<ชื่อฟีเจอร์>` (เช่น `feature/repo-setup`, `feature/html-skeleton`)
   - `fix/<ชื่อบั๊ก>` (เช่น `fix/duplicate-item`, `fix/exchange-rate`)
   - `chore/<งานทั่วไป>`
3. **รูปแบบ Commit Message:**
   ใช้มาตรฐาน Conventional Commits: `type(scope): สรุปสั้นภาษาไทย`
   - ตัวอย่าง: `feat(status): เพิ่มสถานะการชำระเงิน`
   - ตัวอย่าง: `fix(core): แก้ไขบั๊กเพิ่มสินค้าซ้ำซ้อน`
   - ตัวอย่าง: `chore(repo): จัดระเบียบ repo และ .gitignore`

---

## 📐 ข้อกำหนดข้อมูลและเอกสารกลาง
- โครงสร้างฟิลด์และสถานะทั้งหมด ยึดตามเอกสาร [DATA_MODEL.md](DATA_MODEL.md) เสมอ ห้ามเปลี่ยนชื่อตัวแปรโดยพลการ
- โครงสร้าง ID/Class สำหรับเชื่อมต่อกับ JavaScript ยึดตามเอกสาร `HTML_CONTRACT.md`
