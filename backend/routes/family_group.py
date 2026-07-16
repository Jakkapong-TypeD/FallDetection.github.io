import random
import string

from fastapi import APIRouter, HTTPException

from models import CreateGroupRequest, JoinGroupRequest, RegisterDeviceTokenRequest
from firebase_config import db

router = APIRouter(prefix="/groups", tags=["family-group"])


def _generate_invite_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@router.post("/create")
def create_group(req: CreateGroupRequest):
    """สร้างกลุ่มครอบครัว (เครือข่ายเดียวกัน) พร้อม invite code สำหรับให้ญาติคนอื่นกรอกเข้าร่วม"""
    invite_code = _generate_invite_code()
    group_ref = db.collection("family_groups").document()
    group_ref.set({
        "group_name": req.group_name,
        "owner_user_id": req.owner_user_id,
        "invite_code": invite_code,
        "member_user_ids": [req.owner_user_id],
    })
    return {"group_id": group_ref.id, "invite_code": invite_code}


@router.post("/join")
def join_group(req: JoinGroupRequest):
    """ญาติกรอก invite code เพื่อเข้าร่วมเครือข่ายเดียวกับผู้สูงอายุ"""
    groups = db.collection("family_groups").where("invite_code", "==", req.invite_code).limit(1).stream()
    group_doc = next(groups, None)

    if not group_doc:
        raise HTTPException(status_code=404, detail="ไม่พบรหัสเชิญนี้")

    group_ref = db.collection("family_groups").document(group_doc.id)
    group_data = group_doc.to_dict()
    members = set(group_data.get("member_user_ids", []))
    members.add(req.user_id)
    group_ref.update({"member_user_ids": list(members)})

    return {"group_id": group_doc.id, "group_name": group_data["group_name"]}


@router.post("/register-device-token")
def register_device_token(req: RegisterDeviceTokenRequest):
    """บันทึก FCM token ของมือถือแต่ละคน เพื่อใช้ส่ง push notification ภายหลัง"""
    db.collection("users").document(req.user_id).set(
        {"fcm_token": req.fcm_token}, merge=True
    )
    return {"status": "ok"}
