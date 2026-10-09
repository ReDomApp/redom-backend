import asyncio
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

import boto3
import httpx
import torch
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel, Field
from redis.asyncio import Redis

import wan
from wan.configs import MAX_AREA_CONFIGS, SIZE_CONFIGS, WAN_CONFIGS
from wan.utils.utils import save_video

MODEL_NAME = os.getenv("REDOM_VIDEO_MODEL_ID", "ReDom-v2.8—Video")
CHECKPOINT_DIR = os.environ["REDOM_VIDEO_CHECKPOINT_DIR"]
REDIS_URL = os.environ["REDOM_VIDEO_REDIS_URL"]
WORKER_TOKEN = os.environ["REDOM_VIDEO_WORKER_TOKEN"]
QUEUE = os.getenv("REDOM_VIDEO_QUEUE", "redom:video:jobs")
FPS = 24
SEGMENT_SECONDS = 5

app = FastAPI(title="ReDom-v2.8—Video Native Worker")
redis = Redis.from_url(REDIS_URL, decode_responses=True)
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name=os.getenv("R2_REGION", "auto"),
)

class VideoJob(BaseModel):
    # First-class creation modes share the native renderer and retain distinct creative briefs.
    contentType: Literal["video", "movie", "cartoon"] = "video"
    watermarkEnabled: bool = True
    jobId: str
    runtime: str = "redom-v2.8-native"
    model: str = MODEL_NAME
    operation: str = "generate"
    prompt: str = Field(min_length=5, max_length=8000)
    durationSeconds: int = Field(ge=4, le=300)
    resolution: str = "720p"
    aspectRatio: str = "16:9"
    callbackUrl: str
    callbackToken: str
    shotKeys: list[str] = []

pipeline = None

def target_size(aspect_ratio: str, resolution: str):
    if resolution == "1080p":
        return {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}[aspect_ratio]
    return {"16:9": (1280, 704), "9:16": (704, 1280), "1:1": (704, 704)}[aspect_ratio]

def model_size(aspect_ratio: str):
    # The local TI2V runtime is generated at its stable 720-class working sizes.
    return {"16:9": (1280, 704), "9:16": (704, 1280), "1:1": (704, 704)}[aspect_ratio]

def load_pipeline():
    global pipeline
    if pipeline is None:
        if not torch.cuda.is_available():
            raise RuntimeError("A CUDA GPU is required for ReDom-v2.8—Video.")
        pipeline = wan.WanTI2V(
            config=WAN_CONFIGS["ti2v-5B"],
            checkpoint_dir=CHECKPOINT_DIR,
            device_id=int(os.getenv("LOCAL_RANK", "0")),
            rank=0,
            t5_cpu=True,
            convert_model_dtype=True,
        )
    return pipeline

def save_tensor(video, path: Path):
    save_video(
        tensor=video[None],
        save_file=str(path),
        fps=FPS,
        nrow=1,
        normalize=True,
        value_range=(-1, 1),
    )

