import asyncio, json, os, tempfile, subprocess
from pathlib import Path
import httpx, boto3
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from redis.asyncio import Redis

app = FastAPI(title="ReDom-v2.8—Video Worker")
REDIS_URL = os.environ["REDOM_VIDEO_REDIS_URL"]
WORKER_TOKEN = os.environ["REDOM_VIDEO_WORKER_TOKEN"]
QUEUE = os.getenv("REDOM_VIDEO_QUEUE", "redom:video:jobs")
redis = Redis.from_url(REDIS_URL, decode_responses=True)
s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")

class VideoJob(BaseModel):
    jobId: str
    prompt: str = Field(min_length=5, max_length=8000)
    provider: str = "seedance"
    durationSeconds: int = Field(ge=4, le=300)
    resolution: str = "720p"
    aspectRatio: str = "16:9"
    callbackUrl: str
    callbackToken: str

async def callback(job, status, storageKey=None, error=None):
    body = {"jobId": job.jobId, "status": status, "storageKey": storageKey, "durationSeconds": job.durationSeconds, "error": error}
    async with httpx.AsyncClient(timeout=30) as client:
        await client.post(job.callbackUrl, json=body, headers={"Authorization": "Bearer " + job.callbackToken})

async def provider_clip(job, prompt, seconds):
    if job.provider == "seedance":
        base = os.getenv("SEEDANCE_BASE_URL", "https://seedancev2.ai").rstrip("/")
        key = os.environ["SEEDANCE_API_KEY"]
        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post(base + "/api/v1/video/generate", headers={"Authorization": "Bearer " + key, "Idempotency-Key": os.urandom(16).hex()}, json={"model": "seedance/seedance-2.5", "scene": "text-to-video", "prompt": prompt, "duration": seconds, "resolution": job.resolution, "aspect_ratio": job.aspectRatio, "generate_audio": True, "watermark": False, "output_format": "mp4"})
            r.raise_for_status(); task = r.json().get("task", {})
            for _ in range(120):
                if task.get("status") == "success":
                    url = task.get("video_url") or ((task.get("video_urls") or [None])[0])
                    if not url: raise RuntimeError("Seedance returned no video URL.")
                    v = await client.get(url); v.raise_for_status(); return v.content
                if task.get("status") in ("failed", "canceled"): raise RuntimeError("Seedance generation failed.")
                await asyncio.sleep(5)
                q = await client.post(base + "/api/v1/video/query", headers={"Authorization": "Bearer " + key}, json={"task_id": task.get("id")})
                q.raise_for_status(); task = q.json().get("task", {})
        raise TimeoutError("Seedance generation timed out.")
    if job.provider == "veo":
        key = os.environ["GEMINI_API_KEY"]
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post("https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning", headers={"x-goog-api-key": key}, json={"instances": [{"prompt": prompt}], "parameters": {"aspectRatio": job.aspectRatio, "resolution": job.resolution, "durationSeconds": "8"}})
            r.raise_for_status(); op = r.json()
            for _ in range(72):
                if op.get("done"):
                    if op.get("error"): raise RuntimeError("Veo generation failed.")
                    uri = op["response"]["generateVideoResponse"]["generatedSamples"][0]["video"]["uri"]
                    v = await client.get(uri, headers={"x-goog-api-key": key}); v.raise_for_status(); return v.content
                await asyncio.sleep(5); op = (await client.get("https://generativelanguage.googleapis.com/v1beta/" + op["name"], headers={"x-goog-api-key": key})).json()
        raise TimeoutError("Veo generation timed out.")
    if job.provider == "gemini":
        import base64
        key = os.environ["GEMINI_API_KEY"]
        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post("https://generativelanguage.googleapis.com/v1beta/interactions", headers={"x-goog-api-key": key}, json={"model": "gemini-omni-1.1-flash", "input": prompt, "generation_config": {"video_config": {"task": "text_to_video", "duration_seconds": str(min(10, seconds))}}})
            r.raise_for_status(); data = r.json().get("output_video", {}).get("data")
            if not data: raise RuntimeError("Gemini video generation returned no video.")
            return base64.b64decode(data)
    raise ValueError("Unsupported video provider.")

def compose(clips, output):
    with tempfile.TemporaryDirectory() as d:
        paths = []
        for i, data in enumerate(clips):
            p = Path(d) / (str(i) + ".mp4"); p.write_bytes(data); paths.append(p)
        manifest = Path(d) / "concat.txt"
        manifest.write_text("".join(["file \\"" + p.as_posix() + "\"\n" for p in paths]))
        subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(manifest), "-c", "copy", str(output)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

async def process(job):
    clips = []; remaining = job.durationSeconds; scene = 0
    while remaining > 0:
        scene += 1; seconds = min(30 if job.provider == "seedance" else (8 if job.provider == "veo" else 10), remaining)
        prompt = job.prompt + "\nProduction continuity brief: scene " + str(scene) + ". Keep subjects, environment, lighting, camera language, physics and audio coherent across the project."
        clips.append(await provider_clip(job, prompt, seconds)); remaining -= seconds
    with tempfile.TemporaryDirectory() as d:
        output = Path(d) / "final.mp4"; compose(clips, output)
        key = "redom-ai/videos/" + job.jobId + "/final.mp4"
        s3.upload_file(str(output), os.environ["R2_BUCKET_NAME"], key, ExtraArgs={"ContentType": "video/mp4", "CacheControl": "private, max-age=900"})
        return key

async def worker_loop():
    while True:
        item = await redis.brpop(QUEUE, timeout=5)
        if not item: continue
        job = VideoJob.model_validate_json(item[1])
        try: await callback(job, "completed", await process(job))
        except Exception as error: await callback(job, "failed", error=str(error)[:1000])

@app.on_event("startup")
async def startup(): asyncio.create_task(worker_loop())

@app.get("/health")
async def health(): return {"ok": True, "model": "ReDom-v2.8—Video", "providers": ["seedance", "veo", "gemini"]}

@app.post("/v1/jobs")
async def enqueue(job: VideoJob, authorization: str | None = Header(default=None)):
    if authorization != "Bearer " + WORKER_TOKEN: raise HTTPException(401, "Unauthorized")
    await redis.lpush(QUEUE, job.model_dump_json())
    return {"accepted": True, "jobId": job.jobId, "status": "queued"}