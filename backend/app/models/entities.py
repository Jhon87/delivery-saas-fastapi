from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def new_id() -> str:
    return str(uuid4())


def enum_values(enum_class: type[StrEnum]) -> list[str]:
    return [item.value for item in enum_class]


class OrderStatus(StrEnum):
    pending = "Pendente"
    preparing = "Preparando"
    out_for_delivery = "Saiu para Entrega"
    delivered = "Entregue"
    canceled = "Cancelado"


class PaymentMode(StrEnum):
    pix = "PIX"
    card = "Cartao"
    cash_on_delivery = "Dinheiro na Entrega"
    card_on_delivery = "Maquininha na Entrega"


class PaymentStatus(StrEnum):
    pending = "Pendente"
    paid = "Pago"
    failed = "Falhou"
    refunded = "Estornado"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(Text)
    banner_url: Mapped[str | None] = mapped_column(Text)
    opening_hours: Mapped[str | None] = mapped_column(String(160))
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    estimated_delivery_minutes: Mapped[int] = mapped_column(default=40, nullable=False)
    is_open: Mapped[bool] = mapped_column(default=True, nullable=False)
    pix_key: Mapped[str | None] = mapped_column(String(180))
    card_gateway_key: Mapped[str | None] = mapped_column(String(240))
    allow_cash_on_delivery: Mapped[bool] = mapped_column(default=True)
    allow_card_on_delivery: Mapped[bool] = mapped_column(default=True)
    admin_password_hash: Mapped[str | None] = mapped_column(String(220))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    categories: Mapped[list["Category"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    products: Mapped[list["Product"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant] = relationship(back_populates="categories")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant] = relationship(back_populates="products")
    category: Mapped[Category | None] = relationship(back_populates="products")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(140), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    delivery_address: Mapped[str] = mapped_column(Text, nullable=False)
    address_complement: Mapped[str | None] = mapped_column(Text)
    delivery_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    delivery_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    order_notes: Mapped[str | None] = mapped_column(Text)
    payment_mode: Mapped[PaymentMode] = mapped_column(Enum(PaymentMode, values_callable=enum_values), nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, values_callable=enum_values),
        default=PaymentStatus.pending,
        nullable=False,
    )
    payment_provider: Mapped[str | None] = mapped_column(String(40))
    payment_external_id: Mapped[str | None] = mapped_column(String(160), index=True)
    payment_checkout_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, values_callable=enum_values),
        default=OrderStatus.pending,
        nullable=False,
    )
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete-orphan")
    locations: Mapped[list["DeliveryLocation"]] = relationship(cascade="all, delete-orphan")

    @property
    def latest_location(self):
        if not self.locations:
            return None
        return max(self.locations, key=lambda location: location.created_at or datetime.min)


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String(140), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class DeliveryLocation(Base):
    __tablename__ = "delivery_locations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
