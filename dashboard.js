// dashboard.js
import { auth, db, messaging, VAPID_KEY, BACKEND_URL } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const els = {
  userEmail: document.getElementById("user-email"),
  btnLogout: document.getElementById("btn-logout"),
  btnNotify: document.getElementById("btn-notify"),
  panelNoGroup: document.getElementById("panel-no-group"),
  panelGroup: document.getElementById("panel-group"),
  groupName: document.getElementById("group-name"),
  btnCreateGroup: document.getElementById("btn-create-group"),
  inviteCode: document.getElementById("invite-code"),
  btnJoinGroup: document.getElementById("btn-join-group"),
  groupStatus: document.getElementById("group-status"),
  activeGroupName: document.getElementById("active-group-name"),
  activeInviteCode: document.getElementById("active-invite-code"),
  alertList: document.getElementById("alert-list"),
};

let currentUser = null;
let unsubscribeAlerts = null;

// ---------- Auth guard ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  els.userEmail.textContent = user.email;
  resetGroupView();

  // เช็ค Firestore ก่อนว่า user นี้เป็น member ของกลุ่มไหนอยู่แล้วไหม
  await loadGroupFromFirestore();
});

els.btnLogout.addEventListener("click", () => signOut(auth));

// ---------- โหลดกลุ่มจาก Firestore (ไม่ใช่แค่ localStorage) ----------
async function loadGroupFromFirestore() {
  try {
    // ค้นหา family_groups ที่มี uid ของ user นี้อยู่ใน member_user_ids
    const q = query(
      collection(db, "family_groups"),
      where("member_user_ids", "array-contains", currentUser.uid)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // user เป็น member ของกลุ่มนี้อยู่แล้ว โหลดข้อมูลมาแสดง
      const doc = snapshot.docs[0]; // เอากลุ่มแรกที่เจอ
      const data = doc.data();
      showGroupPanel(doc.id, data.group_name, data.invite_code);
    }
    // ถ้าไม่เจอกลุ่มไหนเลย -> แสดงหน้าสร้าง/เข้าร่วมกลุ่ม (ค่าเริ่มต้นอยู่แล้ว)
  } catch (err) {
    console.error("โหลดข้อมูลกลุ่มไม่สำเร็จ:", err);
  }
}

// ---------- Reset view ----------
function resetGroupView() {
  if (unsubscribeAlerts) {
    unsubscribeAlerts();
    unsubscribeAlerts = null;
  }
  els.panelGroup.hidden = true;
  els.panelNoGroup.hidden = false;
  els.groupStatus.hidden = true;
}

function showGroupPanel(groupId, groupName, inviteCode) {
  els.panelNoGroup.hidden = true;
  els.panelGroup.hidden = false;
  els.activeGroupName.textContent = groupName;
  els.activeInviteCode.textContent = inviteCode || "—";
  listenForAlerts(groupId);
  addLeaveGroupButton(groupId);
}

function setStatus(message, isError = false) {
  els.groupStatus.hidden = false;
  els.groupStatus.textContent = message;
  els.groupStatus.style.color = isError ? "#E85C4A" : "";
}

// ---------- สร้าง/เข้าร่วมกลุ่ม ----------
els.btnCreateGroup.addEventListener("click", async () => {
  const name = els.groupName.value.trim();
  if (!name) return setStatus("กรุณาใส่ชื่อกลุ่มก่อนครับ", true);

  els.btnCreateGroup.disabled = true;
  try {
    const res = await fetch(`${BACKEND_URL}/groups/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_user_id: currentUser.uid, group_name: name }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    setStatus(`สร้างกลุ่มสำเร็จ!\nรหัสเชิญ: ${data.invite_code}\n(group_id สำหรับผูกกล้อง: ${data.group_id})`);
    showGroupPanel(data.group_id, name, data.invite_code);
  } catch {
    setStatus("สร้างกลุ่มไม่สำเร็จ กรุณาตรวจสอบว่า backend เปิดอยู่ที่ " + BACKEND_URL, true);
  } finally {
    els.btnCreateGroup.disabled = false;
  }
});

els.btnJoinGroup.addEventListener("click", async () => {
  const code = els.inviteCode.value.trim().toUpperCase();
  if (!code) return setStatus("กรุณาใส่รหัสเชิญก่อนครับ", true);

  els.btnJoinGroup.disabled = true;
  try {
    const res = await fetch(`${BACKEND_URL}/groups/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: currentUser.uid, invite_code: code }),
    });
    if (!res.ok) throw new Error("not_found");
    const data = await res.json();
    setStatus(`เข้าร่วมกลุ่ม "${data.group_name}" สำเร็จ`);
    showGroupPanel(data.group_id, data.group_name, code);
  } catch {
    setStatus("ไม่พบรหัสเชิญนี้ กรุณาตรวจสอบอีกครั้ง", true);
  } finally {
    els.btnJoinGroup.disabled = false;
  }
});

