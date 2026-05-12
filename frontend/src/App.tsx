import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bike, ClipboardList, Copy, CreditCard, Download, Edit3, ExternalLink, MessageCircle, Minus, Plus, Printer, Save, Search, Store, Trash2, Utensils, X } from "lucide-react";
import { api, Category, isSupabaseAuthEnabled, Order, Product, resolveAssetUrl, supabasePasswordLogin, Tenant } from "./api/client";
import { TrackingMap } from "./components/TrackingMap";

type CartItem = {
  product: Product;
  quantity: number;
};

type ProductDraft = {
  name: string;
  description: string;
  price: string;
  category_id: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

const statuses = ["Pendente", "Preparando", "Saiu para Entrega", "Entregue", "Cancelado"];
const fulfillmentStatuses = ["Pendente", "Preparando", "Saiu para Entrega", "Entregue"];
const paymentStatuses = ["Pendente", "Pago", "Falhou", "Estornado"];
const emptyProductDraft: ProductDraft = {
  name: "",
  description: "",
  price: "",
  category_id: "",
  image_url: "",
  sort_order: 0,
  is_active: true,
};

function fileFromForm(form: HTMLFormElement, name: string): File | null {
  const value = new FormData(form).get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function getOrderDestination(order: Order | null): Coordinates | null {
  if (!order?.delivery_latitude || !order.delivery_longitude) return null;
  const latitude = Number(order.delivery_latitude);
  const longitude = Number(order.delivery_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function getLatestDeliveryLocation(order: Order | null): Coordinates | null {
  if (!order?.latest_location) return null;
  const latitude = Number(order.latest_location.latitude);
  const longitude = Number(order.latest_location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function getOrderTrackingUrl(slug: string, orderId: string) {
  return `${window.location.origin}/loja/${slug}/pedido/${orderId}`;
}

function getStoreUrl(slug: string) {
  return `${window.location.origin}/loja/${slug}`;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function getOrderProgressMessage(order: Order | null, tenant: Tenant | null, audience: "admin" | "customer") {
  if (!order) return "";
  if (order.status === "Cancelado") {
    return audience === "admin"
      ? "Pedido cancelado. Ele sai do fluxo de preparo, entrega e faturamento do dia."
      : "Este pedido foi cancelado pela loja.";
  }
  if (order.status === "Entregue") {
    return audience === "admin"
      ? "Pedido concluido. Confira pagamento e finalize o atendimento."
      : "Pedido entregue. Obrigado pela compra.";
  }
  if (order.status === "Saiu para Entrega") {
    return audience === "admin"
      ? "Pedido em rota. Envie a localizacao do entregador para o cliente acompanhar no mapa."
      : "Seu pedido saiu para entrega. O rastreio aparece no mapa assim que a loja enviar a localizacao.";
  }
  if (order.status === "Preparando") {
    return audience === "admin"
      ? "Pedido na cozinha. Separe os itens, confira observacoes e avance para entrega quando sair."
      : `A cozinha da ${tenant?.name ?? "loja"} esta preparando seu pedido.`;
  }
  return audience === "admin"
    ? "Pedido novo. Confira pagamento, endereco e envie para preparo."
    : "Seu pedido chegou no painel da loja e aguarda confirmacao da cozinha.";
}

function getProgressClass(order: Order | null, status: string) {
  if (!order || order.status === "Cancelado") return "";
  const currentIndex = fulfillmentStatuses.indexOf(order.status);
  const statusIndex = fulfillmentStatuses.indexOf(status);
  if (statusIndex < currentIndex) return "done";
  if (statusIndex === currentIndex) return "current";
  return "";
}

function escapeCsvCell(value: string | number) {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function formatOrderTime(order: Order | null) {
  if (!order?.created_at) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(order.created_at));
}

function formatEstimatedDelivery(order: Order | null, tenant: Tenant | null) {
  if (!order?.created_at || !tenant) return "";
  const createdAt = new Date(order.created_at);
  const estimatedAt = new Date(createdAt.getTime() + tenant.estimated_delivery_minutes * 60_000);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(estimatedAt);
  return `por volta de ${time}`;
}

function normalizeWhatsappPhone(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function buildOrderWhatsappUrl(order: Order, tenant: Tenant | null) {
  const phone = normalizeWhatsappPhone(order.customer_phone);
  if (!phone) return "";
  const eta = formatEstimatedDelivery(order, tenant);
  const message = [
    `Ola, ${order.customer_name}.`,
    `Seu pedido ${order.id.slice(0, 8)} esta com status: ${order.status}.`,
    eta ? `Previsao de entrega: ${eta}.` : "",
    `Total: R$ ${Number(order.total_amount).toFixed(2)}.`,
  ].filter(Boolean).join(" ");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clampQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(99, Math.max(1, Math.trunc(quantity)));
}

async function geocodeDeliveryAddress(address: string, complement: string, tenant: Tenant | null): Promise<Coordinates | null> {
  const queryParts = [address, complement, tenant?.address, "Brasil"].filter(Boolean);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("q", queryParts.join(", "));

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const results = await response.json() as Array<{ lat: string; lon: string }>;
    const first = results[0];
    if (!first) return null;
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

function getBrowserCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalizacao indisponivel neste navegador."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => reject(new Error("Nao foi possivel obter sua localizacao.")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

function AdminDashboard() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantName, setTenantName] = useState("Burger Demo");
  const [tenantSlug, setTenantSlug] = useState("burger-demo");
  const [adminEmail, setAdminEmail] = useState(localStorage.getItem("adminEmail") ?? "");
  const [adminPassword, setAdminPassword] = useState("admin123");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(localStorage.getItem("adminSessionTenantId") && localStorage.getItem("adminToken")),
  );
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantAddress, setTenantAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0.00");
  const [estimatedDeliveryMinutes, setEstimatedDeliveryMinutes] = useState(40);
  const [isOpen, setIsOpen] = useState(true);
  const [pixKey, setPixKey] = useState("");
  const [cardGatewayKey, setCardGatewayKey] = useState("");
  const [allowCashOnDelivery, setAllowCashOnDelivery] = useState(true);
  const [allowCardOnDelivery, setAllowCardOnDelivery] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState(0);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);
  const [editingProductId, setEditingProductId] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrderId, setActiveOrderId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const ordersLoadedRef = useRef(false);

  const tenantId = tenant?.id ?? localStorage.getItem("tenantId") ?? "";
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0),
    [cart],
  );

  useEffect(() => {
    if (!tenantId || !isAuthenticated) return;
    localStorage.setItem("tenantId", tenantId);
    refreshData(tenantId);
  }, [tenantId, isAuthenticated]);

  useEffect(() => {
    if (!tenantId || !isAuthenticated) return;
    const interval = window.setInterval(() => {
      refreshOrders(tenantId, true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [tenantId, isAuthenticated]);

  function showError(error: unknown) {
    setError(error instanceof Error ? error.message : "Erro inesperado.");
  }

  function applyTenantSettings(data: Tenant) {
    setTenant(data);
    setTenantName(data.name);
    setTenantSlug(data.slug);
    setTenantPhone(data.phone ?? "");
    setTenantAddress(data.address ?? "");
    setLogoUrl(data.logo_url ?? "");
    setBannerUrl(data.banner_url ?? "");
    setOpeningHours(data.opening_hours ?? "");
    setDeliveryFee(String(data.delivery_fee ?? "0.00"));
    setEstimatedDeliveryMinutes(data.estimated_delivery_minutes);
    setIsOpen(data.is_open);
    setPixKey(data.pix_key ?? "");
    setCardGatewayKey(data.card_gateway_key ?? "");
    setAllowCashOnDelivery(data.allow_cash_on_delivery);
    setAllowCardOnDelivery(data.allow_card_on_delivery);
  }

  function applyOrders(orderData: Order[], announceNew = false) {
    const knownOrderIds = knownOrderIdsRef.current;
    const newOrders = announceNew && ordersLoadedRef.current
      ? orderData.filter((order) => !knownOrderIds.has(order.id))
      : [];

    knownOrderIdsRef.current = new Set(orderData.map((order) => order.id));
    ordersLoadedRef.current = true;
    setOrders(orderData);
    setActiveOrderId((current) =>
      current && orderData.some((order) => order.id === current) ? current : orderData[0]?.id || "",
    );

    if (newOrders.length > 0) {
      setNotice(
        newOrders.length === 1
          ? `Novo pedido recebido: ${newOrders[0].customer_name}.`
          : `${newOrders.length} novos pedidos recebidos.`,
      );
    }
  }

  async function refreshData(id = tenantId) {
    if (!id) return;
    try {
      const [tenantData, categoryData, productData, orderData] = await Promise.all([
        api.getTenantSettings(id),
        api.listCategories(id),
        api.listProducts(id, true),
        api.listOrders(id),
      ]);
      applyTenantSettings(tenantData);
      setCategories(categoryData);
      setProducts(productData);
      applyOrders(orderData);
      setError("");
    } catch (error) {
      if (error instanceof Error && error.message.includes("Tenant nao encontrado")) {
        localStorage.removeItem("tenantId");
        setTenant(null);
        setCategories([]);
        setProducts([]);
        setOrders([]);
        setActiveOrderId("");
      }
      showError(error);
    }
  }

  async function refreshOrders(id = tenantId, announceNew = false) {
    if (!id) return;
    try {
      const orderData = await api.listOrders(id);
      applyOrders(orderData, announceNew);
      setError("");
    } catch (error) {
      showError(error);
    }
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await api.createTenant(tenantName, tenantSlug, adminPassword);
      const auth = await api.adminLogin(created.slug, adminPassword);
      applyTenantSettings(auth.tenant);
      localStorage.setItem("tenantId", auth.tenant.id);
      localStorage.setItem("adminSessionTenantId", auth.tenant.id);
      localStorage.setItem("adminToken", auth.token);
      setIsAuthenticated(true);
      setNotice("Loja criada. O tenant_id foi salvo neste navegador.");
      setError("");
      await refreshData(auth.tenant.id);
    } catch (error) {
      showError(error);
    }
  }

  async function saveTenantSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!tenantId) {
      await createTenant(event);
      return;
    }
    try {
      let updated = await api.updateTenantSettings(tenantId, {
        name: tenantName,
        slug: tenantSlug,
        phone: tenantPhone || null,
        address: tenantAddress || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        opening_hours: openingHours || null,
        delivery_fee: deliveryFee,
        estimated_delivery_minutes: estimatedDeliveryMinutes,
        is_open: isOpen,
        pix_key: pixKey || null,
        card_gateway_key: cardGatewayKey || null,
        allow_cash_on_delivery: allowCashOnDelivery,
        allow_card_on_delivery: allowCardOnDelivery,
        admin_password: newAdminPassword || null,
      });
      const logoFile = fileFromForm(formElement, "logo_file");
      const bannerFile = fileFromForm(formElement, "banner_file");
      if (logoFile) {
        updated = await api.uploadTenantLogo(tenantId, logoFile);
      }
      if (bannerFile) {
        updated = await api.uploadTenantBanner(tenantId, bannerFile);
      }
      applyTenantSettings(updated);
      formElement.reset();
      setNewAdminPassword("");
      setNotice("Configuracoes da loja salvas.");
      setError("");
    } catch (error) {
      showError(error);
    }
  }

  async function loadTenantBySlug() {
    try {
      const found = await api.getTenantBySlug(tenantSlug);
      applyTenantSettings(found);
      localStorage.setItem("tenantId", found.id);
      setNotice("Loja carregada neste navegador.");
      setError("");
      await refreshData(found.id);
    } catch (error) {
      showError(error);
    }
  }

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      let authenticatedTenant: Tenant;
      let sessionTenantId: string;

      if (isSupabaseAuthEnabled()) {
        const email = adminEmail.trim();
        if (!email) {
          throw new Error("Informe o e-mail do administrador.");
        }
        const found = await api.getTenantBySlug(tenantSlug);
        const token = await supabasePasswordLogin(email, adminPassword);
        sessionTenantId = found.id;
        localStorage.setItem("tenantId", found.id);
        localStorage.setItem("adminSessionTenantId", found.id);
        localStorage.setItem("adminToken", token);
        localStorage.setItem("adminEmail", email);
        authenticatedTenant = await api.getTenantSettings(found.id);
      } else {
        const auth = await api.adminLogin(tenantSlug, adminPassword);
        authenticatedTenant = auth.tenant;
        sessionTenantId = auth.tenant.id;
        localStorage.setItem("tenantId", auth.tenant.id);
        localStorage.setItem("adminSessionTenantId", auth.tenant.id);
        localStorage.setItem("adminToken", auth.token);
      }

      applyTenantSettings(authenticatedTenant);
      setIsAuthenticated(true);
      setNotice("Acesso liberado.");
      setError("");
      await refreshData(sessionTenantId);
    } catch (error) {
      showError(error);
    }
  }

  function logoutAdmin() {
    localStorage.removeItem("adminSessionTenantId");
    localStorage.removeItem("adminToken");
    knownOrderIdsRef.current = new Set();
    ordersLoadedRef.current = false;
    setIsAuthenticated(false);
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = { name: categoryName, sort_order: categorySortOrder };
      const wasEditing = Boolean(editingCategoryId);
      if (editingCategoryId) {
        await api.updateCategory(tenantId, editingCategoryId, payload);
      } else {
        await api.createCategory(tenantId, payload);
      }
      resetCategoryForm();
      setNotice(wasEditing ? "Categoria atualizada." : "Categoria adicionada.");
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    try {
      const payload = {
        name: productDraft.name,
        description: productDraft.description || null,
        price: productDraft.price,
        category_id: productDraft.category_id || null,
        image_url: productDraft.image_url || null,
        sort_order: productDraft.sort_order,
        is_active: productDraft.is_active,
      };
      const wasEditing = Boolean(editingProductId);
      let savedProduct: Product;
      if (editingProductId) {
        savedProduct = await api.updateProduct(tenantId, editingProductId, payload);
      } else {
        savedProduct = await api.createProduct(tenantId, payload);
      }
      const productImage = fileFromForm(formElement, "product_file");
      if (productImage) {
        savedProduct = await api.uploadProductImage(tenantId, savedProduct.id, productImage);
      }
      setProducts((current) => {
        const exists = current.some((product) => product.id === savedProduct.id);
        return exists
          ? current.map((product) => (product.id === savedProduct.id ? savedProduct : product))
          : [...current, savedProduct];
      });
      resetProductForm();
      formElement.reset();
      setNotice(wasEditing ? "Produto atualizado." : "Produto adicionado ao cardapio.");
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const order = await api.createOrder(tenantId, {
        customer_name: String(form.get("customer_name")),
        customer_phone: String(form.get("customer_phone")),
        delivery_address: String(form.get("delivery_address")),
        payment_mode: String(form.get("payment_mode")),
        items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      });
      setCart([]);
      setNotice(`Pedido ${order.id.slice(0, 8)} criado.`);
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  function changeCartQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.product.id !== productId));
      return;
    }
    const nextQuantity = clampQuantity(quantity);
    setCart((current) =>
      current.map((item) => (item.product.id === productId ? { ...item, quantity: nextQuantity } : item)),
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((item) => item.product.id !== productId));
  }

  function editCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategorySortOrder(category.sort_order);
  }

  function resetCategoryForm() {
    setEditingCategoryId("");
    setCategoryName("");
    setCategorySortOrder(0);
  }

  async function removeCategory(categoryId: string) {
    try {
      await api.deleteCategory(tenantId, categoryId);
      setNotice("Categoria removida.");
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  function editProduct(product: Product) {
    setEditingProductId(product.id);
    setProductDraft({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      category_id: product.category_id ?? "",
      image_url: product.image_url ?? "",
      sort_order: product.sort_order,
      is_active: product.is_active,
    });
  }

  function resetProductForm() {
    setEditingProductId("");
    setProductDraft(emptyProductDraft);
  }

  async function toggleProductAvailability(product: Product) {
    try {
      await api.updateProduct(tenantId, product.id, {
        name: product.name,
        description: product.description ?? null,
        price: product.price,
        category_id: product.category_id ?? null,
        image_url: product.image_url ?? null,
        sort_order: product.sort_order,
        is_active: !product.is_active,
      });
      setNotice(product.is_active ? "Produto desativado." : "Produto ativado.");
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function removeProduct(productId: string) {
    try {
      await api.deleteProduct(tenantId, productId);
      setNotice("Produto removido.");
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function updateStatus(orderId: string, status: string) {
    try {
      await api.updateOrderStatus(tenantId, orderId, status);
      setNotice("Status do pedido atualizado.");
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function updatePaymentStatus(orderId: string, paymentStatus: string) {
    try {
      await api.updatePaymentStatus(tenantId, orderId, paymentStatus);
      setNotice("Status de pagamento atualizado.");
      setError("");
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  async function advanceOrder(order: Order) {
    if (order.status === "Cancelado") return;
    const nextStatus = statuses[statuses.indexOf(order.status) + 1];
    if (!nextStatus || nextStatus === "Cancelado") return;
    await updateStatus(order.id, nextStatus);
  }

  async function sendDemoLocation(orderId: string) {
    try {
      const order = orders.find((item) => item.id === orderId) ?? null;
      const destination = getOrderDestination(order);
      const baseLatitude = destination?.latitude ?? -23.55052;
      const baseLongitude = destination?.longitude ?? -46.633308;
      const jitter = 0.004 + Math.random() / 250;
      await api.pushDeliveryLocation(tenantId, orderId, baseLatitude + jitter, baseLongitude + jitter);
      setNotice(
        destination
          ? "Coordenada de teste enviada perto do endereco do cliente."
          : "Coordenada de teste enviada. Este pedido ainda nao tem destino geocodificado.",
      );
      setError("");
    } catch (error) {
      showError(error);
    }
  }

  async function sendCurrentLocation(orderId: string) {
    try {
      const position = await getBrowserCoordinates();
      await api.pushDeliveryLocation(tenantId, orderId, position.latitude, position.longitude);
      setNotice("Sua localizacao foi enviada para o rastreio.");
      setError("");
    } catch (error) {
      showError(error);
    }
  }

  async function copyCustomerOrderLink(order: Order) {
    try {
      await copyTextToClipboard(getOrderTrackingUrl(tenant?.slug ?? tenantSlug, order.id));
      setNotice("Link de acompanhamento copiado.");
      setError("");
    } catch {
      setError("Nao foi possivel copiar o link de acompanhamento.");
    }
  }

  async function copyStoreLink() {
    try {
      await copyTextToClipboard(getStoreUrl(tenant?.slug ?? tenantSlug));
      setNotice("Link da loja copiado.");
      setError("");
    } catch {
      setError("Nao foi possivel copiar o link da loja.");
    }
  }

  function printKitchenTicket(order: Order) {
    const ticket = window.open("", "_blank", "width=420,height=640");
    if (!ticket) {
      setError("O navegador bloqueou a janela de impressao.");
      return;
    }
    const items = order.items
      .map((item) => `<li><strong>${item.quantity}x</strong> ${escapeHtml(item.product_name)}</li>`)
      .join("");
    const address = `${order.delivery_address}${order.address_complement ? ` - ${order.address_complement}` : ""}`;
    ticket.document.write(`
      <html>
        <head>
          <title>Pedido ${escapeHtml(order.id.slice(0, 8))}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; }
            h1 { font-size: 22px; margin: 0 0 12px; }
            p { margin: 6px 0; }
            ul { padding-left: 20px; }
            li { margin: 8px 0; }
            .total { border-top: 1px solid #111; margin-top: 16px; padding-top: 12px; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>Pedido ${escapeHtml(order.id.slice(0, 8))}</h1>
          <p><strong>Cliente:</strong> ${escapeHtml(order.customer_name)}</p>
          <p><strong>Telefone:</strong> ${escapeHtml(order.customer_phone)}</p>
          <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
          <p><strong>Pagamento:</strong> ${escapeHtml(order.payment_mode)} - ${escapeHtml(order.payment_status)}</p>
          <p><strong>Recebido:</strong> ${escapeHtml(formatOrderTime(order))}</p>
          <p><strong>Endereco:</strong> ${escapeHtml(address)}</p>
          ${order.order_notes ? `<p><strong>Observacao:</strong> ${escapeHtml(order.order_notes)}</p>` : ""}
          <h2>Itens</h2>
          <ul>${items}</ul>
          <p class="total">Total: R$ ${Number(order.total_amount).toFixed(2)}</p>
        </body>
      </html>
    `);
    ticket.document.close();
    ticket.focus();
    ticket.print();
  }

  const activeOrder = orders.find((order) => order.id === activeOrderId);
  const activeOrderDestination = getOrderDestination(activeOrder ?? null);
  const activeOrderLatestLocation = getLatestDeliveryLocation(activeOrder ?? null);
  const activeOrderTime = formatOrderTime(activeOrder ?? null);
  const activeOrderEta = formatEstimatedDelivery(activeOrder ?? null, tenant);
  const activeOrderProgressMessage = getOrderProgressMessage(activeOrder ?? null, tenant, "admin");
  const activeOrderWhatsappUrl = activeOrder ? buildOrderWhatsappUrl(activeOrder, tenant) : "";
  const todayOrders = orders.filter((order) => {
    if (!order.created_at) return false;
    return new Date(order.created_at).toDateString() === new Date().toDateString();
  });
  const billableTodayOrders = todayOrders.filter((order) => order.status !== "Cancelado");
  const todayRevenue = billableTodayOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const openOrders = orders.filter((order) => !["Entregue", "Cancelado"].includes(order.status));
  const deliveryOrders = orders.filter((order) => order.status === "Saiu para Entrega");
  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const visibleOrders = normalizedOrderSearch
    ? orders.filter((order) =>
        [
          order.id.slice(0, 8),
          order.customer_name,
          order.customer_phone,
          order.delivery_address,
          order.payment_mode,
          order.payment_status,
          order.status,
        ].some((value) => value.toLowerCase().includes(normalizedOrderSearch)),
      )
    : orders;
  const hasNoOrders = orders.length === 0;
  const hasNoVisibleOrders = orders.length > 0 && visibleOrders.length === 0;
  const ordersByStatus = statuses.map((status) => ({
    status,
    orders: visibleOrders.filter((order) => order.status === status),
  }));
  const activeProducts = products.filter((product) => product.is_active);
  const inactiveProducts = products.filter((product) => !product.is_active);
  const paymentOptions = [
    "PIX",
    "Cartao",
    ...(tenant?.allow_cash_on_delivery ?? allowCashOnDelivery ? ["Dinheiro na Entrega"] : []),
    ...(tenant?.allow_card_on_delivery ?? allowCardOnDelivery ? ["Maquininha na Entrega"] : []),
  ];

  function exportTodayOrdersCsv() {
    if (todayOrders.length === 0) {
      setNotice("Nao ha pedidos de hoje para exportar.");
      setError("");
      return;
    }

    const header = [
      "Pedido",
      "Recebido",
      "Cliente",
      "Telefone",
      "Status",
      "Pagamento",
      "Total",
      "Entrega",
      "Endereco",
      "Itens",
      "Observacao",
    ];
    const rows = todayOrders.map((order) => [
      order.id.slice(0, 8),
      formatOrderTime(order),
      order.customer_name,
      order.customer_phone,
      order.status,
      `${order.payment_mode} - ${order.payment_status}`,
      Number(order.total_amount).toFixed(2),
      Number(order.delivery_fee).toFixed(2),
      `${order.delivery_address}${order.address_complement ? ` - ${order.address_complement}` : ""}`,
      order.items.map((item) => `${item.quantity}x ${item.product_name}`).join("; "),
      order.order_notes ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `pedidos-${tenant?.slug ?? tenantSlug}-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("Relatorio CSV dos pedidos de hoje gerado.");
    setError("");
  }

  if (!isAuthenticated) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="section-title">
            <Store size={22} />
            <h1>Painel da hamburgueria</h1>
          </div>
          {notice && <div className="notice">{notice}</div>}
          {error && <div className="notice error">{error}</div>}
          <form className="panel" onSubmit={loginAdmin}>
            <h2>Entrar</h2>
            <label>
              Slug da loja
              <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
            </label>
            {isSupabaseAuthEnabled() && (
              <label>
                E-mail
                <input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} />
              </label>
            )}
            <label>
              Senha
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
              />
            </label>
            <button type="submit">
              <Search size={16} />
              Acessar painel
            </button>
          </form>
          <form className="panel" onSubmit={createTenant}>
            <h2>Criar loja</h2>
            <label>
              Nome
              <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} />
            </label>
            <label>
              Slug
              <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
            </label>
            <label>
              Senha administrativa
              <input
                minLength={6}
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
              />
            </label>
            <button type="submit">
              <Plus size={16} />
              Criar e entrar
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="brand">
            <Store size={24} />
            <h1>Delivery SaaS</h1>
          </div>
          <p>{tenant ? tenant.slug : "Configure uma loja para iniciar o ambiente multi-tenant."}</p>
        </div>
        <div className="topbar-actions">
          <a className="secondary-link" href={getStoreUrl(tenant?.slug ?? tenantSlug)} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Abrir loja
          </a>
          <button type="button" className="secondary-button" onClick={copyStoreLink}>
            <Copy size={16} />
            Copiar link
          </button>
          <button type="button" className="secondary-button" onClick={logoutAdmin}>
            Sair
          </button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="workspace">
        <form className="panel" onSubmit={saveTenantSettings}>
          <div className="section-title">
            <Store size={18} />
            <h2>Loja</h2>
          </div>
          <label>
            Nome
            <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} />
          </label>
          <label>
            Slug
            <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
          </label>
          <label>
            WhatsApp
            <input value={tenantPhone} onChange={(event) => setTenantPhone(event.target.value)} />
          </label>
          <label>
            Endereco da loja
            <input value={tenantAddress} onChange={(event) => setTenantAddress(event.target.value)} />
          </label>
          <label>
            Logo URL
            <input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://..." />
          </label>
          <label>
            Enviar logo
            <input accept="image/*" name="logo_file" type="file" />
          </label>
          <label>
            Banner URL
            <input value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} placeholder="https://..." />
          </label>
          <label>
            Enviar banner
            <input accept="image/*" name="banner_file" type="file" />
          </label>
          <label>
            Horario de funcionamento
            <input value={openingHours} onChange={(event) => setOpeningHours(event.target.value)} placeholder="Ex: Ter-Dom 18h as 23h" />
          </label>
          <div className="form-grid">
            <label>
              Taxa de entrega
              <input
                min="0"
                step="0.01"
                type="number"
                value={deliveryFee}
                onChange={(event) => setDeliveryFee(event.target.value)}
              />
            </label>
            <label>
              Prazo estimado
              <input
                min="1"
                type="number"
                value={estimatedDeliveryMinutes}
                onChange={(event) => setEstimatedDeliveryMinutes(Number(event.target.value))}
              />
            </label>
          </div>
          <label className="toggle-line">
            <input checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} type="checkbox" />
            Loja aberta para pedidos
          </label>
          <label>
            Chave PIX
            <input value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="email, CPF/CNPJ ou chave aleatoria" />
          </label>
          <label>
            Chave gateway cartao
            <input value={cardGatewayKey} onChange={(event) => setCardGatewayKey(event.target.value)} placeholder="token do gateway" />
          </label>
          <label>
            Nova senha administrativa
            <input
              minLength={6}
              type="password"
              value={newAdminPassword}
              onChange={(event) => setNewAdminPassword(event.target.value)}
              placeholder="Preencha apenas para trocar"
            />
          </label>
          <label className="toggle-line">
            <input
              checked={allowCashOnDelivery}
              onChange={(event) => setAllowCashOnDelivery(event.target.checked)}
              type="checkbox"
            />
            Aceitar dinheiro na entrega
          </label>
          <label className="toggle-line">
            <input
              checked={allowCardOnDelivery}
              onChange={(event) => setAllowCardOnDelivery(event.target.checked)}
              type="checkbox"
            />
            Aceitar maquininha na entrega
          </label>
          <button type="submit">
            {tenantId ? <Save size={16} /> : <Plus size={16} />}
            {tenantId ? "Salvar loja" : "Criar tenant"}
          </button>
          <button type="button" className="secondary-button" onClick={loadTenantBySlug}>
            <Search size={16} />
            Carregar slug
          </button>
        </form>

        <form className="panel" onSubmit={addCategory}>
          <div className="section-title">
            <ClipboardList size={18} />
            <h2>Categorias</h2>
          </div>
          <label>
            Nome
            <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required />
          </label>
          <label>
            Ordem
            <input
              type="number"
              value={categorySortOrder}
              onChange={(event) => setCategorySortOrder(Number(event.target.value))}
            />
          </label>
          <button type="submit" disabled={!tenantId}>
            {editingCategoryId ? <Save size={16} /> : <Plus size={16} />}
            {editingCategoryId ? "Salvar categoria" : "Adicionar"}
          </button>
          {editingCategoryId && (
            <button type="button" className="secondary-button" onClick={resetCategoryForm}>
              <X size={16} />
              Cancelar
            </button>
          )}
          <ul className="plain-list">
            {categories.map((category) => (
              <li key={category.id}>
                <span>{category.sort_order}. {category.name}</span>
                <button type="button" className="icon-button" onClick={() => editCategory(category)} title="Editar categoria">
                  <Edit3 size={14} />
                </button>
                <button type="button" className="icon-button danger" onClick={() => removeCategory(category.id)} title="Remover categoria">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </form>

        <form className="panel wide" onSubmit={addProduct}>
          <div className="section-title">
            <Utensils size={18} />
            <h2>Produtos</h2>
          </div>
          <div className="form-grid">
            <label>
              Nome
              <input
                value={productDraft.name}
                onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Preco
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={productDraft.price}
                onChange={(event) => setProductDraft((current) => ({ ...current, price: event.target.value }))}
                required
              />
            </label>
            <label>
              Categoria
              <select
                value={productDraft.category_id}
                onChange={(event) => setProductDraft((current) => ({ ...current, category_id: event.target.value }))}
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ordem
              <input
                type="number"
                value={productDraft.sort_order}
                onChange={(event) => setProductDraft((current) => ({ ...current, sort_order: Number(event.target.value) }))}
              />
            </label>
            <label>
              Imagem URL
              <input
                value={productDraft.image_url}
                onChange={(event) => setProductDraft((current) => ({ ...current, image_url: event.target.value }))}
              />
            </label>
            <label>
              Enviar imagem
              <input accept="image/*" name="product_file" type="file" />
            </label>
          </div>
          <label>
            Descricao
            <textarea
              rows={3}
              value={productDraft.description}
              onChange={(event) => setProductDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label className="toggle-line">
            <input
              checked={productDraft.is_active}
              onChange={(event) => setProductDraft((current) => ({ ...current, is_active: event.target.checked }))}
              type="checkbox"
            />
            Produto ativo no cardapio
          </label>
          <button type="submit" disabled={!tenantId}>
            {editingProductId ? <Save size={16} /> : <Plus size={16} />}
            {editingProductId ? "Salvar produto" : "Adicionar produto"}
          </button>
          {editingProductId && (
            <button type="button" className="secondary-button" onClick={resetProductForm}>
              <X size={16} />
              Cancelar edicao
            </button>
          )}
        </form>
      </section>

      <section className="menu-band">
        <div className="section-title">
          <Utensils size={18} />
          <h2>Cardapio</h2>
        </div>
        <div className="product-grid">
          {activeProducts.map((product) => (
            <article className="product-card" key={product.id}>
              {product.image_url ? <img src={resolveAssetUrl(product.image_url)} alt="" /> : <div className="image-placeholder" />}
              <div>
                <h3>{product.name}</h3>
                <p>{product.description || "Produto ativo no cardapio."}</p>
                <strong>R$ {Number(product.price).toFixed(2)}</strong>
              </div>
              <div className="product-actions">
                <button type="button" className="secondary-button" onClick={() => editProduct(product)}>
                  <Edit3 size={16} />
                  Editar
                </button>
                <button type="button" className="secondary-button" onClick={() => toggleProductAvailability(product)}>
                  <X size={16} />
                  Desativar
                </button>
              </div>
            </article>
          ))}
        </div>
        {inactiveProducts.length > 0 && (
          <div className="inactive-products">
            <h3>Produtos inativos</h3>
            {inactiveProducts.map((product) => (
              <article key={product.id} className="inactive-row">
                <span>{product.name}</span>
                <strong>R$ {Number(product.price).toFixed(2)}</strong>
                <button type="button" className="secondary-button" onClick={() => toggleProductAvailability(product)}>
                  Ativar
                </button>
                <button type="button" className="secondary-button" onClick={() => editProduct(product)}>
                  Editar
                </button>
                <button type="button" className="danger-button" onClick={() => removeProduct(product.id)}>
                  Remover
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="operations">
        <div className="section-title operations-title">
          <div className="section-title">
            <Bike size={18} />
            <h2>Operacao de pedidos</h2>
          </div>
          <div className="operations-tools">
            <button type="button" className="secondary-button" onClick={exportTodayOrdersCsv}>
              <Download size={16} />
              Exportar dia
            </button>
            <label className="order-search">
              <Search size={16} />
              <input
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Buscar pedido, cliente, telefone..."
              />
            </label>
          </div>
        </div>

        <section className="summary-grid">
          <article>
            <span>Pedidos hoje</span>
            <strong>{todayOrders.length}</strong>
          </article>
          <article>
            <span>Faturamento hoje</span>
            <strong>R$ {todayRevenue.toFixed(2)}</strong>
          </article>
          <article>
            <span>Em aberto</span>
            <strong>{openOrders.length}</strong>
          </article>
          <article>
            <span>Em entrega</span>
            <strong>{deliveryOrders.length}</strong>
          </article>
        </section>

        {hasNoOrders && (
          <section className="panel demo-empty">
            <div>
              <strong>Painel pronto para receber pedidos</strong>
              <p>Abra a loja do cliente, envie um pedido de teste e ele aparece aqui na coluna Pendente.</p>
            </div>
            <div className="status-actions two">
              <a className="secondary-link" href={getStoreUrl(tenant?.slug ?? tenantSlug)} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                Abrir loja
              </a>
              <button type="button" className="secondary-button" onClick={copyStoreLink}>
                <Copy size={16} />
                Copiar link
              </button>
            </div>
          </section>
        )}

        {hasNoVisibleOrders && (
          <section className="panel demo-empty">
            <div>
              <strong>Nenhum pedido encontrado</strong>
              <p>A busca atual nao encontrou pedido, cliente, telefone, endereco, pagamento ou status correspondente.</p>
            </div>
          </section>
        )}

        <section className="order-board">
          {ordersByStatus.map((group) => (
            <div className="order-column" key={group.status}>
              <header>
                <h3>{group.status}</h3>
                <strong>{group.orders.length}</strong>
              </header>
              {group.orders.length === 0 && <p className="muted">Sem pedidos.</p>}
              {group.orders.map((order) => {
                const nextStatus = statuses[statuses.indexOf(order.status) + 1];
                return (
                  <article
                    className={order.id === activeOrderId ? "order-card active" : "order-card"}
                    key={order.id}
                  >
                    <button type="button" className="link-button" onClick={() => setActiveOrderId(order.id)}>
                      {order.customer_name}
                    </button>
                    <span>{order.items.length} item(ns)</span>
                    <span>Recebido {formatOrderTime(order)}</span>
                    <strong>R$ {Number(order.total_amount).toFixed(2)}</strong>
                    <div className="order-card-actions">
                      <button type="button" className="secondary-button" onClick={() => setActiveOrderId(order.id)}>
                        Ver pedido
                      </button>
                      {nextStatus && (
                        <button type="button" onClick={() => advanceOrder(order)}>
                          {nextStatus}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </section>

        {activeOrder && (
          <section className="panel order-detail">
            <div className="section-title">
              <ClipboardList size={18} />
              <h2>Pedido selecionado</h2>
            </div>
            <div className="fulfillment-panel">
              <div>
                <strong>Fluxo do atendimento</strong>
                <p>{activeOrderProgressMessage}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => copyCustomerOrderLink(activeOrder)}>
                <Copy size={16} />
                Copiar link do cliente
              </button>
            </div>
            <div className="fulfillment-steps">
              {fulfillmentStatuses.map((status) => (
                <span className={getProgressClass(activeOrder, status)} key={status}>
                  {status}
                </span>
              ))}
            </div>
            <div className="detail-grid">
              <span>Cliente</span>
              <strong>{activeOrder.customer_name}</strong>
              <span>Telefone</span>
              <strong>{activeOrder.customer_phone}</strong>
              <span>Pagamento</span>
              <strong>{activeOrder.payment_mode} - {activeOrder.payment_status}</strong>
              {activeOrder.payment_provider && (
                <>
                  <span>Gateway</span>
                  <strong>{activeOrder.payment_provider}</strong>
                </>
              )}
              <span>Status</span>
              <strong>{activeOrder.status}</strong>
              {activeOrderTime && (
                <>
                  <span>Recebido</span>
                  <strong>{activeOrderTime}</strong>
                </>
              )}
              {activeOrderEta && (
                <>
                  <span>Previsao</span>
                  <strong>{activeOrderEta}</strong>
                </>
              )}
              <span>Endereco</span>
              <strong>
                {activeOrder.delivery_address}
                {activeOrder.address_complement ? ` - ${activeOrder.address_complement}` : ""}
              </strong>
              {activeOrder.order_notes && (
                <>
                  <span>Observacao</span>
                  <strong>{activeOrder.order_notes}</strong>
                </>
              )}
            </div>
            <div className="order-items">
              {activeOrder.items.map((item) => (
                <div key={item.id}>
                  <span>{item.quantity}x {item.product_name}</span>
                  <strong>R$ {(Number(item.unit_price) * item.quantity).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div className="status-actions two">
              {activeOrderWhatsappUrl && (
                <a className="secondary-link" href={activeOrderWhatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle size={16} />
                  Chamar cliente
                </a>
              )}
              <button type="button" className="secondary-button" onClick={() => printKitchenTicket(activeOrder)}>
                <Printer size={16} />
                Imprimir comanda
              </button>
            </div>
            <div className="status-actions">
              {paymentStatuses.map((paymentStatus) => (
                <button
                  type="button"
                  className={activeOrder.payment_status === paymentStatus ? undefined : "secondary-button"}
                  disabled={activeOrder.payment_status === paymentStatus}
                  key={paymentStatus}
                  onClick={() => updatePaymentStatus(activeOrder.id, paymentStatus)}
                >
                  {paymentStatus}
                </button>
              ))}
            </div>
            <div className="status-actions">
              {statuses.map((status) => (
                <button
                  type="button"
                  className={activeOrder.status === status ? undefined : "secondary-button"}
                  disabled={activeOrder.status === status}
                  key={status}
                  onClick={() => updateStatus(activeOrder.id, status)}
                >
                  {status}
                </button>
              ))}
            </div>
            {activeOrder.status === "Saiu para Entrega" && (
              <div className="status-actions two">
                <button type="button" onClick={() => sendCurrentLocation(activeOrder.id)}>
                  <Bike size={16} />
                  Enviar minha localizacao
                </button>
                <button type="button" className="secondary-button" onClick={() => sendDemoLocation(activeOrder.id)}>
                  <Bike size={16} />
                  Enviar localizacao teste
                </button>
              </div>
            )}
            <div className="cart-total">
              <span>Entrega</span>
              <strong>R$ {Number(activeOrder.delivery_fee).toFixed(2)}</strong>
            </div>
            <div className="cart-total">
              <span>Total do pedido</span>
              <strong>R$ {Number(activeOrder.total_amount).toFixed(2)}</strong>
            </div>
          </section>
        )}

        {activeOrder && activeOrder.status === "Saiu para Entrega" && (
          <TrackingMap
            orderId={activeOrder.id}
            destination={
              activeOrderDestination
                ? {
                    ...activeOrderDestination,
                    label: activeOrder.delivery_address,
                  }
                : null
            }
            initialLocation={activeOrderLatestLocation}
          />
        )}
      </section>
    </main>
  );
}

type CustomerStoreProps = {
  slug: string;
  initialOrderId?: string;
};

function getPaymentInstruction(tenant: Tenant | null, order: Order | null) {
  if (!order) return "";
  if (order.payment_status === "Pago") {
    return "Pagamento confirmado pela loja.";
  }
  if (order.payment_mode === "PIX") {
    if (order.payment_checkout_url) {
      return "Clique em Pagar agora para abrir o checkout seguro e finalizar o PIX.";
    }
    return tenant?.pix_key
      ? `Pague via PIX usando a chave ${tenant.pix_key}. A loja confirma o pagamento antes de iniciar a entrega.`
      : "A loja recebeu o pedido e pode enviar a chave PIX pelo WhatsApp.";
  }
  if (order.payment_mode === "Cartao") {
    if (order.payment_checkout_url) {
      return "Clique em Pagar agora para abrir o checkout seguro e finalizar o pagamento no cartao.";
    }
    return "Pagamento por cartao selecionado. A integracao com gateway ainda e simulada neste ambiente.";
  }
  if (order.payment_mode === "Dinheiro na Entrega") {
    return `Separe R$ ${Number(order.total_amount).toFixed(2)} para pagar na entrega.`;
  }
  if (order.payment_mode === "Maquininha na Entrega") {
    return "O entregador leva a maquininha para cobrar no momento da entrega.";
  }
  return "Forma de pagamento registrada no pedido.";
}

function buildCustomerWhatsappUrl(tenant: Tenant | null, order: Order | null) {
  const phone = tenant?.phone?.replace(/\D/g, "");
  if (!phone || phone.length < 10 || !order) return "";
  const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
  const message = [
    `Ola, fiz o pedido ${order.id.slice(0, 8)} pela loja ${tenant?.name ?? ""}.`,
    `Total: R$ ${Number(order.total_amount).toFixed(2)}.`,
    `Pagamento: ${order.payment_mode}.`,
  ].join(" ");
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function CustomerStore({ slug, initialOrderId = "" }: CustomerStoreProps) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const tenantId = tenant?.id ?? "";
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0),
    [cart],
  );
  const deliveryFeeValue = Number(tenant?.delivery_fee ?? 0);
  const orderTotal = total + deliveryFeeValue;
  const paymentOptions = [
    "PIX",
    "Cartao",
    ...(tenant?.allow_cash_on_delivery ? ["Dinheiro na Entrega"] : []),
    ...(tenant?.allow_card_on_delivery ? ["Maquininha na Entrega"] : []),
  ];
  const paymentInstruction = getPaymentInstruction(tenant, order);
  const whatsappUrl = buildCustomerWhatsappUrl(tenant, order);
  const orderDestination = getOrderDestination(order);
  const orderLatestLocation = getLatestDeliveryLocation(order);
  const orderTime = formatOrderTime(order);
  const orderEta = formatEstimatedDelivery(order, tenant);
  const orderProgressMessage = getOrderProgressMessage(order, tenant, "customer");

  useEffect(() => {
    async function loadStore() {
      try {
        const store = await api.getTenantBySlug(slug);
        const [categoryData, productData] = await Promise.all([
          api.listCategories(store.id),
          api.listProducts(store.id),
        ]);
        setTenant(store);
        setCategories(categoryData);
        setProducts(productData);
        setError("");
      } catch (error) {
        setError(error instanceof Error ? error.message : "Nao foi possivel carregar a loja.");
      }
    }
    loadStore();
  }, [slug]);

  useEffect(() => {
    if (!tenantId || !initialOrderId) return;
    api.getOrder(tenantId, initialOrderId)
      .then(setOrder)
      .catch((error) => setError(error instanceof Error ? error.message : "Pedido nao encontrado."));
  }, [tenantId, initialOrderId]);

  useEffect(() => {
    if (!tenantId || !order) return;
    const interval = window.setInterval(async () => {
      try {
        setOrder(await api.getOrder(tenantId, order.id));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Nao foi possivel atualizar o pedido.");
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [tenantId, order?.id]);

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  function changeCartQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) => (item.product.id === productId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || isSubmittingOrder) return;
    setIsSubmittingOrder(true);
    const form = new FormData(event.currentTarget);
    const deliveryAddress = String(form.get("delivery_address"));
    const addressComplement = String(form.get("address_complement")) || "";
    try {
      const destination = await geocodeDeliveryAddress(deliveryAddress, addressComplement, tenant);
      const created = await api.createOrder(tenantId, {
        customer_name: String(form.get("customer_name")),
        customer_phone: String(form.get("customer_phone")),
        delivery_address: deliveryAddress,
        address_complement: addressComplement || null,
        delivery_latitude: destination?.latitude ?? null,
        delivery_longitude: destination?.longitude ?? null,
        order_notes: String(form.get("order_notes")) || null,
        payment_mode: String(form.get("payment_mode")),
        items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      });
      setOrder(created);
      setCart([]);
      setNotice("Pedido recebido pela cozinha.");
      setError("");
      window.history.replaceState(null, "", `/loja/${slug}/pedido/${created.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nao foi possivel fechar o pedido.");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function copyOrderLink() {
    if (!order) return;
    try {
      await copyTextToClipboard(getOrderTrackingUrl(slug, order.id));
      setNotice("Link do pedido copiado.");
      setError("");
    } catch {
      setError("Nao foi possivel copiar o link do pedido.");
    }
  }

  const productsWithoutCategory = products.filter((product) => !product.category_id);
  const visibleGroups = [
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: products.filter((product) => product.category_id === category.id),
    })),
    ...(productsWithoutCategory.length ? [{ id: "others", name: "Outros", items: productsWithoutCategory }] : []),
  ].filter((group) => group.items.length > 0);

  return (
    <main className="public-store">
      <header
        className={tenant?.banner_url ? "store-hero with-banner" : "store-hero"}
        style={tenant?.banner_url ? { backgroundImage: `linear-gradient(90deg, rgba(17, 24, 39, 0.88), rgba(17, 24, 39, 0.48)), url(${resolveAssetUrl(tenant.banner_url)})` } : undefined}
      >
        <div>
          <div className="brand">
            {tenant?.logo_url ? <img className="store-logo" src={resolveAssetUrl(tenant.logo_url)} alt="" /> : <Store size={24} />}
            <h1>{tenant?.name ?? "Hamburgueria"}</h1>
          </div>
          <p>{tenant?.is_open ? "Aberta para pedidos" : "Fechada no momento"}</p>
          <div className="store-facts">
            {tenant?.opening_hours && <span>{tenant.opening_hours}</span>}
            {tenant?.phone && <span>{tenant.phone}</span>}
            {tenant?.address && <span>{tenant.address}</span>}
            {tenant && <span>Entrega em media {tenant.estimated_delivery_minutes} min</span>}
          </div>
        </div>
        <a className="admin-link" href="/">
          Painel da loja
        </a>
      </header>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      {order && (
        <section className="customer-order">
          <div className="panel">
            <div className="section-title">
              <Bike size={18} />
              <h2>Seu pedido</h2>
            </div>
            <div className="fulfillment-panel">
              <div>
                <strong>Acompanhamento</strong>
                <p>{orderProgressMessage}</p>
              </div>
              <button type="button" className="secondary-button" onClick={copyOrderLink}>
                <Copy size={16} />
                Copiar link
              </button>
            </div>
            <div className="fulfillment-steps">
              {fulfillmentStatuses.map((status) => (
                <span className={getProgressClass(order, status)} key={status}>
                  {status}
                </span>
              ))}
            </div>
            <div className="detail-grid">
              <span>Pedido</span>
              <strong>{order.id.slice(0, 8)}</strong>
              <span>Status</span>
              <strong>{order.status}</strong>
              {orderTime && (
                <>
                  <span>Recebido</span>
                  <strong>{orderTime}</strong>
                </>
              )}
              {orderEta && (
                <>
                  <span>Previsao</span>
                  <strong>{orderEta}</strong>
                </>
              )}
              <span>Total</span>
              <strong>R$ {Number(order.total_amount).toFixed(2)}</strong>
              <span>Entrega</span>
              <strong>R$ {Number(order.delivery_fee).toFixed(2)}</strong>
              <span>Pagamento</span>
              <strong>{order.payment_mode} - {order.payment_status}</strong>
            </div>
            <div className="order-items compact">
              {order.items.map((item) => (
                <div key={item.id}>
                  <span>{item.quantity}x {item.product_name}</span>
                  <strong>R$ {(Number(item.unit_price) * item.quantity).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div className="payment-instructions">
              <div className="section-title">
                <CreditCard size={18} />
                <h3>Pagamento</h3>
              </div>
              <p>{paymentInstruction}</p>
              {order.payment_checkout_url && order.payment_status !== "Pago" && (
                <a className="secondary-link order-contact" href={order.payment_checkout_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  Pagar agora
                </a>
              )}
              {whatsappUrl && (
                <a className="secondary-link order-contact" href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle size={16} />
                  Chamar no WhatsApp
                </a>
              )}
            </div>
          </div>
          {order.status === "Saiu para Entrega" && (
            <TrackingMap
              orderId={order.id}
              destination={
                orderDestination
                  ? {
                      ...orderDestination,
                      label: order.delivery_address,
                    }
                  : null
              }
              initialLocation={orderLatestLocation}
            />
          )}
        </section>
      )}

      <section className="store-layout">
        <div className="store-menu">
          {visibleGroups.map((group) => (
            <section className="store-category" key={group.id}>
              <div className="section-title">
                <Utensils size={18} />
                <h2>{group.name}</h2>
              </div>
              <div className="product-grid">
                {group.items.map((product) => (
                  <article className="product-card customer-card" key={product.id}>
                    {product.image_url ? <img src={resolveAssetUrl(product.image_url)} alt="" /> : <div className="image-placeholder" />}
                    <div>
                      <h3>{product.name}</h3>
                      <p>{product.description || "Produto da casa."}</p>
                      <strong>R$ {Number(product.price).toFixed(2)}</strong>
                    </div>
                    <button type="button" onClick={() => addToCart(product)}>
                      <Plus size={16} />
                      Adicionar
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <form className="panel customer-cart" onSubmit={checkout}>
          <div className="section-title">
            <CreditCard size={18} />
            <h2>Finalizar compra</h2>
          </div>
          <div className="cart-lines">
            {cart.length === 0 && <p className="muted">Escolha um item do cardapio.</p>}
            {cart.map((item) => (
              <div className="cart-row" key={item.product.id}>
                <span>{item.product.name}</span>
                <div className="quantity-control">
                  <button type="button" className="icon-button" onClick={() => changeCartQuantity(item.product.id, item.quantity - 1)}>
                    <Minus size={14} />
                  </button>
                  <input
                    min="1"
                    type="number"
                    value={item.quantity}
                    onChange={(event) => changeCartQuantity(item.product.id, Number(event.target.value))}
                  />
                  <button type="button" className="icon-button" onClick={() => changeCartQuantity(item.product.id, item.quantity + 1)}>
                    <Plus size={14} />
                  </button>
                </div>
                <strong>R$ {(Number(item.product.price) * item.quantity).toFixed(2)}</strong>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => changeCartQuantity(item.product.id, 0)}
                  title="Remover item"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="cart-total">
            <span>Subtotal</span>
            <strong>R$ {total.toFixed(2)}</strong>
          </div>
          <div className="cart-total">
            <span>Entrega</span>
            <strong>R$ {deliveryFeeValue.toFixed(2)}</strong>
          </div>
          <div className="cart-total grand-total">
            <span>Total</span>
            <strong>R$ {orderTotal.toFixed(2)}</strong>
          </div>
          <label>
            Nome
            <input name="customer_name" required />
          </label>
          <label>
            Telefone
            <input name="customer_phone" required />
          </label>
          <label>
            Endereco de entrega
            <input name="delivery_address" required />
          </label>
          <label>
            Complemento/referencia
            <input name="address_complement" />
          </label>
          <label>
            Observacao
            <textarea name="order_notes" rows={3} placeholder="Ex: sem cebola, trocar ponto da carne, interfone..." />
          </label>
          <label>
            Pagamento
            <select name="payment_mode">
              {paymentOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          {!tenant?.is_open && <p className="muted">A loja esta fechada para novos pedidos.</p>}
          <button type="submit" disabled={!tenantId || cart.length === 0 || !tenant?.is_open || isSubmittingOrder}>
            <CreditCard size={16} />
            {isSubmittingOrder ? "Enviando pedido..." : "Enviar pedido"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function App() {
  const [, area, slug, orderSegment, orderId] = window.location.pathname.split("/");
  if (area === "loja") {
    return <CustomerStore slug={slug || "burger-demo"} initialOrderId={orderSegment === "pedido" ? orderId : ""} />;
  }
  return <AdminDashboard />;
}
