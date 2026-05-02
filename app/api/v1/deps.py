from fastapi import Header, HTTPException, status


async def get_token(x_vk_token: str = Header(..., description="VK user access token")) -> str:
    if not x_vk_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="VK access token required")
    return x_vk_token
