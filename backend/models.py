from pydantic import BaseModel
from typing import Optional


class RegisterDeviceTokenRequest(BaseModel):
    user_id: str
    fcm_token: str  # token ของเครื่องมือถือ สำหรับส่ง push notification


class CreateGroupRequest(BaseModel):
    owner_user_id: str
    group_name: str


class JoinGroupRequest(BaseModel):
    user_id: str
    invite_code: str


class FallAlertRequest(BaseModel):
    device_id: str
    timestamp: float
    confidence: float
    snapshot_base64: Optional[str] = None
