import os
import base64
import uuid

from fastapi import APIRouter, HTTPException, Header
from google.cloud.firestore_v1 import ArrayUnion

from models import FallAlertRequest
from firebase_config import db, send_push_to_tokens

router = APIRouter(prefix="/alerts", tags=["alerts"])

DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "dev-secret-token")
SNAPSHOT_DIR = "snapshots"
os.makedirs(SNAPSHOT_DIR, exist_ok=True)


def _verify_device(authorization: str | None):
    if authorization != f"Bearer {DEVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized device")


@router.post("/fall")
def receive_fall_alert(req: FallAlertRequest, authorization: str | None = Header(None)):
    """
    Endpoint ที่กล้อง (camera_stream.py) เรียกเมื่อ AI ตรวจพบการล้ม
    ทำหน้าที่:
      1. บันทึก event ลง Firestore
      2. หากล้องนี้ผูกอยู่กับ group ไหน -> ส่ง push notification ไปสมาชิกทุกคนในกลุ่ม
    """
    _verify_device(authorization)

    # หา device -> group ที่ผูกไว้
    device_doc = db.collection("devices").document(req.device_id).get()
    if not device_doc.exists:
        raise HTTPException(status_code=404, detail="ไม่พบอุปกรณ์นี้ในระบบ กรุณาผูกกล้องกับกลุ่มก่อน")

    group_id = device_doc.to_dict().get("group_id")
    group_doc = db.collection("family_groups").document(group_id).get()
    if not group_doc.exists:
        raise HTTPException(status_code=404, detail="ไม่พบกลุ่มที่ผูกกับอุปกรณ์นี้")

    group_data = group_doc.to_dict()
    member_ids = group_data.get("member_user_ids", [])

    # เก็บภาพ snapshot (ถ้ามี)
    snapshot_path = None
    if req.snapshot_base64:
        snapshot_path = f"{SNAPSHOT_DIR}/{uuid.uuid4().hex}.jpg"
        with open(snapshot_path, "wb") as f:
            f.write(base64.b64decode(req.snapshot_base64))

    # บันทึก event
    alert_ref = db.collection("fall_alerts").document()
    alert_ref.set({
        "device_id": req.device_id,
        "group_id": group_id,
        "timestamp": req.timestamp,
        "confidence": req.confidence,
        "snapshot_path": snapshot_path,
        "acknowledged_by": [],
    })

    # ดึง fcm token ของสมาชิกกลุ่มทั้งหมด แล้วส่ง push
    tokens = []
    for uid in member_ids:
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            token = user_doc.to_dict().get("fcm_token")
            if token:
                tokens.append(token)

    send_push_to_tokens(
        tokens=tokens,
        title="⚠️ แจ้งเตือนการล้ม!",
        body=f"ตรวจพบการล้ม ความมั่นใจ {int(req.confidence * 100)}% กรุณาตรวจสอบด่วน",
        data={"alert_id": alert_ref.id, "device_id": req.device_id},
    )

    return {"status": "alert_sent", "alert_id": alert_ref.id, "notified_members": len(tokens)}


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, user_id: str):
    """ญาติกดรับทราบว่าเห็นแจ้งเตือนแล้ว และกำลังไปช่วย"""
    alert_ref = db.collection("fall_alerts").document(alert_id)
    alert_ref.update({"acknowledged_by": ArrayUnion([user_id])})
    return {"status": "acknowledged"}
