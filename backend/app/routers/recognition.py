from fastapi import APIRouter

from app.config import settings
from app.services.recognition import ProviderStatus, UnavailableRecognitionProvider

router = APIRouter(prefix="/recognition", tags=["recognition"])
provider = UnavailableRecognitionProvider(
    configured=bool(settings.recognition_endpoint_url)
)


@router.get("/status", response_model=ProviderStatus)
async def recognition_status():
    return await provider.health()
