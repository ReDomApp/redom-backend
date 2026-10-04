import base64
import io
import os
import time
from typing import Any

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image
from diffusers import (
    AutoPipelineForImage2Image,
    AutoPipelineForInpainting,
    AutoPipelineForText2Image,
)

MODEL_NAME = "ReDom-1.6RD— Image"
MODEL_ID = os.getenv("REDOM_IMAGE_MODEL_ID", "stabilityai/stable-diffusion-xl-base-1.0")
INPAINT_MODEL_ID = os.getenv("REDOM_IMAGE_INPAINT_MODEL_ID", "diffusers/stable-diffusion-xl-1.0-inpainting-0.1")
IP_ADAPTER_REPO = os.getenv("REDOM_IMAGE_IP_ADAPTER_REPO", "h94/IP-Adapter")
IP_ADAPTER_SUBFOLDER = os.getenv("REDOM_IMAGE_IP_ADAPTER_SUBFOLDER", "sdxl_models")
IP_ADAPTER_WEIGHT = os.getenv("REDOM_IMAGE_IP_ADAPTER_WEIGHT", "ip-adapter_sdxl.bin")
IP_ADAPTER_ENABLED = os.getenv("REDOM_IMAGE_IP_ADAPTER_ENABLED", "true").lower() == "true"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

app = FastAPI(title=MODEL_NAME, version="2.0.0")

_text_pipe = None
_img2img_pipe = None
_inpaint_pipe = None
_ip_adapter_loaded = set()


class ReferenceImage(BaseModel):
    data_uri: str = Field(min_length=32, max_length=35_000_000)
    strength: float = Field(default=0.75, ge=0.0, le=1.0)
    role: str = Field(default="object", max_length=32)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    negative_prompt: str | None = Field(default=None, max_length=2000)
    width: int = Field(default=1024, ge=512, le=2048)
    height: int = Field(default=1024, ge=512, le=2048)
    steps: int = Field(default=30, ge=1, le=80)
    images: int = Field(default=1, ge=1, le=4)
    seed: int | None = Field(default=None, ge=0, le=2**32 - 1)
    guidance_scale: float = Field(default=7.0, ge=0.0, le=20.0)
    output_format: str = Field(default="png", pattern="^(png|jpeg|webp)$")
    aspect_ratio: str | None = None
    reference_images: list[ReferenceImage] = Field(default_factory=list, max_length=4)
    reference_strength: float = Field(default=0.75, ge=0.0, le=1.0)


class EditRequest(GenerateRequest):
    image_data_uri: str = Field(min_length=32, max_length=35_000_000)
    mask_data_uri: str | None = Field(default=None, max_length=35_000_000)
    strength: float = Field(default=0.65, ge=0.05, le=0.95)


def authorize(token: str | None):
    if ENGINE_TOKEN and token != ENGINE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid ReDom image engine credential.")


ENGINE_TOKEN = os.getenv("REDOM_IMAGE_ENGINE_TOKEN", "")


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
        _img2img_pipe = AutoPipelineForImage2Image.from_pretrained(
            MODEL_ID,
            torch_dtype=DTYPE,
            use_safetensors=True,
        )
        if DEVICE == "cuda":
            _img2img_pipe = _img2img_pipe.to("cuda")
        else:
            _img2img_pipe = _img2img_pipe.to("cpu")
    return _img2img_pipe


def pipeline_inpaint():
    global _inpaint_pipe
    if _inpaint_pipe is None:
        _inpaint_pipe = AutoPipelineForInpainting.from_pretrained(
            INPAINT_MODEL_ID,
            torch_dtype=DTYPE,
            use_safetensors=True,
        )
        if DEVICE == "cuda":
            _inpaint_pipe = _inpaint_pipe.to("cuda")
        else:
            _inpaint_pipe = _inpaint_pipe.to("cpu")
    return _inpaint_pipe


def ensure_ip_adapter(pipe):
    if not IP_ADAPTER_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Reference-image generation is disabled on this ReDom image worker. Enable REDOM_IMAGE_IP_ADAPTER_ENABLED.",
        )
    key = str(id(pipe))
    if key in _ip_adapter_loaded:
        return
    try:
        pipe.load_ip_adapter(
            IP_ADAPTER_REPO,
            subfolder=IP_ADAPTER_SUBFOLDER,
            weight_name=IP_ADAPTER_WEIGHT,
        )
        _ip_adapter_loaded.add(key)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ReDom reference-image adapter could not be loaded: {exc}") from exc


