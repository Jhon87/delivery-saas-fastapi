create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  phone text,
  address text,
  logo_url text,
  banner_url text,
  opening_hours text,
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  estimated_delivery_minutes integer not null default 40 check (estimated_delivery_minutes > 0),
  is_open boolean not null default true,
  pix_key text,
  card_gateway_key text,
  allow_cash_on_delivery boolean not null default true,
  allow_card_on_delivery boolean not null default true,
  admin_password_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  primary key (tenant_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price > 0),
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  address_complement text,
  delivery_latitude numeric(9, 6),
  delivery_longitude numeric(9, 6),
  order_notes text,
  payment_mode text not null,
  payment_status text not null default 'Pendente',
  payment_provider text,
  payment_external_id text,
  payment_checkout_url text,
  status text not null default 'Pendente',
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  notes text
);

create table if not exists public.delivery_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  created_at timestamptz not null default now()
);

create index if not exists categories_tenant_id_idx on public.categories(tenant_id);
create index if not exists products_tenant_id_idx on public.products(tenant_id);
create index if not exists orders_tenant_id_idx on public.orders(tenant_id);
create index if not exists orders_payment_external_id_idx on public.orders(payment_external_id);
create index if not exists order_items_tenant_id_idx on public.order_items(tenant_id);
create index if not exists delivery_locations_order_id_idx on public.delivery_locations(order_id);

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.delivery_locations enable row level security;

create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select tenant_id
  from public.tenant_members
  where user_id = auth.uid()
$$;

create policy "members read tenants"
on public.tenants for select
using (id in (select public.current_user_tenant_ids()));

create policy "members manage categories"
on public.categories for all
using (tenant_id in (select public.current_user_tenant_ids()))
with check (tenant_id in (select public.current_user_tenant_ids()));

create policy "members manage products"
on public.products for all
using (tenant_id in (select public.current_user_tenant_ids()))
with check (tenant_id in (select public.current_user_tenant_ids()));

create policy "members manage orders"
on public.orders for all
using (tenant_id in (select public.current_user_tenant_ids()))
with check (tenant_id in (select public.current_user_tenant_ids()));

create policy "members manage order items"
on public.order_items for all
using (tenant_id in (select public.current_user_tenant_ids()))
with check (tenant_id in (select public.current_user_tenant_ids()));

create policy "members manage delivery locations"
on public.delivery_locations for all
using (tenant_id in (select public.current_user_tenant_ids()))
with check (tenant_id in (select public.current_user_tenant_ids()));

create policy "members read memberships"
on public.tenant_members for select
using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "tenant product image reads"
on storage.objects for select
using (bucket_id = 'product-images');

create policy "tenant product image writes"
on storage.objects for insert
with check (
  bucket_id = 'product-images'
  and split_part(name, '/', 1)::uuid in (select public.current_user_tenant_ids())
);
