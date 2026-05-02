import logging
from typing import Any
from app.services.vk_client import VKApiClient

logger = logging.getLogger(__name__)


class AdsAccountsService:
    """VK Ads accounts management via VK API (ads.* methods)"""

    def __init__(self, access_token: str):
        self._client = VKApiClient(access_token)

    async def get_accounts(self) -> list[dict]:
        return await self._client.call("ads.getAccounts")

    async def get_clients(self, account_id: int) -> list[dict]:
        return await self._client.call("ads.getClients", account_id=account_id)

    async def create_client(self, account_id: int, name: str, day_limit: str = "0", month_limit: str = "0") -> list[dict]:
        data = [{"name": name, "day_limit": day_limit, "month_limit": month_limit}]
        import json
        return await self._client.call("ads.createClients", account_id=account_id, data=json.dumps(data))

    async def update_client(self, account_id: int, client_id: int, **kwargs: Any) -> list[dict]:
        import json
        data = [{"client_id": client_id, **kwargs}]
        return await self._client.call("ads.updateClients", account_id=account_id, data=json.dumps(data))

    async def delete_clients(self, account_id: int, ids: list[int]) -> int:
        return await self._client.call(
            "ads.deleteClients",
            account_id=account_id,
            ids=",".join(str(i) for i in ids),
        )

    async def get_budget(self, account_id: int) -> str:
        return await self._client.call("ads.getBudget", account_id=account_id)

    async def get_office_users(self, account_id: int) -> list[dict]:
        return await self._client.call("ads.getOfficeUsers", account_id=account_id)
