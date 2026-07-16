// auth.js
import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorText = document.getElementById("auth-error");
const btnSignIn = document.getElementById("btn-signin");
const btnSignUp = document.getElementById("btn-signup");

// ถ้า login อยู่แล้ว ให้เด้งไปหน้า dashboard ทันที
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "dashboard.html";
});

function showError(message) {
  errorText.textContent = message;
  errorText.hidden = false;
}

function setLoading(isLoading) {
  btnSignIn.disabled = isLoading;
  btnSignUp.disabled = isLoading;
}

async function handleSignIn(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

async function handleSignUp(email, password) {
  await createUserWithEmailAndPassword(auth, email, password);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.hidden = true;
  setLoading(true);
  try {
    await handleSignIn(emailInput.value.trim(), passwordInput.value);
  } catch (err) {
    showError("เข้าสู่ระบบไม่สำเร็จ: กรุณาตรวจสอบอีเมล/รหัสผ่าน");
  } finally {
    setLoading(false);
  }
});

btnSignUp.addEventListener("click", async () => {
  errorText.hidden = true;
  if (!emailInput.value || !passwordInput.value) {
    showError("กรุณากรอกอีเมลและรหัสผ่านก่อนสมัครสมาชิก");
    return;
  }
  setLoading(true);
  try {
    await handleSignUp(emailInput.value.trim(), passwordInput.value);
  } catch (err) {
    showError("สมัครสมาชิกไม่สำเร็จ: " + (err.message || "ลองอีกครั้ง"));
  } finally {
    setLoading(false);
  }
});
