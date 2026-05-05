from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel


class TargetingStatsRequest(BaseModel):
    criteria: dict[str, Any]
    ad_format: int = 9
    ad_platform: str = "all"
    link_url: str = ""
    client_id: int | None = None


class RetargetingGroupCreate(BaseModel):
    name: str
    lifetime: int = 30
    client_id: int | None = None


class LookalikeRequest(BaseModel):
    source_type: str = "retargeting_group"
    retargeting_group_id: int | None = None
    client_id: int | None = None
