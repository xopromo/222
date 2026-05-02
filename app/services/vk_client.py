import logging
from typing import Any
import httpx
from app.core.config import get_settings
from app.core.exceptions import VKAPIError, VKAdsAPIError

logger = logging.getLogger(__name__)


class VKApiClient:
    """Client for VK API (api.vk.com/method)"""

    def __init__(self, access_token: str):
        self._token = access_token
        self._settings = get_settings()
        self._base_url = self._settings.vk_ads_api_base_url
        self._api_version = self._settings.vk_api_version

    async def call(self, method: str, **params: Any) -> Any:
        params.setdefault("v", self._api_version)
        params["access_token"] = self._token

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self._base_url}/{method}",
                data=params,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

        if "error" in data:
            err = data["error"]
            raise VKAPIError(
                error_code=err.get("error_code", 0),
                error_msg=err.get("error_msg", "Unknown error"),
                request_params=err.get("request_params", []),
            )

        return data.get("response")


class VKAdsApiClient:
    """Client for VK Ads API (ads.vk.com/api/v2)"""

    def __init__(self, access_token: str):
        self._token = access_token
        self._settings = get_settings()
        self._base_url = self._settings.vk_ads_base_url

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    async def get(self, path: str, **params: Any) -> Any:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self._base_url}{path}",
                headers=self._headers(),
                params=params,
                timeout=30,
            )
        return self._handle_response(response)

    async def post(self, path: str, json: Any = None) -> Any:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self._base_url}{path}",
                headers=self._headers(),
                json=json,
                timeout=30,
            )
        return self._handle_response(response)

    async def patch(self, path: str, json: Any = None) -> Any:
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self._base_url}{path}",
                headers=self._headers(),
                json=json,
                timeout=30,
            )
        return self._handle_response(response)

    async def delete(self, path: str) -> Any:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self._base_url}{path}",
                headers=self._headers(),
                timeout=30,
            )
        return self._handle_response(response)

    def _handle_response(self, response: httpx.Response) -> Any:
        if response.status_code >= 400:
            try:
                detail = response.json()
            except Exception:
                detail = response.text
            raise VKAdsAPIError(status_code=response.status_code, message=str(detail))
        return response.json()
