# Aurelink Python SDK

Dependency-free Python 3.9+ client for the Aurelink HTTP API.

## Install from this repository

```bash
pip install ./artifacts/aurelink-new/sdk/aurelink-python
```

Set `AURELINK_API_KEY` in your server environment. Never expose a live key in browser code or a public repository.

```python
import os
from aurelink import Aurelink

client = Aurelink(api_key=os.environ["AURELINK_API_KEY"])
services = client.list_services()
print(services)
```

The default API base is `https://redom-backend.onrender.com/redom-backend/v1`. Test keys use deterministic sandbox responses. Live purchases automatically include an idempotency key; pass your own stable `idempotency_key` when you need to safely retry the same purchase.

See the Node SDK README for the endpoint catalogue and webhook signature verification guidance. Plain HTTP is supported independently of both SDKs.

## Verify webhook deliveries

Verify the exact raw body before JSON parsing. Aurelink signs `timestamp + "." + raw_body` with HMAC-SHA256 and sends a `v1=` signature. The default tolerance is five minutes.

```python
from aurelink import verify_webhook_signature

valid = verify_webhook_signature(
    payload=raw_request_body,
    signature=request.headers["aurelink-signature"],
    timestamp=request.headers["aurelink-timestamp"],
    secret=os.environ["AURELINK_WEBHOOK_SECRET"],
)
if not valid:
    abort(400)
```

Deduplicate processed events using the webhook event `id`.
