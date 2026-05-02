from fastapi import APIRouter, Depends, Query
from app.api.v1.deps import get_token
from app.services.wall import WallService
from app.schemas.wall import PostCreate, PostUpdate
from app.core.exceptions import VKAPIError, raise_http_from_vk_error

router = APIRouter(prefix="/wall", tags=["wall"])


@router.get("/")
async def get_posts(
    owner_id: int,
    count: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    filter: str = Query("all"),
    token: str = Depends(get_token),
):
    try:
        return await WallService(token).get_posts(owner_id, count, offset, filter)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/")
async def create_post(body: PostCreate, token: str = Depends(get_token)):
    try:
        return await WallService(token).post(**body.model_dump(exclude_none=True))
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.patch("/{post_id}")
async def update_post(post_id: int, body: PostUpdate, token: str = Depends(get_token)):
    try:
        kwargs = body.model_dump(exclude_none=True)
        return await WallService(token).edit_post(body.owner_id, post_id, **kwargs)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.delete("/{post_id}")
async def delete_post(post_id: int, owner_id: int = Query(...), token: str = Depends(get_token)):
    try:
        return await WallService(token).delete_post(owner_id, post_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{post_id}/comments")
async def get_comments(
    post_id: int,
    owner_id: int = Query(...),
    count: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    token: str = Depends(get_token),
):
    try:
        return await WallService(token).get_comments(owner_id, post_id, count, offset)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/{post_id}/pin")
async def pin_post(post_id: int, owner_id: int = Query(...), token: str = Depends(get_token)):
    try:
        return await WallService(token).pin_post(owner_id, post_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.delete("/{post_id}/pin")
async def unpin_post(post_id: int, owner_id: int = Query(...), token: str = Depends(get_token)):
    try:
        return await WallService(token).unpin_post(owner_id, post_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)
