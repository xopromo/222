from fastapi import APIRouter, Depends, Query
from app.api.v1.deps import get_token
from app.services.campaigns import CampaignsService
from app.schemas.campaigns import CampaignCreate, CampaignUpdate, CampaignStatsRequest
from app.core.exceptions import VKAPIError, raise_http_from_vk_error

router = APIRouter(prefix="/accounts/{account_id}/campaigns", tags=["campaigns"])


@router.get("/")
async def list_campaigns(
    account_id: int,
    client_id: int | None = Query(None),
    include_deleted: bool = Query(False),
    token: str = Depends(get_token),
):
    try:
        return await CampaignsService(token).get_campaigns(
            account_id, client_id=client_id, include_deleted=include_deleted
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/")
async def create_campaign(account_id: int, body: CampaignCreate, token: str = Depends(get_token)):
    try:
        data = body.model_dump(exclude_none=True)
        client_id = data.pop("client_id", None)
        campaigns_data = [data]
        svc = CampaignsService(token)
        if client_id:
            # pass client_id inside campaign dict per VK API spec
            campaigns_data[0]["client_id"] = client_id
        return await svc.create_campaigns(account_id, campaigns_data)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.patch("/{campaign_id}")
async def update_campaign(account_id: int, campaign_id: int, body: CampaignUpdate, token: str = Depends(get_token)):
    try:
        data = body.model_dump(exclude_none=True)
        data["campaign_id"] = campaign_id
        return await CampaignsService(token).update_campaigns(account_id, [data])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.delete("/{campaign_id}")
async def delete_campaign(account_id: int, campaign_id: int, token: str = Depends(get_token)):
    try:
        return await CampaignsService(token).delete_campaigns(account_id, [campaign_id])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/stats")
async def get_stats(account_id: int, body: CampaignStatsRequest, token: str = Depends(get_token)):
    try:
        return await CampaignsService(token).get_campaign_stats(
            account_id, body.ids, body.period, body.date_from, body.date_to
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)
