from pydantic import BaseModel, Field
from typing import Literal


class AdCreate(BaseModel):
    campaign_id: int
    ad_format: int  # 1=image, 2=image+text, 4=promoted_posts, 9=adaptive, etc.
    cost_type: Literal[0, 1, 3]  # 0=CPC, 1=CPM, 3=optimized CPM
    cpc: str | None = None
    cpm: str | None = None
    ocpm: str | None = None
    name: str
    link_url: str = ""
    link_domain: str = ""
    title: str = ""
    description: str = ""
    photo_id: str = ""
    video_id: int | None = None


class AdUpdate(BaseModel):
    ad_id: int
    name: str | None = None
    status: Literal[0, 1] | None = None  # 0=stopped, 1=running
    cpc: str | None = None
    cpm: str | None = None
    ocpm: str | None = None


class AdStatsRequest(BaseModel):
    ids: list[int] = Field(min_length=1)
    period: Literal["day", "month", "overall"] = "day"
    date_from: str = "0"
    date_to: str = "0"
