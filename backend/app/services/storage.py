from datetime import timedelta
from typing import BinaryIO, Protocol

from minio import Minio

from app.config import settings


class ObjectStorage(Protocol):
    """S3-compatible object operations used by the media module."""

    def put_object(
        self,
        object_name: str,
        data: BinaryIO,
        length: int,
        content_type: str,
    ) -> None: ...

    def presigned_get_object(self, object_name: str, expires: timedelta) -> str: ...

    def get_object(self, object_name: str): ...


class MinioStorage:
    """MinIO adapter; client and bucket checks are lazy to keep imports side-effect free."""

    def __init__(self) -> None:
        self._client: Minio | None = None

    @property
    def client(self) -> Minio:
        if self._client is None:
            self._client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
            )
        return self._client

    def _ensure_bucket(self) -> None:
        if not self.client.bucket_exists(settings.minio_bucket):
            self.client.make_bucket(settings.minio_bucket)

    def put_object(
        self,
        object_name: str,
        data: BinaryIO,
        length: int,
        content_type: str,
    ) -> None:
        self._ensure_bucket()
        self.client.put_object(
            settings.minio_bucket,
            object_name,
            data,
            length=length,
            content_type=content_type,
        )

    def presigned_get_object(
        self, object_name: str, expires: timedelta
    ) -> str:
        return self.client.presigned_get_object(
            settings.minio_bucket, object_name, expires=expires
        )

    def get_object(self, object_name: str):
        return self.client.get_object(settings.minio_bucket, object_name)


storage: ObjectStorage = MinioStorage()
