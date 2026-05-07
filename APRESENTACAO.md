# Roteiro De Apresentacao

Use este roteiro para demonstrar o projeto como um fluxo real de hamburgueria: cliente compra, pedido cai no painel, cozinha prepara, entrega sai e cliente acompanha.

## 1. Subir O Projeto

```bash
make presentation-up
```

Acesse:

- Painel: `http://localhost:8080`
- Loja do cliente: `http://localhost:8080/loja/burger-demo`
- API: `http://localhost:8000/docs`

Login do painel:

- Slug: `burger-demo`
- Senha: `admin123`

## 2. Mostrar A Loja Do Cliente

Abra `http://localhost:8080/loja/burger-demo`.

Mostre:

- Banner e logotipo da loja.
- Cardapio separado por categorias.
- Fotos reais dos produtos.
- Carrinho com subtotal, taxa de entrega e total.

Pedido de teste sugerido:

- Produto: `Nery Jr` ou `Combo da Casa`
- Nome: `Cliente Demo`
- Telefone: `11988887777`
- Endereco: `Avenida Paulista, 1578 - Sao Paulo, SP`
- Complemento: `Portaria principal`
- Pagamento: `PIX`

Depois clique em `Enviar pedido`.

## 3. Mostrar O Pedido No Painel

Abra `http://localhost:8080` e entre no painel.

Mostre:

- Resumo do dia: pedidos, faturamento, pedidos em aberto e em entrega.
- Pedido novo na coluna `Pendente`.
- Detalhe do pedido com cliente, telefone, pagamento, endereco e itens.
- Botao `Copiar link do cliente`.
- Botao `Imprimir comanda`.

## 4. Simular A Cozinha

No pedido selecionado:

1. Clique em `Preparando`.
2. Mostre que o pedido muda de coluna.
3. Mostre o bloco `Fluxo do atendimento`, que orienta a proxima acao.

## 5. Simular A Entrega

No pedido selecionado:

1. Clique em `Saiu para Entrega`.
2. Clique em `Enviar localizacao teste`.
3. Abra o link do cliente copiado ou volte para a aba da loja.
4. Mostre o mapa com destino e localizacao do entregador.
5. No final, marque `Entregue`.

## 6. Fechar A Demonstracao

Fale que o projeto ja cobre:

- Multi-loja por tenant.
- Painel administrativo.
- Loja publica por slug.
- Cardapio com categorias, produtos, fotos e ordenacao.
- Checkout do cliente.
- Pedido caindo no painel da hamburgueria.
- Status da cozinha e entrega.
- Pagamento simulado.
- Impressao de comanda.
- WhatsApp.
- Rastreamento por mapa.
- Deploy local com Docker/Nginx.
- Exportacao CSV dos pedidos do dia.

## 7. Status Do Projeto

Para apresentacao, o projeto esta pronto para demonstrar o fluxo principal de ponta a ponta:

- Cliente abre a loja.
- Cliente escolhe produtos com fotos reais.
- Cliente fecha pedido.
- Pedido cai no painel da hamburgueria.
- Vendedor acompanha preparo, pagamento e entrega.
- Cliente acompanha status e rastreio.
- Vendedor pode imprimir comanda e exportar pedidos do dia.
- Pagamento online tem base tecnica pronta para gateway, mas no ambiente demo segue simulado.

Pontos que ainda sao simulados ou preparados para uma etapa de producao real:

- Pagamento online real depende de credencial do gateway e validacao final de webhook.
- No demo local, PIX aparece como instrucao/chave da loja; cobranca automatica depende do gateway configurado.
- Login administrativo usa token local simples.
- Deploy publico precisa de dominio, HTTPS e banco Postgres/Supabase.
- Storage Supabase esta previsto, mas localmente as imagens ficam servidas pelo backend.

## 8. Validar Antes De Apresentar

```bash
make validate
docker compose -f docker-compose.prod.yml ps
```

Se o navegador mostrar algo antigo, use `Ctrl + F5`.

## 9. Limpar Pedidos De Teste

Se quiser apresentar com o painel zerado, rode:

```bash
make reset-demo-orders
```

Esse comando remove somente pedidos, itens e rastreios da loja demo. Ele nao apaga categorias, produtos, imagens, logo ou banner.
