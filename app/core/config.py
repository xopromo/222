from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "VK Ads Service"
    app_version: str = "0.1.0"
    debug: bool = False

    # VK OAuth
    vk_client_id: str = ""
    vk_client_secret: str = ""
    vk_redirect_uri: str = "http://localhost:8000/api/v1/auth/callback"

    # VK API
    vk_api_version: str = "5.199"
    vk_ads_api_base_url: str = "https://api.vk.com/method"
    vk_oauth_url: str = "https://oauth.vk.com"

    # VK Ads API (ads.vk.com)
    vk_ads_base_url: str = "https://ads.vk.com/api/v2"

    # Database
    database_url: str = "sqlite+aiosqlite:///./vk_ads.db"

    # Redis (for token cache)
    redis_url: str = "redis://localhost:6379/0"

    # Security
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
