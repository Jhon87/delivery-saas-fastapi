# Deploy

Guia pratico para publicar o projeto separando backend, frontend, banco e storage.

## Visao Geral

- Backend FastAPI: Render, Railway, Fly.io, VPS ou outro host com Docker.
- Frontend React/Vite: Cloudflare Pages, Vercel, Netlify ou static hosting.
- Banco: Supabase Postgres.
- Storage: Supabase Storage.
- Dominio sugerido:
  - API: `https://api.seudominio.com`
  - App/lojas: `https://app.seudominio.com`

## Backend

O backend ja tem:

- `backend/Dockerfile` para Docker Compose local.
- `Dockerfile.api` para hosts que buildam a partir da raiz do repositorio.
- `render.yaml` como base para Render.
- `railway.toml` como base para Railway.

Variaveis obrigatorias em producao:

```env
APP_NAME="Delivery SaaS FastAPI"
API_PREFIX="/api"
DATABASE_URL="postgresql+psycopg://usuario:senha@host:5432/postgres"
CORS_ORIGINS='["https://app.seudominio.com"]'
PUBLIC_BASE_URL="https://api.seudominio.com"
LOCAL_UPLOAD_DIR="uploads"
ALLOW_PUBLIC_TENANT_CREATION="false"
ADMIN_TOKEN_SECRET="troque-por-um-segredo-forte"
ADMIN_AUTH_MODE="jwt"
JWT_SECRET="supabase-jwt-secret-ou-chave-hs256"
JWT_ISSUER="https://seu-projeto.supabase.co/auth/v1"
JWT_AUDIENCE="authenticated"
JWT_TENANT_CLAIM="app_metadata.tenant_id"
PAYMENT_PROVIDER="mercado_pago"
MERCADO_PAGO_ACCESS_TOKEN="APP_USR-..."
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
SUPABASE_STORAGE_BUCKET="product-images"
```

Comando de start:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Healthcheck:

```text
GET /health
```

## Deploy Do Backend No Render

O projeto possui `render.yaml` na raiz.

Passos:

1. Suba o projeto para um repositorio Git.
2. No Render, crie um Web Service a partir do repositorio ou use Blueprint.
3. Configure o build por Docker usando `Dockerfile.api`.
4. Configure as variaveis de ambiente de `backend/.env.production.example`.
5. Use uma `DATABASE_URL` Postgres. Para producao, nao use SQLite.
6. Depois do deploy, teste:

```text
https://sua-api.onrender.com/health
https://sua-api.onrender.com/docs
```

7. Copie a URL publica da API para o frontend:

```env
VITE_API_URL="https://sua-api.onrender.com/api"
VITE_WS_URL="wss://sua-api.onrender.com/api"
```

## Deploy Do Backend No Railway

O projeto possui `railway.toml` na raiz.

Passos:

1. Suba o projeto para um repositorio Git.
2. No Railway, crie um projeto a partir do repositorio.
3. Use o Dockerfile `Dockerfile.api`.
4. Configure as variaveis de ambiente de `backend/.env.production.example`.
5. Adicione um banco Postgres e coloque a connection string em `DATABASE_URL`.
6. Depois do deploy, teste:

```text
https://sua-api.up.railway.app/health
https://sua-api.up.railway.app/docs
```

7. Copie a URL publica da API para o frontend:

```env
VITE_API_URL="https://sua-api.up.railway.app/api"
VITE_WS_URL="wss://sua-api.up.railway.app/api"
```

## Banco Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute `backend/supabase/schema.sql`.
4. Copie a connection string Postgres para `DATABASE_URL`.
5. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## Frontend

O frontend gera arquivos estaticos em `frontend/dist`.

Build:

```bash
cd frontend
npm install
npm run build
```

Variaveis de build:

```env
VITE_API_URL="https://api.seudominio.com/api"
VITE_WS_URL="wss://api.seudominio.com/api"
```

Em Cloudflare Pages, Vercel ou Netlify:

- Build command: `npm run build`
- Output directory: `dist`
- Root directory: `frontend`

## Deploy Do Frontend No Vercel

O projeto ja possui `vercel.json` na raiz.

Passos:

1. Suba o projeto para um repositorio Git.
2. No Vercel, importe o repositorio.
3. Use as configuracoes do `vercel.json`:
   - Install command: `cd frontend && npm ci`
   - Build command: `cd frontend && npm run build`
   - Output directory: `frontend/dist`
