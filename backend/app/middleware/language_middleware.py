from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timedelta


class LanguageMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Определяем язык:
        #    - Из куки 'lang' (если пользователь явно выбрал)
        #    - Из заголовка Accept-Language браузера
        #    - По умолчанию 'ru'

        lang = request.cookies.get('lang')

        if not lang:
            accept_language = request.headers.get('accept-language', '')
            if accept_language:
                primary_lang = accept_language.split(',')[0].split('-')[0].lower()
                if primary_lang in ['ru', 'en']:
                    lang = primary_lang
                else:
                    lang = 'ru'
            else:
                lang = 'ru'

        request.state.lang = lang

        response = await call_next(request)

        if 'lang' not in request.cookies:
            response.set_cookie(
                key='lang',
                value=lang,
                max_age=365 * 24 * 60 * 60,  # 1 год
                httponly=True,  # Не доступен из JavaScript
                samesite='lax'
            )

        response.headers['Content-Language'] = lang

        return response