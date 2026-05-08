from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import get_nested_claim, verify_admin_token, verify_hs256_jwt
from app.models.entities import Tenant


DbSession = Annotated[Session, Depends(get_db)]


def get_tenant_id(x_tenant_id: Annotated[str | None, Header()] = None) -> str:
    if not x_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe o header X-Tenant-Id.",
        )
    return x_tenant_id


TenantId = Annotated[str, Depends(get_tenant_id)]


def get_admin_tenant_id(
    x_tenant_id: Annotated[str | None, Header()] = None,
    x_admin_token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not x_tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Acesso administrativo requerido.")
    settings = get_settings()
    token_tenant_id: str | None = None

    if settings.admin_auth_mode in {"local", "hybrid"} and x_admin_token:
        token_tenant_id = verify_admin_token(x_admin_token, settings.admin_token_secret)

    if not token_tenant_id and settings.admin_auth_mode in {"jwt", "hybrid"}:
        bearer_token = _get_bearer_token(authorization)
        if bearer_token and settings.jwt_secret:
            payload = verify_hs256_jwt(
                bearer_token,
                settings.jwt_secret,
                issuer=settings.jwt_issuer,
                audience=settings.jwt_audience,
            )
            claim_value = get_nested_claim(payload, settings.jwt_tenant_claim) if payload else None
            token_tenant_id = str(claim_value) if claim_value else None

    if token_tenant_id != x_tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessao administrativa invalida.")
    return x_tenant_id


AdminTenantId = Annotated[str, Depends(get_admin_tenant_id)]


def ensure_tenant(db: Session, tenant_id: str) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant nao encontrado.")
    return tenant


def _get_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token
