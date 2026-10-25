# ReDom Internal AI subsystem

This subsystem is intentionally independent from the existing ReDom AI providers and feature routes.

## Boundary

- API namespace planned: `/internal-ai`; route module is intentionally not mounted in the application router yet.
- Inference protocol: OpenAI-compatible `POST /v1/chat/completions` on a dedicated, privately networked model-serving endpoint.
- No fallback to OpenAI, Gemini, existing ReDom AI services, or any other provider.
- No database writes, user-memory persistence, tools, file access, or external actions are exposed by this initial foundation.
- Existing `/ai` routes and their service implementations are not changed by this subsystem.

## Environment

Set these on the backend service only when a private inference server is ready:

- `INTERNAL_AI_ENABLED=true`
- `INTERNAL_AI_BASE_URL=https://<private-inference-host>` (base URL, not the `/v1/chat/completions` path)
- `INTERNAL_AI_API_KEY=<long-random-secret>`
- `INTERNAL_AI_MODEL=<exact-served-model-id>`
- `INTERNAL_AI_TIMEOUT_MS=90000` (optional; bounded to 1–180 seconds)

Until all required values exist and the feature flag is explicitly enabled, chat returns HTTP 503 and does not call any provider.

## API

The route module is prepared to use the existing ReDom bearer-token authentication middleware, but is not reachable through the application until separately reviewed and mounted.

- `GET /internal-ai/status` — configuration readiness only; does not probe the inference host.
- `GET /internal-ai/models` — configured model catalogue.
- `POST /internal-ai/chat/completions` — JSON body:
  ```json
  {
    "messages": [
      { "role": "user", "content": "Explain vector databases." }
    ],
    "temperature": 0.7,
    "maxTokens": 1024
  }
  ```

## Production requirements before enabling

1. Put model serving on a private network; do not expose its port publicly.
2. Store the inference API key in the hosting provider's secret store.
3. Pin the model revision and verify its license for the intended commercial use.
4. Run quality, safety, load, latency, and GPU-memory benchmarks on the actual target hardware.
5. Add observability without logging prompts, completion bodies, or secrets by default.
6. Decide on durable conversation storage, deletion/retention, user quotas, and abuse controls before introducing persistence or tools.

This commit provides the isolated backend integration foundation, not trained model weights or GPU deployment. The service is not operational until a compatible inference server and its secrets are provisioned.
