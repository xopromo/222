import logging
import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class VKOAuthService:
    """VK OAuth 2.0 flow for Web apps (oauth.vk.com)"""

    def __init__(self):
        self._settings = get_settings()

    def get_auth_url(self, scope: str = "ads,offline,wall,groups,stats") -> str:
        state = secrets.token_urlsafe(16)
        params = {
            "client_id": self._settings.vk_client_id,
            "redirect_uri": self._settings.vk_redirect_uri,
            "scope": scope,
            "response_type": "code",
            "state": state,
            "v": self._settings.vk_api_version,
        }
        return f"{self._settings.vk_oauth_url}/authorize?{urlencode(params)}"

    async def exchange_code(self, code: str, state: Optional[str] = None) -> dict:
        params = {
            "client_id": self._settings.vk_client_id,
            "client_secret": self._settings.vk_client_secret,
            "redirect_uri": self._settings.vk_redirect_uri,
            "code": code,
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self._settings.vk_oauth_url}/access_token",
                params=params,
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

        if "error" in data:
            raise ValueError(f"OAuth error: {data.get('error_description', data['error'])}")

        return {
            "access_token": data["access_token"],
            "user_id": data["user_id"],
            "expires_in": data.get("expires_in", 0),
        }
