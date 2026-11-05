"""Safe catalog errors; no filenames, object keys or SDK diagnostics."""


class MediaError(Exception):
    pass


class MediaNotFoundError(MediaError):
    pass


class MediaTooLargeError(MediaError):
    pass


class UnsupportedMediaError(MediaError):
    pass


class MediaUnavailableError(MediaError):
    pass


class InvalidRangeError(MediaError):
    def __init__(self, size: int):
        self.size = size
        super().__init__("Requested byte range is not satisfiable")


class AmbiguousLessonError(ValueError):
    """A legacy label cannot identify a unique published lesson."""
