"""Format-aware duration contracts for standalone shots and long-form composition."""

DIRECT_GENERATION_MAX_SECONDS = 59
CARTOON_PROJECT_MAX_SECONDS = 60 * 60
MOVIE_STUDIO_PROJECT_MAX_SECONDS = 120 * 60


def maximum_duration_seconds(format_name: str, operation: str) -> int:
    """Return the product ceiling for a worker job.

    Long durations are permitted only for Studio composition; model generation
    stays short so the pipeline renders individual shots rather than a feature
    film in one diffusion call.
    """
    if operation != "compose":
        return DIRECT_GENERATION_MAX_SECONDS
    if format_name == "cartoon":
        return CARTOON_PROJECT_MAX_SECONDS
    if format_name == "movie":
        return MOVIE_STUDIO_PROJECT_MAX_SECONDS
    raise ValueError("Unsupported format for long-form composition.")


def validate_duration_seconds(format_name: str, operation: str, duration_seconds: int) -> None:
    maximum = maximum_duration_seconds(format_name, operation)
    if duration_seconds < 4 or duration_seconds > maximum:
        raise ValueError(
            f"{format_name} {operation} duration must be between 4 and {maximum} seconds."
        )
