// phone-camera.js
// -----------------
// หน้านี้เปิดจากมือถือ ขอสิทธิ์กล้อง (getUserMedia) แล้วส่งภาพแบบสด
// ไปให้ทุกคนที่เปิด dashboard.html ในกลุ่มบ้านเดียวกันดู ผ่าน WebRTC
// (peer-to-peer โดยตรง ไม่ผ่าน backend) โดยใช้ Firestore เป็นช่องทาง
// "ต่อสาย" (signaling): ฝั่งนี้เขียน SDP offer ลง Firestore แล้วรอ
// dashboard.js (ฝั่งดู) เขียน SDP answer กลับมา จากนั้นแลก ICE
// candidate กันผ่าน subcollection จนกว่าจะต่อวิดีโอกันติด
//
// ต้องเพิ่ม Firestore Security Rule ให้ collection "camera_sessions"
// (และ subcollection offerCandidates / answerCandidates) อนุญาตให้
// สมาชิกในกลุ่มอ่าน/เขียนได้ — แพทเทิร์นเดียวกับที่ทำไว้ให้ collection
// "medications" ก่อนหน้านี้

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, getDocs,
  doc, setDoc, updateDoc, onSnapshot, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const els = {
  groupName: document.getElementById("phone-group-name"),
  video: document.getElementById("local-preview"),
  videoPlaceholder: document.getElementById("video-placeholder"),
  btnStart: document.getElementById("btn-start-broadcast"),
  btnStop: document.getElementById("btn-stop-broadcast"),
  connDot: document.getElementById("conn-dot"),
  connText: document.getElementById("conn-text"),
  errorText: document.getElementById("phone-error"),
};

// STUN สาธารณะของ Google เท่านั้น (ไม่มี TURN) — ดูหมายเหตุข้อจำกัดใน
// dashboard.js ส่วนกล้องวงจรปิด
const rtcServers = {
  iceServers: [
    { urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  ],
  iceCandidatePoolSize: 10,
};

let currentUser = null;
let currentGroupId = null;
let pc = null;
let localStream = null;
let unsubAnswer = null;
let unsubAnswerCandidates = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  await findGroup();
});

async function findGroup() {
  try {
    const q = query(
      collection(db, "family_groups"),
      where("member_user_ids", "array-contains", currentUser.uid)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      els.groupName.textContent = "—";
      showError("บัญชีนี้ยังไม่ได้เข้าร่วมกลุ่มบ้านใดๆ กรุณาเข้ากลุ่มในหน้าแดชบอร์ดก่อนครับ");
      return;
    }
    const groupDoc = snapshot.docs[0];
    currentGroupId = groupDoc.id;
    console.log("Phone Group:", currentGroupId);
    els.groupName.textContent = groupDoc.data().group_name || "—";
    els.btnStart.disabled = false;
  } catch (err) {
    showError("โหลดข้อมูลกลุ่มไม่สำเร็จ: " + err.message);
  }
}

function showError(msg) {
  els.errorText.hidden = false;
  els.errorText.textContent = msg;
}
function clearError() {
  els.errorText.hidden = true;
  els.errorText.textContent = "";
}
function setConnStatus(state) {
  if (state === "connected") {
    els.connDot.classList.add("online");
    els.connText.textContent = "เชื่อมต่อแล้ว — กำลังส่งภาพให้ครอบครัวดู";
  } else if (state === "connecting") {
    els.connDot.classList.remove("online");
    els.connText.textContent = "กำลังเชื่อมต่อ... เปิดหน้าแดชบอร์ดในอุปกรณ์อื่นเพื่อดูภาพ";
  } else {
    els.connDot.classList.remove("online");
    els.connText.textContent = "ยังไม่ได้เชื่อมต่อ";
  }
}

els.btnStart.addEventListener("click", startBroadcast);
els.btnStop.addEventListener("click", stopBroadcast);

async function startBroadcast() {
  if (!currentGroupId) return;
  clearError();
  els.btnStart.disabled = true;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (err) {
    showError("ขอสิทธิ์กล้องไม่สำเร็จ: " + err.message + " (ลองเช็คว่าอนุญาตสิทธิ์กล้องให้เว็บนี้ในตั้งค่าเบราว์เซอร์แล้วหรือยัง)");
    els.btnStart.disabled = false;
    return;
  }

  els.video.srcObject = localStream;
  els.video.style.display = "block";
  els.videoPlaceholder.style.display = "none";
  els.btnStop.hidden = false;
  setConnStatus("connecting");

  pc = new RTCPeerConnection(rtcServers);
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === "connected") setConnStatus("connected");
    else if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
      setConnStatus("idle");
    } else {
      setConnStatus("connecting");
    }
  };

  const sessionRef = doc(db, "camera_sessions", currentGroupId);
  const offerCandidatesRef = collection(sessionRef, "offerCandidates");
  const answerCandidatesRef = collection(sessionRef, "answerCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) addDoc(offerCandidatesRef, event.candidate.toJSON());
  };

  try {
    // เริ่มเซสชันใหม่ (เขียนทับของเก่าถ้ามีมือถือเครื่องอื่น broadcast ค้างอยู่)
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    await setDoc(sessionRef, {
      offer: { sdp: offerDescription.sdp, type: offerDescription.type },
      answer: null,
      updated_at: Date.now(),
      broadcaster_uid: currentUser.uid,
    });
  } catch (err) {
    showError("เริ่มการเชื่อมต่อไม่สำเร็จ: " + err.message);
    await stopBroadcast();
    return;
  }

  unsubAnswer = onSnapshot(sessionRef, (snap) => {
    const data = snap.data();
    if (pc && !pc.currentRemoteDescription && data?.answer) {
      pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch((err) => {
        console.error("ตั้งค่า remote description ไม่สำเร็จ:", err);
      });
    }
  });

  unsubAnswerCandidates = onSnapshot(answerCandidatesRef, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added" && pc) {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    });
  });
}

async function stopBroadcast() {
  if (unsubAnswer) {
    unsubAnswer();
    unsubAnswer = null;
  }
  if (unsubAnswerCandidates) {
    unsubAnswerCandidates();
    unsubAnswerCandidates = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  els.video.srcObject = null;
  els.video.style.display = "none";
  els.videoPlaceholder.style.display = "block";
  els.btnStop.hidden = true;
  els.btnStart.disabled = false;
  setConnStatus("idle");

  if (currentGroupId) {
    try {
      await deleteDoc(doc(db, "camera_sessions", currentGroupId));
    } catch (err) {
      // ไม่เป็นไรถ้าลบไม่สำเร็จ (เช่นเซสชันถูกแทนที่ไปแล้ว)
    }
  }
}

window.addEventListener("beforeunload", () => {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
  }
});
