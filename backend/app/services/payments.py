from dataclasses import dataclass
from decimal import Decimal
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import get_settings
from app.models.entities import Order, PaymentMode, Tenant


class PaymentProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class PaymentSession:
    provider: str | None
    external_id: str | None
    checkout_url: str | None


class PaymentGateway:
    def create_checkout(self, tenant: Tenant, order: Order) -> PaymentSession:
        settings = get_settings()
        if order.payment_mode not in {PaymentMode.pix, PaymentMode.card}:
            return PaymentSession(provider=None, external_id=None, checkout_url=None)
        if settings.payment_provider != "mercado_pago":
            return PaymentSession(provider="simulated", external_id=None, checkout_url=None)
        if not settings.mercado_pago_access_token:
            raise PaymentProviderError("MERCADO_PAGO_ACCESS_TOKEN nao configurado.")
        return self._create_mercado_pago_preference(settings.mercado_pago_access_token, tenant, order)

    def _create_mercado_pago_preference(self, access_token: str, tenant: Tenant, order: Order) -> PaymentSession:
        payload = {
            "items": [
                {
                    "id": order.id,
                    "title": f"Pedido {tenant.name} #{order.id[:8]}",
                    "quantity": 1,
                    "currency_id": "BRL",
                    "unit_price": float(Decimal(order.total_amount).quantize(Decimal("0.01"))),
                }
            ],
            "payer": {
                "name": order.customer_name,
                "phone": {"number": order.customer_phone},
            },
            "external_reference": order.id,
            "notification_url": f"{get_settings().public_base_url}/api/payments/webhook",
            "statement_descriptor": tenant.name[:22],
        }
        request = Request(
            "https://api.mercadopago.com/checkout/preferences",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise PaymentProviderError(f"Mercado Pago recusou a preferencia: {detail}") from exc
        except (URLError, TimeoutError) as exc:
            raise PaymentProviderError("Nao foi possivel conectar ao Mercado Pago.") from exc

        checkout_url = data.get("init_point") or data.get("sandbox_init_point")
        return PaymentSession(
            provider="mercado_pago",
            external_id=str(data.get("id") or ""),
            checkout_url=checkout_url,
        )
