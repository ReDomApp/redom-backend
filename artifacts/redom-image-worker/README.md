# ReDom-1.6RD— Image GPU Worker

This is the ReDom-controlled inference service for the ReDom image-generation subsystem.

## Runtime

- FastAPI HTTP service
- NVIDIA CUDA GPU
- Hugging Face Diffusers runtime
- Default local model checkpoint: `stabilityai/stable-diffusion-xl-base-1.0`
- Override with `REDOM_IMAGE_MODEL_ID` or a locally mounted model path.
- No OpenAI, Google, ByteDance, or other hosted image-generation API is called by this worker.

The external model checkpoint is an initial implementation detail. The ReDom API uses the stable model identity `ReDom-1.6RD— Image`, so the underlying checkpoint can later be replaced by a ReDom-trained checkpoint without changing the client contract.

## Endpoints

- `GET /health`
- `POST /v1/generate`
- `POST /v1/edit`

The worker is intentionally private. Put it behind a private network or authenticated gateway and configure `REDOM_IMAGE_ENGINE_TOKEN`.

## Capability direction

The API contract is intentionally compatible with the capabilities that informed the ReDom design: text-to-image, image-to-image editing, explicit size/aspect controls, multiple outputs, deterministic seeds, and a model-router boundary. Google Nano Banana documents multimodal image generation/editing and 1K/2K/4K output; Seedream documents unified generation/editing and reference-image workflows; Seedance is a video-generation family and is therefore not used as the image inference engine. These capabilities inform the ReDom abstraction rather than creating a dependency on those hosted services.
