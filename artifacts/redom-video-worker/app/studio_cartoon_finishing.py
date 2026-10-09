"""Movie Studio's deterministic post-production pass for Cartoon—R8.0."""
from __future__ import annotations

import os


def cartoon_finishing_filter(width: int, height: int, watermark: str, target_fps: int | None = None) -> str:
    """Build a stable FFmpeg filter chain for animated project assembly.

    Motion interpolation is intentionally configurable because it increases
    render time and can introduce optical-flow artifacts on fast cuts.
    """
    if width < 1 or height < 1:
        raise ValueError("Output dimensions must be positive.")
    fps = target_fps
    if fps is None:
        raw_fps = os.getenv("REDOM_STUDIO_CARTOON_INTERPOLATION_FPS", "48").strip()
        try:
            fps = int(raw_fps)
        except ValueError as exc:
            raise ValueError("REDOM_STUDIO_CARTOON_INTERPOLATION_FPS must be an integer.") from exc
    if fps not in {0, 24, 30, 48, 60}:
        raise ValueError("Cartoon finishing FPS must be 0, 24, 30, 48, or 60.")

    filters = [
        f"scale={width}:{height}:flags=lanczos",
        "hqdn3d=1.2:1.2:3:3",
        "deband=1thr=0.02:2thr=0.02:3thr=0.02:range=16:blur=1",
        "eq=contrast=1.02:saturation=1.06",
        "unsharp=5:5:0.45:5:5:0",
    ]
    if fps not in {0, 24}:
        filters.append(f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    filters.append(watermark)
    return ",".join(filters)
