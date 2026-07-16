from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from firebase_config import db

router = APIRouter(prefix="/devices", tags=["devices"])


class RegisterDeviceRequest(BaseModel):
    device_id: str
    group_id: str
    label: str = "กล้องห้องนั่งเล่น"


@router.post("/register")
def register_device(req: RegisterDeviceRequest):
    """ผูกกล้อง (เช่น device_id='living-room-cam-01') เข้ากับ family group ที่สร้างไว้"""
    group_doc = db.collection("family_groups").document(req.group_id).get()
    if not group_doc.exists:
        raise HTTPException(status_code=404, detail="ไม่พบกลุ่มนี้")

    db.collection("devices").document(req.device_id).set({
        "group_id": req.group_id,
        "label": req.label,
    })
    return {"status": "device_registered", "device_id": req.device_id, "group_id": req.group_id}
