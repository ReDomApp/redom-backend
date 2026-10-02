import base64
import io
import os
import time
from typing import Literal

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image
from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image

MODEL_NAME = "ReDom-1.6RD— Image"
MODEL_ID = os.getenv("REDOM_IMAGE_MODEL_ID", "stabilityai/stable-diffusion-xl-base-1.0")
ENGINE_TOKEN = os.getenv("REDOM_IMAGE_ENGINE_TOKEN", "")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

app = FastAPI(title=MODEL_NAME, version="1.0.0")

_text_pipe = None
_img2img_pipe = None


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    width: int = Field(default=1024, ge=512, le=1536)
    height: int = Field(default=1024, ge=512, le=1536)
    steps: int = Field(default=30, ge=1, le=60)
    images: int = Field(default=1, ge=1, le=4)
    seed: int | None = Field(default=None, ge=0, le=2**32 - 1)


class EditRequest(GenerateRequest):
    image_data_uri: str = Field(min_length=32, max_length=35_000_000)
    strength: float = Field(default=0.65, ge=0.05, le=0.95)


def authorize(token: str | None):
    if ENGINE_TOKEN and token != ENGINE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid ReDom image engine credential.")


def pipeline_text2image():
    global _text_pipe
    if _text_pipe is None:
        _text_pipe = AutoPipelineForText2Image.from_pretrained(
            MODEL_ID,
            torch_dtype=DTYPE,
            use_safetensors=True,
        )
        if DEVICE == "cuda":
            _text_pipe = _text_pipe.to("cuda")
        else:
            _text_pipe = _text_pipe.to("cpu")
    return _text_pipe


def pipeline_img2img():
    global _img2img_pipe
    if _img2img_pipe is None:
        _img2img_pipe = AutoPipelineForImage2Image.from_pipe(pipeline_text2image())
        if DEVICE == "cuda":
            _img2img_pipe = _img2img_pipe.to("cuda")
    return _img2img_pipe


def decode_data_uri(value: str) -> Image.Image:
    try:
        header, encoded = value.split(",", 1)
        if not header.startswith("data:image/") or ";base64" not in header:
            raise ValueError
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image input.") from exc


def encode_png(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def generate(pipe, request: GenerateRequest, image: Image.Image | None = None):
    results = []
    seed = request.seed
    for index in range(request.images):
        current_seed = (seed + index) if seed is not None else int.from_bytes(os.urandom(4), "big")
        generator = torch.Generator(device=DEVICE).manual_seed(current_seed)

        kwargs = dict(
            prompt=request.prompt,
            width=request.width,
            height=request.height,
            num_inference_steps=request.steps,
            generator=generator,
        )

        if image is None:
            output = pipe(**kwargs).images[0]
        else:
            source = image.resize((request.width, request.height))
            output = pipe(
                **kwargs,
                image=source,
                strength=getattr(request, "strength", 0.65),
            ).images[0]

        results.append({
            "mimeType": "image/png",
            "dataBase64": encode_png(output),
            "width": output.width,
            "height": output.height,
            "seed": current_seed,
        })
    return results


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "modelId": MODEL_ID,
        "device": DEVICE,
    }


@app.post("/v1/generate")
def generate_image(request: GenerateRequest, x_redom_engine_token: str | None = Header(default=None)):
    authorize(x_redom_engine_token)
    started = time.perf_counter()
    results = generate(pipeline_text2image(), request)
    return {
        "model": MODEL_NAME,
        "modelId": MODEL_ID,
        "generationMs": round((time.perf_counter() - started) * 1000),
        "images": results,
    }


@app.post("/v1/edit")
def edit_image(request: EditRequest, x_redom_engine_token: str | None = Header(default=None)):
    authorize(x_redom_engine_token)
    started = time.perf_counter()
    source = decode_data_uri(request.image_data_uri)
    results = generate(pipeline_img2img(), request, source)
    return {
        "model": MODEL_NAME,
        "modelId": MODEL_ID,
        "generationMs": round((time.perf_counter() - started) * 1000),
        "images": results,
    }
