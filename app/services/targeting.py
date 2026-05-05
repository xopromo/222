import logging
from typing import Optional, Any
from app.services.vk_client import VKApiClient

logger = logging.getLogger(__name__)


class TargetingService:
    """VK Ads targeting and audience tools"""

    def __init__(self, access_token: str):
        self._client = VKApiClient(access_token)

    async def get_targeting_stats(
        self,
        account_id: int,
        criteria: dict,
        ad_format: int = 9,
        ad_platform: str = "all",
        client_id:Optional[int] = None,
        link_url: str = "",
    ) -> dict:
        params: dict[str, Any] = {
            "account_id": account_id,
            "ad_format": ad_format,
            "ad_platform": ad_platform,
            "link_url": link_url,
            "criteria": criteria,
        }
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.getTargetingStats", **params)

    async def get_suggestions(self, section: str, ids:Optional[list[int]] = None, q:Optional[str] = None) -> list[dict]:
        params: dict[str, Any] = {"section": section}
        if ids:
            params["ids"] = ",".join(str(i) for i in ids)
        if q:
            params["q"] = q
        return await self._client.call("ads.getSuggestions", **params)

    async def get_categories(self, lang: str = "ru") -> dict:
        return await self._client.call("ads.getCategories", lang=lang)

    async def get_retargeting_groups(self, account_id: int, client_id:Optional[int] = None) -> list[dict]:
        params: dict[str, Any] = {"account_id": account_id}
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.getRetargetingGroups", **params)

    async def create_retargeting_group(
        self,
        account_id: int,
        name: str,
        lifetime: int = 30,
        client_id:Optional[int] = None,
    ) -> dict:
        params: dict[str, Any] = {
            "account_id": account_id,
            "name": name,
            "lifetime": lifetime,
        }
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.createRetargetingGroup", **params)

    async def delete_retargeting_group(self, account_id: int, target_group_id: int, client_id:Optional[int] = None) -> int:
        params: dict[str, Any] = {
            "account_id": account_id,
            "target_group_id": target_group_id,
        }
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.deleteRetargetingGroup", **params)

    async def import_retargeting_contacts(
        self,
        account_id: int,
        target_group_id: int,
        contacts: str,
        client_id:Optional[int] = None,
    ) -> int:
        params: dict[str, Any] = {
            "account_id": account_id,
            "target_group_id": target_group_id,
            "contacts": contacts,
        }
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.importTargetContacts", **params)

    async def get_lookalike_requests(self, account_id: int, client_id:Optional[int] = None) -> dict:
        params: dict[str, Any] = {"account_id": account_id}
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.getLookalikeRequests", **params)

    async def create_lookalike_request(
        self,
        account_id: int,
        source_type: str,
        retargeting_group_id:Optional[int] = None,
        client_id:Optional[int] = None,
    ) -> dict:
        params: dict[str, Any] = {
            "account_id": account_id,
            "source_type": source_type,
        }
        if retargeting_group_id:
            params["retargeting_group_id"] = retargeting_group_id
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.createLookalikeRequest", **params)
