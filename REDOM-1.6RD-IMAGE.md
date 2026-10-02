# ReDom-1.6RD— Image

## Purpose

ReDom-1.6RD— Image is ReDom's controlled image-generation subsystem. ReDom Mobile and ReDom Web call the authenticated ReDom backend; they do not call a hosted image-generation provider directly.

## Runtime path

ReDom Mobile / ReDom Web
→ ReDom Backend `/ai/image` or `/ai/image/edit`
→ ReDom image-engine service
→ private ReDom GPU worker
→ model checkpoint loaded inside the GPU worker
→ R2 image storage
→ Neon generation metadata
→ client receives the ReDom-hosted image URL

## Current model implementation

The first worker checkpoint is configured by `REDOM_IMAGE_MODEL_ID` and defaults to:

`stabilityai/stable-diffusion-xl-base-1.0`

The public ReDom model identity is always:

`ReDom-1.6RD— Image`

This separation is intentional: the checkpoint can later be replaced by a ReDom-trained checkpoint without changing the Mobile/Web API contract.

## Supported operations

- Text-to-image generation
- Image-to-image editing
- Explicit reference-image submission
- Multiple output capability at the worker boundary
- Seeded generation capability at the worker boundary
- Configurable image dimensions at the engine boundary
- R2 object storage
- Neon generation metadata
- Private worker authentication

## Storage

Generated files use:

`redom-ai/users/<user-id>/generations/<job-id>/`

The database records the generation metadata; PostgreSQL is not used as the image-file store.

## Security

The GPU worker is intended to be private and authenticated with `REDOM_IMAGE_ENGINE_TOKEN`.

Stored-image editing accepts ReDom R2 URLs only. Arbitrary remote URLs are not accepted for the stored-image edit path.

## Model/capability research used for the design

Google's current Nano Banana documentation describes native text-to-image generation, text-and-image editing, multi-turn iteration, reference-image workflows, aspect ratios, and 1K/2K/4K output. Those capabilities informed the ReDom abstraction, but ReDom does not call the Google image API.

ByteDance's current Seedream documentation describes unified image generation/editing, reference-image workflows, knowledge-driven generation, and high-resolution output. Seedance is a video-generation family, so it is not used as ReDom's image inference service.

Hugging Face Diffusers documentation provides the local inference implementation used by the initial worker architecture, including SDXL text-to-image and image-to-image pipelines.

OpenAI documentation was used only to understand the existing image API contract being replaced. The ReDom image endpoints no longer call the hosted image-generation operation.

## Future direction

1. Add a durable Redis-backed generation queue.
2. Add model registry and versioned ReDom checkpoints.
3. Add local safety/preflight and output validation.
4. Add dedicated upscaling, inpainting, background removal, and variation workers.
5. Replace the initial external open-weight checkpoint with a ReDom-trained checkpoint when the ReDom dataset and training infrastructure are ready.
6. Keep the Mobile/Web API stable while the internal model implementation evolves.