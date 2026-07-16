"""
firebase_config.py
-------------------
เชื่อม Firebase Admin SDK สำหรับ:
- Firestore: เก็บข้อมูล user, family group, alert log
- Cloud Messaging (FCM): ส่ง push notification ไปแอปมือถือญาติ

วิธีตั้งค่า:
1. ไปที่ Firebase Console -> Project Settings -> Service Accounts
2. กด "Generate new private key" จะได้ไฟล์ json
3. เซฟไว้ที่ backend/serviceAccountKey.json (อย่า commit เข้า git!)
"""

import firebase_admin
from firebase_admin import credentials, firestore, messaging

_cred = credentials.Certificate("serviceAccountKey.json")
firebase_app = firebase_admin.initialize_app(_cred)

db = firestore.client()


def send_push_to_tokens(tokens: list[str], title: str, body: str, data: dict | None = None):
    """ส่ง push notification ไปหลายเครื่องพร้อมกัน (สมาชิกในกลุ่มครอบครัว)"""
    if not tokens:
        return None

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in (data or {}).items()},
        tokens=tokens,
        android=messaging.AndroidConfig(priority="high"),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(aps=messaging.Aps(sound="default"))
        ),
    )
    return messaging.send_multicast(message)
