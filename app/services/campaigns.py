import json
import logging
from typing import Optional, Any
from app.services.vk_client import VKApiClient

logger = logging.getLogger(__name__)


class CampaignsService:
    """VK Ads campaigns management"""

    def __init__(self, access_token: str):
        self._client = VKApiClient(access_token)

    async def get_campaigns(
        self,
        account_id: int,
        client_id:Optional[int] = None,
        campaign_ids:Optional[list[int]] = None,
        include_deleted: bool = False,
    ) -> list[dict]:
        params: dict[str, Any] = {"account_id": account_id}
        if client_id:
            params["client_id"] = client_id
        if campaign_ids:
            params["campaign_ids"] = json.dumps(campaign_ids)
        if include_deleted:
            params["include_deleted"] = 1
        return await self._client.call("ads.getCampaigns", **params)

    async def create_campaigns(self, account_id: int, campaigns: list[dict]) -> list[dict]:
        return await self._client.call(
            "ads.createCampaigns",
            account_id=account_id,
            data=json.dumps(campaigns),
        )

    async def update_campaigns(self, account_id: int, campaigns: list[dict]) -> list[dict]:
        return await self._client.call(
            "ads.updateCampaigns",
            account_id=account_id,
            data=json.dumps(campaigns),
        )

    async def delete_campaigns(self, account_id: int, campaign_ids: list[int]) -> int:
        return await self._client.call(
            "ads.deleteCampaigns",
            account_id=account_id,
            ids=json.dumps(campaign_ids),
        )

    async def get_campaign_stats(
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
            ids_type="campaign",
            ids=",".join(str(i) for i in ids),
            period=period,
            date_from=date_from,
            date_to=date_to,
        )
