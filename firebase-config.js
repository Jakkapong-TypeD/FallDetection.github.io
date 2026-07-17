// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyCMj60KjASvUXzbZlmdGcaAn7ARAef0aGw",
  authDomain: "backend-bb641.firebaseapp.com",
  projectId: "backend-bb641",
  storageBucket: "backend-bb641.firebasestorage.app",
  messagingSenderId: "209525644712",
  appId: "1:209525644712:web:17d4c203e63fb4f14d919d",
  measurementId: "G-7V9MXVPS8Y"
};

// เปลี่ยนเป็น VAPID Key ของโปรเจกต์ backend-bb641
export const VAPID_KEY = "FIREBASE_SERVICE_ACCOUNT";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

export const BACKEND_URL = "https://my-app-backend-xt03.onrender.com";
