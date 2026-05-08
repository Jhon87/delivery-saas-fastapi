export type Tenant = {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  address?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  opening_hours?: string | null;
  delivery_fee: string;
  estimated_delivery_minutes: number;
  is_open: boolean;
  pix_key?: string | null;
  card_gateway_key?: string | null;
  allow_cash_on_delivery: boolean;
  allow_card_on_delivery: boolean;
};

export type Category = {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
};

export type Product = {
  id: string;
  tenant_id: string;
  category_id?: string | null;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Order = {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  address_complement?: string | null;
  delivery_latitude?: string | null;
  delivery_longitude?: string | null;
  order_notes?: string | null;
  payment_mode: string;
  payment_status: string;
  payment_provider?: string | null;
  payment_external_id?: string | null;
  payment_checkout_url?: string | null;
  status: string;
  delivery_fee: string;
  total_amount: string;
  created_at: string;
  latest_location?: {
    id: string;
    tenant_id: string;
    order_id: string;
    latitude: string;
    longitude: string;
  } | null;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: string;
    notes?: string | null;
  }>;
};

export type AdminAuth = {
  tenant: Tenant;
  token: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export function resolveAssetUrl(assetUrl?: string | null): string {
  if (!assetUrl) return "";
  try {
    return new URL(assetUrl).toString();
  } catch {
    if (!assetUrl.startsWith("/")) return assetUrl;
    return `${new URL(API_URL, window.location.origin).origin}${assetUrl}`;
  }
}

async function request<T>(path: string, tenantId: string | null, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (tenantId) headers.set("X-Tenant-Id", tenantId);
  const adminToken = localStorage.getItem("adminToken");
  if (adminToken) {
    headers.set("X-Admin-Token", adminToken);
    if (isJwt(adminToken)) headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Erro inesperado" }));
    const detail = Array.isArray(error.detail)
      ? error.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join("; ")
      : error.detail;
    throw new Error(detail || "Erro inesperado");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function uploadRequest<T>(path: string, tenantId: string, file: File): Promise<T> {
  const body = new FormData();
  body.set("file", file);
  const headers = new Headers();
  headers.set("X-Tenant-Id", tenantId);
  const adminToken = localStorage.getItem("adminToken");
  if (adminToken) {
    headers.set("X-Admin-Token", adminToken);
    if (isJwt(adminToken)) headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers, body });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Erro inesperado" }));
    throw new Error(error.detail || "Erro inesperado");
  }
  return response.json() as Promise<T>;
}

export const api = {
  createTenant: (name: string, slug: string, admin_password = "admin123") =>
    request<Tenant>("/tenants", null, { method: "POST", body: JSON.stringify({ name, slug, admin_password }) }),
  adminLogin: (slug: string, password: string) =>
    request<AdminAuth>("/auth/admin-login", null, { method: "POST", body: JSON.stringify({ slug, password }) }),
  getTenantBySlug: (slug: string) => request<Tenant>(`/tenants/${slug}`, null),
  getTenantSettings: (tenantId: string) => request<Tenant>("/tenant/settings", tenantId),
  updateTenantSettings: (
    tenantId: string,
    payload: Partial<
      Pick<
        Tenant,
        | "name"
        | "slug"
        | "phone"
        | "address"
        | "logo_url"
        | "banner_url"
        | "opening_hours"
        | "delivery_fee"
        | "estimated_delivery_minutes"
        | "is_open"
        | "pix_key"
        | "card_gateway_key"
        | "allow_cash_on_delivery"
        | "allow_card_on_delivery"
      >
    > & { admin_password?: string | null },
  ) => request<Tenant>("/tenant/settings", tenantId, { method: "PATCH", body: JSON.stringify(payload) }),
  uploadTenantLogo: (tenantId: string, file: File) => uploadRequest<Tenant>("/tenant/logo", tenantId, file),
  uploadTenantBanner: (tenantId: string, file: File) => uploadRequest<Tenant>("/tenant/banner", tenantId, file),
  listCategories: (tenantId: string) => request<Category[]>("/categories", tenantId),
  createCategory: (tenantId: string, payload: { name: string; sort_order?: number }) =>
    request<Category>("/categories", tenantId, { method: "POST", body: JSON.stringify(payload) }),
  updateCategory: (tenantId: string, categoryId: string, payload: { name: string; sort_order?: number }) =>
    request<Category>(`/categories/${categoryId}`, tenantId, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCategory: (tenantId: string, categoryId: string) =>
    request<void>(`/categories/${categoryId}`, tenantId, { method: "DELETE" }),
  listProducts: (tenantId: string, includeInactive = false) =>
    request<Product[]>(`/products${includeInactive ? "?include_inactive=true" : ""}`, tenantId),
  createProduct: (tenantId: string, payload: Omit<Product, "id" | "tenant_id">) =>
    request<Product>("/products", tenantId, { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (tenantId: string, productId: string, payload: Omit<Product, "id" | "tenant_id">) =>
    request<Product>(`/products/${productId}`, tenantId, { method: "PUT", body: JSON.stringify(payload) }),
  uploadProductImage: (tenantId: string, productId: string, file: File) =>
    uploadRequest<Product>(`/products/${productId}/image`, tenantId, file),
  deleteProduct: (tenantId: string, productId: string) =>
    request<void>(`/products/${productId}`, tenantId, { method: "DELETE" }),
  listOrders: (tenantId: string) => request<Order[]>("/orders", tenantId),
  createOrder: (
    tenantId: string,
    payload: {
      customer_name: string;
      customer_phone: string;
      delivery_address: string;
      address_complement?: string | null;
      delivery_latitude?: number | null;
      delivery_longitude?: number | null;
      order_notes?: string | null;
      payment_mode: string;
      items: Array<{ product_id: string; quantity: number; notes?: string }>;
    },
  ) => request<Order>("/orders", tenantId, { method: "POST", body: JSON.stringify(payload) }),
  getOrder: (tenantId: string, orderId: string) => request<Order>(`/orders/${orderId}`, tenantId),
  updateOrderStatus: (tenantId: string, orderId: string, status: string) =>
    request<Order>(`/orders/${orderId}/status`, tenantId, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updatePaymentStatus: (tenantId: string, orderId: string, payment_status: string) =>
    request<Order>(`/orders/${orderId}/payment-status`, tenantId, {
      method: "PATCH",
      body: JSON.stringify({ payment_status }),
    }),
  pushDeliveryLocation: (tenantId: string, orderId: string, latitude: number, longitude: number) =>
    request<{ id: string; tenant_id: string; order_id: string; latitude: string; longitude: string }>(
      `/orders/${orderId}/location`,
      tenantId,
      {
        method: "POST",
        body: JSON.stringify({ latitude, longitude }),
      },
    ),
};

function isJwt(token: string): boolean {
  return token.split(".").length === 3;
}
