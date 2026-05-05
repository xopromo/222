from typing import Optional
from pydantic import BaseModel


class PostCreate(BaseModel):
    owner_id:Optional[int] = None
    message: str = ""
    attachments: str = ""
    from_group: int = 0
    publish_date:Optional[int] = None
    signed: int = 0


class PostUpdate(BaseModel):
    owner_id: int
    post_id: int
    message:Optional[str] = None
    attachments:Optional[str] = None
