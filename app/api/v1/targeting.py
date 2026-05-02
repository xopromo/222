from fastapi import APIRouter, Depends, Query
from app.api.v1.deps import get_token
from app.services.targeting import TargetingService
from app.schemas.targeting import TargetingStatsRequest, RetargetingGroupCreate, LookalikeRequest
from app.core.exceptions import VKAPIError, raise_http_from_vk_error

router = APIRouter(prefix="/accounts/{account_id}/targeting", tags=["targeting"])


@router.post("/stats")
async def get_targeting_stats(account_id: int, body: TargetingStatsRequest, token: str = Depends(get_token)):
    try:
        return await TargetingService(token).get_targeting_stats(
            account_id,
            body.criteria,
            ad_format=body.ad_format,
            ad_platform=body.ad_platform,
            client_id=body.client_id,
            link_url=body.link_url,
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/retargeting")
async def list_retargeting_groups(
    account_id: int,
    client_id: int | None = Query(None),
    token: str = Depends(get_token),
):
    try:
        return await TargetingService(token).get_retargeting_groups(account_id, client_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/retargeting")
async def create_retargeting_group(
    account_id: int, body: RetargetingGroupCreate, token: str = Depends(get_token)
):
    try:
        return await TargetingService(token).create_retargeting_group(
            account_id, body.name, body.lifetime, body.client_id
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.delete("/retargeting/{group_id}")
async def delete_retargeting_group(
    account_id: int,
    group_id: int,
    client_id: int | None = Query(None),
    token: str = Depends(get_token),
):
    try:
        return await TargetingService(token).delete_retargeting_group(account_id, group_id, client_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/retargeting/{group_id}/contacts")
async def import_contacts(
    account_id: int,
    group_id: int,
    contacts: str,
    client_id: int | None = Query(None),
    token: str = Depends(get_token),
):
    try:
        return await TargetingService(token).import_retargeting_contacts(
            account_id, group_id, contacts, client_id
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/lookalike")
async def list_lookalike(account_id: int, client_id: int | None = Query(None), token: str = Depends(get_token)):
    try:
        return await TargetingService(token).get_lookalike_requests(account_id, client_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/lookalike")
async def create_lookalike(account_id: int, body: LookalikeRequest, token: str = Depends(get_token)):
    try:
        return await TargetingService(token).create_lookalike_request(
            account_id, body.source_type, body.retargeting_group_id, body.client_id
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/categories")
async def get_categories(token: str = Depends(get_token)):
    try:
        return await TargetingService(token).get_categories()
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/suggestions/{section}")
async def get_suggestions(
    account_id: int,
    section: str,
    q: str | None = Query(None),
    token: str = Depends(get_token),
):
    try:
        return await TargetingService(token).get_suggestions(section, q=q)
    except VKAPIError as e:
        raise_http_from_vk_error(e)
