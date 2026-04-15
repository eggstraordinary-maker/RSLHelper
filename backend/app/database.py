from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

# Синхронный движок для Alembic миграций
engine = create_engine(settings.database_url)

# Асинхронный движок для приложения
async_engine = create_async_engine(settings.database_url_async)

# Синхронная сессия
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Асинхронная сессия
AsyncSessionLocal = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()


# Dependency для синхронной сессии
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Dependency для асинхронной сессии
async def get_async_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
