from pydantic import BaseModel


class PostCreate(BaseModel):
    owner_id: int | None = None
    message: str = ""
    attachments: str = ""
    from_group: int = 0
    publish_date: int | None = None
    signed: int = 0


class PostUpdate(BaseModel):
    owner_id: int
    post_id: int
    message: str | None = None
    attachments: str | None = None
