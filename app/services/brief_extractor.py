import json
import os
from mistralai import Mistral

mistral_key = os.getenv("MISTRAL_API_KEY") or open(os.path.expanduser("~/.mistral_key")).read().strip()
client = Mistral(api_key=mistral_key)


async def extract_brief_data(brief_text: str) -> dict:
    """
    Извлекает структурированные данные из текста брифа используя Mistral API.

    Returns:
        {
            "campaign_name": {"value": str, "confidence": float},
            "budget": {"value": float, "confidence": float},
            ...
        }
    """
    prompt = f"""Analyze the following brief text and extract the following information.
Return ONLY valid JSON, no markdown code blocks.

Brief text:
---
{brief_text}
---

Extract and return this JSON structure (use null for missing fields):
{{
  "campaign_name": {{"value": "...", "confidence": 0.95}},
  "budget_rub": {{"value": 50000, "confidence": 0.95}},
  "start_date": {{"value": "2024-06-01", "confidence": 0.95}},
  "end_date": {{"value": "2024-06-30", "confidence": 0.95}},
  "age_from": {{"value": 18, "confidence": 0.95}},
  "age_to": {{"value": 45, "confidence": 0.95}},
  "message": {{"value": "...", "confidence": 0.85}},
  "cta": {{"value": "...", "confidence": 0.90}}
}}

Guidelines:
- confidence is 0-100 (as decimal, e.g., 0.95 = 95%)
- Extract dates in YYYY-MM-DD format
- Numbers without currency notation
- Be conservative with confidence (lower if uncertain)
- Return ONLY the JSON object, no extra text"""

    try:
        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )

        result_text = response.choices[0].message.content.strip()

        # Парсим JSON
        data = json.loads(result_text)
        return data

    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse Mistral response as JSON: {str(e)}")
    except Exception as e:
        raise Exception(f"Mistral API error: {str(e)}")
