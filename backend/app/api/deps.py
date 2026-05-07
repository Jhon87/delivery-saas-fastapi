from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import verify_admin_token
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
) -> str:
    if not x_tenant_id or not x_admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Acesso administrativo requerido.")
    token_tenant_id = verify_admin_token(x_admin_token, get_settings().admin_token_secret)
    if token_tenant_id != x_tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessao administrativa invalida.")
    return x_tenant_id


AdminTenantId = Annotated[str, Depends(get_admin_tenant_id)]


def ensure_tenant(db: Session, tenant_id: str) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant nao encontrado.")
    return tenant
