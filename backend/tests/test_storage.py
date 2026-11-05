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
        self.get_ranges: list[str | None] = []
        self.content_types: dict[str, str] = {}

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
        self.content_types[Key] = ContentType
        self.put_calls += 1
        return {}

    def get_object(self, *, Bucket: str, Key: str, Range: str | None = None):
        if Key not in self.objects:
            raise _client_error("NoSuchKey", 404, "GetObject")
        self.get_ranges.append(Range)
        data = self.objects[Key]
        if Range:
            start, end = map(int, Range.removeprefix("bytes=").split("-"))
            data = data[start:end + 1]
        return {"Body": io.BytesIO(data)}

    def head_object(self, *, Bucket: str, Key: str):
        if Key not in self.objects:
            raise _client_error("NoSuchKey", 404, "HeadObject")
        return {"ContentLength": len(self.objects[Key]), "ContentType": self.content_types[Key]}

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
    metadata = storage.stat_object("lesson.mp4")
    assert metadata.size == 11 and metadata.content_type == "video/mp4"
    body = storage.get_object("lesson.mp4")
    try:
        assert body.read() == b"video-bytes"
    finally:
        body.close()

    url = storage.presigned_get_object("lesson.mp4", timedelta(minutes=10))
    assert url.startswith("http://localhost:8333/")
    assert client.presign_calls[0]["ExpiresIn"] == 600

    partial = storage.get_object("lesson.mp4", "bytes=1-3")
    try:
        assert partial.read() == b"ide"
        assert client.get_ranges[-1] == "bytes=1-3"
    finally:
        partial.close()

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
