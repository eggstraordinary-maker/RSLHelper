from fastapi import APIRouter, UploadFile, File, Form, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import uuid
import io
from datetime import timedelta

from app.database import get_db
from app.models import VideoFile
from app.services.storage import client, bucket

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    description: str = Form(""),
    db: Session = Depends(get_db)
):

    contents = await file.read()

    object_name = f"{uuid.uuid4()}_{file.filename}"

    client.put_object(
        bucket,
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

    url = client.presigned_get_object(
        bucket,
        object_name,
        expires=timedelta(hours=2)
    )

    return {"url": url}


@router.get("/stream/{object_name}")
def stream_video(request: Request, object_name: str):
    response = client.get_object(bucket, object_name)

    return StreamingResponse(
        response.stream(32 * 1024),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes"
        }
    )
