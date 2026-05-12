import argparse
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.db import Base, SessionLocal, engine
from app.core.migrations import ensure_sqlite_columns
from app.core.security import hash_password
from app.models.entities import Tenant


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria ou atualiza uma loja diretamente no banco.")
    parser.add_argument("--name", required=True, help="Nome publico da loja.")
    parser.add_argument("--slug", required=True, help="Slug usado na URL /loja/{slug}.")
    parser.add_argument("--admin-password", required=True, help="Senha local de emergencia/admin demo.")
    parser.add_argument("--phone", default="", help="WhatsApp ou telefone da loja.")
    parser.add_argument("--address", default="", help="Endereco da loja.")
    parser.add_argument("--delivery-fee", default="0.00", help="Taxa de entrega padrao.")
    parser.add_argument("--estimated-delivery-minutes", type=int, default=40, help="Tempo medio de entrega.")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    ensure_sqlite_columns(engine)

    with SessionLocal() as session:
        tenant = session.scalar(select(Tenant).where(Tenant.slug == args.slug))
        created = tenant is None
        if tenant is None:
            tenant = Tenant(slug=args.slug)
            session.add(tenant)

        tenant.name = args.name
        tenant.phone = args.phone or None
        tenant.address = args.address or None
        tenant.delivery_fee = Decimal(args.delivery_fee)
        tenant.estimated_delivery_minutes = args.estimated_delivery_minutes
        tenant.admin_password_hash = hash_password(args.admin_password)

        session.commit()
        session.refresh(tenant)

    action = "criada" if created else "atualizada"
    print(f"Loja {action}: {tenant.name} ({tenant.slug})")
    print(f"TENANT_ID={tenant.id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
