# PRD - Plataforma SaaS Delivery de Hamburguerias (Multi-tenant)

## 1. Visão Geral
Sistema de gestão e vendas para múltiplas hamburguerias, onde cada lojista (tenant) gerencia seu cardápio, fotos e pedidos, enquanto o cliente final realiza compras com pagamento integrado e rastreio de entrega.

## 2. Arquitetura Multi-tenant
- **Isolamento de Dados:** Todas as tabelas (produtos, pedidos, usuários) devem possuir uma coluna `tenant_id`.
- **Segurança:** Utilizar Row Level Security (RLS) do PostgreSQL (Supabase) para garantir que um lojista não acesse dados de outro.

## 3. Funcionalidades do Lojista (Painel Administrativo)
- **Gestão de Cardápio:** CRUD de categorias e produtos (nome, descrição, preço).
- **Upload de Imagens:** Integração com Supabase Storage para fotos de produtos, vinculadas ao `tenant_id`.
- **Gestão de Pedidos:** Painel para alterar status do pedido (Pendente, Preparando, Saiu para Entrega, Entregue).
- **Configuração de Pagamento:** Cadastro de chaves para recebimento (PIX/Cartão) e opção de "Pagamento na Entrega".

## 4. Funcionalidades do Cliente (Site de Vendas)
- **Cardápio Dinâmico:** Visualização de itens filtrados por hamburgueria.
- **Carrinho de Compras:** Seleção de itens, opcionais e cálculo de total.
- **Checkout e Pagamento:**
  - Pagamento Online: Integração com Gateway (PIX/Cartão) via Webhooks no FastAPI.
  - Pagamento Offline: Seleção de método para pagar na entrega (dinheiro/maquininha).

## 5. Logística e Rastreamento
- **Rastreio em Tempo Real:** 
  - O motoboy envia coordenadas GPS via aplicação.
  - O cliente visualiza a localização do entregador em um mapa (Leaflet/Google Maps) quando o status for "Saiu para Entrega".
- **Notificações:** Atualização de status via WebSocket ou Pulling para o cliente.

## 6. Requisitos Técnicos
- **Backend:** FastAPI (Python).
- **Banco de Dados & Auth:** Supabase (PostgreSQL).
- **Storage:** Supabase Storage.
- **Frontend Sugerido:** React/Vite (para deploy no Cloudflare Pages).
- **Infraestrutura:** Docker para ambiente de desenvolvimento local no Ubuntu.
