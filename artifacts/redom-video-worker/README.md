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
