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
- Maximum: 59 seconds (00:59), enforced by the backend and GPU worker
- Scene segments: 5 seconds by default
- Final output is composited and enhanced by the ReDom worker.

The 59-second limit is a hard output-duration ceiling, not a guaranteed generation-time SLA. Movie and Cartoon use the same cap; Movie Studio may direct either format but cannot export a longer video.

## Creator formats and references

The native worker accepts three format modes: `video` (short-form scenes), `movie` (cinematic production), and `cartoon` (animation-directed generation). Every generated/exported video is limited to 59 seconds maximum. Movie Intelligence and Cartoon Intelligence are coordinated capabilities, not competing formats: Movie Studio can plan/direct either format, while Cartoon—R8.0 renders animated shots. An optional private R2 reference-image key conditions the first generated segment; each following segment uses the previous segment final frame to preserve continuity. Reference assets are removed after the worker finishes or fails the job.

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

## RunPod Serverless Load Balancer

This FastAPI worker is intended to be deployed as a **Load balancer** endpoint, not a RunPod Queue endpoint. It owns its existing Redis queue consumer and accepts backend jobs at `POST /v1/jobs`.

- Health check path: `/ping` (returns HTTP 200)
- Application port: set `PORT=8080`
- Health-check port: set `PORT_HEALTH=8080`
- Expose HTTP port `8080` in the RunPod template/endpoint configuration.
- Keep the repository Dockerfile path as `artifacts/redom-video-worker/Dockerfile` and build context as `artifacts/redom-video-worker`.
- Mount the provisioned model checkpoint at `/models/redom-v2.8-video` and configure the required Redis and R2 variables before enabling traffic.

RunPod's edge authentication does not replace ReDom's application-level bearer token on `POST /v1/jobs`. Configure `REDOM_VIDEO_WORKER_TOKEN` to match the backend's `REDOM_VIDEO_ENGINE_TOKEN`.

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


## Movie audio, singing and lip sync

Movie production now generates separate audio assets before the shot queue starts, then mixes those assets into each shot and the final composition.

### Backend (Render) environment

- `ELEVENLABS_API_KEY`: required to generate speech and original music.
- `REDOM_DEFAULT_VOICE_ID`: optional fallback voice ID. Prefer per-character `voiceAssignments` supplied to the Movie Studio project request.
- `REDOM_MOVIE_VOICE_MODEL`: optional; defaults to `eleven_multilingual_v2`.
- `REDOM_MOVIE_MUSIC_MODEL`: optional; defaults to `music_v2_5`.

The authenticated `GET /ai/video/voices` endpoint returns available voice profiles. Set `voiceAssignments` as a map from character name to the selected voice ID. The planner should use each speaker's name and short dialogue text in the shot plan.

### GPU worker environment

- `SYNC_API_KEY`: required for shots containing dialogue when lip-sync is enabled.
- `REDOM_LIPSYNC_MODEL`: optional; defaults to `lipsync-2-pro`.

For lip sync, the worker uploads a short-lived source video and voice-only WAV to private R2 storage, supplies expiring signed URLs to Sync Labs, polls the generation, downloads the result, and deletes the temporary inputs. Dialogue is then mixed with the generated music and AAC-encoded into the final video. Keep the API key only in the worker's secret environment; never pass it from a client.

### Audio behavior and limitations

- Instrumental score is generated for the project; up to two planned song concepts can be generated with original lyrics and sung vocals.
- Spoken dialogue uses assigned ElevenLabs voice IDs and character-level timing metadata.
- The music-generation model can produce a singer with a requested vocal style, but its singer is not guaranteed to be the same identity as the character's spoken TTS voice. A dedicated, licensed singing-voice identity model would be required for exact singing/speaking identity continuity.
- Lip-sync is run per shot that contains dialogue. Keep close-up dialogue shots focused on one speaking character for best results; multi-character staging still requires visual QA.
- Music and lip-sync calls are paid external services and must be budgeted. The current worker does not claim Hollywood-grade quality without real rendered test scenes and review.
- If dialogue is present and `SYNC_API_KEY` is missing, the shot fails explicitly rather than silently returning a falsely marked lip-synced result.
- The video-generation worker still requires a provisioned CUDA GPU and mounted Wan2.2 checkpoint. A successful code build alone does not establish production readiness.


## Movie Studio finishing for Cartoon projects

When a Cartoon—R8.0 Movie Studio project reaches final composition, the Studio worker applies a dedicated animation post-production chain after joining the approved shots:
- Lanczos scaling to the selected delivery dimensions.
- Temporal/spatial denoising and debanding to reduce shimmer and banding.
- Mild saturation/contrast and edge refinement for a more coherent animated finish.
- Motion-compensated frame interpolation (default 48 fps) to smooth compatible motion between generated frames.
- ReDom Cartoon watermark and localized caption burn-in, followed by H.264/AAC encoding and final validation.

