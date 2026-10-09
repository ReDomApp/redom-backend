"""Deterministic animation direction injected into Cartoon—R8.0 render prompts.

This is prompt orchestration, not a substitute for a compatible animation checkpoint.
"""
from __future__ import annotations


def build_animation_direction(prompt: str, language_direction: str | None = None) -> str:
    """Return stable animation-production constraints for one rendered segment."""
    base = [
        "CARTOON—R8.0 ANIMATION PIPELINE: authored animation, not live-action with a filter.",
        "Preserve recurring character model-sheet identity: silhouette, face and eye design, proportions, palette, wardrobe, markings, accessories, age impression and relative scale.",
        "Use readable silhouettes and poses, anticipation, clear action beats, coherent motion arcs, weight, contact, foot/paw planting, overlap and follow-through, secondary action, expression holds, and genre-appropriate exaggeration.",
        "Maintain shot geography, eye-lines, lighting direction, screen direction and scene continuity. Use layered foreground, midground and background motion at restrained rates for depth.",
        "For humans: maintain facial structure, costume, hair, hands, eye-lines and acting intent. For animals and creatures: maintain species-specific anatomy, gait, balance, fur/feather/scale patterns, muzzle/beak shape, and limb count.",
        "For anime: use expressive original designs, controlled impact frames, graphic effects and speed lines only when they suit the requested subgenre; do not copy protected characters, exact frames, costumes, logos, dialogue or scene sequences.",
        "Avoid identity drift, morphing, extra limbs, face drift, texture crawl, flicker, foot sliding, impossible joints, changing costume/markings, and photoreal restyling of an established animated design.",
        "Preserve requested animation medium and palette (2D, stylized 3D, anime, cel-shaded, painterly or hybrid). Dialogue audio and accurate lip-sync must come from the configured audio pipeline; do not imply they exist if they were not generated.",
    ]
    if language_direction and language_direction.strip():
        base.append("Language and performance direction: " + language_direction.strip()[:1000])
    if prompt.strip():
        base.append("Creator's original scene intent: " + prompt.strip()[:8000])
    return "\n".join(base)
