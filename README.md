# РЖЯ Помощник

Локальный стек состоит из React/Vite, FastAPI, PostgreSQL 15 и SeaweedFS 4.48 с S3 API. MinIO в этой ветке больше не используется. Метаданные видео остаются в PostgreSQL, а содержимое файлов хранится в bucket `videos` SeaweedFS; схема базы данных при смене хранилища не меняется.


## Какая ветка актуальна

Текущая интеграционная версия находится в `develop`. `main` пока не обновлён
отдельным релизом: обычный `git clone` без выбора ветки может получить старую версию.
Для нового устройства:

```powershell
git clone --branch develop https://github.com/eggstraordinary-maker/RSLHelper.git
Set-Location RSLHelper
```

В существующем checkout сначала проверьте изменения (`git status --short`), затем
переключитесь на develop без удаления своих файлов:

```powershell
git fetch origin
git switch develop
git pull --ff-only origin develop
```

## Запуск через Docker Compose

Нужны Docker Desktop с Linux containers/WSL 2, Docker Compose v2 и PowerShell
(Windows PowerShell 5.1 либо PowerShell 7). На новом устройстве из корня проекта:

```powershell
.\scripts\setup_env.ps1
notepad '.\backend\.env'
# Заполните SMTP_USER, SMTP_PASSWORD и EMAIL_FROM своими данными.
docker compose config --quiet
docker compose up -d --build --wait --renew-anon-volumes
docker compose ps
```

Скрипт читает опубликованные `.env.example` и создаёт пять файлов: `backend/.env`,
`postgres/.env`, `seaweedfs/.env`, `seaweedfs/.env.admin` и `frontend/.env`.
Для БД, JWT, S3 и консоли генерируются отдельные случайные секреты. Оба DB URL
сразу согласованы с PostgreSQL, S3-ключи — с хранилищем; вручную переносить секреты
с другого устройства не нужно. Пользователь консоли — `admin`, её новый пароль
находится в локальном `seaweedfs/.env.admin`. Скрипт не печатает секреты.

Повторный запуск сохраняет имеющиеся env-файлы. При неполном комплекте четырёх
серверных файлов скрипт останавливается без перезаписи: восстановите недостающие
файлы из примеров и согласуйте их с существующими настройками. Рабочие env и
данные существующего устройства автоматически не заменяются.

В SMTP-примере задана сигнатура Gmail: `smtp.gmail.com:465`, `ssl`, auth включён.
Реальные `SMTP_USER`, `SMTP_PASSWORD` (пароль приложения) и `EMAIL_FROM` заполните
самостоятельно. Для другого провайдера также измените host/port/security по его
настройкам. Заглушки позволяют собрать и запустить стек, но отправка настоящей
почты требует рабочих учётных данных и сетевого доступа. Для разработки без
реальной почты используйте Mailpit из раздела ниже.

`frontend/.env` нужен для Vite вне Docker; в Docker Compose адрес API и остальные
локальные defaults уже передаются через `environment`. Dockerfile frontend
выполняет `npm ci`; Dockerfile backend устанавливает Python-зависимости и ffmpeg.
Для Docker-запуска не требуются локальные Python, Node.js, npm или папки docs/models.

Если предпочитаете создать файлы вручную, альтернативный вариант:

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
if (-not (Test-Path '.\seaweedfs\.env.admin')) {
    Copy-Item '.\seaweedfs\.env.admin.example' '.\seaweedfs\.env.admin'
}
if (-not (Test-Path '.\frontend\.env')) {
    Copy-Item '.\frontend\.env.example' '.\frontend\.env'
}
notepad '.\backend\.env'
notepad '.\postgres\.env'
notepad '.\seaweedfs\.env'
notepad '.\seaweedfs\.env.admin'
docker compose config --quiet
docker compose up -d --build --wait --renew-anon-volumes
docker compose ps
```

При ручном копировании перед запуском замените примеры `SECRET_KEY`, `POSTGRES_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, настройте SMTP и задайте длинный случайный `WEED_ADMIN_PASSWORD` в `seaweedfs/.env.admin`. Автоматический вариант выше уже генерирует эти локальные секреты, кроме SMTP. Пустой пароль останавливает запуск консоли. Файлы с секретами исключены из Git и Docker build context; учётные данные консоли загружаются только её контейнером. Пароль в `backend/.env` внутри `DATABASE_URL*` должен совпадать с `POSTGRES_PASSWORD` в `postgres/.env`. Локальные порты привязаны к `127.0.0.1`:

