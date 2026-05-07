import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select

from app.core.db import Base, SessionLocal, engine
from app.core.migrations import ensure_sqlite_columns
from app.models.entities import DeliveryLocation, Order, OrderItem, Tenant


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_columns(engine)

    with SessionLocal() as session:
        tenant = session.scalar(select(Tenant).where(Tenant.slug == "burger-demo"))
        if not tenant:
            print("Loja demo burger-demo ainda nao existe. Rode make seed-demo primeiro.")
            return

        order_ids = list(session.scalars(select(Order.id).where(Order.tenant_id == tenant.id)))
        if not order_ids:
            print("Nenhum pedido demo para limpar.")
            return

        session.execute(delete(DeliveryLocation).where(DeliveryLocation.tenant_id == tenant.id))
        session.execute(delete(OrderItem).where(OrderItem.tenant_id == tenant.id))
        session.execute(delete(Order).where(Order.tenant_id == tenant.id))
        session.commit()
        print(f"Pedidos demo removidos: {len(order_ids)}")


if __name__ == "__main__":
    main()
