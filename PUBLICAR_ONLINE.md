# Publicar Online

Este arquivo e o checklist direto para colocar o projeto online.

## Estado Atual

O projeto ja esta preparado para publicar:

- Frontend: Netlify ou Vercel.
- Backend: Railway ou Render.
- Banco: Supabase/Postgres.
- Storage: Supabase Storage.
- Pagamento: base Mercado Pago criada, mas precisa de token real.

## Antes De Publicar

Rode:

```bash
make deploy-check
```

Esse comando valida:

- Sintaxe do backend.
- Testes automatizados.
- Build do frontend.
- Build Docker da API que sera usada em Railway/Render.

## Caminho Recomendado

Use:

- Backend: Railway.
- Frontend: Netlify.
- Banco: Supabase.
- Pagamento: Mercado Pago.

## 1. GitHub

1. Crie um repositorio no GitHub.
2. Suba este projeto para o repositorio.
3. Use esse mesmo repositorio no Railway e no Netlify.

## 2. Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o arquivo `backend/supabase/schema.sql`.
4. Copie a connection string Postgres.
5. Copie:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 3. Railway Backend

1. Crie um projeto no Railway usando o repositorio GitHub.
2. Use o `Dockerfile.api`.
3. Configure as variaveis:

```env
APP_NAME="Delivery SaaS FastAPI"
API_PREFIX="/api"
DATABASE_URL="postgresql+psycopg://..."
CORS_ORIGINS='["https://sua-loja.netlify.app"]'
PUBLIC_BASE_URL="https://sua-api.up.railway.app"
LOCAL_UPLOAD_DIR="uploads"
ADMIN_TOKEN_SECRET="gere-um-segredo-forte"
PAYMENT_PROVIDER="simulated"
MERCADO_PAGO_ACCESS_TOKEN=""
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
SUPABASE_STORAGE_BUCKET="product-images"
```

4. Depois que publicar, teste:

```text
https://sua-api.up.railway.app/health
https://sua-api.up.railway.app/docs
```

## 4. Netlify Frontend

1. Crie um site no Netlify usando o mesmo repositorio GitHub.
2. O arquivo `netlify.toml` ja define:
   - Base: `frontend`
   - Build: `npm run build`
   - Publish: `dist`
3. Configure as variaveis:

```env
VITE_API_URL="https://sua-api.up.railway.app/api"
VITE_WS_URL="wss://sua-api.up.railway.app/api"
```

4. Publique.
5. Copie a URL final do Netlify.
6. Volte no Railway e atualize:

```env
CORS_ORIGINS='["https://sua-loja.netlify.app"]'
```

## 5. Criar Dados Da Loja Online

Depois de backend e frontend publicados:

1. Abra o painel online.
2. Crie a loja.
3. Cadastre categorias.
4. Cadastre produtos.
5. Envie imagens.
6. Abra `/loja/slug-da-loja` e faça pedido de teste.

O seed demo local nao roda automaticamente em producao. Em producao, cadastre a loja pelo painel.

## 6. Pagamento Real

Para ativar Mercado Pago:

```env
PAYMENT_PROVIDER="mercado_pago"
MERCADO_PAGO_ACCESS_TOKEN="APP_USR-..."
```

Depois teste:

1. Pedido PIX.
2. Botao `Pagar agora`.
3. Retorno do webhook.
4. Status mudando para `Pago`.

Sem token real, o sistema segue em modo simulado.

## 7. Checklist Final

- API `/health` responde.
- API `/docs` abre.
- Frontend abre.
- Painel faz login.
- Loja publica abre.
- Pedido cai no painel.
- Status muda.
- Rastreio abre.
- CSV exporta.
- CORS nao bloqueia chamadas.
