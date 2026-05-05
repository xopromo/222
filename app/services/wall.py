import logging
from typing import Optional, Any
from app.services.vk_client import VKApiClient

logger = logging.getLogger(__name__)


class WallService:
    """VK Wall API — posts, reposts, likes"""

    def __init__(self, access_token: str):
        self._client = VKApiClient(access_token)

    async def get_posts(self, owner_id: int, count: int = 20, offset: int = 0, filter_: str = "all") -> dict:
        return await self._client.call(
            "wall.get",
            owner_id=owner_id,
            count=count,
            offset=offset,
            filter=filter_,
            extended=1,
        )

    async def post(
        self,
        owner_id:Optional[int] = None,
        message: str = "",
        attachments: str = "",
        from_group: int = 0,
        publish_date:Optional[int] = None,
        **kwargs: Any,
    ) -> dict:
        params: dict[str, Any] = {"message": message, "from_group": from_group}
        if owner_id:
            params["owner_id"] = owner_id
        if attachments:
            params["attachments"] = attachments
        if publish_date:
            params["publish_date"] = publish_date
        params.update(kwargs)
        return await self._client.call("wall.post", **params)

    async def edit_post(self, owner_id: int, post_id: int, **kwargs: Any) -> dict:
        return await self._client.call("wall.edit", owner_id=owner_id, post_id=post_id, **kwargs)

    async def delete_post(self, owner_id: int, post_id: int) -> int:
        return await self._client.call("wall.delete", owner_id=owner_id, post_id=post_id)

    async def get_by_id(self, posts: list[str]) -> list[dict]:
        return await self._client.call("wall.getById", posts=",".join(posts), extended=1)

    async def get_comments(self, owner_id: int, post_id: int, count: int = 20, offset: int = 0) -> dict:
        return await self._client.call(
            "wall.getComments",
            owner_id=owner_id,
            post_id=post_id,
            count=count,
            offset=offset,
            extended=1,
        )

    async def pin_post(self, owner_id: int, post_id: int) -> int:
        return await self._client.call("wall.pin", owner_id=owner_id, post_id=post_id)

    async def unpin_post(self, owner_id: int, post_id: int) -> int:
        return await self._client.call("wall.unpin", owner_id=owner_id, post_id=post_id)
