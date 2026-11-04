"""Safe account errors without request data or infrastructure diagnostics."""


class AccountError(ValueError):
    pass


class AccountNotFoundError(AccountError):
    pass


class InvalidCredentialsError(AccountError):
    pass


class InvalidResetTokenError(AccountError):
    pass


class EmailAlreadyVerifiedError(AccountError):
    pass


class InvalidRefreshTokenError(AccountError):
    pass


class IncorrectPasswordError(AccountError):
    pass


class SelfDeletionError(AccountError):
    pass


class AccountPermissionError(AccountError):
    pass


class AccountConflictError(AccountError):
    def __init__(self, field: str):
        message = {
            "email": "Email is already in use",
            "username": "Username is already in use",
        }.get(field, "Account identity is already in use")
        super().__init__(message)


class AccountPersistenceError(RuntimeError):
    """Database integrity failure safe to report without SQL parameters."""
