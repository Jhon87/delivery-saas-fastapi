from decimal import Decimal
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.db import Base, SessionLocal, engine
from app.core.migrations import ensure_sqlite_columns
from app.core.security import hash_password
from app.models.entities import Category, Product, Tenant


DEMO_PRODUCTS = [
    {
        "category": "Hamburgueres",
        "name": "Nery Jr",
        "description": "Burger artesanal com queijo, bacon crocante e molho da casa.",
        "price": Decimal("20.00"),
        "image_url": "/static/demo/nery-jr.jpg",
        "sort_order": 1,
    },
    {
        "category": "Hamburgueres",
        "name": "Clássico Smash",
        "description": "Pao brioche, smash burger, queijo cheddar e picles.",
        "price": Decimal("24.90"),
        "image_url": "/static/demo/classico-smash.jpg",
        "sort_order": 2,
    },
    {
        "category": "Combos",
        "name": "Combo da Casa",
        "description": "Burger, batata frita e refrigerante lata.",
        "price": Decimal("39.90"),
        "image_url": "/static/demo/combo-casa.jpg",
        "sort_order": 1,
    },
    {
        "category": "Bebidas",
        "name": "Refrigerante Lata",
        "description": "Lata 350ml gelada.",
        "price": Decimal("6.00"),
        "image_url": "/static/demo/refrigerante.jpg",
        "sort_order": 1,
    },
]


def get_or_create_category(session, tenant_id: str, name: str, sort_order: int) -> Category:
    category = session.scalar(select(Category).where(Category.tenant_id == tenant_id, Category.name == name))
    if category:
        category.sort_order = sort_order
        return category
    category = Category(tenant_id=tenant_id, name=name, sort_order=sort_order)
    session.add(category)
    session.flush()
    return category


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_columns(engine)

    with SessionLocal() as session:
        tenant = session.scalar(select(Tenant).where(Tenant.slug == "burger-demo"))
        if not tenant:
            tenant = Tenant(
                name="Burger Demo",
                slug="burger-demo",
                admin_password_hash=hash_password("admin123"),
            )
            session.add(tenant)
            session.flush()

        tenant.name = "Burger Demo"
        tenant.phone = "11999999999"
        tenant.address = "Avenida Paulista, 1000 - São Paulo, SP"
        tenant.opening_hours = "Ter-Dom 18h as 23h"
        tenant.logo_url = "/static/demo/logo.svg"
        tenant.banner_url = "/static/demo/banner.svg"
        tenant.delivery_fee = Decimal("7.50")
        tenant.estimated_delivery_minutes = 40
        tenant.is_open = True
        tenant.pix_key = "pix@burgerdemo.com"
        tenant.allow_cash_on_delivery = True
        tenant.allow_card_on_delivery = True

        category_order = {"Hamburgueres": 1, "Combos": 2, "Bebidas": 3}
        categories = {
            name: get_or_create_category(session, tenant.id, name, sort_order)
            for name, sort_order in category_order.items()
        }

        for item in DEMO_PRODUCTS:
            product = session.scalar(
                select(Product).where(Product.tenant_id == tenant.id, Product.name == item["name"])
            )
            if not product:
                product = Product(tenant_id=tenant.id, name=item["name"])
                session.add(product)
            product.category_id = categories[item["category"]].id
            product.description = item["description"]
            product.price = item["price"]
            product.image_url = item["image_url"]
            product.sort_order = item["sort_order"]
            product.is_active = True

        session.commit()
        print(f"Demo pronta: burger-demo ({tenant.id})")


if __name__ == "__main__":
    main()
