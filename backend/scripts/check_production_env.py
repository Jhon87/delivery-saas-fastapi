import argparse
import ast
import os
from pathlib import Path
from urllib.parse import urlparse


PLACEHOLDER_PARTS = (
    "seu-",
    "sua-",
    "seudominio",
    "example",
    "localhost",
    "127.0.0.1",
    "troque-por",
    "dev-change-me",
    "...",
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida variaveis de ambiente antes de publicar em producao.")
    parser.add_argument("--backend-env", default="backend/.env.production", help="Arquivo .env do backend.")
    parser.add_argument("--frontend-env", default="frontend/.env.production", help="Arquivo .env do frontend.")
    args = parser.parse_args()

    errors: list[str] = []
    warnings: list[str] = []

    backend_env = load_env_file(Path(args.backend_env))
    frontend_env = load_env_file(Path(args.frontend_env))

    if not backend_env:
      errors.append(f"Arquivo de backend nao encontrado ou vazio: {args.backend_env}")
    if not frontend_env:
      errors.append(f"Arquivo de frontend nao encontrado ou vazio: {args.frontend_env}")

    validate_backend(backend_env, errors, warnings)
    validate_frontend(frontend_env, errors, warnings)

    if warnings:
        print("Avisos:")
        for warning in warnings:
            print(f"  - {warning}")

    if errors:
        print("Erros de producao:")
        for error in errors:
            print(f"  - {error}")
        return 1

    print("Ambiente de producao validado.")
    return 0


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = strip_quotes(value.strip())
    return values


def strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def validate_backend(env: dict[str, str], errors: list[str], warnings: list[str]) -> None:
    require(env, "DATABASE_URL", errors)
    require(env, "CORS_ORIGINS", errors)
    require(env, "PUBLIC_BASE_URL", errors)
    require(env, "ALLOW_PUBLIC_TENANT_CREATION", errors)
    require(env, "ADMIN_AUTH_MODE", errors)

    database_url = env.get("DATABASE_URL", "")
    if database_url and not database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        errors.append("DATABASE_URL precisa apontar para Postgres/Supabase em producao.")

    public_base_url = env.get("PUBLIC_BASE_URL", "")
    if public_base_url and not is_https_url(public_base_url):
        errors.append("PUBLIC_BASE_URL deve ser uma URL https publica.")

    cors_origins = parse_cors_origins(env.get("CORS_ORIGINS", ""))
    if not cors_origins:
        errors.append("CORS_ORIGINS precisa conter ao menos a URL publica do frontend.")
    for origin in cors_origins:
        if not is_https_url(origin):
            errors.append(f"CORS_ORIGINS contem origem nao HTTPS ou invalida: {origin}")

    admin_auth_mode = env.get("ADMIN_AUTH_MODE", "")
    if admin_auth_mode not in {"local", "jwt", "hybrid"}:
        errors.append("ADMIN_AUTH_MODE deve ser local, jwt ou hybrid.")

    if env.get("ALLOW_PUBLIC_TENANT_CREATION", "").lower() not in {"false", "0", "no"}:
        errors.append("ALLOW_PUBLIC_TENANT_CREATION deve ficar false em producao.")

    admin_secret = env.get("ADMIN_TOKEN_SECRET", "")
    if admin_auth_mode in {"local", "hybrid"} and is_weak_secret(admin_secret):
        errors.append("ADMIN_TOKEN_SECRET precisa ser forte quando ADMIN_AUTH_MODE usa local ou hybrid.")

    if admin_auth_mode in {"jwt", "hybrid"}:
        require(env, "JWT_SECRET", errors)
        require(env, "JWT_ISSUER", errors)
        require(env, "JWT_AUDIENCE", errors)
        require(env, "JWT_TENANT_CLAIM", errors)
        if env.get("JWT_ISSUER") and not is_https_url(env["JWT_ISSUER"]):
            errors.append("JWT_ISSUER deve ser a URL https do emissor Supabase Auth.")

    if env.get("PAYMENT_PROVIDER") == "mercado_pago" and is_placeholder(env.get("MERCADO_PAGO_ACCESS_TOKEN", "")):
        warnings.append("PAYMENT_PROVIDER=mercado_pago esta ativo, mas MERCADO_PAGO_ACCESS_TOKEN parece placeholder.")

    if env.get("SUPABASE_URL") or env.get("SUPABASE_SERVICE_ROLE_KEY"):
        require(env, "SUPABASE_URL", errors)
        require(env, "SUPABASE_SERVICE_ROLE_KEY", errors)
        if env.get("SUPABASE_URL") and not is_https_url(env["SUPABASE_URL"]):
            errors.append("SUPABASE_URL deve ser uma URL https.")


def validate_frontend(env: dict[str, str], errors: list[str], warnings: list[str]) -> None:
    require(env, "VITE_API_URL", errors)
    require(env, "VITE_WS_URL", errors)

    api_url = env.get("VITE_API_URL", "")
    if api_url and not is_https_url(api_url):
        errors.append("VITE_API_URL deve ser uma URL https publica.")
    if api_url and not api_url.rstrip("/").endswith("/api"):
        warnings.append("VITE_API_URL normalmente deve terminar em /api.")

    ws_url = env.get("VITE_WS_URL", "")
    if ws_url:
        parsed = urlparse(ws_url)
        if parsed.scheme != "wss" or not parsed.netloc or is_placeholder(ws_url):
            errors.append("VITE_WS_URL deve ser uma URL wss publica.")
        if not ws_url.rstrip("/").endswith("/api"):
            warnings.append("VITE_WS_URL normalmente deve terminar em /api.")

    supabase_url = env.get("VITE_SUPABASE_URL", "")
    supabase_anon_key = env.get("VITE_SUPABASE_ANON_KEY", "")
    if supabase_url or supabase_anon_key:
        require(env, "VITE_SUPABASE_URL", errors)
        require(env, "VITE_SUPABASE_ANON_KEY", errors)
        if supabase_url and not is_https_url(supabase_url):
            errors.append("VITE_SUPABASE_URL deve ser uma URL https.")


def require(env: dict[str, str], key: str, errors: list[str]) -> None:
    value = env.get(key, "")
    if not value or is_placeholder(value):
        errors.append(f"{key} nao foi configurada com valor real.")


def is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return True
    return any(part in normalized for part in PLACEHOLDER_PARTS)


def is_weak_secret(value: str) -> bool:
    return is_placeholder(value) or len(value) < 32


def is_https_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc) and not is_placeholder(value)


def parse_cors_origins(value: str) -> list[str]:
    if not value:
        return []
    try:
        parsed = ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(parsed, list):
        return [str(item) for item in parsed]
    return []


if __name__ == "__main__":
    raise SystemExit(main())