- frontend: <http://localhost:5173>;
- FastAPI и Swagger: <http://localhost:8000>, <http://localhost:8000/docs>;
- SeaweedFS S3 endpoint: <http://localhost:8333>;
- консоль SeaweedFS: <http://localhost:23646> — логин `WEED_ADMIN_USER` и пароль `WEED_ADMIN_PASSWORD` из `seaweedfs/.env.admin`;
- PostgreSQL для программ на Windows: `localhost:15432`.

Проверка приложения и объектного хранилища:

```powershell
Invoke-RestMethod 'http://localhost:8000/health'
(Invoke-WebRequest 'http://localhost:5173/' -UseBasicParsing).StatusCode
docker compose exec -T backend python -m scripts.storage_smoke
```

Smoke test создаёт временный объект, читает его обратно, формирует подписанную ссылку и удаляет объект. Исходный volume `minio_data`, если он остался от прежнего Compose, автоматически не удаляется и новой конфигурацией не используется. Поскольку ценных объектов в MinIO нет, отдельное копирование данных для этого переключения не требуется.

`--renew-anon-volumes` обновляет volume с зависимостями frontend после изменений `package-lock.json`; именованные volumes PostgreSQL, S3 и консоли сохраняются. Backend выполняет миграции Alembic до старта API, frontend ждёт его healthcheck. Для уже существующей базы перед обновлением сделайте резервную копию. Миграция `0003_lesson_progress` сохраняет исходные записи и таблицу соответствий `legacy_progress_mapping`; автоматический downgrade этой миграции запрещён, откат выполняется восстановлением копии.

## Консоль S3

Сервис `seaweedfs-console` запускает штатный `weed admin` из того же закреплённого образа SeaweedFS. В браузере откройте <http://localhost:23646>, войдите и выберите **Buckets → videos** либо **File Browser**. Доступны просмотр bucket, файлов и метаданных, операции с объектами. Порт 8333 обслуживает S3 API; XML `AccessDenied` при открытии его корня без подписи ожидаем.

Загрузка через консоль создаёт объект в S3. Чтобы видео стало уроком приложения и получило `lesson_id`, используйте `POST /videos/upload` через Swagger с учётной записью администратора: этот запрос одновременно создаёт запись в PostgreSQL. Форма загрузки в текущем frontend пока отсутствует.

Дополнительные HTTP-проверки из корня проекта (Python 3, без установки пакетов):

```powershell
python scripts/console_smoke.py
```

Проверка требует вход в консоль и открывает страницу bucket. Для проверки хранилища используйте приведённый выше `python -m scripts.storage_smoke` внутри backend; он выполняет запись, чтение и удаление собственного временного объекта, не выводя подписанную ссылку.

## Обучение и распознавание

Обучение поддерживает самостоятельную практику: просмотр эталонного видео, счётчик повторений, собственную отметку завершения и восстановление прогресса после перезагрузки. Камера включается отдельной кнопкой, её потоки освобождаются при остановке и выходе. Содержимое камеры на сервер не передаётся.

`GET /recognition/status` сейчас честно возвращает недоступность провайдера. Настройки `RECOGNITION_ENDPOINT_URL` в backend и `VITE_RECOGNITION_URL` / `VITE_RECOGNITION_TRANSPORT` во frontend подготовлены для будущего подключения; одного URL недостаточно для включения распознавания. Для Docker frontend передайте значения через переменные окружения PowerShell перед `docker compose up`.

## Повторение проверок

Основные проверки воспроизводятся на Python 3.11 и Node.js 22 в контейнерах:

Комплект env-примеров и скрипт создания настроек дополнительно проверяются
командой `python -m unittest discover -s scripts/tests -p 'test_*.py'`
(для неё нужны Python 3, PowerShell и Docker Compose). CI также генерирует
свежие env, собирает обычный Compose, проверяет API/S3/консоль и сборку frontend;
после этого удаляет только собственный изолированный стенд.

