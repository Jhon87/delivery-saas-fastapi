import hashlib
import hmac
import secrets
import time


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
