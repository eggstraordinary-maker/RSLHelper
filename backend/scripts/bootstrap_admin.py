"""Explicitly grant the existing admin role to an eligible account. Default: dry-run."""
import argparse
import asyncio
from dataclasses import asdict
import json

from app.modules.accounts.errors import AccountNotFoundError, AccountPermissionError


class SafeParser(argparse.ArgumentParser):
    def error(self, _message):
        self.exit(2, "Invalid arguments; use --help.\n")


def positive_id(value):
    result = int(value)
    if result <= 0:
        raise ValueError("Expected positive account ID")
    return result


async def execute(user_id: int, *, dry_run: bool):
    # Lazy imports keep configuration validation/DSN failures inside safe handling.
    from app.database import AsyncSessionLocal, async_engine
    from app.modules.accounts import public as accounts

    try:
        async with AsyncSessionLocal() as session:
            return await accounts.bootstrap_admin(session, user_id, dry_run=dry_run)
    finally:
        await async_engine.dispose()


def main(argv=None) -> int:
    parser = SafeParser(description=__doc__)
    parser.add_argument("--user-id", required=True, type=positive_id, help="Numeric ID from GET /users/me")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Commit the role assignment")
    mode.add_argument("--dry-run", action="store_true", help="Validate only (the default)")
    args = parser.parse_args(argv)
    try:
        result = asyncio.run(execute(args.user_id, dry_run=not args.apply))
        print(json.dumps({"ok": True, **asdict(result)}))
        return 0
    except AccountNotFoundError:
        result, code = {"ok": False, "error": "account_not_found"}, 3
    except AccountPermissionError:
        result, code = {"ok": False, "error": "account_not_eligible"}, 4
    except Exception as error:
        result, code = {"ok": False, "error": "bootstrap_unavailable", "error_type": type(error).__name__}, 1
    print(json.dumps(result))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
