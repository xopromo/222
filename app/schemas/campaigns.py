from pydantic import BaseModel, Field
from typing import Optional, Literal


class CampaignCreate(BaseModel):
    name: str
    type: Literal["normal", "vk_apps_managed", "mobile_apps", "promoted_posts"] = "normal"
    day_limit: str = "0"
    lifetime_limit: str = "0"
    start_time: int = 0
    stop_time: int = 0
    client_id:Optional[int] = None


class CampaignUpdate(BaseModel):
    campaign_id: int
    name:Optional[str] = None
    status:Optional[Literal[0, 1, 2]] = None  # 0=stopped, 1=running, 2=deleted
    day_limit:Optional[str] = None
    lifetime_limit:Optional[str] = None
    start_time:Optional[int] = None
    stop_time:Optional[int] = None


class CampaignStatsRequest(BaseModel):
    ids: list[int] = Field(min_length=1)
    period: Literal["day", "month", "overall"] = "day"
    date_from: str = "0"
    date_to: str = "0"
