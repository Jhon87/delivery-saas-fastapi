from decimal import Decimal

from fastapi import APIRouter, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.api.deps import AdminTenantId, DbSession, TenantId, ensure_tenant
from app.core.config import get_settings
from app.core.security import create_admin_token, hash_password, verify_password
from app.models.entities import Category, DeliveryLocation, Order, OrderItem, OrderStatus, PaymentStatus, Product, Tenant
from app.schemas.dtos import (
    AdminLogin,
    AdminAuthRead,
    CategoryCreate,
    CategoryRead,
    DeliveryLocationCreate,
    DeliveryLocationRead,
    OrderCreate,
    OrderRead,
    OrderStatusUpdate,
    PaymentWebhook,
    PaymentStatusUpdate,
    ProductCreate,
    ProductRead,
    TenantCreate,
    TenantRead,
    TenantUpdate,
)
from app.services.storage import ProductImageStorage
from app.services.payments import PaymentGateway, PaymentProviderError


router = APIRouter()
tracking_connections: dict[str, list[WebSocket]] = {}


@router.post("/tenants", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreate, db: DbSession) -> Tenant:
    data = payload.model_dump()
    admin_password = data.pop("admin_password")
    tenant = Tenant(**data, admin_password_hash=hash_password(admin_password))
    db.add(tenant)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug ja esta em uso.") from exc
    db.refresh(tenant)
    return tenant


@router.post("/auth/admin-login", response_model=AdminAuthRead)
def admin_login(payload: AdminLogin, db: DbSession) -> dict[str, Tenant | str]:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == payload.slug))
    if not tenant or not verify_password(payload.password, tenant.admin_password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais invalidas.")
    return {"tenant": tenant, "token": create_admin_token(tenant.id, get_settings().admin_token_secret)}


@router.get("/tenants/{slug}", response_model=TenantRead)
def get_tenant(slug: str, db: DbSession) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant nao encontrado.")
    return tenant


@router.get("/tenant/settings", response_model=TenantRead)
def get_tenant_settings(db: DbSession, tenant_id: AdminTenantId) -> Tenant:
    return ensure_tenant(db, tenant_id)


@router.patch("/tenant/settings", response_model=TenantRead)
def update_payment_settings(payload: TenantUpdate, db: DbSession, tenant_id: AdminTenantId) -> Tenant:
    tenant = ensure_tenant(db, tenant_id)
    if payload.slug and payload.slug != tenant.slug:
        existing = db.scalar(select(Tenant).where(Tenant.slug == payload.slug))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug ja esta em uso.")
    data = payload.model_dump(exclude_unset=True)
    admin_password = data.pop("admin_password", None)
    for key, value in data.items():
        setattr(tenant, key, value)
    if admin_password:
        tenant.admin_password_hash = hash_password(admin_password)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.post("/tenant/logo", response_model=TenantRead)
def upload_tenant_logo(file: UploadFile, db: DbSession, tenant_id: AdminTenantId) -> Tenant:
    tenant = ensure_tenant(db, tenant_id)
    try:
        tenant.logo_url = ProductImageStorage().upload(tenant_id, file, "tenant")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    db.commit()
    db.refresh(tenant)
    return tenant


@router.post("/tenant/banner", response_model=TenantRead)
def upload_tenant_banner(file: UploadFile, db: DbSession, tenant_id: AdminTenantId) -> Tenant:
    tenant = ensure_tenant(db, tenant_id)
    try:
        tenant.banner_url = ProductImageStorage().upload(tenant_id, file, "tenant")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    db.commit()
    db.refresh(tenant)
    return tenant


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: DbSession, tenant_id: AdminTenantId) -> Category:
    ensure_tenant(db, tenant_id)
    category = Category(tenant_id=tenant_id, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(db: DbSession, tenant_id: TenantId) -> list[Category]:
    return list(
        db.scalars(
            select(Category).where(Category.tenant_id == tenant_id).order_by(Category.sort_order, Category.name)
        )
    )


@router.put("/categories/{category_id}", response_model=CategoryRead)
def update_category(category_id: str, payload: CategoryCreate, db: DbSession, tenant_id: AdminTenantId) -> Category:
    category = db.scalar(select(Category).where(Category.id == category_id, Category.tenant_id == tenant_id))
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria nao encontrada.")
    for key, value in payload.model_dump().items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: str, db: DbSession, tenant_id: AdminTenantId) -> None:
    category = db.scalar(select(Category).where(Category.id == category_id, Category.tenant_id == tenant_id))
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria nao encontrada.")
    db.delete(category)
    db.commit()


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: DbSession, tenant_id: AdminTenantId) -> Product:
    ensure_tenant(db, tenant_id)
    if payload.category_id:
        category = db.scalar(select(Category).where(Category.id == payload.category_id, Category.tenant_id == tenant_id))
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Categoria invalida.")
    product = Product(tenant_id=tenant_id, **payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/products", response_model=list[ProductRead])
def list_products(db: DbSession, tenant_id: TenantId, include_inactive: bool = False) -> list[Product]:
    query = select(Product).where(Product.tenant_id == tenant_id).order_by(Product.sort_order, Product.name)
    if not include_inactive:
        query = query.where(Product.is_active.is_(True))
    return list(db.scalars(query))


@router.put("/products/{product_id}", response_model=ProductRead)
def update_product(product_id: str, payload: ProductCreate, db: DbSession, tenant_id: AdminTenantId) -> Product:
    product = db.scalar(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id))
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
    for key, value in payload.model_dump().items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: str, db: DbSession, tenant_id: AdminTenantId) -> None:
    product = db.scalar(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id))
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
    db.delete(product)
    db.commit()


