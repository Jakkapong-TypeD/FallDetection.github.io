// dashboard.js
import { auth, db, messaging, VAPID_KEY, BACKEND_URL } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs,
  addDoc, doc, updateDoc, deleteDoc, serverTimestamp, increment,
  setDoc, getDoc
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

  // กล้อง
  cameraFeed: document.getElementById("camera-feed"),
  cameraFeedRemote: document.getElementById("camera-feed-remote"),
  cameraOffline: document.getElementById("camera-offline"),
  cameraDeviceLabel: document.getElementById("camera-device-label"),
  camDot: document.getElementById("cam-dot"),

  // แจ้งเตือนการกินยา
  btnAddMed: document.getElementById("btn-add-med"),
  medList: document.getElementById("med-list"),
  medEmpty: document.getElementById("med-empty"),
  medModal: document.getElementById("med-modal"),
  medModalTitle: document.getElementById("med-modal-title"),
  medForm: document.getElementById("med-form"),
  medName: document.getElementById("med-name"),
  medDose: document.getElementById("med-dose"),
  medStock: document.getElementById("med-stock"),
  medNote: document.getElementById("med-note"),
  medBedtime: document.getElementById("med-bedtime"),
  mealGroup: document.getElementById("meal-group"),
  bedtimeGroup: document.getElementById("bedtime-group"),
  mealError: document.getElementById("meal-error"),
  btnMedCancel: document.getElementById("btn-med-cancel"),
};

let currentUser = null;
let unsubscribeAlerts = null;
let unsubscribeMedications = null;
let currentGroupId = null;
let medications = []; // แคชรายการยาล่าสุดจาก Firestore (sync กับทุกคนในกลุ่มแบบเรียลไทม์)
let editingMedId = null;
let notifiedThisSession = {}; // กันแจ้งเตือนซ้ำในแท็บนี้ (key: medId_slotId_YYYY-MM-DD)

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

// ถ้าเคยอนุญาตแจ้งเตือนแล้ว ให้เปิดใช้งานอัตโนมัติ
await setupNotifications(false);
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
  if (unsubscribeMedications) {
    unsubscribeMedications();
    unsubscribeMedications = null;
  }
  currentGroupId = null;
  medications = [];
  stopPhoneCameraViewer();
  els.panelGroup.hidden = true;
  els.panelNoGroup.hidden = false;
  els.groupStatus.hidden = true;
}

