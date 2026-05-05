from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from app.services.auth import VKOAuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(scope: str = "ads offline wall groups stats"):
    svc = VKOAuthService()
    url = svc.get_auth_url(scope=scope)
    return RedirectResponse(url=url)


@router.get("/callback")
async def callback(code: str, state: str | None = None, device_id: str | None = None):
    svc = VKOAuthService()
    token_data = await svc.exchange_code(code, state=state)
    return token_data
