from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.api.v1.deps import get_token
from app.services.groups import GroupsService
from app.core.exceptions import VKAPIError, raise_http_from_vk_error

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("/")
async def get_groups(
    group_ids: str = Query(..., description="Comma-separated group IDs or screen names"),
    fields: str = Query("", description="Extra fields to include"),
    token: str = Depends(get_token),
):
    try:
        ids = [g.strip() for g in group_ids.split(",")]
        return await GroupsService(token).get_by_id(ids, fields=fields)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/search")
async def search_groups(
    q: str = Query(...),
    count: int = Query(20, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    type: str = Query(""),
    token: str = Depends(get_token),
):
    try:
        return await GroupsService(token).search(q, count, offset, type)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/my")
async def get_my_groups(
    user_id:Optional[int] = Query(None),
    extended: bool = Query(False),
    filter: str = Query(""),
    token: str = Depends(get_token),
):
    try:
        return await GroupsService(token).get_user_groups(user_id, extended, filter)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{group_id}/members")
async def get_members(
    group_id: int,
    count: int = Query(1000, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    fields: str = Query(""),
    token: str = Depends(get_token),
):
    try:
        return await GroupsService(token).get_members(group_id, count, offset, fields)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{group_id}/stats")
async def get_stats(
    group_id: int,
    date_from: str = Query(""),
    date_to: str = Query(""),
    token: str = Depends(get_token),
):
    try:
        return await GroupsService(token).get_stats(group_id, date_from, date_to)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{group_id}/is_member")
async def check_membership(
    group_id: int,
    user_ids: str = Query(..., description="Comma-separated user IDs"),
    token: str = Depends(get_token),
):
    try:
        ids = [int(u.strip()) for u in user_ids.split(",")]
        return await GroupsService(token).is_member(group_id, ids)
    except VKAPIError as e:
        raise_http_from_vk_error(e)