def last_frame(video_path: Path, image_path: Path):
    subprocess.run(
        [
            "ffmpeg", "-y", "-sseof", "-0.05", "-i", str(video_path),
            "-frames:v", "1", "-vf", "scale=704:-2", str(image_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return Image.open(image_path).convert("RGB")

def render_project(job: VideoJob, output: Path):
    pipe = load_pipeline()
    segments = []
    reference = None
    remaining = job.durationSeconds
    scene_index = 0

    with tempfile.TemporaryDirectory(prefix="redom-video-") as work:
        workdir = Path(work)
        while remaining > 0:
            scene_index += 1
            seconds = min(SEGMENT_SECONDS, remaining)
            frames = seconds * FPS + 1
            prompt = job.prompt.strip()
            if job.contentType == "movie":
                prompt += "\\nReDom Movie Studio: naturalistic emotional performances, subtle micro-expressions, motivated blocking, lens-aware depth of field, coherent shot/reverse-shot, motivated lighting, and strict wardrobe/prop/character continuity."
            elif job.contentType == "cartoon":
                prompt += "\\nReDom Cartoon: polished original animation, expressive acting, consistent character proportions and silhouettes, readable staging, purposeful camera angles, coherent motion arcs, appealing color design, and genre-appropriate timing."
            else:
                prompt += "\\nReDom Videos: concise short-form storytelling, immediate visual hook, clear scene beats, deliberate camera movement, stable subject continuity, and a clean ending."
            if job.operation == "cgi":
                prompt += (
                    "\nCGI production brief: physically based materials, coherent geometry, "
                    "cinematic camera motion, volumetric lighting, stable object identity, "
                    "clean edges, realistic shadows and temporal continuity."
                )
            prompt += (
                f"\nReDom scene {scene_index}: preserve the established subject, environment, "
                "lighting direction, camera language, motion logic and visual continuity. "
                "Do not introduce identity manipulation, deceptive evidence, or unsafe content."
            )

            video = pipe.generate(
                prompt,
                img=reference,
                size=model_size(job.aspectRatio),
                max_area=MAX_AREA_CONFIGS.get("ti2v-5B", 704 * 1280),
                frame_num=frames,
                sampling_steps=40,
                guide_scale=5.0,
                seed=scene_index * 104729,
                offload_model=True,
            )
            if video is None:
                raise RuntimeError("Native ReDom video runtime returned no frames.")

            segment = workdir / f"segment-{scene_index:04d}.mp4"
            save_tensor(video, segment)
            segments.append(segment)
            reference = last_frame(segment, workdir / f"frame-{scene_index:04d}.png")
            remaining -= seconds

        manifest = workdir / "concat.txt"
        manifest.write_text(
            "".join(f"file '{path.as_posix()}'\n" for path in segments),
            encoding="utf-8",
        )

        working = workdir / "joined.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(manifest),
                "-c", "copy", str(working),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        width, height = target_size(job.aspectRatio, job.resolution)
        enhanced = workdir / "final.mp4"
        vf = (
            f"scale={width}:{height}:flags=lanczos,"
            "hqdn3d=1.2:1.2:3:3,"
            "unsharp=5:5:0.45:5:5:0,"
            "format=yuv420p"
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(working), "-vf", vf,
                "-map", "0:v", "-map", "0:a?",
                "-c:v", "libx264", "-preset", os.getenv("REDOM_VIDEO_X264_PRESET", "medium"),
                "-crf", os.getenv("REDOM_VIDEO_CRF", "18"),
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                str(enhanced),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        output.write_bytes(enhanced.read_bytes())


def apply_brand_watermark(source: Path, output: Path, job: VideoJob, workdir: Path):
    """Burn a visible ReDom brand mark into every frame before publishing an asset."""
    labels = {"video": "ReDom Videos", "movie": "ReDom Movie Studio", "cartoon": "ReDom Cartoon"}
    label = labels[job.contentType]
    canvas = Image.new("RGBA", (620, 92), (0, 0, 0, 0))
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(canvas)
    font_path = os.getenv("REDOM_WATERMARK_FONT_PATH")
    try:
        font = ImageFont.truetype(font_path, 29) if font_path else ImageFont.load_default()
    except (OSError, TypeError):
        font = ImageFont.load_default()
    draw.rounded_rectangle((2, 2, 618, 90), radius=18, fill=(8, 18, 36, 170), outline=(255, 255, 255, 125), width=2)
    logo_path = os.getenv("REDOM_BRAND_LOGO_PATH")
    text_x = 22
    if logo_path and Path(logo_path).is_file():
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo.thumbnail((58, 58))
            canvas.alpha_composite(logo, (16, (92 - logo.height) // 2))
            text_x = 86
        except OSError:
            pass
    draw.text((text_x, 28), label, font=font, fill=(255, 255, 255, 245), stroke_width=1, stroke_fill=(0, 0, 0, 170))
    watermark = workdir / "redom-watermark.png"
    canvas.save(watermark)
    subprocess.run([
        "ffmpeg", "-y", "-i", str(source), "-i", str(watermark),
        "-filter_complex", "[0:v][1:v]overlay=W-w-28:H-h-28:format=auto,format=yuv420p",
        "-map", "0:a?", "-c:v", "libx264", "-preset", os.getenv("REDOM_VIDEO_X264_PRESET", "medium"),
        "-crf", os.getenv("REDOM_VIDEO_CRF", "18"), "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(output),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def compose_project(job: VideoJob, output: Path):
    if not job.shotKeys:
        raise RuntimeError("ReDom composer received no shot assets.")
    with tempfile.TemporaryDirectory(prefix="redom-compose-") as work:
        workdir = Path(work)
        local_segments = []
        for index, key in enumerate(job.shotKeys, start=1):
            local = workdir / f"shot-{index:04d}.mp4"
            s3.download_file(os.environ["R2_BUCKET_NAME"], key, str(local))
            local_segments.append(local)

        manifest = workdir / "concat.txt"
        manifest.write_text("".join("file '" + path.as_posix() + "'\n" for path in local_segments), encoding="utf-8")
        joined = workdir / "joined.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(manifest), "-c", "copy", str(joined)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

        width, height = target_size(job.aspectRatio, job.resolution)
        vf = f"scale={width}:{height}:flags=lanczos,hqdn3d=1.2:1.2:3:3,unsharp=5:5:0.45:5:5:0,format=yuv420p"
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(joined), "-vf", vf,
                "-map", "0:v", "-map", "0:a?",
                "-c:v", "libx264", "-preset", os.getenv("REDOM_VIDEO_X264_PRESET", "medium"),
                "-crf", os.getenv("REDOM_VIDEO_CRF", "18"),
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                str(output),
            ],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

async def callback(job: VideoJob, status: str, storage_key: str | None = None, error: str | None = None):
    body = {
        "jobId": job.jobId,
        "status": status,
        "storageKey": storage_key,
        "durationSeconds": job.durationSeconds,
        "error": error,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            job.callbackUrl,
            json=body,
            headers={"Authorization": "Bearer " + job.callbackToken},
        )
        response.raise_for_status()

async def process(job: VideoJob):
    if job.runtime != "redom-v2.8-native" or job.model != MODEL_NAME:
        raise ValueError("Unsupported ReDom video runtime.")
    if job.contentType not in {"video", "movie", "cartoon"}:
        raise ValueError("Unsupported ReDom creation mode.")
    if job.durationSeconds > 300:
        raise ValueError("Video duration exceeds the ReDom maximum.")

    await callback(job, "processing")
    with tempfile.TemporaryDirectory(prefix="redom-video-output-") as work:
        output = Path(work) / "final.mp4"
        if job.operation == "compose":
            await asyncio.to_thread(compose_project, job, output)
        else:
            await asyncio.to_thread(render_project, job, output)
        # Apply disclosure after composition so all exported frames retain the mark.
        branded = Path(work) / "branded-final.mp4"
        await asyncio.to_thread(apply_brand_watermark, output, branded, job, Path(work))
        output = branded
        key = f"redom-ai/{job.contentType}s/{job.jobId}/final.mp4"
        s3.upload_file(
            str(output),
            os.environ["R2_BUCKET_NAME"],
            key,
            ExtraArgs={"ContentType": "video/mp4", "CacheControl": "private, max-age=900"},
        )
        return key

async def worker_loop():
    while True:
        item = await redis.brpop(QUEUE, timeout=5)
        if not item:
            continue
        job = VideoJob.model_validate_json(item[1])
        try:
            key = await process(job)
            await callback(job, "completed", key)
        except Exception as error:
            await callback(job, "failed", error=str(error)[:1000])

@app.on_event("startup")
async def startup():
    asyncio.create_task(worker_loop())

@app.on_event("shutdown")
async def shutdown():
    await redis.close()

@app.get("/health")
async def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "runtime": "redom-v2.8-native",
        "generation": "local-gpu",
    }

@app.post("/v1/jobs")
async def enqueue(job: VideoJob, authorization: str | None = Header(default=None)):
    if authorization != "Bearer " + WORKER_TOKEN:
        raise HTTPException(401, "Unauthorized")
    if job.runtime != "redom-v2.8-native" or job.model != MODEL_NAME:
        raise HTTPException(400, "Unsupported ReDom video runtime.")
    if job.contentType not in {"video", "movie", "cartoon"}:
        raise HTTPException(400, "Unsupported ReDom creation mode.")
    await redis.lpush(QUEUE, job.model_dump_json())
    return {"accepted": True, "jobId": job.jobId, "status": "queued", "model": MODEL_NAME}