Configure `REDOM_STUDIO_CARTOON_INTERPOLATION_FPS` on the Studio worker as `48` (default), `60`, `30`, `24`, or `0` to disable interpolation. Optical-flow interpolation can produce artifacts on rapid cuts, particles, impact frames or heavy occlusion; use `0` or `24` for those projects and compare the actual rendered result. This is a real deterministic post-production pass, not a claim that FFmpeg can fix bad anatomy or turn an unsuitable checkpoint into a feature-animation model.

Studio also owns the existing story plan, shot pacing, language/audio planning, dialogue/music handoff and final composition. Cartoon remains responsible for the authored animated shot generation. The current compose pass does not regenerate character motion with a second diffusion model.

## Cartoon—R8.0 runtime readiness and checkpoint contract

The worker now rejects invalid model/runtime/format combinations at startup, validates that its configured checkpoint directory exists and is non-empty before loading, and reports `checkpointReady`, `gpuReady`, `pipelineLoaded` and `readiness` from `/health`. `/ping` remains the platform liveness endpoint; it is not proof the GPU model is ready.

For the dedicated Cartoon endpoint, configure:
- `REDOM_VIDEO_MODEL_ID=Cartoon—R8.0`
- `REDOM_VIDEO_RUNTIME_ID=redom-cartoon-r8-native`
- `REDOM_VIDEO_ALLOWED_FORMATS=cartoon`
- `REDOM_VIDEO_CHECKPOINT_DIR=/models/cartoon-r8`
- `REDOM_VIDEO_WAN_CONFIG=ti2v-5B` only when the provisioned Cartoon checkpoint is compatible with Wan2.2 TI2V-5B.

The worker injects an animation-specific direction into every cartoon segment, including identity/model-sheet invariants, human/animal anatomy, posing and motion, temporal artifacts, camera/world continuity and anime-style constraints. Movie Studio retains the separate responsibility of composing approved Cartoon shots, music, dialogue and captions. Composition currently means media assembly and post-processing, not a second diffusion-based generative enhancement pass.

**Provisioning caveat:** this code does not download or train model weights. The Cartoon checkpoint must be acquired/provisioned separately, have documented provenance/licensing, match the selected Wan architecture, and pass actual GPU renders. A non-empty directory is only a basic readiness signal, not a checkpoint-integrity or animation-quality certification. Do not enable production traffic until the twelve Cartoon acceptance tests in `docs/cartoon-r8-animation-intelligence-spec.md` have real render evidence.

## Deploying the three isolated model endpoints

The same worker image supports isolated deployment profiles through environment configuration. Deploy three separate RunPod Load Balancer endpoints from this Dockerfile. Do not point all three backend URLs at one endpoint.

| Endpoint | `REDOM_VIDEO_MODEL_ID` | `REDOM_VIDEO_RUNTIME_ID` | `REDOM_VIDEO_ALLOWED_FORMATS` | `REDOM_VIDEO_CHECKPOINT_DIR` |
|---|---|---|---|---|
| Video | `ReDom-v2.8—Video` | `redom-v2.8-native` | `video` | `/models/redom-v2.8-video` |
| Cartoon | `Cartoon—R8.0` | `redom-cartoon-r8-native` | `cartoon` | `/models/cartoon-r8` |
| Studio | `Studio—Ultron 8.0R` | `redom-studio-ultron-8r-native` | `movie,cartoon` | `/models/ultron-8r` |

For each endpoint, set the generic worker environment variables `REDOM_VIDEO_MODEL_ID`, `REDOM_VIDEO_RUNTIME_ID`, `REDOM_VIDEO_ALLOWED_FORMATS`, `REDOM_VIDEO_CHECKPOINT_DIR`, `REDOM_VIDEO_WORKER_TOKEN`, `REDOM_VIDEO_REDIS_URL`, and `REDOM_VIDEO_QUEUE` to that endpoint's profile. Set the R2 variables on each endpoint as well. Use a unique bearer token and queue per endpoint. The endpoint's bearer token must match its corresponding backend token.

Backend environment mapping:
- Video endpoint URL/token → `REDOM_VIDEO_ENGINE_URL` / `REDOM_VIDEO_ENGINE_TOKEN`
- Cartoon endpoint URL/token → `REDOM_CARTOON_ENGINE_URL` / `REDOM_CARTOON_ENGINE_TOKEN`
- Studio endpoint URL/token → `REDOM_STUDIO_ENGINE_URL` / `REDOM_STUDIO_ENGINE_TOKEN`

The configured checkpoint directory must contain the correct compatible checkpoint files before the worker is marked ready. The code does not synthesize or train weights. The currently checked-in runtime uses the Wan2.2 TI2V-5B implementation, so each mounted checkpoint must be compatible with that runtime. These endpoint profiles isolate routing and operational resources; they do not, by themselves, prove that three separately trained model weights exist. Do not describe a model as a separately trained proprietary model until its checkpoint provenance and quality have been verified.

The Studio endpoint receives live-action movie shots and all final-composition jobs from the backend's existing Movie Studio planner. Cartoon episode shots are sent to Cartoon—R8.0; final assembly for either movie or cartoon projects runs on Studio—Ultron 8.0R. It must use the Studio token for worker authorization and callbacks, and its own Redis URL/queue. The worker must have access to the same R2 bucket where project audio and shot assets are stored.
