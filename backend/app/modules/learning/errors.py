class LessonNotFoundError(ValueError):
    pass


class AmbiguousLessonError(ValueError):
    pass


class AttemptConflictError(ValueError):
    pass
