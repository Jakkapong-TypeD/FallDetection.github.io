importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyCMj60KjASvUXzbZlmdGcaAn7ARAef0aGw",
  authDomain: "backend-bb641.firebaseapp.com",
  projectId: "backend-bb641",
  storageBucket: "backend-bb641.firebasestorage.app",
  messagingSenderId: "209525644712",
  appId: "1:209525644712:web:17d4c203e63fb4f14d919d",
  measurementId: "G-7V9MXVPS8Y"
};

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
