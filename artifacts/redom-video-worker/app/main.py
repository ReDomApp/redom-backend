import asyncio
import os
import subprocess
import tempfile
from pathlib import Path

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
    referenceAssetKey: str | None = None
    format: str = Field(default="video", pattern="^(video|movie|cartoon)$")
    watermark: bool = True

pipeline = None

def watermark_label(format_name: str) -> str:
    return {"movie": "ReDom Movie Studio", "cartoon": "ReDom Cartoon", "video": "ReDom Videos"}.get(format_name, "ReDom Videos")

def watermark_filter(format_name: str, enabled: bool = True) -> str:
    if not enabled:
        return "format=yuv420p"
    label = watermark_label(format_name)
    font = os.getenv("REDOM_VIDEO_WATERMARK_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    # A persistent, unobtrusive brand mark in the far-right upper corner.
    escaped = label.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    return (f"drawtext=fontfile='{font}':text='{escaped}':x=w-tw-24:y=24:"
            "fontsize=22:fontcolor=white@0.92:borderw=2:bordercolor=black@0.65:"
            "box=1:boxcolor=black@0.28:boxborderw=10,format=yuv420p")

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
        if job.referenceAssetKey:
            if not job.referenceAssetKey.startswith("redom-ai/video-references/") or ".." in job.referenceAssetKey:
                raise ValueError("Invalid ReDom reference asset key.")
            reference_path = workdir / "reference-image"
            s3.download_file(os.environ["R2_BUCKET_NAME"], job.referenceAssetKey, str(reference_path))
            with Image.open(reference_path) as reference_image:
                reference = reference_image.convert("RGB").copy()
        while remaining > 0:
            scene_index += 1
            seconds = min(SEGMENT_SECONDS, remaining)
            frames = seconds * FPS + 1
            prompt = job.prompt.strip()
            if job.format == "cartoon":
                prompt += ("\nAnimation direction: polished high-end animated film, expressive character acting, "
                           "deliberate animation timing, stable model sheets, consistent proportions, "
                           "appealing silhouettes, clean materials, intentional color design and readable staging. "
                           "Do not drift into live-action photorealism unless explicitly requested.")
            elif job.format == "movie":
                prompt += ("\nFeature-film direction: motivated camera movement, intentional shot composition, "
                           "naturalistic performance, believable lighting, cinematic depth, consistent wardrobe "
                           "and screen direction, emotionally legible facial acting and coherent scene geography.")
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
            watermark_filter(job.format, job.watermark)
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
        vf = f"scale={width}:{height}:flags=lanczos,hqdn3d=1.2:1.2:3:3,unsharp=5:5:0.45:5:5:0," + watermark_filter(job.format, job.watermark)
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
        "format": job.format,
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
    if job.durationSeconds > 300:
        raise ValueError("Video duration exceeds the ReDom maximum.")
    if job.format not in {"video", "movie", "cartoon"}:
        raise ValueError("Unsupported ReDom video format.")

    await callback(job, "processing")
    with tempfile.TemporaryDirectory(prefix="redom-video-output-") as work:
        output = Path(work) / "final.mp4"
        if job.operation == "compose":
            await asyncio.to_thread(compose_project, job, output)
        else:
            await asyncio.to_thread(render_project, job, output)
        key = f"redom-ai/videos/{job.jobId}/final.mp4"
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
        finally:
            if job.referenceAssetKey and job.referenceAssetKey.startswith("redom-ai/video-references/") and ".." not in job.referenceAssetKey:
                try:
                    await asyncio.to_thread(s3.delete_object, Bucket=os.environ["R2_BUCKET_NAME"], Key=job.referenceAssetKey)
                except Exception:
                    pass

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
    await redis.lpush(QUEUE, job.model_dump_json())
    return {"accepted": True, "jobId": job.jobId, "status": "queued", "model": MODEL_NAME}
