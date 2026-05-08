import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash or "$" not in stored_hash:
        return False
    salt, expected = stored_hash.split("$", 1)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return hmac.compare_digest(digest.hex(), expected)


def create_admin_token(tenant_id: str, secret: str, ttl_seconds: int = 60 * 60 * 12) -> str:
    expires_at = int(time.time()) + ttl_seconds
    payload = f"{tenant_id}:{expires_at}"
    signature = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def verify_admin_token(token: str, secret: str) -> str | None:
    parts = token.split(":")
    if len(parts) != 3:
        return None
    tenant_id, expires_at, signature = parts
    payload = f"{tenant_id}:{expires_at}"
    expected = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        expires_at_timestamp = int(expires_at)
    except ValueError:
        return None
    if expires_at_timestamp < int(time.time()):
        return None
    return tenant_id


def create_hs256_jwt(
    claims: dict[str, Any],
    secret: str,
    ttl_seconds: int = 60 * 60,
    issuer: str | None = None,
    audience: str | None = None,
) -> str:
    now = int(time.time())
    payload = {"iat": now, "exp": now + ttl_seconds, **claims}
    if issuer:
        payload["iss"] = issuer
    if audience:
        payload["aud"] = audience
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join(
        [
            _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
        ]
    )
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_base64url_encode(signature)}"


def verify_hs256_jwt(
    token: str,
    secret: str,
    issuer: str | None = None,
    audience: str | None = None,
) -> dict[str, Any] | None:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
        header = json.loads(_base64url_decode(header_segment))
        payload = json.loads(_base64url_decode(payload_segment))
    except (ValueError, json.JSONDecodeError):
        return None

    if header.get("alg") != "HS256":
        return None

    signing_input = f"{header_segment}.{payload_segment}"
    expected_signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    try:
        actual_signature = _base64url_decode(signature_segment)
    except ValueError:
        return None
    if not hmac.compare_digest(actual_signature, expected_signature):
        return None

    now = int(time.time())
    try:
        if "exp" in payload and int(payload["exp"]) < now:
            return None
        if "nbf" in payload and int(payload["nbf"]) > now:
            return None
    except (TypeError, ValueError):
        return None

    if issuer and payload.get("iss") != issuer:
        return None

    if audience and not _audience_matches(payload.get("aud"), audience):
        return None

    return payload


def get_nested_claim(payload: dict[str, Any], claim_path: str) -> Any:
    value: Any = payload
    for part in claim_path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _audience_matches(token_audience: Any, expected_audience: str) -> bool:
    if isinstance(token_audience, str):
        return token_audience == expected_audience
    if isinstance(token_audience, list):
        return expected_audience in token_audience
    return False
