"""Dependency-free Aurelink API client using urllib."""
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

DEFAULT_BASE_URL = "https://redom-backend.onrender.com/redom-backend/v1"


class AurelinkError(Exception):
    def __init__(self, message, *, status=0, code=None, request_id=None,
                 retry_after=None, idempotency_key=None, body=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id
        self.retry_after = retry_after
        self.idempotency_key = idempotency_key
        self.body = body


def verify_webhook_signature(payload, signature, timestamp, secret, *, tolerance_seconds=300, now=None):
    """Verify Aurelink's v1 HMAC-SHA256 signature against the exact raw request body."""
    try:
        stamp = int(timestamp)
        current = int(time.time() if now is None else now)
        if abs(current - stamp) > int(tolerance_seconds):
            return False
        supplied = str(signature).removeprefix("v1=")
        if len(supplied) != 64:
            return False
        raw = payload if isinstance(payload, bytes) else str(payload).encode("utf-8")
        expected = hmac.new(str(secret).encode("utf-8"), str(timestamp).encode("ascii") + b"." + raw, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, supplied.lower())
    except (TypeError, ValueError, UnicodeError):
        return False


class Aurelink:
    def __init__(self, api_key=None, *, base_url=DEFAULT_BASE_URL, timeout=30):
        self.api_key = api_key or os.getenv("AURELINK_API_KEY")
        if not self.api_key:
            raise ValueError("Aurelink requires an API key.")
        if not self.api_key.startswith(("aul_test_", "aul_live_")):
            raise ValueError("API key must be a valid Aurelink test or live key.")
        self.base_url = base_url.rstrip("/")
        self.timeout = max(1, min(120, float(timeout)))

    def request(self, path, *, method="GET", body=None, query=None,
                idempotency_key=None, idempotent=False, headers=None):
        url = self.base_url + "/" + path.lstrip("/")
        if query:
            encoded = urllib.parse.urlencode(query, doseq=True)
            url += ("&" if "?" in url else "?") + encoded
        request_headers = {"Accept": "application/json", "Authorization": "Bearer " + self.api_key}
        request_headers.update(headers or {})
        data = None
        if body is not None:
            request_headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        if idempotent and self.api_key.startswith("aul_live_"):
            idempotency_key = idempotency_key or str(uuid.uuid4())
            request_headers["Idempotency-Key"] = idempotency_key
        elif idempotency_key:
            request_headers["Idempotency-Key"] = idempotency_key
        req = urllib.request.Request(url, data=data, headers=request_headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read()
                parsed = json.loads(raw.decode("utf-8")) if raw else None
                return parsed
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                parsed = json.loads(raw.decode("utf-8")) if raw else {}
            except ValueError:
                parsed = {"message": raw.decode("utf-8", errors="replace")}
            raise AurelinkError(parsed.get("message", "Aurelink API request failed."),
                status=error.code, code=parsed.get("code"),
                request_id=error.headers.get("X-Aurelink-Request-Id"),
                retry_after=error.headers.get("Retry-After"),
                idempotency_key=idempotency_key, body=parsed) from error
        except (TimeoutError, OSError) as error:
            raise AurelinkError(str(error) or "Aurelink network request failed.",
                code="NETWORK_ERROR", idempotency_key=idempotency_key) from error

    @staticmethod
    def _id(value):
        return urllib.parse.quote(str(value), safe="")

    def list_services(self, **query):
        return self.request("/aurelink/catalog/services", query=query)

    def list_countries(self, **query):
        return self.request("/aurelink/catalog/countries", query=query)

    def list_orders(self, **query):
        return self.request("/aurelink/orders", query=query)

    def wallet(self):
        return self.request("/aurelink/wallet")

    def wallet_ledger(self, **query):
        return self.request("/aurelink/wallet/ledger", query=query)

    def quote_activation(self, payload):
        return self.request("/aurelink/quotes", method="POST", body=payload)

    def create_activation(self, payload, *, idempotency_key=None):
        return self.request("/aurelink/activations", method="POST", body=payload,
                            idempotent=True, idempotency_key=idempotency_key)

    def activation(self, order_id):
        return self.request("/aurelink/activations/{}/status".format(self._id(order_id)))

    def activation_messages(self, order_id):
        return self.request("/aurelink/activations/{}/messages".format(self._id(order_id)))

    def cancel_activation(self, order_id):
        return self.request("/aurelink/activations/{}/cancel".format(self._id(order_id)), method="POST", body={})

    def list_rentals(self, **query):
        return self.request("/aurelink/catalog/rentals", query=query)

    def quote_rental(self, payload):
        return self.request("/aurelink/rental-quotes", method="POST", body=payload)

    def create_rental(self, payload, *, idempotency_key=None):
        return self.request("/aurelink/rentals", method="POST", body=payload,
                            idempotent=True, idempotency_key=idempotency_key)

    def rental(self, rental_id):
        return self.request("/aurelink/rentals/{}/status".format(self._id(rental_id)))

    def rental_messages(self, rental_id):
        return self.request("/aurelink/rentals/{}/messages".format(self._id(rental_id)))

    def renew_rental(self, rental_id, payload=None, *, idempotency_key=None):
        return self.request("/aurelink/rentals/{}/renew".format(self._id(rental_id)),
                            method="POST", body=payload or {}, idempotent=True,
                            idempotency_key=idempotency_key)

    def list_nonvoip_countries(self):
        return self.request("/aurelink/nonvoip/countries")

    def list_nonvoip_products(self, **query):
        return self.request("/aurelink/nonvoip/products", query=query)

    def create_nonvoip_order(self, payload, *, idempotency_key=None):
        return self.request("/aurelink/nonvoip/orders", method="POST", body=payload,
                            idempotent=True, idempotency_key=idempotency_key)

    def nonvoip_messages(self, order_id):
        return self.request("/aurelink/nonvoip/orders/{}/messages".format(self._id(order_id)))

    def cancel_nonvoip_order(self, order_id):
        return self.request("/aurelink/nonvoip/orders/{}/cancel".format(self._id(order_id)), method="POST", body={})

    def list_dedicated_countries(self):
        return self.request("/aurelink/dedicated/countries")

    def quote_dedicated(self, payload):
        return self.request("/aurelink/dedicated/quote", method="POST", body=payload)

    def create_dedicated_order(self, payload, *, idempotency_key=None):
        return self.request("/aurelink/dedicated/orders", method="POST", body=payload,
                            idempotent=True, idempotency_key=idempotency_key)

    def dedicated_messages(self, order_id):
        return self.request("/aurelink/dedicated/orders/{}/messages".format(self._id(order_id)))

    def set_dedicated_auto_renew(self, order_id, enabled):
        return self.request("/aurelink/dedicated/orders/{}/auto-renew".format(self._id(order_id)),
                            method="PATCH", body={"enabled": bool(enabled)})

    def cancel_dedicated_order(self, order_id):
        return self.request("/aurelink/dedicated/orders/{}/cancel".format(self._id(order_id)), method="POST", body={})
