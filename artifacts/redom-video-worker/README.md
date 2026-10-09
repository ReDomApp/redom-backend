# ReDom-v2.8—Video native GPU worker

This worker is the private ReDom generation runtime for **ReDom-v2.8—Video**.

## Architecture

The production path is:

`ReDom API → ReDom security gate → ReDom job queue → private GPU worker → ReDom-native video runtime → enhancement/compositing → R2 → ReDom output security validation → signed delivery`

The worker does **not** proxy or call a hosted video-generation provider. There are no provider-selection fields, provider API keys, or provider-generation endpoints in the runtime contract.

## Runtime

The worker loads a locally mounted ReDom video checkpoint from:

- `REDOM_VIDEO_CHECKPOINT_DIR`

The public product/model identity is:

- `ReDom-v2.8—Video`

The current runtime foundation is the local Wan2.2 TI2V-5B architecture. ReDom controls the checkpoint, GPU runtime, orchestration, segmentation, continuity conditioning, enhancement, storage, and security gate. The runtime must be provisioned with the checkpoint before production traffic is enabled.

The local TI2V runtime supports text-to-video and image-conditioned video generation. ReDom uses short scene segments with the previous scene's final frame as the next scene's visual reference to improve continuity rather than treating a five-minute project as one uncontrolled diffusion pass. The upstream implementation documents 720-class TI2V generation and 24fps operation. 

## Project duration

- Minimum: 4 seconds
- Maximum: 300 seconds (5 minutes)
- Scene segments: 5 seconds by default
- Final output is composited and enhanced by the ReDom worker.

Five minutes is a **maximum project duration**, not a guaranteed generation-time SLA.

## Creator formats and references

The native worker accepts three format modes: `video` (short-form scenes), `movie` (cinematic production), and `cartoon` (animation-directed generation). An optional private R2 reference-image key conditions the first generated segment; each following segment uses the previous segment final frame to preserve continuity. Reference assets are removed after the worker finishes or fails the job.

Every final encode applies the official ReDom logo beside a persistent far-right brand watermark: `ReDom Videos | AI-generated`, `ReDom Movie Studio | AI-generated`, or `ReDom Cartoon | AI-generated`. The worker image converts the approved ReDom SVG to PNG and installs DejaVu fonts for FFmpeg drawtext. Branding is applied after joining segments so it remains consistent across the finished output.

## Enhancement pipeline

After native generation, the worker applies ReDom-controlled post-processing:

- resolution scaling for the requested output tier
- denoise/deblocking
- controlled sharpening
- H.264 encoding
- AAC audio track normalization/encoding
- fast-start MP4 delivery

The generation worker does not make a generated object available directly. The backend performs output security validation before marking the job completed.

## CGI mode

The API supports a `cgi` operation. CGI mode augments the ReDom scene brief with physically based materials, coherent geometry, cinematic camera movement, volumetric lighting, stable object identity, realistic shadows, and temporal continuity. It is still rendered through the ReDom-controlled video runtime; it is not a third-party CGI API.

## Required worker environment

- `REDOM_VIDEO_MODEL_ID=ReDom-v2.8—Video`
- `REDOM_VIDEO_CHECKPOINT_DIR=/models/redom-v2.8-video`
- `REDOM_VIDEO_REDIS_URL`
- `REDOM_VIDEO_WORKER_TOKEN`
- `REDOM_VIDEO_QUEUE`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_REGION`

The checkpoint directory is intentionally external to the application image. Do not download model weights dynamically during a user generation request.

## Security

Security is enforced by the existing ReDom AI security event architecture before and after generation.

The worker itself rejects runtime/model mismatches and cannot enqueue a job unless the API supplies the ReDom-native runtime identity. The backend validates the completed MP4 before delivery.

Do not add a fallback to a hosted video-generation API. If the private GPU runtime is unavailable, the correct behavior is to fail the job and return temporary unavailability.
