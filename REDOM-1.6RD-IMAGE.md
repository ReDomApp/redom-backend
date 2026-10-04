# ReDom-1.6RD— Image

## Purpose

ReDom-1.6RD— Image is ReDom's controlled image-generation and image-editing subsystem. ReDom Mobile and ReDom Web call the authenticated ReDom backend; clients never call a hosted image-generation provider directly.

## Runtime path

ReDom Mobile / ReDom Web
→ ReDom Backend `/ai/image` or `/ai/image/edit`
→ ReDom image-engine service
→ private ReDom GPU worker
→ model checkpoint / adapters loaded inside the GPU worker
→ R2 image storage
→ Neon generation metadata
→ client receives ReDom-hosted image URLs

## Current capability contract

The backend and worker now expose a real image-engine contract instead of a prompt-only wrapper:

- Text-to-image generation
- Whole-image image-to-image editing
- Masked inpainting
- Reference-image conditioning
- Up to 4 reference images in the current public ReDom contract
- Reference roles: subject, character, style, composition and object
- Reference strength control
- Multiple output images per request
- Deterministic seeded generation
- Negative prompts
- Guidance-scale control
- Explicit width and height
- Aspect-ratio presets: 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 4:5, 5:4 and 21:9
- PNG, JPEG and WebP output
- Persistent output manifest for every generated image
- Persistent generation settings for reproducibility
- Private GPU-worker authentication
- ReDom input and output security validation
- Backward-compatible `image` response field while also returning `images[]`

The worker's `/health` endpoint advertises its enabled capability set so the backend/operations layer can distinguish a configured capability from a merely documented one.

## Current worker foundation

The initial worker uses Hugging Face Diffusers with an SDXL checkpoint selected by `REDOM_IMAGE_MODEL_ID`.

Default:

`stabilityai/stable-diffusion-xl-base-1.0`

The public model identity remains:

`ReDom-1.6RD— Image`

This separation is intentional. The inference runtime is an internal implementation boundary, so the base checkpoint can be replaced by a ReDom-trained or otherwise approved open-weight checkpoint without changing the Mobile/Web API contract.

Reference conditioning uses IP-Adapter when `REDOM_IMAGE_IP_ADAPTER_ENABLED=true`. Inpainting uses the configured `REDOM_IMAGE_INPAINT_MODEL_ID`.

## Why the engine is being built this way

Modern image systems expose capabilities beyond a single prompt box. For example, current image APIs support multiple reference images, many aspect ratios, high-resolution output, conversational editing, and strong text rendering. ReDom therefore keeps those capabilities in the engine contract rather than baking them into one frontend screen.

The local Diffusers architecture also provides composable building blocks such as IP-Adapter for image conditioning, ControlNet for structural controls, and LoRA for lightweight model adaptation. Those are suitable future components for ReDom's private GPU runtime.

## Important capability boundary

The current SDXL worker is **not yet feature-equivalent to the newest commercial image models**.

In particular, the current production foundation does not yet provide:

1. Native 4K generation with the quality of a dedicated high-resolution image model.
2. Native high-fidelity text/layout rendering comparable to newer image foundation models.
3. Full conversational multi-turn visual state and edit history inside the image runtime.
4. Native object/subject removal and outpainting as first-class operations.
5. ControlNet pose/depth/edge controls.
6. Configured LoRA/model-personalization management.
7. Dedicated super-resolution/background-removal pipelines.
8. Web-grounded image creation.
9. A ReDom-trained foundation checkpoint.

These are engineering targets, not claims that the current worker already supports them.

## Recommended model evolution

The next major quality step should be a model-router architecture:

`ReDom-1.6RD API`
→ `ReDom image runtime router`
→ `T2I runtime`
→ `Edit / reference runtime`
→ `Inpaint runtime`
→ `Upscale runtime`
→ `Control runtime`
→ `ReDom checkpoint`

An open-weight model such as the Apache-2.0 Qwen-Image family demonstrates the kind of text rendering and editing capability ReDom needs while remaining compatible with the private-worker architecture. The Qwen-Image-Edit family also demonstrates multi-image editing. ReDom should evaluate such models as runtime foundations rather than exposing any third-party model identity to users. The eventual target remains a ReDom-owned checkpoint.

## Storage

Generated files use:

`redom-ai/users/<user-id>/generations/<job-id>/`

The database records the request settings and complete output manifest; PostgreSQL is not used as the image-file store.

## Security

The GPU worker is intended to be private and authenticated with `REDOM_IMAGE_ENGINE_TOKEN`.

Stored-image editing accepts ReDom R2 URLs only. Arbitrary remote URLs are not accepted for stored-image edit requests.

Image requests continue through ReDom's server-side image security and output validation before generated assets are persisted.

## Environment

Core:

`REDOM_IMAGE_ENGINE_URL`
`REDOM_IMAGE_ENGINE_TOKEN`
`REDOM_IMAGE_ENGINE_TIMEOUT_MS`
`REDOM_IMAGE_MODEL_ID`

Advanced runtime:

`REDOM_IMAGE_INPAINT_MODEL_ID`
`REDOM_IMAGE_IP_ADAPTER_ENABLED`
`REDOM_IMAGE_IP_ADAPTER_REPO`
`REDOM_IMAGE_IP_ADAPTER_SUBFOLDER`
`REDOM_IMAGE_IP_ADAPTER_WEIGHT`
`REDOM_IMAGE_MAX_DIMENSION`

## Compatibility

Existing clients may continue to read:

`image`

New clients should prefer:

`images[]`

Each output includes its ReDom storage URL, dimensions, MIME type and seed where available.

The API remains stable while the GPU runtime evolves.
