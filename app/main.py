from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.exceptions import VKAPIError, VKAdsAPIError
from fastapi.responses import JSONResponse
from fastapi import Request


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(VKAPIError)
async def vk_api_error_handler(request: Request, exc: VKAPIError):
    return JSONResponse(
        status_code=502,
        content={"error_code": exc.error_code, "detail": exc.error_msg},
    )


@app.exception_handler(VKAdsAPIError)
async def vk_ads_error_handler(request: Request, exc: VKAdsAPIError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.app_version}
