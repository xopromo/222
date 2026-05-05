import json
import logging
from typing import Optional, Any
from app.services.vk_client import VKApiClient

logger = logging.getLogger(__name__)


class AdsService:
    """VK Ads ad units management"""

    def __init__(self, access_token: str):
        self._client = VKApiClient(access_token)

    async def get_ads(
        self,
        account_id: int,
        campaign_ids:Optional[list[int]] = None,
        ad_ids:Optional[list[int]] = None,
        client_id:Optional[int] = None,
        include_deleted: bool = False,
        only_deleted: bool = False,
    ) -> list[dict]:
        params: dict[str, Any] = {"account_id": account_id}
        if campaign_ids:
            params["campaign_ids"] = json.dumps(campaign_ids)
        if ad_ids:
            params["ad_ids"] = json.dumps(ad_ids)
        if client_id:
            params["client_id"] = client_id
        if include_deleted:
            params["include_deleted"] = 1
        if only_deleted:
            params["only_deleted"] = 1
        return await self._client.call("ads.getAds", **params)

    async def create_ads(self, account_id: int, ads: list[dict]) -> list[dict]:
        return await self._client.call(
            "ads.createAds",
            account_id=account_id,
            data=json.dumps(ads),
        )

    async def update_ads(self, account_id: int, ads: list[dict]) -> list[dict]:
        return await self._client.call(
            "ads.updateAds",
            account_id=account_id,
            data=json.dumps(ads),
        )

    async def delete_ads(self, account_id: int, ad_ids: list[int]) -> int:
        return await self._client.call(
            "ads.deleteAds",
            account_id=account_id,
            ids=json.dumps(ad_ids),
        )

    async def get_ads_layout(self, account_id: int, ad_ids: list[int], client_id:Optional[int] = None) -> list[dict]:
        params: dict[str, Any] = {
            "account_id": account_id,
            "ad_ids": json.dumps(ad_ids),
        }
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.getAdsLayout", **params)

    async def get_ad_targeting(self, account_id: int, ad_ids: list[int], client_id:Optional[int] = None) -> list[dict]:
        params: dict[str, Any] = {
            "account_id": account_id,
            "ad_ids": json.dumps(ad_ids),
        }
        if client_id:
            params["client_id"] = client_id
        return await self._client.call("ads.getAdsTargeting", **params)

    async def get_ad_stats(
        self,
        account_id: int,
        ids: list[int],
        period: str = "day",
        date_from: str = "0",
        date_to: str = "0",
    ) -> list[dict]:
        return await self._client.call(
            "ads.getStatistics",
            account_id=account_id,
            ids_type="ad",
            ids=",".join(str(i) for i in ids),
            period=period,
            date_from=date_from,
            date_to=date_to,
        )
