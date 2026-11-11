"""Supported account use cases; repositories remain module-internal."""
from .admission import admit, AdmissionUnavailable, RateLimitExceeded

from .service import (
    change_password, create_verification, delete_account,
    issue_password_reset, login, reset_password, rotate_refresh, update_profile,
    verify_email, register_account, get_principal, list_users, logout,
)

__all__ = [
    "admit", "AdmissionUnavailable", "RateLimitExceeded",
    "change_password", "create_verification", "delete_account",
    "issue_password_reset", "login", "reset_password", "rotate_refresh",
    "update_profile", "verify_email", "register_account", "get_principal", "list_users", "logout",
]
