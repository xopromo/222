import base64
import hashlib
import logging
import os
import secrets
from urllib.parse import urlencode
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE S256."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


class VKOAuthService:
    """VK OAuth 2.0 / VK ID OAuth 2.1 flow"""

    def __init__(self):
        self._settings = get_settings()

    def get_auth_url(self, scope: str = "ads,offline") -> tuple[str, str]:
        """Return (auth_url, code_verifier). Caller must persist code_verifier."""
        code_verifier, code_challenge = _generate_pkce_pair()
        params = {
            "client_id": self._settings.vk_client_id,
            "redirect_uri": self._settings.vk_redirect_uri,
            "scope": scope,
            "response_type": "code",
            "code_challenge": code_challenge,
            "code_challenge_method": "s256",
            "state": secrets.token_urlsafe(16),
        }
        url = f"https://id.vk.com/authorize?{urlencode(params)}"
        return url, code_verifier

    async def exchange_code(
        self, code: str, code_verifier: str, device_id: str = "", state: str = ""
    ) -> dict:
        payload = {
            "grant_type": "authorization_code",
            "client_id": self._settings.vk_client_id,
            "code": code,
            "code_verifier": code_verifier,
            "redirect_uri": self._settings.vk_redirect_uri,
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
            if not response.is_success:
                logger.error("VK token error body: %s", response.text)
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
