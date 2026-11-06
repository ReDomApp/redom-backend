import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from io import BytesIO
from aurelink import Aurelink, AurelinkError, verify_webhook_signature


class FakeResponse:
    def __init__(self, body, status=200):
        self.body = json.dumps(body).encode()
        self.status = status
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self): return self.body


class AurelinkClientTests(unittest.TestCase):
    def test_webhook_signature_verification(self):
        import hashlib
        import hmac
        secret = "whsec_test_secret"
        timestamp = "1793994000"
        payload = b'{"id":"evt_1","type":"sms.received"}'
        signature = "v1=" + hmac.new(secret.encode(), timestamp.encode() + b"." + payload, hashlib.sha256).hexdigest()
        self.assertTrue(verify_webhook_signature(payload, signature, timestamp, secret, now=1793994000))
        self.assertFalse(verify_webhook_signature(payload, signature, timestamp, secret, now=1793994600))

    def test_requires_valid_key(self):
        with self.assertRaises(ValueError):
            Aurelink("invalid")
        with self.assertRaises(ValueError):
            Aurelink(None)

    @patch("urllib.request.urlopen")
    def test_authenticated_service_request(self, open_url):
        open_url.return_value = FakeResponse({"success": True, "services": []})
        client = Aurelink("aul_test_example")
        result = client.list_services(country="US")
        self.assertTrue(result["success"])
        request = open_url.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer aul_test_example")
        self.assertIn("country=US", request.full_url)

    @patch("urllib.request.urlopen")
    def test_live_purchase_has_idempotency_header(self, open_url):
        open_url.return_value = FakeResponse({"success": True}, 201)
        client = Aurelink("aul_live_example")
        client.create_activation({"service": "telegram"}, idempotency_key="purchase-1")
        request = open_url.call_args.args[0]
        self.assertEqual(request.get_header("Idempotency-key"), "purchase-1")

    @patch("urllib.request.urlopen")
    def test_structured_rate_limit_error(self, open_url):
        headers = {"Retry-After": "60", "X-Aurelink-Request-Id": "req-1"}
        error = HTTPError("https://api.test", 429, "slow down", headers,
                          BytesIO(json.dumps({"message":"Rate limited","code":"RATE_LIMIT_EXCEEDED"}).encode()))
        open_url.side_effect = error
        with self.assertRaises(AurelinkError) as caught:
            Aurelink("aul_test_example").list_services()
        self.assertEqual(caught.exception.status, 429)
        self.assertEqual(caught.exception.retry_after, "60")
        self.assertEqual(caught.exception.request_id, "req-1")


if __name__ == "__main__":
    unittest.main()
