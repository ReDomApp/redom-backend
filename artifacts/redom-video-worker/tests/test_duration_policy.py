import unittest

from app.duration_policy import (
    CARTOON_PROJECT_MAX_SECONDS,
    DIRECT_GENERATION_MAX_SECONDS,
    MOVIE_STUDIO_PROJECT_MAX_SECONDS,
    maximum_duration_seconds,
    validate_duration_seconds,
)


class DurationPolicyTests(unittest.TestCase):
    def test_standalone_generation_stays_under_59_seconds(self):
        self.assertEqual(maximum_duration_seconds("video", "generate"), 59)
        self.assertEqual(maximum_duration_seconds("movie", "generate"), 59)
        self.assertEqual(maximum_duration_seconds("cartoon", "generate"), 59)
        validate_duration_seconds("video", "generate", 59)
        with self.assertRaises(ValueError):
            validate_duration_seconds("video", "generate", 60)

    def test_cartoon_project_composition_allows_60_minutes(self):
        self.assertEqual(CARTOON_PROJECT_MAX_SECONDS, 3600)
        self.assertEqual(maximum_duration_seconds("cartoon", "compose"), 3600)
        validate_duration_seconds("cartoon", "compose", 3600)
        with self.assertRaises(ValueError):
            validate_duration_seconds("cartoon", "compose", 3601)

    def test_studio_movie_composition_allows_120_minutes(self):
        self.assertEqual(MOVIE_STUDIO_PROJECT_MAX_SECONDS, 7200)
        self.assertEqual(maximum_duration_seconds("movie", "compose"), 7200)
        validate_duration_seconds("movie", "compose", 7200)
        with self.assertRaises(ValueError):
            validate_duration_seconds("movie", "compose", 7201)

    def test_long_form_composition_rejects_unknown_format(self):
        with self.assertRaises(ValueError):
            maximum_duration_seconds("video", "compose")


if __name__ == "__main__":
    unittest.main()
