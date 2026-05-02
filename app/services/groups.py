import logging
from typing import Any
from app.services.vk_client import VKApiClient

logger = logging.getLogger(__name__)


class GroupsService:
    """VK Groups / Communities management"""

    def __init__(self, access_token: str):
        self._client = VKApiClient(access_token)

    async def get_by_id(self, group_ids: list[str | int], fields: str = "") -> list[dict]:
        params: dict[str, Any] = {"group_ids": ",".join(str(g) for g in group_ids)}
        if fields:
            params["fields"] = fields
        return await self._client.call("groups.getById", **params)

    async def get_members(self, group_id: int | str, count: int = 1000, offset: int = 0, fields: str = "") -> dict:
        params: dict[str, Any] = {
            "group_id": group_id,
            "count": count,
            "offset": offset,
        }
        if fields:
            params["fields"] = fields
        return await self._client.call("groups.getMembers", **params)

    async def search(self, q: str, count: int = 20, offset: int = 0, type_: str = "") -> dict:
        params: dict[str, Any] = {"q": q, "count": count, "offset": offset}
        if type_:
            params["type"] = type_
        return await self._client.call("groups.search", **params)

    async def get_stats(self, group_id: int, date_from: str = "", date_to: str = "") -> list[dict]:
        params: dict[str, Any] = {"group_id": group_id}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        return await self._client.call("stats.get", group_id=group_id, date_from=date_from, date_to=date_to)

    async def get_user_groups(self, user_id: int | None = None, extended: bool = False, filter_: str = "") -> dict:
        params: dict[str, Any] = {"extended": 1 if extended else 0}
        if user_id:
            params["user_id"] = user_id
        if filter_:
            params["filter"] = filter_
        return await self._client.call("groups.get", **params)

    async def is_member(self, group_id: int | str, user_ids: list[int]) -> list[dict]:
        return await self._client.call(
            "groups.isMember",
            group_id=group_id,
            user_ids=",".join(str(u) for u in user_ids),
            extended=1,
        )
