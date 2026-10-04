# ReDom-1.6RD— Image GPU Worker

This is the ReDom-controlled inference service for the ReDom image-generation and image-editing subsystem.

## Runtime

- FastAPI HTTP service
- NVIDIA CUDA GPU
- Hugging Face Diffusers runtime
- Configurable open-weight model checkpoint
- Private worker authentication with `REDOM_IMAGE_ENGINE_TOKEN`
- ReDom backend remains the only public API boundary

The worker currently defaults to:

`stabilityai/stable-diffusion-xl-base-1.0`

through `REDOM_IMAGE_MODEL_ID`.

The public model identity remains:

`ReDom-1.6RD— Image`

The checkpoint is an internal runtime implementation detail and can be replaced by a ReDom-owned checkpoint without changing the client API.

## Endpoints

- `GET /health`
- `POST /v1/generate`
- `POST /v1/edit`

## Current capabilities

- Text-to-image
- Image-to-image editing
- Masked inpainting
- Reference-image conditioning through IP-Adapter
- Multiple reference images
- Multiple outputs
- Seeded generation
- Negative prompts
- Guidance-scale control
- Explicit width/height
- Aspect-ratio control
- PNG/JPEG/WebP output
- Capability discovery through `/health`

## Reference-image conditioning

Set:

`REDOM_IMAGE_IP_ADAPTER_ENABLED=true`

The worker loads the configured IP-Adapter and accepts reference images from the ReDom backend. Reference images are supplied as base64 image data and are never fetched from arbitrary remote URLs by the worker.

The adapter settings are configurable:

- `REDOM_IMAGE_IP_ADAPTER_REPO`
- `REDOM_IMAGE_IP_ADAPTER_SUBFOLDER`
- `REDOM_IMAGE_IP_ADAPTER_WEIGHT`

## Inpainting

The backend can send a source image plus a mask. White mask regions are replaced and black regions are preserved.

Configure the inpainting checkpoint with:

`REDOM_IMAGE_INPAINT_MODEL_ID`

## Security

The worker is intended to run on a private GPU network. Do not expose it directly to the public internet without an authenticated gateway.

The ReDom backend performs user authorization, quota enforcement, request security classification and generated-output security validation before storing the result.

## Capability direction

The API deliberately has a broader contract than the first SDXL runtime. The next runtime layers should add:

- ControlNet structural controls
- Dedicated super-resolution
- Background removal / subject extraction
- Outpainting
- Configured LoRA adapters
- Higher-resolution generation
- Stronger text rendering
- ReDom-trained image checkpoints

Current image APIs such as Gemini demonstrate multi-reference workflows, broad aspect-ratio support, high-resolution output and conversational editing. ReDom's API is being designed so these capabilities can be implemented inside its private runtime without exposing or depending on a hosted image-generation API.

Hugging Face Diffusers provides local components such as IP-Adapter, ControlNet and LoRA that fit this architecture.
