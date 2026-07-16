from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import family_group, alerts, devices

app = FastAPI(title="Elderly Fall Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ตอนขึ้น production ควรจำกัด origin ให้แคบลง
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(family_group.router)
app.include_router(alerts.router)
app.include_router(devices.router)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "elderly-fall-detection-backend"}


# รันด้วยคำสั่ง: uvicorn main:app --reload --port 8000