@router.post("/products/{product_id}/image", response_model=ProductRead)
def upload_product_image(product_id: str, file: UploadFile, db: DbSession, tenant_id: AdminTenantId) -> Product:
    product = db.scalar(select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id))
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado.")
    try:
        product.image_url = ProductImageStorage().upload(tenant_id, file)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    db.commit()
    db.refresh(product)
    return product


@router.post("/orders", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: DbSession, tenant_id: TenantId) -> Order:
    tenant = ensure_tenant(db, tenant_id)
    if not tenant.is_open:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Loja fechada no momento.")
    if payload.payment_mode.value == "Dinheiro na Entrega" and not tenant.allow_cash_on_delivery:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pagamento em dinheiro desabilitado.")
    if payload.payment_mode.value == "Maquininha na Entrega" and not tenant.allow_card_on_delivery:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pagamento na maquininha desabilitado.")

    products = {
        product.id: product
        for product in db.scalars(
            select(Product).where(
                Product.tenant_id == tenant_id,
                Product.id.in_([item.product_id for item in payload.items]),
                Product.is_active.is_(True),
            )
        )
    }
    subtotal = Decimal("0.00")
    order_items: list[OrderItem] = []
    for item in payload.items:
        product = products.get(item.product_id)
        if not product:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Produto invalido no pedido.")
        subtotal += product.price * item.quantity
        order_items.append(
            OrderItem(
                tenant_id=tenant_id,
                product_id=product.id,
                product_name=product.name,
                quantity=item.quantity,
                unit_price=product.price,
                notes=item.notes,
            )
        )

    delivery_fee = tenant.delivery_fee or Decimal("0.00")
    order = Order(
        tenant_id=tenant_id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        delivery_address=payload.delivery_address,
        address_complement=payload.address_complement,
        delivery_latitude=payload.delivery_latitude,
        delivery_longitude=payload.delivery_longitude,
        order_notes=payload.order_notes,
        payment_mode=payload.payment_mode,
        delivery_fee=delivery_fee,
        total_amount=subtotal + delivery_fee,
        items=order_items,
    )
    db.add(order)
    db.flush()
    try:
        payment_session = PaymentGateway().create_checkout(tenant, order)
    except PaymentProviderError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    order.payment_provider = payment_session.provider
    order.payment_external_id = payment_session.external_id
    order.payment_checkout_url = payment_session.checkout_url
    db.commit()
    db.refresh(order)
    return order


