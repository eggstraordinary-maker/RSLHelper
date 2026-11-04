import io
from datetime import timedelta

import pytest
from botocore.exceptions import ClientError

from app.services.storage import S3Storage


def _client_error(code: str, status: int, operation: str) -> ClientError:
    return ClientError(
        {
            "Error": {"Code": code, "Message": code},
            "ResponseMetadata": {"HTTPStatusCode": status},
        },
        operation,
    )


class FakeS3Client:
    def __init__(self, bucket_exists: bool = False) -> None:
        self.bucket_exists = bucket_exists
        self.objects: dict[str, bytes] = {}
        self.put_calls = 0
        self.presign_calls: list[dict] = []

    def head_bucket(self, Bucket: str):
        if not self.bucket_exists:
            raise _client_error("NoSuchBucket", 404, "HeadBucket")
        return {}

    def create_bucket(self, Bucket: str):
        self.bucket_exists = True
        return {}

    def put_object(
        self,
        *,
        Bucket: str,
        Key: str,
        Body,
        ContentLength: int,
        ContentType: str,
    ):
        payload = Body.read()
        assert len(payload) == ContentLength
        assert ContentType
        self.objects[Key] = payload
        self.put_calls += 1
        return {}

    def get_object(self, *, Bucket: str, Key: str):
        if Key not in self.objects:
            raise _client_error("NoSuchKey", 404, "GetObject")
        return {"Body": io.BytesIO(self.objects[Key])}

    def head_object(self, *, Bucket: str, Key: str):
        if Key not in self.objects:
            raise _client_error("NoSuchKey", 404, "HeadObject")
        return {"ContentLength": len(self.objects[Key])}

    def delete_object(self, *, Bucket: str, Key: str):
        self.objects.pop(Key, None)
        return {}

    def generate_presigned_url(self, operation: str, **kwargs):
        self.presign_calls.append({"operation": operation, **kwargs})
        key = kwargs["Params"]["Key"]
        return f"http://localhost:8333/videos/{key}?signed=true"


def test_s3_storage_contract_uses_bucket_and_streams_objects():
    client = FakeS3Client()
    storage = S3Storage(client=client, public_client=client, bucket="videos")

    storage.put_object(
        "lesson.mp4",
        io.BytesIO(b"video-bytes"),
        length=11,
        content_type="video/mp4",
    )
    storage.put_object(
        "second.mp4",
        io.BytesIO(b"second"),
        length=6,
        content_type="video/mp4",
    )

    assert client.bucket_exists is True
    assert client.put_calls == 2
    assert storage.object_exists("lesson.mp4") is True
    body = storage.get_object("lesson.mp4")
    try:
        assert body.read() == b"video-bytes"
    finally:
        body.close()

    url = storage.presigned_get_object("lesson.mp4", timedelta(minutes=10))
    assert url.startswith("http://localhost:8333/")
    assert client.presign_calls[0]["ExpiresIn"] == 600

    storage.delete_object("lesson.mp4")
    assert storage.object_exists("lesson.mp4") is False


def test_bucket_access_errors_are_not_misreported_as_missing_bucket():
    class ForbiddenClient(FakeS3Client):
        def head_bucket(self, Bucket: str):
            raise _client_error("AccessDenied", 403, "HeadBucket")

    client = ForbiddenClient()
    storage = S3Storage(client=client, public_client=client, bucket="videos")

    with pytest.raises(ClientError) as raised:
        storage.put_object(
            "lesson.mp4",
            io.BytesIO(b"video"),
            length=5,
            content_type="video/mp4",
        )

    assert raised.value.response["Error"]["Code"] == "AccessDenied"
    assert client.bucket_exists is False
