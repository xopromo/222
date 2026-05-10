from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.brief_extractor import extract_brief_data

router = APIRouter(prefix="/brief", tags=["brief"])


class BriefExtractRequest(BaseModel):
    text: str


class ExtractedField(BaseModel):
    value: str | int | float | None
    confidence: float


class BriefExtractResponse(BaseModel):
    campaign_name: ExtractedField | None = None
    budget_rub: ExtractedField | None = None
    start_date: ExtractedField | None = None
    end_date: ExtractedField | None = None
    age_from: ExtractedField | None = None
    age_to: ExtractedField | None = None
    message: ExtractedField | None = None
    cta: ExtractedField | None = None


@router.post("/extract", response_model=BriefExtractResponse)
async def extract_brief(request: BriefExtractRequest) -> BriefExtractResponse:
    """
    Извлекает структурированные данные из текста брифа используя Mistral AI.
    """
    if not request.text or len(request.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Brief text is too short")

    try:
        data = await extract_brief_data(request.text)

        response_data = {}
        for field_name in BriefExtractResponse.model_fields.keys():
            if field_name in data and data[field_name]:
                field_data = data[field_name]
                response_data[field_name] = ExtractedField(
                    value=field_data.get("value"),
                    confidence=field_data.get("confidence", 0.5),
                )

        return BriefExtractResponse(**response_data)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
