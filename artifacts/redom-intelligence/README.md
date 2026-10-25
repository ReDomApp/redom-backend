# ReDom Intelligence Core

Independent AI core/backend for ReDom-owned services. This package is a separate workspace artifact and deployable service; it does not mount routes into, import code from, or replace any existing ReDom AI implementation. No frontend is included.

## Boundary and current scope

- Own HTTP API process, configuration, service credentials, rate limiting, container and deployment lifecycle.
- OpenAI-compatible endpoints: `GET /v1/models` and `POST /v1/chat/completions`.
- Health endpoints: `GET /health/live` and `GET /health/ready`.
- Service-to-service bearer authentication; keys must be at least 32 characters.
- Calls only the statically configured inference endpoint. No OpenAI/Gemini/other hosted-provider fallback.
- No prompt/completion logging, durable conversation storage, memory, tools, file access, or autonomous external actions in this first slice.
- No connection to the existing ReDom database or user-auth middleware.
- The inference server is private to the Compose network; the API is bound to loopback on the host by default.

## Run locally

1. Copy `.env.example` to a private environment file and replace every example secret with independently generated random secrets.
2. Ensure a compatible inference server is running on a private network.
3. Set `INFERENCE_BASE_URL`, `INFERENCE_API_KEY`, and `INFERENCE_MODEL` to match that server.
4. Run `pnpm --filter @redom/intelligence-core typecheck`, `pnpm --filter @redom/intelligence-core test`, `pnpm --filter @redom/intelligence-core build`.
5. Start with `pnpm --filter @redom/intelligence-core start`.

Without valid service keys and inference configuration, readiness fails closed and model requests return 503. Generate a service key with a cryptographically secure generator, for example `openssl rand -hex 32`. Do not use the sample values as production credentials.

## GPU deployment

On a Linux host with NVIDIA drivers and NVIDIA Container Toolkit, set `SERVICE_API_KEYS`, `INFERENCE_API_KEY`, and (if needed) `HF_TOKEN` in the deployment environment, then run:

```sh
docker compose --env-file /secure/path/redom-intelligence.env -f deploy/compose.yaml up -d --build
```

The Compose file is a deployment template, not proof of provisioned GPU capacity. Pin the vLLM image by digest and pin the model to an immutable revision before production. Verify the model's license and commercial terms. Benchmark VRAM, throughput, latency, concurrency, and quality on the actual hardware. The example model is not a hardware or quality guarantee.

## API contract

Requests require `Authorization: Bearer <SERVICE_API_KEY>`. Use separate random keys for ReDom services and for the model server.

```http
GET /v1/models
Authorization: Bearer <SERVICE_API_KEY>
```

```http
POST /v1/chat/completions
Authorization: Bearer <SERVICE_API_KEY>
Content-Type: application/json

{
  "model": "redom-model",
  "messages": [
    { "role": "user", "content": "Explain vector databases." }
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

The `model` value must match `INFERENCE_MODEL`. Supported message roles in this first slice are `system`, `user`, and `assistant`; streaming and tool calls are not implemented. Request bodies are capped at 1 MiB and messages at 100.

## Production gates still required

- Provision and validate dedicated GPU hosting; choose/pin the model revision and image digest.
- Add end-to-end integration tests against the selected model server and load/safety/quality evaluations.
- Add external secret management, TLS/mTLS or a private authenticated service mesh for cross-host traffic, and network policy.
- Design durable conversations, user-level tenancy, memory, retention/deletion, quotas, abuse prevention, and prompt-injection controls before adding those features.
- Add metrics/tracing that never capture prompts, completions, or credentials by default.
- Add a model-evaluation and rollout process before routing production traffic.

This is a backend foundation, not a trained foundation model and not yet a production-proven ChatGPT-equivalent system. Existing ReDom AI routes, services, screens, and model integrations are intentionally untouched.
