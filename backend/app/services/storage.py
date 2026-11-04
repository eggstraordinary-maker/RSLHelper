from datetime import timedelta
from threading import Lock
from typing import Any, BinaryIO, Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings


class StoredObject(Protocol):
    def read(self, amount: int | None = None) -> bytes: ...

    def close(self) -> None: ...


class ObjectStorage(Protocol):
    """Object operations used by the media module."""

    def put_object(
        self,
        object_name: str,
        data: BinaryIO,
        length: int,
        content_type: str,
    ) -> None: ...

    def presigned_get_object(self, object_name: str, expires: timedelta) -> str: ...

    def get_object(self, object_name: str) -> StoredObject: ...

    def object_exists(self, object_name: str) -> bool: ...

    def delete_object(self, object_name: str) -> None: ...


class S3Storage:
    """S3 adapter configured for SeaweedFS path-style addressing."""

    def __init__(
        self,
        client: Any | None = None,
        public_client: Any | None = None,
        bucket: str | None = None,
    ) -> None:
        self._client = client
        self._public_client = public_client
        self._bucket = bucket or settings.s3_bucket
        self._bucket_ready = False
        self._bucket_lock = Lock()

    @staticmethod
    def _create_client(endpoint_url: str):
        return boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.s3_region,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                connect_timeout=5,
                read_timeout=60,
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    @property
    def client(self):
        if self._client is None:
            self._client = self._create_client(settings.s3_endpoint_url)
        return self._client

    @property
    def public_client(self):
        if self._public_client is None:
            endpoint = settings.s3_public_endpoint_url or settings.s3_endpoint_url
            self._public_client = self._create_client(endpoint)
        return self._public_client

    def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return

        with self._bucket_lock:
            if self._bucket_ready:
                return
            try:
                self.client.head_bucket(Bucket=self._bucket)
            except ClientError as exc:
                error = exc.response.get("Error", {})
                error_code = str(error.get("Code", ""))
                status_code = exc.response.get("ResponseMetadata", {}).get(
                    "HTTPStatusCode"
                )
                if error_code not in {"404", "NoSuchBucket", "NotFound"} and (
                    status_code != 404
                ):
                    raise
                try:
                    self.client.create_bucket(Bucket=self._bucket)
                except ClientError as create_exc:
                    create_code = str(
                        create_exc.response.get("Error", {}).get("Code", "")
                    )
                    if create_code not in {
                        "BucketAlreadyExists",
                        "BucketAlreadyOwnedByYou",
                    }:
                        raise
            self._bucket_ready = True

    def put_object(
        self,
        object_name: str,
        data: BinaryIO,
        length: int,
        content_type: str,
    ) -> None:
        self._ensure_bucket()
        self.client.put_object(
            Bucket=self._bucket,
            Key=object_name,
            Body=data,
            ContentLength=length,
            ContentType=content_type,
        )

    def presigned_get_object(
        self, object_name: str, expires: timedelta
    ) -> str:
        self._ensure_bucket()
        return self.public_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": object_name},
            ExpiresIn=int(expires.total_seconds()),
        )

    def get_object(self, object_name: str) -> StoredObject:
        response = self.client.get_object(Bucket=self._bucket, Key=object_name)
        return response["Body"]

    def object_exists(self, object_name: str) -> bool:
        try:
            self.client.head_object(Bucket=self._bucket, Key=object_name)
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            status_code = exc.response.get("ResponseMetadata", {}).get(
                "HTTPStatusCode"
            )
            if error_code in {"404", "NoSuchKey", "NotFound"} or status_code == 404:
                return False
            raise
        return True

    def delete_object(self, object_name: str) -> None:
        self.client.delete_object(Bucket=self._bucket, Key=object_name)


storage: ObjectStorage = S3Storage()