4. Configure as variaveis de ambiente:

```env
VITE_API_URL="https://sua-api-publica.com/api"
VITE_WS_URL="wss://sua-api-publica.com/api"
```

5. Depois do deploy, copie a URL do Vercel e coloque essa origem no backend:

```env
CORS_ORIGINS='["https://seu-app.vercel.app"]'
```

## Deploy Do Frontend No Netlify

O projeto ja possui `netlify.toml` na raiz e `frontend/public/_redirects` para suportar rotas internas da loja.

Passos:

1. Suba o projeto para um repositorio Git.
2. No Netlify, importe o repositorio.
3. O `netlify.toml` usa:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Configure as variaveis de ambiente:

```env
VITE_API_URL="https://sua-api-publica.com/api"
VITE_WS_URL="wss://sua-api-publica.com/api"
```

5. Depois do deploy, copie a URL do Netlify e coloque essa origem no backend:

```env
CORS_ORIGINS='["https://seu-app.netlify.app"]'
```

As rotas da loja, como `/loja/burger-demo`, funcionam no Vercel/Netlify porque os arquivos de deploy redirecionam rotas do frontend para `index.html`.

## Deploy Local De Apresentacao

Para simular um deploy local com frontend estatico em Nginx:

```bash
make presentation-up
```

Acesse:

- Frontend: `http://localhost:8080`
- Loja demo: `http://localhost:8080/loja/burger-demo`
- API docs: `http://localhost:8000/docs`

Para parar:

```bash
make presentation-down
```

## CORS

O backend precisa permitir a URL publica do frontend:

```env
CORS_ORIGINS='["https://app.seudominio.com"]'
```

Para homologacao, pode incluir mais de uma origem:

```env
CORS_ORIGINS='["https://app.seudominio.com","https://staging.seudominio.com"]'
```

## WebSocket

O rastreamento usa WebSocket em:

```text
/api/tracking/{order_id}
```

No frontend, use `wss://` em producao:

```env
VITE_WS_URL="wss://api.seudominio.com/api"
```

## Checklist Antes De Producao

- Copiar e preencher os envs locais:

```bash
cp backend/.env.production.example backend/.env.production
cp frontend/.env.example frontend/.env.production
make production-env-check
```

- Trocar `ADMIN_TOKEN_SECRET`.
- Manter `ALLOW_PUBLIC_TENANT_CREATION=false` depois de criar a loja.
- Usar Supabase/Postgres em `DATABASE_URL`.
- Executar `backend/supabase/schema.sql`.
- Configurar Supabase Storage.
- Configurar `PAYMENT_PROVIDER` e chave do gateway, se for usar pagamento online.
- Configurar `CORS_ORIGINS` com o dominio real.
- Configurar HTTPS.
- Configurar `VITE_API_URL` e `VITE_WS_URL`.
- Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` se o painel usar Supabase Auth.
- Rodar testes:

```bash
backend/.venv/bin/pytest backend/tests
cd frontend && npm run build
```

## Limites Do Estado Atual

- Autenticacao administrativa ja aceita JWT HS256 quando `ADMIN_AUTH_MODE=jwt`.
- A tela de login ja usa Supabase Auth quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estao configurados; ainda e necessario criar os usuarios no Supabase com `app_metadata.tenant_id`.
- Criacao publica de lojas pode ser bloqueada com `ALLOW_PUBLIC_TENANT_CREATION=false`; use `backend/scripts/create_tenant.py` para bootstrap no banco de producao.
- Gateway PIX/cartao fica simulado por padrao. A base para Mercado Pago ja existe, mas requer `MERCADO_PAGO_ACCESS_TOKEN` real e validacao final de webhooks.
- Geocodificacao usa Nominatim/OpenStreetMap no frontend.

## Ordem Recomendada Para Publicar

1. Criar banco Postgres/Supabase.
2. Executar `backend/supabase/schema.sql`.
3. Publicar backend FastAPI no Render/Railway.
4. Testar `/health` e `/docs`.
5. Publicar frontend no Vercel/Netlify com `VITE_API_URL` e `VITE_WS_URL`.
6. Atualizar `CORS_ORIGINS` no backend com a URL final do frontend.
7. Testar loja publica, painel, pedido, status e rastreio.