// ---------- ปุ่มออกจากกลุ่ม ----------
function addLeaveGroupButton(groupId) {
  // ลบอันเก่าออกก่อน (ถ้ามี)
  const old = document.getElementById("btn-leave-group");
  if (old) old.remove();

  const btn = document.createElement("button");
  btn.id = "btn-leave-group";
  btn.className = "btn btn-small btn-ghost";
  btn.textContent = "ออกจากกลุ่มนี้";
  btn.style.marginTop = "24px";

  btn.addEventListener("click", async () => {
    if (!confirm("ต้องการออกจากกลุ่มนี้ใช่ไหมครับ?")) return;
    try {
      // ออกจากกลุ่มใน backend
      await fetch(`${BACKEND_URL}/groups/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser.uid, group_id: groupId }),
      });
    } catch {
      // ถ้า endpoint ยังไม่มี ก็แค่รีเซ็ต view ฝั่ง client ไปก่อน
    }
    resetGroupView();
  });

  els.alertList.after(btn);
}

// ---------- Push notifications ----------
els.btnNotify.addEventListener("click", async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("กรุณาอนุญาตการแจ้งเตือนในเบราว์เซอร์ เพื่อรับข่าวเมื่อมีเหตุการณ์ล้ม");
      return;
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) throw new Error("no token");

    await fetch(`${BACKEND_URL}/groups/register-device-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: currentUser.uid, fcm_token: token }),
    });

    els.btnNotify.textContent = "เปิดการแจ้งเตือนแล้ว ✓";
    els.btnNotify.disabled = true;
  } catch (err) {
    alert("เปิดการแจ้งเตือนไม่สำเร็จ: " + err.message);
  }
});

onMessage(messaging, (payload) => {
  new Notification(payload.notification?.title || "แจ้งเตือน", {
    body: payload.notification?.body || "",
  });
});

// ---------- Alert history (realtime) ----------
function listenForAlerts(groupId) {
  if (unsubscribeAlerts) {
    unsubscribeAlerts();
    unsubscribeAlerts = null;
  }

  const q = query(
    collection(db, "fall_alerts"),
    where("group_id", "==", groupId),
    orderBy("timestamp", "desc"),
    limit(30)
  );

  unsubscribeAlerts = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      els.alertList.innerHTML = `<p class="empty-state">ยังไม่มีการแจ้งเตือน ระบบจะแสดงที่นี่ทันทีเมื่อตรวจพบการล้ม</p>`;
      return;
    }
    els.alertList.innerHTML = "";
    snapshot.forEach((doc) => {
      const a = doc.data();
      const date = new Date(a.timestamp * 1000);
      const confidence = Math.round((a.confidence || 0) * 100);

      const item = document.createElement("div");
      item.className = "alert-item";
      item.innerHTML = `
        <span class="alert-icon">⚠️</span>
        <div>
          <h4>ตรวจพบการล้ม — ความมั่นใจ ${confidence}%</h4>
          <p>${date.toLocaleString("th-TH")}<br>อุปกรณ์: ${a.device_id || "-"}</p>
        </div>
      `;
      els.alertList.appendChild(item);
    });
  });
}
