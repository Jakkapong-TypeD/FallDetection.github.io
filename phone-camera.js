from pathlib import Path

src = Path("/mnt/data/phone-camera(1).js")
text = src.read_text(encoding="utf-8")

text = text.replace(
"""  collection, query, where, getDocs,
  doc, setDoc, updateDoc, onSnapshot, addDoc, deleteDoc
""",
"""  collection, query, where, getDocs,
  doc, getDoc, setDoc, updateDoc, onSnapshot, addDoc, deleteDoc
"""
)

old_func = """async function findGroup() {
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
    els.groupName.textContent = groupDoc.data().group_name || "—";
    els.btnStart.disabled = false;
  } catch (err) {
    showError("โหลดข้อมูลกลุ่มไม่สำเร็จ: " + err.message);
  }
}
"""

new_func = """async function findGroup() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requestedGroupId = params.get("groupId");

    // ถ้ามี groupId ใน URL ให้เปิดบ้านนั้นโดยตรง
    // ตัวอย่าง: phone-camera.html?groupId=DOCUMENT_ID
    if (requestedGroupId) {
      const groupRef = doc(db, "family_groups", requestedGroupId);
      const groupSnap = await getDoc(groupRef);

      if (!groupSnap.exists()) {
        els.groupName.textContent = "—";
        showError("ไม่พบกลุ่มบ้านนี้ กรุณาตรวจสอบลิงก์อีกครั้ง");
        return;
      }

      const groupData = groupSnap.data();
      const members = groupData.member_user_ids || [];

      // อนุญาตเฉพาะสมาชิกของบ้านนี้
      if (!members.includes(currentUser.uid)) {
        els.groupName.textContent = "—";
        showError("บัญชีนี้ไม่ได้เป็นสมาชิกของกลุ่มบ้านนี้");
        return;
      }

      currentGroupId = groupSnap.id;
      els.groupName.textContent = groupData.group_name || "—";
      els.btnStart.disabled = false;
      return;
    }

    // ถ้าไม่มี groupId ให้ค้นหากลุ่มที่ผู้ใช้เป็นสมาชิก
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

    // ถ้ามีหลายบ้าน ไม่ควรเลือก snapshot.docs[0] แบบสุ่ม
    if (snapshot.size > 1) {
      els.groupName.textContent = "—";
      showError("บัญชีนี้อยู่หลายกลุ่ม กรุณาเปิดหน้ากล้องจากลิงก์ของบ้านที่ต้องการ");
      return;
    }

    const groupDoc = snapshot.docs[0];
    currentGroupId = groupDoc.id;
    els.groupName.textContent = groupDoc.data().group_name || "—";
    els.btnStart.disabled = false;
  } catch (err) {
    console.error("โหลดข้อมูลกลุ่มไม่สำเร็จ:", err);
    showError("โหลดข้อมูลกลุ่มไม่สำเร็จ: " + err.message);
  }
}
"""

if old_func not in text:
    raise RuntimeError("ไม่พบฟังก์ชัน findGroup เดิมในไฟล์")

text = text.replace(old_func, new_func)

out = Path("/mnt/data/phone-camera.js")
out.write_text(text, encoding="utf-8")

print(f"สร้างไฟล์แล้ว: {out}")
