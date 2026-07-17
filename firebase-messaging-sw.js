importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "นำค่าจาก firebase-config.js มาใส่",
  authDomain: "backend-bb641.firebaseapp.com",
  projectId: "backend-bb641",
  storageBucket: "นำค่าจาก firebase-config.js มาใส่",
  messagingSenderId: "นำค่าจาก firebase-config.js มาใส่",
  appId: "นำค่าจาก firebase-config.js มาใส่"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("ได้รับการแจ้งเตือนเบื้องหลัง:", payload);

  const title =
    payload.notification?.title ||
    "FallGuard Family";

  const options = {
    body:
      payload.notification?.body ||
      "มีการแจ้งเตือนใหม่",
    icon: "./icon-192.png",
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow("./dashboard.html")
  );
});
