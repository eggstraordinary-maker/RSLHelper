"""Admin-only transport for catalog drafts, versions and publication."""

from contextlib import contextmanager
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog_schemas import (
    CatalogConflictResponse, CatalogCreate, CatalogEdit, CatalogGestureResponse, CatalogRevisionResponse,
    CatalogTransition,
)
from app.database import get_async_db
from app.dependencies import get_current_admin_user
from app.modules.catalog import public as catalog
from app.modules.catalog.errors import CatalogConflictError, MediaNotFoundError, MediaTooLargeError
from app.modules.catalog.errors import MediaUnavailableError, UnsupportedMediaError
from app.schemas import UserResponse
from .videos import media_response

Admin = Annotated[UserResponse, Depends(get_current_admin_user)]
Database = Annotated[AsyncSession, Depends(get_async_db)]

router = APIRouter(
    prefix="/admin/catalog", tags=["admin catalog"],
    responses={
        401: {"description": "Требуется вход"},
        403: {"description": "Требуется роль администратора"},
        404: {"description": "Жест или видео отсутствует"},
        409: {"description": "Конфликт версии или условий модерации", "model": CatalogConflictResponse},
        503: {"description": "Каталог или хранилище временно недоступно"},
    },
)


@contextmanager
def _catalog_errors():
    try:
        yield
    except CatalogConflictError as error:
        raise HTTPException(409, detail={
            "code": error.code, "message": str(error), "missing": list(error.missing),
        }) from None
    except MediaNotFoundError as error:
        raise HTTPException(404, detail=str(error)) from None
    except MediaTooLargeError as error:
        raise HTTPException(413, detail=str(error)) from None
    except UnsupportedMediaError as error:
        raise HTTPException(415, detail=str(error)) from None
    except MediaUnavailableError as error:
        raise HTTPException(503, detail=str(error)) from None


@router.get("", response_model=list[CatalogGestureResponse], summary="Получить жесты, включая черновики и архив")
async def list_gestures(
    response: Response, _admin: Admin, db: Database,
    offset: int = Query(0, ge=0, le=2_147_483_647), limit: int = Query(25, ge=1, le=100),
):
    response.headers["Cache-Control"] = "no-store"
    return await catalog.list_gestures(db, offset, limit)


@router.post("", status_code=201, response_model=CatalogGestureResponse, summary="Создать черновик жеста")
async def create_gesture(data: CatalogCreate, admin: Admin, db: Database):
    fields = catalog.DraftFields(**data.model_dump(exclude={"gesture_id"}))
    with _catalog_errors():
        return await catalog.create_gesture(db, str(data.gesture_id), fields, admin.id)


@router.get("/{gesture_id}", response_model=CatalogGestureResponse, summary="Получить актуальную версию жеста")
async def get_gesture(gesture_id: UUID, response: Response, _admin: Admin, db: Database):
    response.headers["Cache-Control"] = "no-store"
    with _catalog_errors():
        return await catalog.get_gesture(db, str(gesture_id))


@router.put("/{gesture_id}", response_model=CatalogGestureResponse, summary="Сохранить новую версию черновика")
async def edit_gesture(gesture_id: UUID, data: CatalogEdit, admin: Admin, db: Database):
    fields = catalog.DraftFields(**data.model_dump(exclude={"expected_version"}))
    with _catalog_errors():
        return await catalog.edit_gesture(db, str(gesture_id), data.expected_version, fields, admin.id)


@router.put(
    "/{gesture_id}/video", response_model=CatalogGestureResponse,
    summary="Загрузить или заменить единственный видеопример черновика",
    description="MP4/H.264 до 100 МБ (100 000 000 байт) и 15 секунд. "
    "Загрузка создаёт новую версию с незаполненными источником и согласием.",
    responses={413: {"description": "Превышен размер запроса"}, 415: {"description": "Недопустимое видео"}},
)
async def replace_video(
    gesture_id: UUID, admin: Admin, db: Database,
    expected_version: Annotated[int, Form(ge=1, le=2_147_483_647)], file: Annotated[UploadFile, File()],
):
    with _catalog_errors():
        return await catalog.replace_video(
            db, str(gesture_id), expected_version, admin.id, file.file, file.filename, file.content_type,
        )


@router.post(
    "/{gesture_id}/transitions", response_model=CatalogGestureResponse,
    summary="Проверить, опубликовать, снять, архивировать, восстановить или отозвать согласие",
    description="Публикация требует видео, категории, источника, согласия и отдельного одобрения версии. "
    "Отзыв действует на все версии с указанным видеопримером. Вся операция привязана к актуальной версии.",
)
async def transition(gesture_id: UUID, data: CatalogTransition, admin: Admin, db: Database):
    with _catalog_errors():
        return await catalog.transition(
            db, str(gesture_id), data.expected_version, admin.id, data.action, data.note, data.media_version,
        )


@router.get(
    "/{gesture_id}/versions", response_model=list[CatalogRevisionResponse], summary="Получить историю версий жеста",
)
async def gesture_history(
    gesture_id: UUID, response: Response, _admin: Admin, db: Database,
    before_version: int | None = Query(None, ge=1, le=2_147_483_647), limit: int = Query(25, ge=1, le=100),
):
    response.headers["Cache-Control"] = "no-store"
    with _catalog_errors():
        return await catalog.gesture_history(db, str(gesture_id), before_version, limit)


@router.get(
    "/{gesture_id}/versions/{version}/content", response_class=StreamingResponse,
    summary="Просмотреть сохранённый видеопример для модерации",
    description="Авторизованный просмотр MP4 указанной версии. Отозванное видео недоступно.",
    responses={200: {"content": {"video/mp4": {}}}, 206: {"description": "Диапазон байтов"}},
)
async def preview(
    gesture_id: UUID, version: Annotated[int, Path(ge=1, le=2_147_483_647)],
    request: Request, _admin: Admin, db: Database,
):
    with _catalog_errors():
        object_name = await catalog.preview_object(db, str(gesture_id), version)
    await db.rollback()  # Do not hold a database connection while streaming.
    return await media_response(request, object_name)