function showGroupPanel(groupId, groupName, inviteCode) {
  els.panelNoGroup.hidden = true;
  els.panelGroup.hidden = false;
  els.activeGroupName.textContent = groupName;
  els.activeInviteCode.textContent = inviteCode || "—";
  currentGroupId = groupId;
  console.log("Dashboard Group:", groupId);
  listenForAlerts(groupId);
  listenForMedications(groupId);
  startPhoneCameraViewer(groupId);
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

// ---------- กล้องวงจรปิด ----------
// ตอนนี้ยังไม่มีกล้อง IP จริง เลยใช้ "กล้องมือถือ" เป็นแหล่งภาพชั่วคราว
// วิธีทำงาน: มือถือเปิดหน้า phone-camera.html แล้วขอสิทธิ์กล้อง จากนั้น
// ส่ง SDP offer + ICE candidates ผ่าน Firestore (collection
// "camera_sessions", doc id = group_id) เป็นช่องทาง "ต่อสาย" (signaling)
// ให้ทุกคนที่เปิดหน้า dashboard ในกลุ่มเดียวกัน (viewer) รับสายแล้วต่อ
// วิดีโอกันตรงๆ แบบ peer-to-peer (WebRTC) — ไม่ต้องผ่าน backend เลย
//
// ข้อจำกัด: ใช้ STUN สาธารณะของ Google เท่านั้น (ฟรี ไม่มี TURN) ถ้ามือถือ
// กับคนดูอยู่คนละเครือข่ายที่ NAT/ไฟร์วอลล์เข้มงวดมาก อาจต่อกันไม่ติด —
// เหมาะกับใช้ชั่วคราวในบ้าน/เครือข่ายเดียวกันก่อน ถ้าจะให้เสถียรขึ้นค่อยหา
// TURN server (เช่น Twilio, coturn ของตัวเอง) มาใส่เพิ่มทีหลังได้
//
// ต้องเพิ่ม Firestore Security Rule ให้ collection "camera_sessions" และ
// subcollection ของมันด้วย (แพทเทิร์นเดียวกับ medications ที่ทำไว้ก่อนหน้า)
const rtcServers = {
  iceServers: [
    { urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  ],
  iceCandidatePoolSize: 10,
};

let cameraPc = null;
let unsubscribeCameraSession = null;
let unsubscribeOfferCandidates = null;

function showCameraSource(source) {
  // source: "phone" (กำลังรับภาพจากมือถือ) | "offline" (ยังไม่มีใคร broadcast)
  if (source === "phone") {
    els.cameraFeedRemote.style.display = "block";
    els.cameraFeed.style.display = "none";
    els.cameraOffline.classList.remove("show");
    els.camDot.classList.add("online");
    els.cameraDeviceLabel.textContent = "📱 กล้องจากมือถือ";
  } else {
    els.cameraFeedRemote.style.display = "none";
    els.cameraFeed.style.display = "none";
    els.cameraOffline.classList.add("show");
    els.camDot.classList.remove("online");
    els.cameraDeviceLabel.textContent = "ยังไม่ได้เชื่อมต่อ";
  }
}

function startPhoneCameraViewer(groupId) {
  stopPhoneCameraViewer();
  if (!groupId) return;

  showCameraSource("offline");

  cameraPc = new RTCPeerConnection(rtcServers);
  const remoteStream = new MediaStream();
  els.cameraFeedRemote.srcObject = remoteStream;

  cameraPc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
    showCameraSource("phone");
  };
  cameraPc.onconnectionstatechange = () => {
    if (cameraPc && (cameraPc.connectionState === "disconnected" || cameraPc.connectionState === "failed" || cameraPc.connectionState === "closed")) {
      showCameraSource("offline");
    }
  };

  const sessionRef = doc(db, "camera_sessions", groupId);
  const offerCandidatesRef = collection(sessionRef, "offerCandidates");
  const answerCandidatesRef = collection(sessionRef, "answerCandidates");

  cameraPc.onicecandidate = (event) => {
    if (event.candidate) addDoc(answerCandidatesRef, event.candidate.toJSON());
  };

  let answered = false;

  unsubscribeCameraSession = onSnapshot(sessionRef, async (snap) => {
    const data = snap.data();
    if (!data || !data.offer) {
      answered = false;
      showCameraSource("offline");
      return;
    }
    if (!answered && cameraPc) {
      answered = true;
      try {
        await cameraPc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answerDescription = await cameraPc.createAnswer();
        await cameraPc.setLocalDescription(answerDescription);
        await updateDoc(sessionRef, {
          answer: { sdp: answerDescription.sdp, type: answerDescription.type },
        });
      } catch (err) {
        console.error("เชื่อมต่อกล้องมือถือไม่สำเร็จ:", err);
      }
    }
  });

  unsubscribeOfferCandidates = onSnapshot(offerCandidatesRef, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added" && cameraPc) {
        cameraPc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    });
  });
}

function stopPhoneCameraViewer() {
  if (unsubscribeCameraSession) {
    unsubscribeCameraSession();
    unsubscribeCameraSession = null;
  }
  if (unsubscribeOfferCandidates) {
    unsubscribeOfferCandidates();
    unsubscribeOfferCandidates = null;
  }
  if (cameraPc) {
    cameraPc.close();
    cameraPc = null;
  }
  els.cameraFeedRemote.srcObject = null;
  showCameraSource("offline");
}

// ---------- (สำรองไว้สำหรับตอนมีกล้อง IP จริง) ----------
// ถ้าอนาคตติดตั้งกล้อง IP จริงผ่าน camera_stream.py + backend แล้ว ให้เรียก
// startMjpegStream(groupId) แทน startPhoneCameraViewer(groupId) ใน
// showGroupPanel() ด้านบน (ฟังก์ชันนี้ยังไม่ได้ถูกเรียกใช้งานตอนนี้)
let streamRetryTimer = null;

