"""Put, read, sign and optionally retain one object in configured S3 storage."""

import argparse
import io
import json
import uuid
from datetime import timedelta

from app.services.storage import storage


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--delete", metavar="OBJECT_NAME")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.delete:
        storage.delete_object(args.delete)
        assert not storage.object_exists(args.delete)
        print(f"SeaweedFS Delete OK: {args.delete}")
        return

    object_name = f"smoke/{uuid.uuid4().hex}.txt"
    expected = b"rslhelper-seaweedfs-smoke"
    uploaded = False

    try:
        storage.put_object(
            object_name,
            io.BytesIO(expected),
            length=len(expected),
            content_type="text/plain",
        )
        uploaded = True
        assert storage.object_exists(object_name)

        body = storage.get_object(object_name)
        try:
            actual = body.read()
        finally:
            body.close()
        assert actual == expected

        url = storage.presigned_get_object(object_name, timedelta(minutes=5))
        assert object_name in url
        print(f"SeaweedFS Put/Get/Presign OK: {object_name}")
        print(json.dumps({"object_name": object_name, "url": url}))
    finally:
        if uploaded and not args.keep:
            storage.delete_object(object_name)

    if not args.keep:
        assert not storage.object_exists(object_name)
        print("SeaweedFS Delete OK")


if __name__ == "__main__":
    main()
