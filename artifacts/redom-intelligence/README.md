# AUREX Intelligence by ReDom

Independent, backend-only AI inference service owned by ReDom. It is not mounted into the existing ReDom backend and does not alter existing AI routes, integrations, databases, auth middleware, or frontend.

## Model family

| Public ID | Display name | Role | Configuration |
|---|---|---|---|
| `aurex-1.8` | **AUREX 1.8** | General-purpose intelligence | `AUREX_18_BASE_URL`, `AUREX_18_API_KEY`, `AUREX_18_MODEL` |
| `rex-6.8` | **REX 6.8** | Coding, debugging, code review | `REX_68_BASE_URL`, `REX_68_API_KEY`, `REX_68_MODEL` |
| `aurex-apex` | **AUREX Apex** | Premium flagship reasoning | `AUREX_APEX_BASE_URL`, `AUREX_APEX_API_KEY`, `AUREX_APEX_MODEL` |

Each public ID needs its own explicitly configured private inference endpoint and actual served model. Incomplete routes are omitted from `GET /v1/models`; requests never silently route to another model. The current Compose template provisions only the example AUREX 1.8 engine. REX 6.8 and AUREX Apex are not active until their dedicated engines and model capacity are provisioned and validated. Display names do not mean models have been trained.

## API and security

- OpenAI-compatible `GET /v1/models` and `POST /v1/chat/completions`.
- Health: `GET /health/live`, `GET /health/ready`; readiness checks all configured model routes.
- Service-to-service bearer authentication; keys must be at least 32 characters.
- Static private inference endpoints only; no hosted-provider or cross-model fallback.
- No prompt/completion logging, durable conversation storage, memory, tools, file access, or autonomous actions.
- No existing ReDom database, auth, route, or frontend integration.

## Run and deploy

Copy `.env.example` to a private environment file, replace all sample secrets, and set AUREX 1.8 variables to match the inference server. Configure REX/Apex only when their actual dedicated engines are ready. Generate secrets with `openssl rand -hex 32`.

On a Linux host with NVIDIA drivers and NVIDIA Container Toolkit:

```sh
docker compose --env-file /secure/path/redom-intelligence.env -f deploy/compose.yaml up -d --build
```

The Compose file is a template, not proof of provisioned GPU capacity. Pin vLLM image digests and model revisions, verify licenses, and benchmark latency, throughput, VRAM, concurrency, and quality before production.

## Request example

```json
{
  "model": "aurex-1.8",
  "messages": [{ "role": "user", "content": "Explain vector databases." }],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

Supported roles are `system`, `user`, and `assistant`; streaming and tool calls are not implemented. Request bodies are capped at 1 MiB and messages at 100.

## Production gates

Provision and validate GPU hosting, immutable model revisions, image digests, licenses, live model integration tests, load/safety/quality evaluations, secret management, TLS/mTLS for cross-host traffic, network policy, metrics without prompt/credential capture, and model rollout controls. This is an inference gateway/model-routing foundation, not a trained foundation model or production-proven ChatGPT-equivalent system.
