import os
import sys
import tempfile
from pathlib import Path

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
os.environ["LOCAL_UPLOAD_DIR"] = tempfile.mkdtemp(prefix="delivery-saas-test-uploads-")
os.environ["ADMIN_TOKEN_SECRET"] = "test-secret"
os.environ["PAYMENT_PROVIDER"] = "simulated"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.security import create_hs256_jwt  # noqa: E402
from app.main import app  # noqa: E402


client = TestClient(app)


def create_store_with_product(slug: str = "teste-burger"):
    tenant_response = client.post(
        "/api/tenants",
        json={"name": "Teste Burger", "slug": slug, "admin_password": "admin123"},
    )
    assert tenant_response.status_code == 201
    tenant = tenant_response.json()
    tenant_id = tenant["id"]

    assert client.get("/api/orders", headers={"X-Tenant-Id": tenant_id}).status_code == 401

    login_response = client.post(
        "/api/auth/admin-login",
        json={"slug": slug, "password": "admin123"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["token"]
    admin_headers = {"X-Tenant-Id": tenant_id, "X-Admin-Token": token}
    public_headers = {"X-Tenant-Id": tenant_id}

    category_response = client.post(
        "/api/categories",
        headers=admin_headers,
        json={"name": "Burgers", "sort_order": 1},
    )
    assert category_response.status_code == 201
    category_id = category_response.json()["id"]

    product_response = client.post(
        "/api/products",
        headers=admin_headers,
        json={
            "name": "Classic Burger",
            "description": "Pao, carne e queijo",
            "price": "29.90",
            "category_id": category_id,
            "sort_order": 2,
            "is_active": True,
        },
    )
    assert product_response.status_code == 201
    product_id = product_response.json()["id"]
    return tenant_id, admin_headers, public_headers, product_id


def create_order(public_headers: dict[str, str], product_id: str):
    response = client.post(
        "/api/orders",
        headers=public_headers,
        json={
            "customer_name": "Cliente Teste",
            "customer_phone": "11999999999",
            "delivery_address": "Rua Teste, 123",
            "payment_mode": "PIX",
            "delivery_latitude": -23.56321,
            "delivery_longitude": -46.65425,
            "items": [{"product_id": product_id, "quantity": 2}],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_public_order_flow_and_admin_protection():
    tenant_id, admin_headers, public_headers, product_id = create_store_with_product("teste-burger")

    order = create_order(public_headers, product_id)
    assert order["status"] == "Pendente"
    assert order["payment_status"] == "Pendente"
    assert order["payment_provider"] == "simulated"
    assert order["payment_checkout_url"] is None
    assert order["total_amount"] == "59.80"
    order_id = order["id"]

    status_response = client.patch(
        f"/api/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "Preparando"},
    )
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "Preparando"

    payment_response = client.patch(
        f"/api/orders/{order_id}/payment-status",
        headers=admin_headers,
        json={"payment_status": "Pago"},
    )
    assert payment_response.status_code == 200
    assert payment_response.json()["payment_status"] == "Pago"

    orders_response = client.get("/api/orders", headers=admin_headers)
    assert orders_response.status_code == 200
    assert len(orders_response.json()) == 1


def test_payment_webhook_updates_order_status():
    _, _, public_headers, product_id = create_store_with_product("teste-payment-webhook")
    order = create_order(public_headers, product_id)

    webhook_response = client.post(
        "/api/payments/webhook",
        json={
            "provider": "mercado_pago",
            "event": "payment.updated",
            "order_id": order["id"],
            "status": "approved",
            "raw_payload": {"payment_id": "mp-123"},
        },
    )
    assert webhook_response.status_code == 202

    order_response = client.get(f"/api/orders/{order['id']}", headers=public_headers)
    assert order_response.status_code == 200
    updated_order = order_response.json()
    assert updated_order["payment_status"] == "Pago"
    assert updated_order["payment_provider"] == "mercado_pago"
    assert updated_order["payment_external_id"] == "mp-123"


def test_delivery_location_and_cancel_status():
    _, admin_headers, public_headers, product_id = create_store_with_product("teste-delivery")
    order = create_order(public_headers, product_id)
    order_id = order["id"]

    early_location_response = client.post(
        f"/api/orders/{order_id}/location",
        headers=admin_headers,
        json={"latitude": -23.562, "longitude": -46.653},
    )
    assert early_location_response.status_code == 400

    out_for_delivery_response = client.patch(
        f"/api/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "Saiu para Entrega"},
    )
    assert out_for_delivery_response.status_code == 200

    location_response = client.post(
        f"/api/orders/{order_id}/location",
        headers=admin_headers,
        json={"latitude": -23.562, "longitude": -46.653},
    )
    assert location_response.status_code == 201

    tracked_order_response = client.get(f"/api/orders/{order_id}", headers=public_headers)
    assert tracked_order_response.status_code == 200
    tracked_order = tracked_order_response.json()
    assert tracked_order["latest_location"]["latitude"] == "-23.562000"
    assert tracked_order["latest_location"]["longitude"] == "-46.653000"

    cancel_response = client.patch(
        f"/api/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "Cancelado"},
    )
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "Cancelado"


def test_tenant_isolation_and_admin_token_scope():
    tenant_a_id, tenant_a_admin_headers, tenant_a_public_headers, tenant_a_product_id = create_store_with_product(
        "teste-tenant-a"
    )
    tenant_b_id, tenant_b_admin_headers, tenant_b_public_headers, _ = create_store_with_product("teste-tenant-b")

    assert tenant_a_id != tenant_b_id

    cross_tenant_response = client.post(
        "/api/categories",
        headers={
            "X-Tenant-Id": tenant_b_id,
            "X-Admin-Token": tenant_a_admin_headers["X-Admin-Token"],
        },
        json={"name": "Tentativa Invalida", "sort_order": 1},
    )
    assert cross_tenant_response.status_code == 401

    tenant_a_products = client.get("/api/products", headers=tenant_a_public_headers)
    tenant_b_products = client.get("/api/products", headers=tenant_b_public_headers)
    assert tenant_a_products.status_code == 200
    assert tenant_b_products.status_code == 200
    assert len(tenant_a_products.json()) == 1
    assert tenant_a_products.json()[0]["id"] == tenant_a_product_id
    assert tenant_b_products.json()[0]["id"] != tenant_a_product_id

    create_order(tenant_a_public_headers, tenant_a_product_id)

    tenant_a_orders = client.get("/api/orders", headers=tenant_a_admin_headers)
    tenant_b_orders = client.get("/api/orders", headers=tenant_b_admin_headers)
    assert tenant_a_orders.status_code == 200
    assert tenant_b_orders.status_code == 200
    assert len(tenant_a_orders.json()) == 1
    assert tenant_b_orders.json() == []


def test_admin_jwt_authorizes_tenant_when_enabled(monkeypatch):
    tenant_id, _, _, _ = create_store_with_product("teste-jwt-admin")
    jwt_secret = "jwt-test-secret"
    token = create_hs256_jwt({"app_metadata": {"tenant_id": tenant_id}}, jwt_secret)

    monkeypatch.setenv("ADMIN_AUTH_MODE", "jwt")
    monkeypatch.setenv("JWT_SECRET", jwt_secret)
    get_settings.cache_clear()
    try:
        settings_response = client.get(
            "/api/tenant/settings",
            headers={"X-Tenant-Id": tenant_id, "Authorization": f"Bearer {token}"},
        )
        assert settings_response.status_code == 200
        assert settings_response.json()["id"] == tenant_id

        local_token_response = client.get(
            "/api/tenant/settings",
            headers={"X-Tenant-Id": tenant_id, "X-Admin-Token": token},
        )
        assert local_token_response.status_code == 401
    finally:
        get_settings.cache_clear()


def test_public_tenant_creation_can_be_disabled(monkeypatch):
    monkeypatch.setenv("ALLOW_PUBLIC_TENANT_CREATION", "false")
    get_settings.cache_clear()
    try:
        response = client.post(
            "/api/tenants",
            json={"name": "Bloqueada Burger", "slug": "bloqueada-burger", "admin_password": "admin123"},
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Criacao publica de lojas desabilitada."
    finally:
        get_settings.cache_clear()
