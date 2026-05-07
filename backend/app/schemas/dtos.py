from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import OrderStatus, PaymentMode, PaymentStatus


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    admin_password: str = Field(default="admin123", min_length=6, max_length=80)


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    slug: str | None = Field(default=None, min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    opening_hours: str | None = Field(default=None, max_length=160)
    delivery_fee: Decimal | None = Field(default=None, ge=0)
    estimated_delivery_minutes: int | None = Field(default=None, ge=1, le=240)
    is_open: bool | None = None
    pix_key: str | None = None
    card_gateway_key: str | None = None
    allow_cash_on_delivery: bool | None = None
    allow_card_on_delivery: bool | None = None
    admin_password: str | None = Field(default=None, min_length=6, max_length=80)


class TenantRead(TenantCreate):
    id: str
    phone: str | None = None
    address: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    opening_hours: str | None = None
    delivery_fee: Decimal
    estimated_delivery_minutes: int
    is_open: bool
    pix_key: str | None = None
    card_gateway_key: str | None = None
    allow_cash_on_delivery: bool
    allow_card_on_delivery: bool
    admin_password: str = Field(default="", exclude=True)

    model_config = ConfigDict(from_attributes=True)


class AdminLogin(BaseModel):
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    password: str = Field(min_length=6, max_length=80)


class AdminAuthRead(BaseModel):
    tenant: TenantRead
    token: str


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    sort_order: int = 0


class CategoryRead(CategoryCreate):
    id: str
    tenant_id: str

    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    category_id: str | None = None
    name: str = Field(min_length=2, max_length=140)
    description: str | None = None
    price: Decimal = Field(gt=0)
    image_url: str | None = None
    sort_order: int = 0
    is_active: bool = True


class ProductRead(ProductCreate):
    id: str
    tenant_id: str

    model_config = ConfigDict(from_attributes=True)


class OrderItemCreate(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=99)
    notes: str | None = None


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=140)
    customer_phone: str = Field(min_length=6, max_length=40)
    delivery_address: str = Field(min_length=8)
    address_complement: str | None = None
    delivery_latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    delivery_longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    order_notes: str | None = None
    payment_mode: PaymentMode
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderItemRead(BaseModel):
    id: str
    product_id: str
    product_name: str
    quantity: int
    unit_price: Decimal
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class DeliveryLocationCreate(BaseModel):
    latitude: Decimal = Field(ge=-90, le=90)
    longitude: Decimal = Field(ge=-180, le=180)


class DeliveryLocationRead(DeliveryLocationCreate):
    id: str
    order_id: str
    tenant_id: str

    model_config = ConfigDict(from_attributes=True)


class OrderRead(BaseModel):
    id: str
    tenant_id: str
    customer_name: str
    customer_phone: str
    delivery_address: str
    address_complement: str | None = None
    delivery_latitude: Decimal | None = None
    delivery_longitude: Decimal | None = None
    order_notes: str | None = None
    payment_mode: PaymentMode
    payment_status: PaymentStatus
    payment_provider: str | None = None
    payment_external_id: str | None = None
    payment_checkout_url: str | None = None
    status: OrderStatus
    delivery_fee: Decimal
    total_amount: Decimal
    created_at: datetime
    items: list[OrderItemRead]
    latest_location: DeliveryLocationRead | None = None

    model_config = ConfigDict(from_attributes=True)


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class PaymentStatusUpdate(BaseModel):
    payment_status: PaymentStatus


class PaymentWebhook(BaseModel):
    provider: str
    event: str
    order_id: str
    status: str
    raw_payload: dict = Field(default_factory=dict)
