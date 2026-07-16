# FallGuard Family — เว็บแอป (แทน Flutter)

เว็บแอปนี้ทำหน้าที่แทนแอปมือถือทุกอย่าง: login, สร้าง/เข้าร่วมกลุ่มครอบครัว, รับ push notification, ดูประวัติการแจ้งเตือนแบบ real-time

## โครงสร้างไฟล์

```
web-app/
├── index.html              หน้า login/สมัครสมาชิก
├── dashboard.html           หน้าหลัก (กลุ่ม + ประวัติแจ้งเตือน)
├── style.css                 สไตล์ทั้งหมด
├── auth.js                    logic หน้า login
├── dashboard.js               logic หน้า dashboard
├── firebase-config.js         ตั้งค่า Firebase (ต้องกรอกเอง)
└── firebase-messaging-sw.js   service worker รับ push ตอนปิดแท็บ
```

## ขั้นตอนติดตั้ง

### 1. เพิ่ม Web App ใน Firebase Console

1. ไปที่ Firebase Console → โปรเจกต์ `fallguard-family` → ไอคอนเฟือง → **Project settings**
2. เลื่อนลงมาที่ **"Your apps"** → กด **"Add app"** → เลือกไอคอน **`</>`** (Web)
3. ตั้งชื่อแอป เช่น `fallguard-web` → **Register app**
4. จะเห็นโค้ด `firebaseConfig = {...}` — คัดลอกค่าทั้งหมดมาแทนที่ในไฟล์ `firebase-config.js` (บรรทัดที่เขียนว่า "ใส่ค่าของพี่ตรงนี้")
5. **คัดลอกค่าเดียวกันนี้ไปใส่ซ้ำอีกครั้ง** ในไฟล์ `firebase-messaging-sw.js` ด้วย (เป็นข้อจำกัดของ service worker ที่เรียก import จากไฟล์อื่นไม่ได้)

### 2. สร้าง VAPID Key (สำหรับ Web Push)

1. ในหน้า Project settings เดียวกัน คลิกแท็บ **"Cloud Messaging"**
2. เลื่อนลงมาหา **"Web configuration"**
3. กด **"Generate key pair"**
4. คัดลอกค่าที่ได้ มาใส่ในไฟล์ `firebase-config.js` ตรงตัวแปร `VAPID_KEY`

### 3. รัน Backend (เหมือนเดิม)

เปิด terminal แยก รันตามที่เคยทำ:
```bash
cd backend
venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

### 4. รันเว็บแอปด้วย local server

**ห้ามเปิดไฟล์ html ตรงๆ ด้วยการดับเบิลคลิก** เพราะ Firebase และ service worker ต้องรันผ่าน server (http://localhost) ถึงจะทำงานได้

เปิด terminal ใหม่ เข้าไปที่โฟลเดอร์ `web-app`:
```bash
cd web-app
python -m http.server 5500
```

เปิดเบราว์เซอร์ไปที่:
```
http://localhost:5500
```

### 5. ทดสอบ

1. สมัครสมาชิก → login
2. กด **"เปิดการแจ้งเตือน"** ที่มุมขวาบน → กด Allow ตอนเบราว์เซอร์ถามสิทธิ์
3. สร้างกลุ่ม หรือกรอกรหัสเชิญเข้าร่วมกลุ่ม
4. เอา `group_id` ไปผูกกับกล้อง (เหมือนขั้นตอนเดิมที่เคยทำผ่าน `POST /devices/register`)
5. ทดสอบล้มหน้ากล้อง → ควรเห็น push notification เด้งขึ้นมา และรายการในหน้าเว็บอัปเดตทันที (real-time ผ่าน Firestore)

## หมายเหตุสำคัญ

- **iPhone/Safari**: การรองรับ Web Push ยังจำกัดกว่า Android/Chrome พอสมควร แนะนำทดสอบบน Chrome/Edge บนคอมพิวเตอร์หรือ Android ก่อน
- **Localhost ใช้ได้โดยไม่ต้องมี HTTPS** เพราะเบราว์เซอร์อนุญาตพิเศษสำหรับการพัฒนา แต่ถ้าจะ deploy ขึ้นเซิร์ฟเวอร์จริงให้ผู้อื่นใช้ ต้องมี HTTPS เท่านั้น
- ถ้าจะให้ญาติคนอื่นเข้าเว็บนี้จากเครื่องอื่น ต้อง deploy ขึ้น hosting จริง (เช่น Firebase Hosting ฟรี) และเปลี่ยน `BACKEND_URL` ใน `firebase-config.js` ให้ชี้ไปที่ backend ที่ deploy ขึ้นเซิร์ฟเวอร์แล้วเช่นกัน (ไม่ใช่ localhost)
