import pytest
from app.security import validate_allowlisted_url


def test_https_allowlisted_url_passes():
    assert validate_allowlisted_url("https://www.fbi.gov/wanted", {"www.fbi.gov"}) == "https://www.fbi.gov/wanted"


@pytest.mark.parametrize("url", [
    "http://www.fbi.gov/wanted",
    "https://evil.example/wanted",
    "https://user:pass@www.fbi.gov/wanted",
    "https://www.fbi.gov:8443/wanted",
    "file:///etc/passwd",
])
def test_bad_url_rejected(url):
    with pytest.raises(ValueError):
        validate_allowlisted_url(url, {"www.fbi.gov"})


def test_ip_literal_rejected():
    with pytest.raises(ValueError):
        validate_allowlisted_url("https://8.8.8.8/", {"8.8.8.8"})
