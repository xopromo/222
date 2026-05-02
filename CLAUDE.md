# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Model Usage

**Always use `model: "haiku"` when spawning Agent tool calls for research, web search, or information gathering tasks.** Only use Sonnet/Opus agents for complex code generation or analysis tasks.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run the server (dev)
uvicorn app.main:app --reload

# Run tests
pytest

# Run single test
pytest tests/test_health.py::test_health -v

# Lint
ruff check .

# Type check
mypy app/

# Docker
docker-compose up --build
```

## Architecture

**FastAPI service** that proxies VK API calls and (in future) caches data locally.

### Request flow

```
Client → X-VK-Token header → API endpoint → Service layer → VK API
```

The VK user access token is passed per-request via `X-VK-Token` header (`app/api/v1/deps.py`). No token storage yet — planned for future multi-user support.

### Layer separation

- `app/core/` — config (`Settings` via pydantic-settings), exceptions, logging
- `app/services/` — all VK API communication. Two HTTP clients:
  - `VKApiClient` (`services/vk_client.py`) — for `api.vk.com/method/ads.*` (legacy ads API)
  - `VKAdsApiClient` (`services/vk_client.py`) — for `ads.vk.com/api/v2` (new VK Реклама API)
- `app/schemas/` — Pydantic request/response models
- `app/api/v1/` — FastAPI routers, one file per domain area

### VK API distinction

There are two separate VK advertising APIs — do not confuse them:
- **`api.vk.com/method/ads.*`** — legacy VK Ads, accessed via standard VK OAuth token, rate-limited per token (error codes 6, 9, 601)
- **`ads.vk.com/api/v2`** — new VK Реклама, requires manual access via `ads_api@vk.team`, returns `X-RateLimit-*` headers, HTTP 429 on limit exceeded

Current services (`ads_accounts`, `campaigns`, `ads`, `targeting`) use the legacy API via `VKApiClient`.

### Error handling

`VKAPIError` and `VKAdsAPIError` are raised in service layer and caught either by global exception handlers in `app/main.py` or by `raise_http_from_vk_error()` in routers. Key VK error codes: 5=invalid token, 601=daily quota exceeded.

## Planned architecture (discussed, not yet implemented)

- PostgreSQL replacing SQLite; unit of sync is **ad account** (not user) — multiple users share one account's data
- Token pool per account: pick token with lowest recent usage, read remaining quota from `X-RateLimit-Hourly-Remaining`
- Celery + Redis for background sync (campaigns every 10 min, statistics every hour)
- JWT auth layer; `user_accounts` many-to-many table
- Token auto-refresh before 24h expiry
