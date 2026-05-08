# Delivery SaaS FastAPI

Plataforma SaaS multi-tenant para hamburguerias, com painel do vendedor, loja publica, pedidos, pagamentos, rastreamento e uploads.

## URLs Locais

- Painel do vendedor: `http://localhost:5173`
- Loja publica demo: `http://localhost:5173/loja/burger-demo`
- API docs: `http://localhost:8000/docs`
- Healthcheck: `http://localhost:8000/health`

Login demo:

- Slug: `burger-demo`
- Senha: `admin123`

## Rodando Com Docker

```bash
docker compose up --build
```

Depois acesse o painel em `http://localhost:5173`.

Se os containers ja existem e voce so quer subir:

```bash
docker compose up -d
```

Para ver o status:

```bash
docker compose ps
```

## Deploy Local De Apresentacao

Esse modo roda o frontend ja buildado em Nginx, parecido com um deploy real:

```bash
make presentation-up
```

Acesse:

- App/loja: `http://localhost:8080`
- Loja demo: `http://localhost:8080/loja/burger-demo`
- API: `http://localhost:8000/docs`

Para desligar:

```bash
make presentation-down
```

Para limpar apenas os pedidos demo antes de apresentar:

```bash
make reset-demo-orders
```

Roteiro sugerido para demonstrar o projeto:

```bash
APRESENTACAO.md
```

Arquivos prontos para publicar o frontend:

- `vercel.json`
- `netlify.toml`
- `frontend/.env.example`
- `frontend/public/_redirects`

Arquivos prontos para publicar o backend:

- `Dockerfile.api`
- `render.yaml`
- `railway.toml`
- `backend/.env.production.example`

Mais detalhes em `DEPLOY.md`.

Checklist direto para colocar online:

```bash
PUBLICAR_ONLINE.md
```

## Rodando Sem Docker

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Fluxo Principal

1. O vendedor entra no painel.
2. Configura a loja, horarios, WhatsApp, taxa de entrega, PIX e formas de pagamento.
3. Cadastra categorias e produtos, com imagem e ordem de exibicao.
4. O cliente acessa `/loja/{slug}`, monta carrinho e envia pedido.
5. O pedido aparece automaticamente no painel.
6. O vendedor acompanha por colunas: `Pendente`, `Preparando`, `Saiu para Entrega`, `Entregue`, `Cancelado`.
7. O vendedor marca pagamento como `Pendente`, `Pago`, `Falhou` ou `Estornado`.
8. Quando sair para entrega, o vendedor pode enviar a localizacao real ou uma localizacao de teste.
9. O cliente acompanha status, pagamento e rastreio.

## Recursos Implementados

- Multi-tenant por `tenant_id`.
- Criacao de loja com senha administrativa.
- Login administrativo com token simples local.
- Autenticacao administrativa por JWT HS256 configuravel para producao.
- CRUD de categorias.
- CRUD de produtos.
- Upload local de imagens e fallback para Supabase Storage quando configurado.
- Loja publica por slug.
- Carrinho e checkout.
- Pedido com itens, taxa de entrega e total calculado no backend.
- Status operacional do pedido.
- Status de pagamento.
- Base de checkout online com provider simulado e Mercado Pago via variaveis de ambiente.
- Cancelamento de pedido.
- Painel de pedidos com busca, resumo do dia e colunas por status.
- Atualizacao automatica de pedidos no painel.
- Impressao de comanda.
- Atalho WhatsApp para cliente e loja.
- Geocodificacao do endereco de entrega no checkout.
- Rastreio por mapa com destino do cliente, ultima localizacao e WebSocket.
- Exportacao CSV dos pedidos do dia.
- Roteiro e comandos para apresentacao local.
- Testes automatizados do backend cobrindo fluxo principal, pagamento, rastreio e cancelamento.

## Status Do Projeto

Pronto para demonstracao local:

- Fluxo do cliente comprando na loja.
- Pedido caindo no painel do vendedor.
- Operacao da cozinha por status.
- Saida para entrega com rastreio no mapa.
- Impressao de comanda.
- Relatorio CSV do dia.
- Deploy local de apresentacao com Docker/Nginx.

Ainda pendente para producao real:

- Conectar o login do painel ao Supabase Auth e emitir JWT com `app_metadata.tenant_id`.
- Usar Supabase/Postgres em vez de SQLite local.
- Configurar dominio, HTTPS e CORS publico.
- Configurar storage Supabase para imagens reais em producao.
- Configurar e validar gateway real de PIX/cartao.
- Definir `ADMIN_TOKEN_SECRET` forte se `ADMIN_AUTH_MODE=local` ou `hybrid`.

## Testes

Instale as dependencias do backend:

```bash
backend/.venv/bin/pip install -r backend/requirements.txt
```

Rode:

```bash
backend/.venv/bin/pytest backend/tests
```

Validacoes manuais uteis:

```bash
python3 -m compileall backend/app
cd frontend && npm run build
```

## Supabase

O schema esta em:

```bash
backend/supabase/schema.sql
```

Execute esse SQL no Supabase para criar tabelas, indices e politicas RLS.

Variaveis para storage real:

```bash
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
SUPABASE_STORAGE_BUCKET="product-images"
```

Sem essas variaveis, uploads ficam locais em `backend/uploads`.

## Autenticacao Administrativa

O modo local continua ativo por padrao para demo:

```bash
ADMIN_AUTH_MODE="local"
ADMIN_TOKEN_SECRET="dev-change-me"
```

Para producao com JWT HS256:

```bash
ADMIN_AUTH_MODE="jwt"
JWT_SECRET="supabase-jwt-secret-ou-chave-hs256"
JWT_ISSUER="https://seu-projeto.supabase.co/auth/v1"
JWT_AUDIENCE="authenticated"
JWT_TENANT_CLAIM="app_metadata.tenant_id"
```

Nesse modo, as rotas administrativas aceitam `Authorization: Bearer <jwt>` e validam se o claim configurado em `JWT_TENANT_CLAIM` corresponde ao header `X-Tenant-Id`.

## Producao

Antes de colocar em producao:

- Conectar o frontend ao Supabase Auth e salvar o JWT da sessao administrativa.
- Definir `ADMIN_TOKEN_SECRET` forte.
- Usar Postgres/Supabase em vez de SQLite.
- Configurar dominio, HTTPS e CORS.
- Configurar storage Supabase.
- Integrar gateway real de PIX/cartao.
- Separar variaveis `.env` reais de `.env.example`.

## Estrutura

```text
backend/
  app/
    api/
    core/
    models/
    schemas/
    services/
  tests/
  supabase/schema.sql
frontend/
  Dockerfile.prod
  nginx.conf
  src/
    api/
    components/
    styles/
```
