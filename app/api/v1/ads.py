from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from app.api.v1.deps import get_token
from app.services.ads import AdsService
from app.schemas.ads import AdCreate, AdUpdate, AdStatsRequest
from app.core.exceptions import VKAPIError, raise_http_from_vk_error

router = APIRouter(prefix="/accounts/{account_id}/ads", tags=["ads"])


@router.get("/")
async def list_ads(
    account_id: int,
    campaign_ids: str | None = Query(None, description="Comma-separated campaign IDs"),
    include_deleted: bool = Query(False),
    token: str = Depends(get_token),
):
    try:
        campaign_id_list = [int(i) for i in campaign_ids.split(",")] if campaign_ids else None
        return await AdsService(token).get_ads(
            account_id,
            campaign_ids=campaign_id_list,
            include_deleted=include_deleted,
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/")
async def create_ad(account_id: int, body: AdCreate, token: str = Depends(get_token)):
    try:
        return await AdsService(token).create_ads(account_id, [body.model_dump(exclude_none=True)])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.patch("/{ad_id}")
async def update_ad(account_id: int, ad_id: int, body: AdUpdate, token: str = Depends(get_token)):
    try:
        data = body.model_dump(exclude_none=True)
        data["ad_id"] = ad_id
        return await AdsService(token).update_ads(account_id, [data])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.delete("/{ad_id}")
async def delete_ad(account_id: int, ad_id: int, token: str = Depends(get_token)):
    try:
        return await AdsService(token).delete_ads(account_id, [ad_id])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{ad_id}/layout")
async def get_ad_layout(account_id: int, ad_id: int, token: str = Depends(get_token)):
    try:
        return await AdsService(token).get_ads_layout(account_id, [ad_id])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{ad_id}/targeting")
async def get_ad_targeting(account_id: int, ad_id: int, token: str = Depends(get_token)):
    try:
        return await AdsService(token).get_ad_targeting(account_id, [ad_id])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/stats")
async def get_stats(account_id: int, body: AdStatsRequest, token: str = Depends(get_token)):
    try:
        return await AdsService(token).get_ad_stats(
            account_id, body.ids, body.period, body.date_from, body.date_to
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)
