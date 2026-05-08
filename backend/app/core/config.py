from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Delivery SaaS FastAPI"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./delivery_saas.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    public_base_url: str = "http://localhost:8000"
    local_upload_dir: str = "uploads"
    admin_token_secret: str = "dev-change-me"
    admin_auth_mode: Literal["local", "jwt", "hybrid"] = "local"
    jwt_secret: str | None = None
    jwt_issuer: str | None = None
    jwt_audience: str | None = None
    jwt_tenant_claim: str = "app_metadata.tenant_id"
    payment_provider: str = "simulated"
    mercado_pago_access_token: str | None = None

    supabase_url: AnyHttpUrl | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "product-images"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator(
        "mercado_pago_access_token",
        "jwt_secret",
        "jwt_issuer",
        "jwt_audience",
        "supabase_url",
        "supabase_service_role_key",
        mode="before",
    )
    @classmethod
    def empty_string_as_none(cls, value: str | None) -> str | None:
        if value == "":
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
