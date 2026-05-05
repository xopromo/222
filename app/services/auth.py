import hashlib
import base64
import logging
import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# In-memory store: state -> code_verifier (MVP, single-user)
_pkce_store: dict[str, str] = {}


def _generate_pkce() -> tuple[str, str]:
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


class VKOAuthService:
    """VK ID OAuth 2.1 (PKCE) flow"""

    VK_ID_AUTH_URL = "https://id.vk.com/oauth2/auth"
    VK_ID_TOKEN_URL = "https://id.vk.com/oauth2/token"

    def __init__(self):
        self._settings = get_settings()

    def get_auth_url(self, scope: str = "ads offline wall groups stats") -> str:
        code_verifier, code_challenge = _generate_pkce()
        state = secrets.token_urlsafe(16)
        _pkce_store[state] = code_verifier

        params = {
            "client_id": self._settings.vk_client_id,
            "redirect_uri": self._settings.vk_redirect_uri,
            "scope": scope,
            "response_type": "code",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{self.VK_ID_AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, state: Optional[str] = None) -> dict:
        code_verifier = _pkce_store.pop(state, None) if state else None

        data: dict = {
            "client_id": self._settings.vk_client_id,
            "client_secret": self._settings.vk_client_secret,
            "redirect_uri": self._settings.vk_redirect_uri,
            "code": code,
            "grant_type": "authorization_code",
        }
        if code_verifier:
            data["code_verifier"] = code_verifier

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.VK_ID_TOKEN_URL,
                data=data,
                timeout=15,
            )
            response.raise_for_status()
            result = response.json()

        if "error" in result:
            raise ValueError(f"OAuth error: {result.get('error_description', result['error'])}")

        return {
            "access_token": result["access_token"],
            "user_id": result.get("user_id"),
            "expires_in": result.get("expires_in", 0),
            "id_token": result.get("id_token"),
        }
