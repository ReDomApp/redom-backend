import unittest
from unittest.mock import patch

from app.studio_cartoon_finishing import cartoon_finishing_filter


class StudioCartoonFinishingTests(unittest.TestCase):
    def test_default_finishing_includes_cleanup_color_and_motion_interpolation(self):
        with patch.dict("os.environ", {"REDOM_STUDIO_CARTOON_INTERPOLATION_FPS": "48"}):
            result = cartoon_finishing_filter(1280, 720, "format=yuv420p")
        self.assertIn("hqdn3d", result)
        self.assertIn("deband", result)
        self.assertIn("saturation=1.06", result)
        self.assertIn("minterpolate=fps=48", result)
        self.assertTrue(result.endswith("format=yuv420p"))

    def test_interpolation_can_be_disabled_for_fast_cuts(self):
        result = cartoon_finishing_filter(1920, 1080, "format=yuv420p", target_fps=0)
        self.assertNotIn("minterpolate", result)
        self.assertIn("scale=1920:1080:flags=lanczos", result)

    def test_rejects_invalid_dimensions_and_fps(self):
        with self.assertRaises(ValueError):
            cartoon_finishing_filter(0, 720, "format=yuv420p", target_fps=24)
        with self.assertRaises(ValueError):
            cartoon_finishing_filter(1280, 720, "format=yuv420p", target_fps=25)


if __name__ == "__main__":
    unittest.main()
