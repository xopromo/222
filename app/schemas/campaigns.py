from pydantic import BaseModel, Field
from typing import Literal


class CampaignCreate(BaseModel):
    name: str
    type: Literal["normal", "vk_apps_managed", "mobile_apps", "promoted_posts"] = "normal"
    day_limit: str = "0"
    lifetime_limit: str = "0"
    start_time: int = 0
    stop_time: int = 0
    client_id: int | None = None


class CampaignUpdate(BaseModel):
    campaign_id: int
    name: str | None = None
    status: Literal[0, 1, 2] | None = None  # 0=stopped, 1=running, 2=deleted
    day_limit: str | None = None
    lifetime_limit: str | None = None
    start_time: int | None = None
    stop_time: int | None = None


class CampaignStatsRequest(BaseModel):
    ids: list[int] = Field(min_length=1)
    period: Literal["day", "month", "overall"] = "day"
    date_from: str = "0"
    date_to: str = "0"
