// firebase-messaging-sw.js
// ต้องอยู่ที่ root ของเว็บ (โฟลเดอร์เดียวกับ index.html) ห้ามย้ายเข้าโฟลเดอร์ย่อย
// ทำหน้าที่รับ push notification ตอนที่ไม่ได้เปิดแท็บเว็บอยู่

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// ใส่ค่าเดียวกับใน firebase-config.js (ไฟล์นี้เป็น service worker เรียก import module ไม่ได้ ต้องคัดลอกค่ามาซ้ำ)
firebase.initializeApp({
  apiKey: "AIzaSyALBqEc_ZKvXCoi51uhtYyIJhoi_4rpptc",
  authDomain: "fallguard-family.firebaseapp.com",
  projectId: "fallguard-family",
  storageBucket: "fallguard-family.firebasestorage.app",
  messagingSenderId: "543935846728",
  appId: "1:543935846728:web:9bfe0c7e0e8da47f88bb7d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "แจ้งเตือน";
  const options = {
    body: payload.notification?.body || "",
    icon: "/icon.png",
  };
  self.registration.showNotification(title, options);
});
