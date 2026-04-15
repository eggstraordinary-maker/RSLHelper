from minio import Minio
from app.config import settings

client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure
)

bucket = settings.minio_bucket

if not client.bucket_exists(bucket):
    client.make_bucket(bucket)
