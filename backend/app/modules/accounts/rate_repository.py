from datetime import datetime, timedelta, timezone
from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.models import AuthRateBucket


async def clock(db):
    if db.get_bind().dialect.name == "postgresql":
        return await db.scalar(select(func.clock_timestamp()))
    return datetime.now(timezone.utc)


async def locked_bucket(db, scope, digest, window):
    now = await clock(db)
    stale = (await db.execute(select(AuthRateBucket.scope, AuthRateBucket.key_digest)
        .where(AuthRateBucket.expires_at <= now).order_by(AuthRateBucket.expires_at)
        .limit(100).with_for_update(skip_locked=True))).all()
    if stale:
        await db.execute(delete(AuthRateBucket).where(
            tuple_(AuthRateBucket.scope, AuthRateBucket.key_digest).in_([tuple(row) for row in stale])))
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    await db.execute(insert(AuthRateBucket).values(scope=scope, key_digest=digest,
        admissions=[], expires_at=now + timedelta(seconds=window))
        .on_conflict_do_nothing(index_elements=["scope", "key_digest"]))
    return await db.scalar(select(AuthRateBucket).where(
        AuthRateBucket.scope == scope, AuthRateBucket.key_digest == digest)
        .with_for_update().execution_options(populate_existing=True))
