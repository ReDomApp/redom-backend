# ReDom Shared Generative Intelligence: implementation and readiness record

## Existing implementation reviewed

The implementation branch was based on `main` after reviewing the 50 most recent commits (through 2026-10-09). Those commits show recent work on the native RunPod worker, language/caption handling, Studio planning and trailer approval, dialogue/music assets, and lip-sync. These are retained as useful foundations.

Relevant files inspected:
- `artifacts/redom-video-worker/README.md`
- `artifacts/redom-video-worker/app/main.py`
- `artifacts/redom-backend/src/services/redomVideoEngine.service.ts`
- `artifacts/redom-backend/src/services/redomVideoStudio.service.ts`
- `artifacts/redom-backend/src/services/redomMovieAudio.service.ts`
- `artifacts/redom-backend/src/services/redomVideoSecurity.service.ts`
- `artifacts/redom-backend/src/database/reDomVideoStudio.ts`
- `artifacts/redom-backend/src/routes/ai.routes.ts`
- `artifacts/redom-backend/package.json`
- `.github/workflows/redom-video-engine-checks.yml`

## Findings before upgrade

1. The GPU worker loads the local Wan2.2 TI2V-5B foundation, uses 24fps and short segments, and supports 4–300-second jobs. The README describes 720-class generation with optional scaling to 1080p; scaling is not native 1080p generation.
2. The worker request contract currently accepts `video`, `movie`, and `cartoon` format values, all through the same Wan-based generation path. That is not three independent models.
3. Movie Studio has valuable project-bible, entity, episode, scene, shot, research, story-state, revision, dialogue, soundtrack, and lip-sync work. However, `redomVideoStudio.service.ts` imports and invokes `createReDomVideoJob`, coupling production shots to the standalone video engine.
4. The existing worker has authenticated job submission and callbacks, private object storage, output validation, watermarking, and basic health endpoints. These controls should be preserved and strengthened.
5. Repository checks currently cover backend TypeScript type-checking and Python syntax. They do not prove GPU rendering quality, native high-resolution output, multilingual lip-sync quality, or long-production recovery.

## Initial implementation in this branch

- Added `redomCinematicModelRegistry.service.ts` with exactly three explicit identities:
  - `ReDom-v2.8—Video` / `redom-v2.8-native`
  - `Cartoon—R8.0` / `redom-cartoon-native`
  - `Studio—Ultron 8.0R` / `redom-studio-orchestrator`
- Added strict model/runtime identity validation and operation/format validation helpers.
- Added no-fallback behavior: a runtime that is not configured is unavailable rather than silently routed to another product.
- Added an authenticated `GET /video/models` catalogue endpoint. It reports configuration only as `configured_unprobed`, not as healthy or quality-validated.
- Kept the existing database and generation flows intact in this initial change; no historical records are rewritten.

## Runtime configuration contract

The backend registry expects these per-product runtime settings:
- Video: `REDOM_VIDEO_ENGINE_URL`, `REDOM_VIDEO_RUNTIME_ENABLED=true`
- Cartoon: `REDOM_CARTOON_ENGINE_URL`, `REDOM_CARTOON_RUNTIME_ENABLED=true`
- Studio: `REDOM_STUDIO_ENGINE_URL`, `REDOM_STUDIO_RUNTIME_ENABLED=true`

Worker-side checkpoint provisioning remains separate:
- Video: `REDOM_VIDEO_CHECKPOINT_DIR`
- Cartoon: `REDOM_CARTOON_CHECKPOINT_DIR`
- Studio: `REDOM_STUDIO_CHECKPOINT_DIR` only if a dedicated Studio runtime actually uses model weights locally.

Do not enable a product until its runtime has been deployed with real, licensed, provisioned weights and has passed its runtime health checks. A URL and environment flag alone do not establish readiness. These new settings are not yet wired into full production dispatch by this initial registry-only increment.

## Implementation phases and acceptance criteria

### Phase 1 — Registry and safe routing foundation
- [x] Define exactly three model identities and distinct runtime IDs.
- [x] Reject unknown model IDs and model/runtime mismatches through shared validation helpers.
- [x] Expose an authenticated model catalogue without misrepresenting configuration as health.
- [ ] Route every job submission through the registry and enforce model identity end-to-end.
- [ ] Add isolated runtime health probes and readiness reporting.

### Phase 2 — Separate runtimes and persistent production state
- [ ] Video runtime: standalone video operations only.
- [ ] Cartoon runtime: dedicated animation checkpoint/pipeline, character references and animation-specific validation.
- [ ] Studio runtime: orchestration and persistent production state independent of the video worker; explicitly select a shot-generation model per shot.
- [ ] Add safe migrations for model ID/version, runtime identity, generation config, checkpointed shot status, render versions and QA evidence.
- [ ] Preserve old jobs with explicit legacy identifiers and migration/backward-compatibility tests.

### Phase 3 — Quality, media, and resilience
- [ ] Implement source-aware research records with retrieval dates, claim provenance and rights basis.
- [ ] Add resumable production checkpoints and reuse validated shot outputs after interruption.
- [ ] Add multilingual voice, subtitle and lip-sync capability checks; do not mark unsupported language combinations complete.
- [ ] Add shot/scene/full-production media QA, FFprobe checks, transition checks and language/audio metadata validation.
- [ ] Measure actual GPU throughput, resolution, memory use, failure rate and cost using rendered jobs.

### Phase 4 — Release gate
A release is not production-ready until the acceptance suite in the engineering specification has recorded pass/fail/unverified status and includes real rendered media evidence. No generated samples or GPU measurements are claimed by this branch's registry change.

## Current status

This is an incremental architecture change, not completion of the full cross-genre generation upgrade. The three registry entries are present, but Cartoon and Studio runtimes are not proven operational by this change; end-to-end job dispatch, database migration, GPU benchmarks, multilingual rendering tests, and deployment validation remain outstanding. Do not market the three products as independent production-ready models until those gates pass.
