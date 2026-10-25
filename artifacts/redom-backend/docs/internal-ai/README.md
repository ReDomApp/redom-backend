# ReDom Internal AI Core

ReDom Internal AI is a separate, opt-in inference subsystem in the existing `artifacts/redom-backend` Express application. It does not replace or modify existing provider-backed AI routes or services.

## API

All routes are mounted under `/internal-ai` and require the existing ReDom bearer-token authentication middleware.

- `GET /internal-ai/status` — reports whether the private runtime is configured without exposing its URL or credentials.
- `POST /internal-ai/chat` — accepts `{ "message": "...", "language": "en" }` and returns a non-streaming reply.

The existing `/ai` route group remains unchanged. Clients must explicitly call `/internal-ai` to use this system.

## Environment

Set these variables in the existing backend deployment environment. They are read optionally by the new subsystem so a missing internal-AI configuration does not prevent the existing backend or existing AI providers from starting.

- `REDOM_INTERNAL_AI_BASE_URL` — private HTTPS URL of an OpenAI-compatible inference server, optionally ending in `/v1`.
- `REDOM_INTERNAL_AI_TOKEN` — long random bearer token configured on the inference gateway. Never expose it to clients or log it.
- `REDOM_INTERNAL_AI_MODEL` — model identifier served by the private runtime (defaults to `redom-internal`).

The service accepts HTTPS URLs. HTTP is permitted only for localhost/127.0.0.1 development. Prefer private networking or a restricted gateway; do not expose vLLM directly to the public internet.

## Initial inference contract

The first implementation targets an OpenAI-compatible `POST /v1/chat/completions` endpoint. It sends a single user turn and a ReDom-specific system instruction, disables streaming, applies a 60-second timeout, and does not return upstream error bodies to clients.

The current vertical slice intentionally does not persist conversations, use model tools, read arbitrary database data, or claim web access. These features must be added separately with explicit authorization, privacy, retention, and evaluation design.

## Security boundaries

- Existing ReDom authentication is required for every endpoint.
- Requests are schema-validated and length-limited.
- Chat is rate-limited per authenticated user.
- Runtime URL and bearer token are never returned by the API.
- Model output is treated as untrusted text. It has no direct database or tool access.
- The model receives only the submitted message and authenticated user identifier; client-supplied history is not accepted.
- Runtime errors are sanitized.
- The subsystem is additive; no current provider environment variables or service code are changed.

## Next milestones

1. Deploy and benchmark a commercially suitable open-weight instruct model on private cloud GPU infrastructure.
2. Add request/response streaming with cancellation and backpressure.
3. Add durable conversation storage only after existing schema and retention rules are audited.
4. Add retrieval with document-level access checks and prompt-injection defenses.
5. Add typed, allowlisted tools; never give the model direct SQL or unrestricted network access.
6. Add evaluation datasets, latency/throughput metrics, model version pinning, and staged rollout controls.