@router.get("/orders", response_model=list[OrderRead])
def list_orders(db: DbSession, tenant_id: AdminTenantId) -> list[Order]:
    return list(db.scalars(select(Order).where(Order.tenant_id == tenant_id).order_by(Order.created_at.desc())))


@router.get("/orders/{order_id}", response_model=OrderRead)
def get_order(order_id: str, db: DbSession, tenant_id: TenantId) -> Order:
    order = db.scalar(select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido nao encontrado.")
    return order


@router.patch("/orders/{order_id}/status", response_model=OrderRead)
async def update_order_status(order_id: str, payload: OrderStatusUpdate, db: DbSession, tenant_id: AdminTenantId) -> Order:
    order = db.scalar(select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido nao encontrado.")
    order.status = payload.status
    db.commit()
    db.refresh(order)
    await broadcast_tracking(order_id, {"type": "status", "status": order.status.value})
    return order


@router.patch("/orders/{order_id}/payment-status", response_model=OrderRead)
def update_payment_status(order_id: str, payload: PaymentStatusUpdate, db: DbSession, tenant_id: AdminTenantId) -> Order:
    order = db.scalar(select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido nao encontrado.")
    order.payment_status = payload.payment_status
    db.commit()
    db.refresh(order)
    return order


@router.post("/orders/{order_id}/location", response_model=DeliveryLocationRead, status_code=status.HTTP_201_CREATED)
async def push_delivery_location(
    order_id: str,
    payload: DeliveryLocationCreate,
    db: DbSession,
    tenant_id: AdminTenantId,
) -> DeliveryLocation:
    order = db.scalar(select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido nao encontrado.")
    if order.status != OrderStatus.out_for_delivery:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pedido ainda nao saiu para entrega.")
    location = DeliveryLocation(tenant_id=tenant_id, order_id=order_id, **payload.model_dump())
    db.add(location)
    db.commit()
    db.refresh(location)
    await broadcast_tracking(
        order_id,
        {
            "type": "location",
            "latitude": float(location.latitude),
            "longitude": float(location.longitude),
        },
    )
    return location


@router.post("/payments/webhook", status_code=status.HTTP_202_ACCEPTED)
def receive_payment_webhook(payload: PaymentWebhook, db: DbSession) -> dict[str, str]:
    order = db.scalar(select(Order).where(Order.id == payload.order_id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido nao encontrado.")

    normalized_status = payload.status.lower()
    if normalized_status in {"approved", "paid", "accredited"}:
        order.payment_status = PaymentStatus.paid
    elif normalized_status in {"rejected", "cancelled", "canceled", "failed"}:
        order.payment_status = PaymentStatus.failed
    elif normalized_status in {"refunded", "charged_back"}:
        order.payment_status = PaymentStatus.refunded
    else:
        order.payment_status = PaymentStatus.pending

    order.payment_provider = payload.provider
    if payload.raw_payload.get("payment_id"):
        order.payment_external_id = str(payload.raw_payload["payment_id"])
    db.commit()
    return {"status": "received", "order_id": payload.order_id}


@router.websocket("/tracking/{order_id}")
async def tracking_socket(websocket: WebSocket, order_id: str) -> None:
    await websocket.accept()
    tracking_connections.setdefault(order_id, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        tracking_connections[order_id].remove(websocket)


async def broadcast_tracking(order_id: str, message: dict) -> None:
    for websocket in list(tracking_connections.get(order_id, [])):
        try:
            await websocket.send_json(message)
        except RuntimeError:
            tracking_connections[order_id].remove(websocket)
