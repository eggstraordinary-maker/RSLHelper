import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import auth, users, language, videos, progress, admin
from app.middleware.language_middleware import LanguageMiddleware

class CustomCORSMiddleware(CORSMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Добавляем CORS заголовки даже для ошибок
        origin = request.headers.get('origin')
        if origin in self.allow_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'

        return response


app = FastAPI(
    title="РЖЯ-помощник API",
    description="API для приложения распознавания жестов русского жестового языка",
    version="1.0.0"
)


@app.exception_handler(RequestValidationError)
async def sanitized_validation_error_handler(
    _request: Request, exc: RequestValidationError
):
    # Pydantic's default error payload includes the rejected input. That can
    # contain passwords, tokens, or other private form data.
    safe_errors = [
        {
            "loc": error.get("loc"),
            "msg": error.get("msg"),
            "type": error.get("type"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": safe_errors})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8000", "http://frontend:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(LanguageMiddleware)

# Настройка CORS
# app.add_middleware(
#     CustomCORSMiddleware,
#     allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8000", "http://frontend:5173"],
#     # allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# Подключение роутеров
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(language.router)
app.include_router(videos.router)
app.include_router(progress.router)
app.include_router(admin.router)

@app.get("/")
async def root():
    return {"message": "Жестовый помощник API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=8000)
