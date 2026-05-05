from __future__ import annotations

from pydantic import BaseModel


class AccountOut(BaseModel):
    account_id: int
    account_name: str
    account_type: str
    account_status: int
    access_role: str


class ClientCreate(BaseModel):
    name: str
    day_limit: str = "0"
    month_limit: str = "0"


class ClientUpdate(BaseModel):
    name: str | None = None
    day_limit: str | None = None
    month_limit: str | None = None
