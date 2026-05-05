from fastapi import APIRouter, Cookie, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from app.services.auth import VKOAuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(scope: str = "ads,offline,wall,groups,stats"):
    svc = VKOAuthService()
    url, code_verifier = svc.get_auth_url(scope=scope)
    response = RedirectResponse(url=url)
    response.set_cookie("pkce_verifier", code_verifier, httponly=True, samesite="lax", max_age=600)
    return response


@router.get("/callback")
async def callback(
    code: str,
    device_id: str = "",
    state: str = "",
    pkce_verifier: str = Cookie(default=""),
):
    if not pkce_verifier:
        raise HTTPException(status_code=400, detail="Missing PKCE verifier cookie. Start auth from /api/v1/auth/login")
    svc = VKOAuthService()
    token_data = await svc.exchange_code(code, code_verifier=pkce_verifier, device_id=device_id, state=state)
    response = JSONResponse(content=token_data)
    response.delete_cookie("pkce_verifier")
    return response
