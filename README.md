# РЖЯ Помощник

Локальный стек состоит из React/Vite, FastAPI, PostgreSQL 15 и SeaweedFS 4.48 с S3 API. MinIO в этой ветке больше не используется. Метаданные видео остаются в PostgreSQL, а содержимое файлов хранится в bucket `videos` SeaweedFS; схема базы данных при смене хранилища не меняется.

## Запуск через Docker Compose

Нужны Docker Desktop с Linux containers/WSL 2 и Docker Compose v2. Из корня проекта выполните:

```powershell
if (-not (Test-Path '.\backend\.env')) {
    Copy-Item '.\backend\.env.example' '.\backend\.env'
}
if (-not (Test-Path '.\postgres\.env')) {
    Copy-Item '.\postgres\.env.example' '.\postgres\.env'
}
if (-not (Test-Path '.\seaweedfs\.env')) {
    Copy-Item '.\seaweedfs\.env.example' '.\seaweedfs\.env'
}
notepad '.\backend\.env'
notepad '.\postgres\.env'
notepad '.\seaweedfs\.env'
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Перед общим или публичным развёртыванием замените `SECRET_KEY`, `POSTGRES_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` и SMTP-параметры. Все `.env` исключены из Git и Docker build context. Пароль в `backend/.env` внутри `DATABASE_URL*` должен совпадать с `POSTGRES_PASSWORD` в `postgres/.env`. Локальные порты привязаны к `127.0.0.1`:

- frontend: <http://localhost:5173>;
- FastAPI и Swagger: <http://localhost:8000>, <http://localhost:8000/docs>;
- SeaweedFS S3 endpoint: <http://localhost:8333>;
- PostgreSQL для программ на Windows: `localhost:15432`.

Проверка приложения и объектного хранилища:

```powershell
Invoke-RestMethod 'http://localhost:8000/health'
(Invoke-WebRequest 'http://localhost:5173/' -UseBasicParsing).StatusCode
docker compose exec -T backend python -m scripts.storage_smoke
```

Smoke test создаёт временный объект, читает его обратно, формирует подписанную ссылку и удаляет объект. Исходный volume `minio_data`, если он остался от прежнего Compose, автоматически не удаляется и новой конфигурацией не используется. Поскольку ценных объектов в MinIO нет, отдельное копирование данных для этого переключения не требуется.

Обычная остановка сохраняет данные:

```powershell
docker compose down
```

Команда `docker compose down -v` удалит локальные volumes PostgreSQL и SeaweedFS вместе с данными.