def decode_data_uri(value: str, label: str = "image") -> Image.Image:
    try:
        header, encoded = value.split(",", 1)
        if not header.startswith("data:image/") or ";base64" not in header:
            raise ValueError
        raw = base64.b64decode(encoded, validate=True)
        if not raw:
            raise ValueError
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}.") from exc


def decode_mask(value: str, width: int, height: int) -> Image.Image:
    try:
        header, encoded = value.split(",", 1)
        if not header.startswith("data:image/") or ";base64" not in header:
            raise ValueError
        raw = base64.b64decode(encoded, validate=True)
        mask = Image.open(io.BytesIO(raw)).convert("L")
        return mask.resize((width, height))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid inpainting mask.") from exc


def encode_image(image: Image.Image, output_format: str) -> tuple[str, str]:
    fmt = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[output_format]
    mime = {"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp"}[output_format]
    buf = io.BytesIO()
    if fmt == "JPEG":
        image = image.convert("RGB")
        image.save(buf, format=fmt, quality=95, optimize=True)
    elif fmt == "WEBP":
        image.save(buf, format=fmt, quality=95, method=6)
    else:
        image.save(buf, format=fmt, optimize=True)
    return mime, base64.b64encode(buf.getvalue()).decode("ascii")


def configure_reference_conditioning(pipe, references: list[ReferenceImage], default_strength: float):
    if not references:
        return None
    ensure_ip_adapter(pipe)
    images = [decode_data_uri(ref.data_uri, "reference image") for ref in references]
    scales = [max(0.0, min(1.0, ref.strength if ref.strength is not None else default_strength)) for ref in references]
    try:
        pipe.set_ip_adapter_scale(scales if len(scales) > 1 else scales[0])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid reference-image configuration: {exc}") from exc
    return images


def generate(pipe, request: GenerateRequest, image: Image.Image | None = None):
    results = []
    reference_images = configure_reference_conditioning(pipe, request.reference_images, request.reference_strength)
    seed = request.seed

    for index in range(request.images):
        current_seed = (seed + index) if seed is not None else int.from_bytes(os.urandom(4), "big")
        generator = torch.Generator(device=DEVICE).manual_seed(current_seed)

        kwargs: dict[str, Any] = {
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "width": request.width,
            "height": request.height,
            "num_inference_steps": request.steps,
            "guidance_scale": request.guidance_scale,
            "generator": generator,
        }

        if reference_images:
            kwargs["ip_adapter_image"] = reference_images

        if image is None:
            output = pipe(**kwargs).images[0]
        elif request.mask_data_uri:
            source = image.resize((request.width, request.height))
            mask = decode_mask(request.mask_data_uri, request.width, request.height)
            output = pipe(
                **kwargs,
                image=source,
                mask_image=mask,
                strength=request.strength,
            ).images[0]
        else:
            source = image.resize((request.width, request.height))
            output = pipe(
                **kwargs,
                image=source,
                strength=request.strength,
            ).images[0]

        mime, encoded = encode_image(output, request.output_format)
        results.append({
            "mimeType": mime,
            "dataBase64": encoded,
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
        "inpaintModelId": INPAINT_MODEL_ID,
        "device": DEVICE,
        "capabilities": {
            "textToImage": True,
            "imageToImage": True,
            "inpainting": True,
            "referenceImages": IP_ADAPTER_ENABLED,
            "multipleReferenceImages": IP_ADAPTER_ENABLED,
            "multipleOutputs": True,
            "seededGeneration": True,
            "negativePrompt": True,
            "aspectRatioControl": True,
            "outputFormats": ["png", "jpeg", "webp"],
        },
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
    source = decode_data_uri(request.image_data_uri, "source image")
    pipe = pipeline_inpaint() if request.mask_data_uri else pipeline_img2img()
    results = generate(pipe, request, source)
    return {
        "model": MODEL_NAME,
        "modelId": MODEL_ID if not request.mask_data_uri else INPAINT_MODEL_ID,
        "generationMs": round((time.perf_counter() - started) * 1000),
        "images": results,
    }
