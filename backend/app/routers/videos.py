import io
import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin_user
from app.models import VideoFile
from app.services.storage import storage

router = APIRouter(prefix="/videos", tags=["videos"])
logger = logging.getLogger(__name__)


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
    _current_admin=Depends(get_current_admin_user),
):
    contents = await file.read()

    object_name = f"{uuid.uuid4()}_{file.filename}"

    storage.put_object(
        object_name,
        io.BytesIO(contents),
        length=len(contents),
        content_type=file.content_type
    )

    video = VideoFile(
        filename=file.filename,
        description=description,
        object_name=object_name
    )

    db.add(video)
    db.commit()
    db.refresh(video)

    return video


@router.get("/")
def list_videos(db: Session = Depends(get_db)):
    return db.query(VideoFile).all()


@router.get("/{object_name}")
def get_video(object_name: str):
    try:
        url = storage.presigned_get_object(
            object_name,
            expires=timedelta(hours=2),
        )
    except Exception as exc:
        logger.warning("Video link generation failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=404, detail="Video not found") from None

    return {"url": url}


@router.get("/stream/{object_name}")
def stream_video(request: Request, object_name: str):
    try:
        response = storage.get_object(object_name)
    except Exception as exc:
        logger.warning("Video retrieval failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=404, detail="Video not found") from None

    def stream_chunks():
        try:
            yield from response.stream(32 * 1024)
        finally:
            response.close()
            response.release_conn()

    return StreamingResponse(
        stream_chunks(),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes"
        }
    )
