from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from app.services.auth import VKOAuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(scope: str = "ads,offline,wall,groups,stats"):
    svc = VKOAuthService()
    url = svc.get_auth_url(scope=scope)
    return RedirectResponse(url=url)


@router.get("/callback")
async def callback(code: str):
    svc = VKOAuthService()
    token_data = await svc.exchange_code(code)
    # In a real app: persist token to DB / session, then redirect to frontend
    return token_data
