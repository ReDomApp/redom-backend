# Self-hosted GPU inference (operator guide)

This is an optional deployment template for the independent ReDom Internal AI subsystem. It does not deploy automatically with the backend and does not modify existing AI integrations.

## Requirements

- A Linux GPU host with NVIDIA drivers and NVIDIA Container Toolkit configured.
- Docker Compose with GPU device reservations supported.
- Sufficient GPU VRAM for the chosen model, context length, concurrency, and quantization.
- A private network path from the backend host to the inference host.

## Start

1. Choose a model and verify its license, provenance, hardware requirements, and commercial-use terms.
2. Set `MODEL_ID`, `SERVED_MODEL_NAME`, `INTERNAL_AI_API_KEY`, and optionally `HF_TOKEN` in the inference host environment.
3. Run `docker compose -f compose.yaml up -d`.
4. Verify model readiness locally before configuring the backend.
5. Configure the backend's `INTERNAL_AI_BASE_URL`, `INTERNAL_AI_API_KEY`, and `INTERNAL_AI_MODEL` to match the private service and exact served model name; then set `INTERNAL_AI_ENABLED=true`.

The default model value is a starting example only, not a quality or hardware recommendation. Benchmark candidate models on the target GPU before production use.

## Network and security

The template binds port 8000 to loopback and is not directly reachable from another machine by default. Configure a private VPN/VPC/tunnel or a mutually authenticated private proxy, then use that private address for `INTERNAL_AI_BASE_URL`. Do not publish an unauthenticated inference endpoint to the public internet. Use a strong unique API key and restrict outbound/inbound firewall rules.

## Important

A model server is not the same thing as training a foundation model. This setup serves existing open-weight model weights. Fine-tuning, evaluation, dataset governance, and any from-scratch pretraining are separate projects. Do not turn the backend feature flag on until the real inference endpoint has been validated.
