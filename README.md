# Siran Summit 2026 — Sistema de Reserva de Stands

Sistema interno para a equipe comercial reservar stands do Siran Summit 2026
(10 e 11 de novembro). Feito para uso **no celular** — os vendedores trabalham
em campo — e também funcional no desktop.

## Como funciona

- **Vendedores** entram e veem a grade de stands com status em tempo real:
  - 🟢 **Disponível** — pode reservar
  - 🟡 **Reservado** — bloqueado, aguardando confirmação
  - 🔴 **Vendido** — reserva confirmada
  - ⚪ **Indisponível** — bloqueado pela administração
- Ao **reservar**, o vendedor informa os dados do cliente, pode **anexar
  documentos** (fotos, PDF, Word, Excel, TXT) e o stand fica **imediatamente
  indisponível** para os demais.
- A trava é feita no banco, não na tela: dois vendedores clicando no mesmo
  stand no mesmo instante resultam em uma reserva e um aviso de indisponível.
- A reserva tem **prazo para confirmação** (padrão 48h, configurável). Sem
  confirmação, **expira e o stand é liberado automaticamente**.
- Cada reserva dispara **notificação por e-mail e WhatsApp** para o vendedor e
  para a lista da diretoria (opcional — veja abaixo).
- **Administradores** gerenciam cotas, stands, vendedores, reservas e ajustes.

## Cotas

As cotas são entidades próprias — preço, tamanho e lista de benefícios ficam
em um só lugar e valem para todos os stands daquela cota. Editar os benefícios
da Semeadura atualiza todos os stands dela de uma vez.

| Cota | Valor | Tamanho |
|---|---|---|
| Raiz | R$ 5.000 | 4m² (sem área de exposição) |
| Semeadura | R$ 10.000 | 18m² (9m² stand / 9m² exposição) |
| Colheita | *a definir* | *a definir* |
| Parceiro | R$ 30.000 | 72m² (36m² stand / 36m² exposição) |

Cotas podem ser criadas, editadas e excluídas pelo painel (aba **Cotas**). A
exclusão é bloqueada enquanto houver stands vinculados.

Um stand pode **sobrescrever** preço e tamanho da sua cota — útil para posições
privilegiadas. Deixando os campos em branco, ele herda os valores da cota.

## Stack

React 19 + Vite + Tailwind 4 (frontend) · Express 5 + MySQL (backend) —
mesmo padrão dos portais E-Mais / GP Experience, pronto para Hostinger.

## Rodando localmente

```bash
npm install
copy .env.example .env    # preencha as credenciais do MySQL
npm run setup             # cria banco, tabelas e dados iniciais
npm run dev:all           # Vite (5173) + API (3001)
```

Login inicial: **admin / 123** — configurável por `ADMIN_USUARIO` e
`ADMIN_SENHA` no `.env`. **Troque antes de publicar na internet:** o sistema
guarda dados de clientes e documentos anexados.

O setup cria 26 stands de exemplo, com **quantidades provisórias** por cota
(Raiz 8, Semeadura 8, Colheita 6, Parceiro 4) e o stand P1 já indisponível.
Ajuste tudo pelo painel quando o mapa definitivo do evento sair. O setup é
idempotente: rodar de novo não duplica nem apaga o que foi cadastrado.

## Notificações (opcional)

Os dois canais são independentes e ficam **desligados** sem configuração — a
reserva funciona normalmente, apenas não avisa ninguém. O painel mostra o
estado de cada canal e um histórico de envios para diagnóstico.

- **E-mail**: preencha `SMTP_*` no `.env`.
- **WhatsApp**: `WHATSAPP_PROVIDER=meta` (API oficial da Meta) ou `webhook`
  (Z-API, Evolution API e similares).

Os destinatários fixos são cadastrados em **Admin > Ajustes**. O vendedor da
reserva é sempre notificado, usando o e-mail/telefone do cadastro dele — por
isso vale preencher esses campos ao cadastrar vendedores.

Detalhes de cada variável estão comentados no `.env.example`.

## Anexos das reservas

Documentos de clientes **não** ficam na pasta pública das plantas dos stands.
São gravados em `ANEXOS_DIR` (padrão `anexos_privados/`, fora de `public/`) e
só saem pela rota autenticada `/api/reservas/anexos/:id`, que valida se quem
pede é o dono da reserva ou um administrador. São servidos como `attachment`,
nunca renderizados no navegador.

Em produção, aponte `ANEXOS_DIR` e `UPLOADS_DIR` para pastas **fora da área de
deploy**, para que novas publicações não apaguem os arquivos.

## Deploy (Hostinger)

1. `npm run build` gera o `dist/`
2. Configure o `.env` (`NODE_ENV=production`; a `PORT` é definida automaticamente)
3. Defina `UPLOADS_DIR` e `ANEXOS_DIR` fora da área de deploy
4. Rode `npm run setup` uma vez
5. Start: `npm start`

## Estrutura

```
server/
  index.js          API + job que libera reservas expiradas (a cada 1 min)
  db.js             Pool MySQL
  reservas-lib.js   Expiração e prazo de reserva
  notificacoes.js   E-mail (SMTP) e WhatsApp (Meta ou webhook)
  setup-full.js     Criação do banco + seed + migrações (idempotente)
  routes/
    auth.js         Login/sessões + CRUD de usuários
    stands.js       CRUD de stands + upload de planta
    categorias.js   CRUD de cotas
    reservas.js     Reservar/confirmar/cancelar + anexos + ajustes
src/
  components/       Modal (bottom-sheet no celular), campos, anexos
  pages/Login.tsx   Autenticação
  pages/Mapa.tsx    Grade de stands (vendedores) — atualiza a cada 15s
  pages/Admin.tsx   Stands, Cotas, Vendedores, Reservas, Ajustes
```