```powershell
docker compose -f docker-compose.yml -f docker-compose.test.yml build backend-tests frontend-tests
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --no-deps backend-tests
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --no-deps frontend-tests
```

Сквозной браузерный тест использует настоящий запущенный стек, временного пользователя и два временных видео. Он проверяет вход, S3-воспроизведение, уроки с одинаковыми названиями, сохранение/чтение прогресса, синтетическую камеру, мобильную ширину и вход в консоль S3. Физическая камера и ML-модель этим тестом не проверяются.

```powershell
New-Item -ItemType Directory -Path .local-test-artifacts -Force | Out-Null
Invoke-WebRequest 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' -OutFile .local-test-artifacts/e2e-video.mp4
Set-Location frontend
npm ci
$env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path (Split-Path (Get-Location) -Parent) '.local-test-artifacts\browsers')
npx playwright install chromium
Set-Location ..
.\scripts\run_e2e.ps1
```

Можно передать свой небольшой MP4: `.\scripts\run_e2e.ps1 -VideoPath 'C:\path\clip.mp4'`. Скрипт очищает только созданные им тестовые строки и объекты в `finally`. Если очистка была прервана, повторите `docker compose exec -T backend python -m scripts.learning_smoke --cleanup /tmp/e2e-fixture.json`. Каталог `.local-test-artifacts` исключён из Git.

