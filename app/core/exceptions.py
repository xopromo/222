from __future__ import annotations

from fastapi import HTTPException, status


class VKAPIError(Exception):
    def __init__(self, error_code: int, error_msg: str, request_params: list | None = None):
        self.error_code = error_code
        self.error_msg = error_msg
        self.request_params = request_params or []
        super().__init__(f"VK API Error {error_code}: {error_msg}")


class VKAdsAPIError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"VK Ads API Error {status_code}: {message}")


class TokenNotFoundError(Exception):
    pass


class AccountNotFoundError(Exception):
    pass


def raise_http_from_vk_error(exc: VKAPIError) -> None:
    # Common VK API error codes
    error_map = {
        5: status.HTTP_401_UNAUTHORIZED,
        7: status.HTTP_403_FORBIDDEN,
        15: status.HTTP_403_FORBIDDEN,
        100: status.HTTP_422_UNPROCESSABLE_ENTITY,
        600: status.HTTP_403_FORBIDDEN,
        603: status.HTTP_403_FORBIDDEN,
    }
    http_status = error_map.get(exc.error_code, status.HTTP_502_BAD_GATEWAY)
    raise HTTPException(status_code=http_status, detail=exc.error_msg)
