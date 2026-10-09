import unittest

from app.animation_direction import build_animation_direction


class AnimationDirectionTests(unittest.TestCase):
    def test_human_animal_anime_constraints_are_present(self):
        prompt = build_animation_direction(
            "A young fox meets a human child in a moonlit forest.",
            "Japanese, Kansai dialect, soft hesitant delivery",
        )
        for phrase in (
            "model-sheet identity",
            "For humans",
            "For animals and creatures",
            "For anime",
            "foot sliding",
            "Japanese, Kansai dialect",
            "Creator's original scene intent",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)

    def test_empty_language_direction_is_allowed(self):
        prompt = build_animation_direction("An original animated chase.")
        self.assertIn("An original animated chase.", prompt)
        self.assertNotIn("Language and performance direction:", prompt)

    def test_prompt_inputs_are_bounded(self):
        prompt = build_animation_direction("x" * 9000, "y" * 2000)
        self.assertLess(len(prompt), 12000)
        self.assertIn("x" * 8000, prompt)
        self.assertIn("y" * 1000, prompt)


if __name__ == "__main__":
    unittest.main()
