from fastapi import APIRouter, Depends
from app.api.v1.deps import get_token
from app.services.ads_accounts import AdsAccountsService
from app.schemas.accounts import ClientCreate, ClientUpdate
from app.core.exceptions import VKAPIError, raise_http_from_vk_error

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("/")
async def list_accounts(token: str = Depends(get_token)):
    try:
        return await AdsAccountsService(token).get_accounts()
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{account_id}/budget")
async def get_budget(account_id: int, token: str = Depends(get_token)):
    try:
        return {"budget": await AdsAccountsService(token).get_budget(account_id)}
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{account_id}/clients")
async def list_clients(account_id: int, token: str = Depends(get_token)):
    try:
        return await AdsAccountsService(token).get_clients(account_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.post("/{account_id}/clients")
async def create_client(account_id: int, body: ClientCreate, token: str = Depends(get_token)):
    try:
        return await AdsAccountsService(token).create_client(
            account_id, body.name, body.day_limit, body.month_limit
        )
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.patch("/{account_id}/clients/{client_id}")
async def update_client(account_id: int, client_id: int, body: ClientUpdate, token: str = Depends(get_token)):
    try:
        kwargs = body.model_dump(exclude_none=True)
        return await AdsAccountsService(token).update_client(account_id, client_id, **kwargs)
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.delete("/{account_id}/clients/{client_id}")
async def delete_client(account_id: int, client_id: int, token: str = Depends(get_token)):
    try:
        return await AdsAccountsService(token).delete_clients(account_id, [client_id])
    except VKAPIError as e:
        raise_http_from_vk_error(e)


@router.get("/{account_id}/users")
async def list_office_users(account_id: int, token: str = Depends(get_token)):
    try:
        return await AdsAccountsService(token).get_office_users(account_id)
    except VKAPIError as e:
        raise_http_from_vk_error(e)
