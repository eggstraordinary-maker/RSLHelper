import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.routers import auth, users, language, videos
from app.middleware.language_middleware import LanguageMiddleware
from app.config import settings
from app.database import engine
from app import models


class CustomCORSMiddleware(CORSMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Добавляем CORS заголовки даже для ошибок
        origin = request.headers.get('origin')
        if origin in self.allow_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создание таблиц при старте
    models.Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="РЖЯ-помощник API",
    description="API для приложения распознавания жестов русского жестового языка",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(LanguageMiddleware)

# Настройка CORS
app.add_middleware(
    CustomCORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(language.router)
app.include_router(videos.router)


@app.get("/")
async def root():
    return {"message": "Жестовый помощник API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=8000)