Frontend использует Tailwind CSS 4; нужны современные браузеры (Chrome 111+, Firefox 128+, Safari 16.4+), см. [руководство Tailwind](https://tailwindcss.com/docs/upgrade-guide).

Обычная остановка сохраняет данные:

```powershell
docker compose down
```

Команда `docker compose down -v` удалит локальные volumes PostgreSQL и SeaweedFS вместе с данными.

### Проверенные MP4 и изолированные тесты

После обновления кода пересоберите контейнеры: `docker compose up -d --build --wait --renew-anon-volumes`.
Проверка MP4 использует `ffprobe`; пакет ffmpeg устанавливается Dockerfile автоматически.
При запуске backend без Docker ffmpeg/ffprobe должны присутствовать в PATH.
Разрешён MP4/H.264 до 100 000 000 байт (100 МБ) и 15 секунд; переменные `MEDIA_MAX_UPLOAD_BYTES`,
`MEDIA_MAX_REQUEST_OVERHEAD_BYTES` (1 МиБ) и `MEDIA_PROBE_TIMEOUT_SECONDS` (10 секунд)
позволяют настроить лимиты. Проверяются контейнер, H.264 и длительность; декодирование каждого кадра не выполняется.

Публичный каталог: `GET /videos/lessons`. Поле `media_url` указывает на
`/videos/lessons/{lesson_id}/content`; GET поддерживает один byte-range, HEAD возвращает метаданные.
Старые object-key маршруты сохранены как deprecated. Неидентифицированный MIME старого объекта
не считается проверенным MP4: такой материал нужно проверить и загрузить заново.

Новая миграция 0005 добавляет точную уникальность username. При исторических дублях она
останавливается без изменения аккаунтов; разрешать такие конфликты нужно после резервного копирования.

Отдельные тесты настоящих PostgreSQL и SeaweedFS:

```powershell
try {
    docker compose -p rslhelper-media-check -f docker-compose.test.yml --profile test run --build --rm backend-postgres-tests
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL checks failed' }
    docker compose -p rslhelper-media-check -f docker-compose.test.yml --profile test run --build --rm backend-media-tests
    if ($LASTEXITCODE -ne 0) { throw 'Media integration checks failed' }
} finally {
    docker compose -p rslhelper-media-check -f docker-compose.test.yml --profile test down --volumes
}
```

Этот project name выделен только тестам; его volumes не содержат рабочих данных.

## Почта и проверки аккаунта — 06.11.2026

Обычный запуск сохраняет SMTP из существующего backend/.env. Дополнительные
настройки: SMTP_SECURITY=starttls (default), ssl либо явно выбранный plain;
SMTP_AUTH=true (default), SMTP_TIMEOUT_SECONDS=10. Timeout применяется к сетевым
SMTP-операциям, не является гарантией полного времени доставки. TLS проверяет
сертификаты. Plain без auth предназначен для локального тестового приёмника.

Для разработки можно направить письма в Mailpit без реальной отправки:

```powershell
docker compose -f docker-compose.yml -f docker-compose.mail.yml up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'Mail development startup failed' }
```

Письма открываются на http://localhost:8025. Overlay не меняет реальные .env.
Чтобы вернуть обычный SMTP, пересоздайте backend без overlay:
`docker compose up -d --force-recreate backend`. Один restart не применяет новые env.

При регистрации после SMTP 503 аккаунт уже создан: используйте форму повторного
подтверждения, не регистрируйте его заново. Она также доступна при просроченной
ссылке и на экране входа. Ошибка сети при проверке ссылки имеет отдельный retry.
Профиль защищён маршрутом; ошибка прогресса видна с повторной попыткой.

### Как работает повторная отправка подтверждения

Это ручное восстановление регистрации, если письмо не пришло, SMTP временно
не работал или ссылка истекла. На экране регистрации, входа или недействительной
ссылки введите тот же email в форме повторной отправки. Frontend вызывает
`POST /auth/resend-verification`. Новый аккаунт не создаётся и пароль не меняется.

Сервер проверяет наличие аккаунта и отсутствие подтверждения, заменяет старый
одноразовый токен новым и сохраняет его хеш в БД, затем отправляет письмо.
Ссылка действует 24 часа; используйте последнее письмо: предыдущая ссылка после
повторной отправки недействительна. После успешного подтверждения токен нельзя
использовать повторно. При ошибке SMTP сервер возвращает 503, и запрос можно
повторить позднее. Очереди и автоматических повторов доставки сейчас нет.

Общий лимит запросов писем — 3 за 15 минут на адрес (включая регистрацию и
восстановление пароля). При превышении повторная отправка возвращает 429 и
`Retry-After`. Лимиты настраиваются через `AUTH_MAIL_LIMIT` и
`AUTH_MAIL_WINDOW_SECONDS`. Для уже подтверждённого адреса эта форма не нужна;
если забыт пароль, используйте восстановление пароля.

Текущий E2E runner больше не сохраняет пароль в JSON. Он создаёт случайный пароль
только в окружении дочерних процессов, а manifest содержит run_id/user_id/lesson_ids/
objects для выбора и cleanup. Старые инструкции о файле с credentials больше не
применяются. Для всех новых browser tests нужен запущенный Mailpit dev overlay либо
изолированный test stack с UI на localhost:18025. Полный локальный test stack:

```powershell
docker compose -p rslhelper-e2e-check -f docker-compose.test.yml --profile e2e up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'Isolated E2E startup failed' }
$env:PLAYWRIGHT_CONSOLE_USER = 'ciadmin'
$env:PLAYWRIGHT_CONSOLE_PASSWORD = 'ci-console-test-password' # только фиктивный test stack
.\scripts\run_e2e.ps1 -VideoPath <путь-к-небольшому-MP4> -ComposeProject rslhelper-e2e-check -ComposeFile docker-compose.test.yml -Profile e2e -BackendService e2e-backend -MailpitUrl http://localhost:18025
docker compose -p rslhelper-e2e-check -f docker-compose.test.yml --profile e2e down --volumes
```

Используйте свободные тестовые порты 8000/5173/18333/18025/23646; рабочий стек на
тех же портах нужно предварительно остановить. Cleanup выполняется даже при ошибке
browser tests; ошибка cleanup считается ошибкой runner. Рабочие volumes не удалять.

После BE-018 `backend-postgres-tests` также запускает learning-регрессии на
PostgreSQL: конкурентные attempts, повторное завершение, ownership,
unpublished/legacy и rollback. Быстрый `backend-tests` проверяет границы импортов
модулей. Выполняйте команды с `--build` после изменения исходников: старый image
без обновления `app`, `tests` и `scripts` не проверяет текущее рабочее дерево.

## Проверки после доработок спринта 5

Настраиваемые лимиты включены по умолчанию: `AUTH_LOGIN_LIMIT=10`,
`AUTH_LOGIN_WINDOW_SECONDS=60`, `AUTH_MAIL_LIMIT=3`,
`AUTH_MAIL_WINDOW_SECONDS=900`. Они общие для экземпляров API и хранятся в
PostgreSQL после `alembic upgrade head` (миграции 0006 и 0007).
`CORS_ORIGINS` задаётся JSON-массивом разрешённых HTTP(S) origin.
При лимите входа/регистрации/повтора письма возвращается 429 с Retry-After;
forgot-password сохраняет одинаковый ответ для существующего и неизвестного email.

Из корня: `python backend/scripts/export_openapi.py .local-test-artifacts/openapi.json`.
Затем в frontend: `npm ci`, `npm run api:check`, `npm run lint`,
`npm run check:boundaries`, `npm run typecheck`, `npm run typecheck:tools`,
`npm run test:coverage`, `npm run build`.
После изменения схемы осознанно выполнить `npm run api:generate` и проверить diff.
Минимумы coverage: backend строки 80%, ветви 60%; frontend строки 85%, ветви 75%.

Browser CI использует только синтетический H.264-клип и изолированный test compose.
Из каталога frontend выполните `node scripts/check-e2e-privacy.mjs`
с установленным Chromium Playwright.
Публикуется лишь агрегированный JSON статусов: trace/video/снимки страницы и
тексты исключений не включаются в артефакты CI. Падение проверки остаётся ошибкой.
## Проверка SMTP и перенос настроек

Backend внутри Docker подключается к `postgres:5432`. Приложения на Windows
подключаются к `localhost:15432`. Логин, пароль и имя БД в обоих DATABASE_URL
должны соответствовать postgres/.env. Специальные символы пароля в URL требуют
percent-encoding; для нового локального секрета удобно использовать случайную
строку из букв/цифр. Изменение POSTGRES_PASSWORD в env не меняет пароль уже
инициализированного PostgreSQL volume. Не удаляйте volume ради исправления env.

Редактировать нужно `.env`, а не `.env.example`. Копирование примера выполняется
только при отсутствии `.env`; команда выше сохраняет имеющиеся файлы.
После изменения `.env` нужен recreate соответствующего контейнера, один restart
новые переменные не загружает:

```powershell
docker compose up -d --force-recreate --wait backend seaweedfs-console
```

Проверка соединения, TLS и авторизации без отправки писем:

```powershell
docker compose exec -T backend python -m scripts.smtp_check
```

Она выводит только этап, режим, порт и безопасный класс/код ошибки. `ok=true`
подтверждает транспорт и авторизацию, но не попадание сообщения во входящие.
Для Gmail в примере выбран проверенный порт 465 + SMTP_SECURITY=ssl;
альтернативный вариант — 587 + SMTP_SECURITY=starttls,
SMTP_AUTH=true; при парольной авторизации используйте пароль приложения при
включённой двухэтапной проверке. Обычный запуск использует backend/.env.
Overlay docker-compose.mail.yml принудительно направляет письма в Mailpit,
поэтому на настоящий почтовый ящик при таком запуске они не приходят.

Если подключение закрывается до приветствия SMTP или TLS, пароль ещё не
проверяется: проверьте сетевой доступ, VPN/фильтрацию и правила firewall.
На проверенном устройстве с Volna потребовалось исключение только для домена
`smtp.gmail.com` (подключение напрямую), при сохранении VPN для остального трафика.
На другом устройстве настройка VPN независима от репозитория; порт 465 должен
быть доступен из контейнера backend. `scripts.smtp_check` проверяет это без письма.
Если сервер принял сообщение, отдельно проверьте «Спам» и ограничения провайдера.
После SMTP 503 аккаунт уже существует; используйте повтор подтверждения.
Лимит писем по умолчанию — 3 запроса за 15 минут на адрес, с учётом регистрации.

Официальные параметры Gmail: https://developers.google.com/workspace/gmail/imap/imap-smtp
Пароли приложений: https://support.google.com/accounts/answer/185833
