# ReDom three-model video architecture

## Model boundaries

| Model ID | Exclusive responsibility | Checkpoint mount | Runtime identity |
|---|---|---|---|
| `ReDom-v2.8—Video` | General video generation only | `/models/redom-v2.8-video` | `redom-v2.8-native` |
| `Cartoon—R8.0` | Cartoon and animation generation only | `/models/cartoon-r8` | `redom-cartoon-r8-native` |
| `Studio—Ultron 8.0R` | Full Movie Studio production, episodes, multi-shot continuity and final assembly | `/models/ultron-8r` | `redom-studio-ultron-8r-native` |

## Shared infrastructure

All three models can share the ReDom backend, authentication and entitlement checks, Redis technology, R2 storage, callback protocol, job metadata, safety checks, observability and deployment automation. Each model must have its own endpoint, credentials, checkpoint and inference runtime. GPU pools can be sized independently.

## Fail-closed routing requirement

- Video requests must target only `REDOM_VIDEO_ENGINE_URL` / `REDOM_VIDEO_ENGINE_TOKEN`.
- Cartoon requests must target only `REDOM_CARTOON_ENGINE_URL` / `REDOM_CARTOON_ENGINE_TOKEN`.
- Movie Studio requests must target only `REDOM_STUDIO_ENGINE_URL` / `REDOM_STUDIO_ENGINE_TOKEN`.
- A missing endpoint or checkpoint must return unavailable. Never silently run Cartoon or Studio requests through the video model.
- The existing Wan2.2 TI2V-5B worker is the initial ReDom-v2.8—Video runtime. It is not the Cartoon—R8.0 or Studio—Ultron 8.0R model.

## Production readiness

The model registry establishes canonical identities and endpoint/checkpoint contracts; it does not supply model weights or implement the two new inference engines. Do not enable production traffic for Cartoon—R8.0 or Studio—Ultron 8.0R until their actual model checkpoints, runtime adapters, queue routing and output validation are implemented and tested. Studio also requires durable multi-stage orchestration for planning, shot rendering, dialogue/audio, continuity and final composition. A single short-video inference call is not a Movie Studio engine.

## RunPod load balancer convention

For each HTTP worker, expose port `8080`, set `PORT=8080` and `PORT_HEALTH=8080`, and configure health path `/ping`. Keep separate endpoint secrets in secret fields. The worker must authenticate ReDom's bearer token independently of edge authentication.
