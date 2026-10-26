# ReDom Intelligence Core

Independent backend-only AI service owned by ReDom. This service is not mounted into the existing ReDom backend and does not modify existing AI providers, routes, databases, authentication middleware, or frontend screens.

## Product models

| Public ID | Intended role | Environment prefix |
|---|---|---|
| `orex` — **OREX** | General-purpose assistant: knowledge, writing, analysis, tool-assisted research | `OREX_` |
| `apex` — **APEX** | Advanced reasoning and multi-step analysis | `APEX_` |
| `ultron` — **ULTRON** | Coding, debugging, code review, software engineering | `ULTRON_` |

These are ReDom product identities and routing slots, not claims that ReDom has trained foundation models from scratch. Each identity requires a real, separately configured inference endpoint and actual model weights. Unconfigured routes are not advertised. Role labels do not prove capability quality; the model must pass the relevant evaluations before production promotion.

## Implemented capabilities

- OpenAI-compatible `GET /v1/models` and `POST /v1/chat/completions`.
- Real inference through an explicitly configured OpenAI-compatible model server (for example, self-hosted vLLM). No provider fallback.
- Opt-in web research through `web_search: true` using the fixed Brave Search API endpoint. The model may call only the built-in search tool; arbitrary tool definitions and arbitrary URL fetches are not exposed.
- Up to three bounded tool-call rounds per completion. Search results are treated as untrusted evidence, and source links are appended to the final answer.
- Health: `GET /health/live` and `GET /health/ready`; readiness probes configured model endpoints.
- Bearer service authentication with timing-safe hash comparison; pre-auth peer-IP and authenticated service-key rate limits; bounded concurrent inference; bounded request body and aggregate prompt size; strict JSON content type; response security headers; bounded inference/search timeouts.
- No prompt or completion logging, no durable conversation storage, no filesystem or shell access, and no autonomous write actions.

### Web research setup

Set `BRAVE_SEARCH_API_KEY` using a secret manager. The API key is never returned to callers or passed into the model. Enable research on a request with:

```json
{
  "model": "orex",
  "web_search": true,
  "messages": [
    { "role": "user", "content": "Compare the latest official documentation for these two APIs and cite sources." }
  ],
  "max_tokens": 1500
}
```

If the key is missing, an explicit research request fails closed with `WEB_SEARCH_NOT_CONFIGURED`. Ordinary chat does not make web requests. A search provider's snippets are not the same as fetching and reading every linked page; the model should disclose evidence limits and verify important claims against primary sources.

## Security boundaries and production requirements

The current controls are defense-in-depth, not a claim of a completed security certification. The in-memory rate limiter is per process and cannot enforce a global quota across replicas. The pre-auth limiter uses the socket peer address and deliberately does not trust spoofable forwarded headers. Production needs a reverse proxy with correctly configured trusted-proxy policy, distributed quotas, TLS or mTLS, network egress policy, secret rotation, dependency/image pinning, vulnerability scanning, centralized redacted audit events, metrics, backups, and an incident response plan. Never expose the inference engine directly to the public internet.

The web-search integration contacts a fixed provider endpoint and does not fetch arbitrary URLs, reducing SSRF exposure. Search results remain untrusted; prompt injection defenses reduce but cannot eliminate model susceptibility. Do not give retrieved text access to secrets or privileged tools.

## Local deployment

1. Copy `.env.example` to a secret-protected environment file and replace all sample secrets.
2. Provision a Linux host with compatible NVIDIA drivers and NVIDIA Container Toolkit.
3. Configure `OREX_BASE_URL`, `OREX_API_KEY`, and `OREX_MODEL` to match a real serving engine.
4. Build and run the service with the repository's documented Compose template.
5. Pin container digests and model revisions, verify each model's license, and benchmark VRAM, throughput, latency, concurrency, tool-call quality, coding tasks, reasoning tasks, and safety before promoting it.

The checked-in Compose template is deployment configuration, not proof that GPU hosting or model weights are available. CI tests with mock inference verify API behavior only; they do not validate actual model quality or live GPU inference.
