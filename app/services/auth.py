import logging
from urllib.parse import urlencode
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class VKOAuthService:
    """VK OAuth 2.0 flow"""

    def __init__(self):
        self._settings = get_settings()

    def get_auth_url(self, scope: str = "ads,offline") -> str:
        params = {
            "client_id": self._settings.vk_client_id,
            "redirect_uri": self._settings.vk_redirect_uri,
            "scope": scope,
            "response_type": "code",
            "v": self._settings.vk_api_version,
        }
        return f"{self._settings.vk_oauth_url}/authorize?{urlencode(params)}"

    async def exchange_code(self, code: str, device_id: str = "", state: str = "") -> dict:
        # VK ID OAuth 2.1 (code_v2) uses POST to id.vk.com/oauth2/auth
        payload = {
            "grant_type": "authorization_code",
            "client_id": self._settings.vk_client_id,
            "client_secret": self._settings.vk_client_secret,
            "redirect_uri": self._settings.vk_redirect_uri,
            "code": code,
            "device_id": device_id,
            "state": state,
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://id.vk.com/oauth2/auth",
                data=payload,
                timeout=15,
            )
            logger.debug("VK token response %s: %s", response.status_code, response.text)
            response.raise_for_status()
            data = response.json()

        if "error" in data:
            raise ValueError(f"OAuth error: {data.get('error_description', data['error'])}")

        return {
            "access_token": data["access_token"],
            "user_id": data.get("user_id"),
            "expires_in": data.get("expires_in", 0),
            "refresh_token": data.get("refresh_token"),
            "id_token": data.get("id_token"),
        }

    async def get_service_token(self) -> str:
        """Get application service token (for server-side calls)"""
        params = {
            "client_id": self._settings.vk_client_id,
            "client_secret": self._settings.vk_client_secret,
            "grant_type": "client_credentials",
            "v": self._settings.vk_api_version,
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
            raise ValueError(f"Service token error: {data.get('error_description', data['error'])}")

        return data["access_token"]