function startMjpegStream(groupId) {
  if (!groupId) return;
  const url = `${BACKEND_URL}/stream/video?group_id=${encodeURIComponent(groupId)}`;
  els.cameraFeed.style.display = "block";
  els.cameraFeedRemote.style.display = "none";
  els.cameraFeed.src = "";
  els.cameraFeed.src = url + "&t=" + Date.now();
}

function stopMjpegStream() {
  if (streamRetryTimer) {
    clearTimeout(streamRetryTimer);
    streamRetryTimer = null;
  }
  els.cameraFeed.src = "";
}

els.cameraFeed.addEventListener("load", () => {
  els.cameraOffline.classList.remove("show");
  els.camDot.classList.add("online");
  els.cameraDeviceLabel.textContent = "living-room-cam-01";
});
els.cameraFeed.addEventListener("error", () => {
  els.cameraOffline.classList.add("show");
  els.camDot.classList.remove("online");
  if (streamRetryTimer) clearTimeout(streamRetryTimer);
  streamRetryTimer = setTimeout(() => startMjpegStream(currentGroupId), 5000);
});


// ---------- Push notifications ----------
els.btnNotify.addEventListener("click", async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("กรุณาอนุญาตการแจ้งเตือนในเบราว์เซอร์ เพื่อรับข่าวเมื่อมีเหตุการณ์ล้ม");
      return;
    }

    const registration = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
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

// =========================================================
// แจ้งเตือนการกินยา (Medication Reminders)
// ---------------------------------------------------------
// เก็บใน Firestore collection "medications" (ผูกกับ group_id
// แบบเดียวกับ fall_alerts) และ sync แบบเรียลไทม์ผ่าน onSnapshot
// เพื่อให้สมาชิกทุกคนในกลุ่ม ไม่ว่าจะล็อกอินด้วยอีเมลไหน หรือ
// เปิดจากอุปกรณ์ไหน เห็นรายการยาและสถานะ "กินแล้ว" ตรงกันทันที
//
// ต้องเพิ่ม Firestore Security Rule ให้ collection นี้ด้วย
// (ตัวอย่าง ปรับ field ให้ตรงกับ rule ของ family_groups/fall_alerts
// ที่มีอยู่แล้ว):
//
//   match /medications/{medId} {
//     allow read, write: if request.auth != null &&
//       request.auth.uid in get(/databases/$(database)/documents/family_groups/$(resource.data.group_id)).data.member_user_ids;
//   }
//
// (สำหรับ create ที่ resource.data ยังไม่มี ให้เช็คจาก request.resource.data.group_id แทน)
// =========================================================

