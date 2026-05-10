from fastapi import APIRouter
from app.api.v1 import auth, accounts, campaigns, ads, targeting, wall, groups

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(accounts.router)
api_router.include_router(campaigns.router)
api_router.include_router(ads.router)
api_router.include_router(targeting.router)
api_router.include_router(wall.router)
api_router.include_router(groups.router)
