"""Operator-facing account results without identity or credential data."""
from dataclasses import dataclass


@dataclass(frozen=True)
class AdminBootstrapResult:
    user_id: int
    role: str
    change_required: bool
    dry_run: bool
