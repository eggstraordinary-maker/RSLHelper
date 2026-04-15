from fastapi import APIRouter, Request, Response, Depends
from pydantic import BaseModel


router = APIRouter(prefix="/api", tags=["language"])


class LanguageRequest(BaseModel):
    lang: str


@router.post("/set-language")
async def set_language(
        request: LanguageRequest,
        response: Response
):
    """Устанавливает язык пользователя"""
    if request.lang not in ['ru', 'en']:
        return {"error": "Unsupported language"}

    # Устанавливаем куку с языком
    response.set_cookie(
        key='lang',
        value=request.lang,
        max_age=365 * 24 * 60 * 60,  # 1 год
        httponly=True,
        samesite='lax'
    )

    return {"message": f"Language set to {request.lang}", "lang": request.lang}


@router.get("/current-language")
async def get_current_language(request: Request):
    """Возвращает текущий язык пользователя"""
    lang = request.cookies.get('lang', 'ru')
    return {"lang": lang, "supported_languages": ["ru", "en"]}
