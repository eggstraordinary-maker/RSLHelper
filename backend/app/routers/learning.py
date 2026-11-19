"""Authenticated learning navigation over the published catalog."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog_schemas import LearningSectionsResponse, lesson_response
from app.database import get_async_db
from app.dependencies import get_current_active_user
from app.modules.learning import public as learning

router = APIRouter(prefix="/learning", tags=["learning"], dependencies=[Depends(get_current_active_user)])


@router.get(
    "/sections", response_model=LearningSectionsResponse,
    summary="Получить уроки разделов «Алфавит» и «Базовые жесты»",
    description="Доступно активному пользователю с подтверждённым email. "
    "Возвращает опубликованные уроки со стабильным UUID и ссылкой на видео приложения.",
    responses={401: {"description": "Требуется вход"}, 400: {"description": "Аккаунт неактивен или email не подтверждён"}},
)
async def list_sections(response: Response, db: AsyncSession = Depends(get_async_db)):
    response.headers["Cache-Control"] = "no-store"
    sections = await learning.list_sections(db)
    return LearningSectionsResponse(
        alphabet=[lesson_response(lesson) for lesson in sections["alphabet"]],
        basic=[lesson_response(lesson) for lesson in sections["basic"]],
    )