const TIMING_LABEL = { before_meal: "ก่อนอาหาร", after_meal: "หลังอาหาร", before_bed: "ก่อนนอน" };
const MEAL_LABEL = { morning: "เช้า", noon: "กลางวัน", evening: "เย็น" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function getDoseSlots(med) {
  if (med.timing === "before_bed") {
    return [{ slotId: "bed", label: "ก่อนนอน", time: med.bedtime }];
  }
  return (med.meals || []).map((m) => ({
    slotId: m.meal,
    label: MEAL_LABEL[m.meal] + (med.timing === "before_meal" ? " (ก่อนอาหาร)" : " (หลังอาหาร)"),
    time: m.time,
  }));
}

// ---------- Realtime sync จาก Firestore ----------
function listenForMedications(groupId) {
  if (unsubscribeMedications) {
    unsubscribeMedications();
    unsubscribeMedications = null;
  }
  const q = query(collection(db, "medications"), where("group_id", "==", groupId));
  unsubscribeMedications = onSnapshot(q, (snapshot) => {
    medications = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMedications();
    checkDueReminders();
  });
}

// ---------- แสดงผลรายการยา ----------
function renderMedications() {
  els.medList.querySelectorAll(".med-item").forEach((n) => n.remove());

  if (medications.length === 0) {
    els.medEmpty.style.display = "block";
    return;
  }
  els.medEmpty.style.display = "none";

  const nowMin = minutesNow();
  const today = todayStr();

  medications.forEach((med) => {
    const slots = getDoseSlots(med);
    const takenToday = (med.taken && med.taken[today]) || {};

    const item = document.createElement("div");
    item.className = "med-item";
    item.dataset.id = med.id;

    const isDue = slots.some((s) => {
      const t = toMinutes(s.time);
      if (t === null) return false;
      return !takenToday[s.slotId] && nowMin >= t && nowMin - t <= 15;
    });
    if (isDue) item.classList.add("due");

    const hasStock = med.stock !== null && med.stock !== undefined && med.stock !== "";
    const stockLow = hasStock && Number(med.stock) <= 5;

    item.innerHTML = `
      <div class="med-item-top">
        <div>
          <div class="med-name-row">
            <span class="med-name">${escapeHtml(med.name)}</span>
            ${med.dose ? `<span class="med-dose">${escapeHtml(med.dose)}</span>` : ""}
            <span class="med-badge">${TIMING_LABEL[med.timing]}</span>
          </div>
          ${med.note ? `<div class="med-note">${escapeHtml(med.note)}</div>` : ""}
          ${stockLow ? `<div class="med-note med-stock-low">เหลือ ${escapeHtml(String(med.stock))} เม็ด/โดส — ใกล้หมด</div>` : ""}
        </div>
        <div class="med-actions">
          <button class="med-icon-btn med-edit" title="แก้ไข">✏️</button>
          <button class="med-icon-btn med-delete" title="ลบ">🗑️</button>
        </div>
      </div>
      <div class="med-times"></div>
    `;

    const timesEl = item.querySelector(".med-times");
    slots.forEach((s) => {
      const taken = !!takenToday[s.slotId];
      const chip = document.createElement("label");
      chip.className = "med-time-chip" + (taken ? " taken" : "");
      chip.innerHTML = `<input type="checkbox" ${taken ? "checked" : ""}> ${s.time || "--:--"} · ${s.label}`;
      chip.querySelector("input").addEventListener("change", (e) => toggleTaken(med, s.slotId, e.target.checked));
      timesEl.appendChild(chip);
    });

    item.querySelector(".med-edit").addEventListener("click", () => openMedModal(med));
    item.querySelector(".med-delete").addEventListener("click", () => deleteMed(med.id));

    els.medList.appendChild(item);
  });
}

// ---------- ทำเครื่องหมายว่ากินยาแล้ว/ยัง (sync ให้ทุกคนเห็นทันที) ----------
async function toggleTaken(med, slotId, taken) {
  const today = todayStr();
  const update = { [`taken.${today}.${slotId}`]: taken };

  const hasStock = med.stock !== null && med.stock !== undefined && med.stock !== "";
  if (hasStock) {
    update.stock = increment(taken ? -1 : 1);
  }

  try {
    await updateDoc(doc(db, "medications", med.id), update);
  } catch (err) {
    alert("บันทึกสถานะกินยาไม่สำเร็จ: " + err.message);
  }
}

// ---------- เพิ่ม/แก้ไข/ลบยา ----------
function updateTimingVisibility() {
  const timing = els.medForm.querySelector('input[name="timing"]:checked').value;
  if (timing === "before_bed") {
    els.mealGroup.style.display = "none";
    els.bedtimeGroup.style.display = "block";
  } else {
    els.mealGroup.style.display = "block";
    els.bedtimeGroup.style.display = "none";
  }
}
els.medForm.querySelectorAll('input[name="timing"]').forEach((r) => r.addEventListener("change", updateTimingVisibility));

function openMedModal(med) {
  editingMedId = med ? med.id : null;
  els.medModalTitle.textContent = med ? "แก้ไขรายการยา" : "เพิ่มรายการยา";
  els.medName.value = med ? med.name : "";
  els.medDose.value = med ? med.dose || "" : "";
  els.medStock.value = med && med.stock !== undefined ? med.stock : "";
  els.medNote.value = med ? med.note || "" : "";

  const timing = med ? med.timing : "before_meal";
  els.medForm.querySelector(`input[name="timing"][value="${timing}"]`).checked = true;

  els.medForm.querySelectorAll(".meal-slot").forEach((slot) => {
    const mealKey = slot.dataset.meal;
    const check = slot.querySelector(".meal-check");
    const timeInput = slot.querySelector(".meal-time");
    if (med && med.meals) {
      const found = med.meals.find((m) => m.meal === mealKey);
      check.checked = !!found;
      if (found) timeInput.value = found.time;
    } else {
      check.checked = mealKey === "morning" || mealKey === "evening";
    }
  });
  els.medBedtime.value = med && med.bedtime ? med.bedtime : "21:00";

  els.mealError.classList.remove("show");
  updateTimingVisibility();
  els.medModal.classList.add("show");
  els.medName.focus();
}

function closeMedModal() {
  els.medModal.classList.remove("show");
  editingMedId = null;
  els.medForm.reset();
}

els.btnAddMed.addEventListener("click", () => openMedModal(null));
els.btnMedCancel.addEventListener("click", closeMedModal);
els.medModal.addEventListener("click", (e) => {
  if (e.target === els.medModal) closeMedModal();
});

els.medForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentGroupId) return;

  const timing = els.medForm.querySelector('input[name="timing"]:checked').value;
  let meals = [];
  let bedtime = null;

  if (timing === "before_bed") {
    bedtime = els.medBedtime.value;
  } else {
    els.medForm.querySelectorAll(".meal-slot").forEach((slot) => {
      if (slot.querySelector(".meal-check").checked) {
        meals.push({ meal: slot.dataset.meal, time: slot.querySelector(".meal-time").value });
      }
    });
    if (meals.length === 0) {
      els.mealError.classList.add("show");
      return;
    }
  }
  els.mealError.classList.remove("show");

  const stockVal = els.medStock.value;
  const payload = {
    group_id: currentGroupId,
    name: els.medName.value.trim(),
    dose: els.medDose.value.trim(),
    timing,
    meals,
    bedtime,
    stock: stockVal === "" ? "" : Number(stockVal),
    note: els.medNote.value.trim(),
  };

  const submitBtn = els.medForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if (editingMedId) {
      await updateDoc(doc(db, "medications", editingMedId), payload);
    } else {
      payload.taken = {};
      payload.created_by = currentUser.uid;
      payload.created_at = serverTimestamp();
      await addDoc(collection(db, "medications"), payload);
    }
    closeMedModal();
  } catch (err) {
    alert("บันทึกรายการยาไม่สำเร็จ: " + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

async function deleteMed(medId) {
  if (!confirm("ลบรายการยานี้ใช่หรือไม่?")) return;
  try {
    await deleteDoc(doc(db, "medications", medId));
  } catch (err) {
    alert("ลบรายการยาไม่สำเร็จ: " + err.message);
  }
}

// ---------- ตรวจสอบเวลาที่ต้องแจ้งเตือน ----------
// หมายเหตุ: นี่คือการแจ้งเตือนฝั่ง client (ใช้ได้เมื่อเปิดแท็บนี้ค้างไว้
// และกดปุ่ม "เปิดการแจ้งเตือน" อนุญาต permission ไปแล้วเท่านั้น)
// ถ้าต้องการ push แจ้งเตือนไปหาทุกคนในกลุ่มแม้ปิดแอปอยู่ (เหมือนที่ระบบ
// แจ้งเตือนการล้มทำผ่าน FCM) ต้องมี Cloud Function ฝั่ง backend คอย
// เช็คตารางยาเป็นระยะแล้วยิง FCM ไปยัง fcm_token ของสมาชิกกลุ่ม —
// ส่วนนี้ผมยังไม่เห็นโค้ด backend จึงยังทำให้ไม่ได้ในตอนนี้ครับ
function checkDueReminders() {
  const nowMin = minutesNow();
  const today = todayStr();

  medications.forEach((med) => {
    const takenToday = (med.taken && med.taken[today]) || {};
    getDoseSlots(med).forEach((s) => {
      const t = toMinutes(s.time);
      if (t === null) return;
      const key = `${med.id}_${s.slotId}_${today}`;
      if (!takenToday[s.slotId] && !notifiedThisSession[key] && nowMin >= t && nowMin - t <= 5) {
        notifiedThisSession[key] = true;
        const msg = `ถึงเวลากินยา "${med.name}" (${s.label})`;
        if (window.Notification && Notification.permission === "granted") {
          new Notification("FallGuard Family — แจ้งเตือนกินยา", { body: msg });
        }
      }
    });
  });
}

setInterval(() => {
  if (currentGroupId) checkDueReminders();
}, 30000);
