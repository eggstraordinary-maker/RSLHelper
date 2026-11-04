import re


def validate_password_strength(value: str) -> str:
    """Apply the same password rules to registration, reset and password change."""
    if len(value) < 8:
        raise ValueError("Password must contain at least 8 characters")
    if not any(char.isupper() for char in value):
        raise ValueError("Password must contain an uppercase letter")
    if not any(char.islower() for char in value):
        raise ValueError("Password must contain a lowercase letter")
    if not any(char.isdigit() for char in value):
        raise ValueError("Password must contain a digit")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must be no more than 72 UTF-8 bytes")
    return value


def is_valid_username(value: str) -> bool:
    return re.fullmatch(r"[a-zA-Z0-9_]+", value) is not None
