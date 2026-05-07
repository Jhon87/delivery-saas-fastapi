from sqlalchemy import Engine, text

from app.core.security import hash_password


def ensure_sqlite_columns(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    required_columns: dict[str, dict[str, str]] = {
        "tenants": {
            "phone": "TEXT",
            "address": "TEXT",
            "logo_url": "TEXT",
            "banner_url": "TEXT",
            "opening_hours": "VARCHAR(160)",
            "delivery_fee": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
            "estimated_delivery_minutes": "INTEGER NOT NULL DEFAULT 40",
            "is_open": "BOOLEAN NOT NULL DEFAULT 1",
            "admin_password_hash": "VARCHAR(220)",
        },
        "orders": {
            "address_complement": "TEXT",
            "delivery_latitude": "NUMERIC(9, 6)",
            "delivery_longitude": "NUMERIC(9, 6)",
            "order_notes": "TEXT",
            "payment_status": "VARCHAR(9) NOT NULL DEFAULT 'Pendente'",
            "payment_provider": "VARCHAR(40)",
            "payment_external_id": "VARCHAR(160)",
            "payment_checkout_url": "TEXT",
            "delivery_fee": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
        },
        "products": {
            "sort_order": "INTEGER NOT NULL DEFAULT 0",
        },
    }

    with engine.begin() as connection:
        for table_name, columns in required_columns.items():
            existing = {
                row[1]
                for row in connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            }
            for column_name, definition in columns.items():
                if column_name not in existing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))
        connection.execute(
            text("UPDATE tenants SET admin_password_hash = :password_hash WHERE admin_password_hash IS NULL"),
            {"password_hash": hash_password("admin123")},
        )
        connection.execute(text("UPDATE orders SET payment_mode = 'PIX' WHERE payment_mode = 'pix'"))
        connection.execute(text("UPDATE orders SET payment_mode = 'Cartao' WHERE payment_mode = 'card'"))
        connection.execute(
            text("UPDATE orders SET payment_mode = 'Dinheiro na Entrega' WHERE payment_mode = 'cash_on_delivery'")
        )
        connection.execute(
            text("UPDATE orders SET payment_mode = 'Maquininha na Entrega' WHERE payment_mode = 'card_on_delivery'")
        )
        connection.execute(text("UPDATE orders SET status = 'Pendente' WHERE status = 'pending'"))
        connection.execute(text("UPDATE orders SET status = 'Preparando' WHERE status = 'preparing'"))
        connection.execute(text("UPDATE orders SET status = 'Saiu para Entrega' WHERE status = 'out_for_delivery'"))
        connection.execute(text("UPDATE orders SET status = 'Entregue' WHERE status = 'delivered'"))
        connection.execute(text("UPDATE orders SET status = 'Cancelado' WHERE status = 'canceled'"))
        connection.execute(text("UPDATE orders SET payment_status = 'Pendente' WHERE payment_status = 'pending'"))
        connection.execute(text("UPDATE orders SET payment_status = 'Pago' WHERE payment_status = 'paid'"))
        connection.execute(text("UPDATE orders SET payment_status = 'Falhou' WHERE payment_status = 'failed'"))
        connection.execute(text("UPDATE orders SET payment_status = 'Estornado' WHERE payment_status = 'refunded'"))
