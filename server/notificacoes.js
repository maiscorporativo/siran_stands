/* ── Notificações de reserva (e-mail + WhatsApp) ──────────────────
   Tudo aqui é opcional: sem as variáveis de ambiente configuradas o
   canal simplesmente não dispara, e a reserva segue normalmente.
   O envio NUNCA deve derrubar ou atrasar a reserva — por isso roda
   depois da resposta HTTP e registra o resultado em notificacoes_log. */
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import pool from './db.js';

/* Este módulo lê process.env no topo, então precisa garantir que o
   .env já esteja carregado — não dá para depender da ordem em que os
   imports do index.js são avaliados. */
dotenv.config();

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE,
  WHATSAPP_PROVIDER, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
  WHATSAPP_WEBHOOK_URL, WHATSAPP_TEMPLATE,
  EVOLUTION_API_KEY, EVOLUTION_INSTANCE,
  APP_URL,
} = process.env;

// Aceita os dois nomes para a URL, que variam conforme a documentação
const EVOLUTION_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL;

const emailAtivo = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
const whatsappAtivo = Boolean(
  (WHATSAPP_PROVIDER === 'meta' && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ||
  (WHATSAPP_PROVIDER === 'evolution' && EVOLUTION_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE) ||
  (WHATSAPP_PROVIDER === 'webhook' && WHATSAPP_WEBHOOK_URL)
);

let transporter = null;
if (emailAtivo) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export function statusNotificacoes() {
  return {
    email: emailAtivo,
    whatsapp: whatsappAtivo,
    whatsapp_provider: whatsappAtivo ? WHATSAPP_PROVIDER : null,
  };
}

/* ── Destinatários extras, configurados no painel ─────────────── */
async function getConfig(chave) {
  const [rows] = await pool.query('SELECT valor FROM config WHERE chave = ? LIMIT 1', [chave]);
  return rows[0]?.valor || '';
}

function separar(lista) {
  return lista.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
}

/* ── Telefone BR para o formato E.164 sem "+" (5517999998888) ─── */
function normalizarTelefone(tel) {
  const so = String(tel).replace(/\D/g, '');
  if (!so) return null;
  if (so.startsWith('55')) return so;
  if (so.length === 10 || so.length === 11) return `55${so}`;
  return so;
}

async function registrar(reservaId, canal, destino, ok, erro) {
  try {
    await pool.query(
      `INSERT INTO notificacoes_log (reserva_id, canal, destino, status, erro)
       VALUES (?, ?, ?, ?, ?)`,
      [reservaId, canal, destino, ok ? 'enviado' : 'falha', erro ? String(erro).slice(0, 500) : null]
    );
  } catch (e) {
    console.warn('[notificacoes] falha ao gravar log:', e.message);
  }
}

/* ── Evolution API ────────────────────────────────────────────────
   POST {url}/message/sendText/{instancia} com header `apikey`.
   A v2 espera { number, text }; a v1 espera { number, textMessage:
   { text } }. Tentamos a v2 e, se ela recusar o formato, repetimos
   no formato v1 — assim funciona nas duas sem configuração extra. */
/* Envia um PDF como documento pelo WhatsApp (Evolution /sendMedia).
   Falha aqui não impede a mensagem de texto — são chamadas separadas. */
async function enviarEvolutionDocumento(numero, arquivoBase64, nomeArquivo, legenda) {
  const base = EVOLUTION_URL.replace(/\/+$/, '');
  const url = `${base}/message/sendMedia/${encodeURIComponent(EVOLUTION_INSTANCE)}`;
  const headers = { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY };

  const corpoV2 = {
    number: numero,
    mediatype: 'document',
    mimetype: 'application/pdf',
    media: arquivoBase64,
    fileName: nomeArquivo,
    caption: legenda,
  };

  let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(corpoV2) });
  if (res.status === 400 || res.status === 404) {
    const erroV2 = (await res.text()).slice(0, 200);
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        number: numero,
        mediaMessage: {
          mediatype: 'document',
          fileName: nomeArquivo,
          caption: legenda,
          media: arquivoBase64,
        },
      }),
    });
    if (!res.ok)
      throw new Error(`Evolution mídia ${res.status}: ${(await res.text()).slice(0, 200)} (v2: ${erroV2})`);
    return;
  }
  if (!res.ok) throw new Error(`Evolution mídia ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function enviarEvolution(numero, mensagem) {
  const base = EVOLUTION_URL.replace(/\/+$/, '');
  const url = `${base}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`;
  const headers = { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY };

  const tentar = corpo => fetch(url, { method: 'POST', headers, body: JSON.stringify(corpo) });

  /* linkPreview: false — sem isso o WhatsApp transforma o e-mail ou o
     site que aparecem na mensagem num cartão de preview (o logo do
     Gmail, por exemplo), que rouba a atenção do aviso de reserva. */
  let res = await tentar({ number: numero, text: mensagem, linkPreview: false });
  if (res.status === 400 || res.status === 404) {
    const primeiroErro = (await res.text()).slice(0, 200);
    res = await tentar({
      number: numero,
      textMessage: { text: mensagem },
      options: { linkPreview: false },
    });
    if (!res.ok) {
      throw new Error(`Evolution ${res.status}: ${(await res.text()).slice(0, 200)} (v2 respondeu: ${primeiroErro})`);
    }
    return;
  }
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/* ── WhatsApp ─────────────────────────────────────────────────────
   'meta'      → API oficial do WhatsApp Cloud (Meta)
   'evolution' → Evolution API (self-hosted / Docker)
   'webhook'   → POST genérico { telefone, mensagem }, para Z-API e
                 outros (ajuste o corpo conforme o seu provedor). */
async function enviarWhatsapp(telefone, mensagem) {
  const numero = normalizarTelefone(telefone);
  if (!numero) throw new Error('Telefone inválido');

  if (WHATSAPP_PROVIDER === 'evolution') {
    return enviarEvolution(numero, mensagem);
  }

  if (WHATSAPP_PROVIDER === 'meta') {
    const corpo = WHATSAPP_TEMPLATE
      ? {
          messaging_product: 'whatsapp',
          to: numero,
          type: 'template',
          template: {
            name: WHATSAPP_TEMPLATE,
            language: { code: 'pt_BR' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: mensagem }] }],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: numero,
          type: 'text',
          text: { body: mensagem },
        };

    const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!res.ok) throw new Error(`Meta API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  const res = await fetch(WHATSAPP_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(WHATSAPP_TOKEN ? { Authorization: `Bearer ${WHATSAPP_TOKEN}` } : {}),
    },
    body: JSON.stringify({ telefone: numero, phone: numero, mensagem, message: mensagem }),
  });
  if (!res.ok) throw new Error(`Webhook ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/* ── Monta os textos a partir dos dados da reserva ─────────────── */
function montarMensagem(d, evento) {
  const titulo =
    evento === 'assinada'  ? `Contrato assinado — Stand ${d.stand_codigo}` :
    evento === 'confirmada' ? `Venda confirmada — Stand ${d.stand_codigo}` :
                              `Novo stand reservado — ${d.stand_codigo}`;

  const preco = d.stand_preco != null
    ? Number(d.stand_preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'a definir';

  const prazo = d.expira_em
    ? new Date(d.expira_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const linhas = [
    `*${titulo}*`,
    '',
    `Stand: ${d.stand_codigo} — ${d.stand_nome}`,
    d.categoria ? `Cota: ${d.categoria}` : null,
    `Valor: ${preco}`,
    '',
    `Cliente: ${d.cliente_nome}`,
    d.cliente_empresa ? `Empresa: ${d.cliente_empresa}` : null,
    d.cliente_contato ? `Contato: ${d.cliente_contato}` : null,
    '',
    `Vendedor: ${d.vendedor_nome}`,
    evento === 'reservada' ? `Confirmar até: ${prazo}` : null,
    d.observacoes ? `\nObservações: ${d.observacoes}` : null,
    APP_URL ? `\nAcesse: ${APP_URL}` : null,
  ].filter(l => l !== null);

  const texto = linhas.join('\n');

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#1b4f27;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
        <h2 style="margin:0;font-size:18px">${titulo}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:.85">Siran Summit 2026 — Reserva de Stands</p>
      </div>
      <div style="border:1px solid #e7e5e4;border-top:0;border-radius:0 0 12px 12px;padding:20px">
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#292524">
          ${[
            ['Stand', `${d.stand_codigo} — ${d.stand_nome}`],
            ['Cota', d.categoria],
            ['Valor', preco],
            ['Cliente', d.cliente_nome],
            ['Empresa', d.cliente_empresa],
            ['Contato', d.cliente_contato],
            ['Vendedor', d.vendedor_nome],
            evento === 'reservada' ? ['Confirmar até', prazo] : null,
            ['Observações', d.observacoes],
          ].filter(l => l && l[1]).map(([k, v]) => `
            <tr>
              <td style="padding:7px 0;color:#78716c;width:120px;vertical-align:top">${k}</td>
              <td style="padding:7px 0;font-weight:600">${String(v).replace(/</g, '&lt;')}</td>
            </tr>`).join('')}
        </table>
        ${APP_URL ? `<a href="${APP_URL}" style="display:inline-block;margin-top:18px;background:#237d36;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;font-size:14px">Abrir o sistema</a>` : ''}
      </div>
    </div>`;

  return { titulo, texto, html };
}

/* ── Dispara as notificações de uma reserva ───────────────────────
   `evento`: 'reservada' | 'confirmada'.
   Erros são registrados e engolidos de propósito. */
export async function notificarReserva(reservaId, evento = 'reservada') {
  if (!emailAtivo && !whatsappAtivo) return;

  try {
    const [[d]] = await pool.query(
      `SELECT r.*, s.codigo AS stand_codigo, s.nome AS stand_nome,
              COALESCE(s.preco, c.preco) AS stand_preco, c.nome AS categoria,
              u.nome AS vendedor_nome, u.email AS vendedor_email, u.telefone AS vendedor_telefone
       FROM reservas r
       JOIN stands s ON s.id = r.stand_id
       LEFT JOIN categorias c ON c.id = s.categoria_id
       JOIN users u ON u.id = r.vendedor_id
       WHERE r.id = ?`,
      [reservaId]
    );
    if (!d) return;

    const { titulo, texto, html } = montarMensagem(d, evento);

    /* Documento gerado para esta proposta, quando já existe: vai
       anexado no e-mail e como arquivo no WhatsApp. */
    let contrato = null;
    if (d.contrato_arquivo) {
      try {
        const { caminhoContrato } = await import('./contratos-lib.js');
        const { nomeArquivoContrato } = await import('./contrato-pdf.js');
        const caminho = caminhoContrato(d.contrato_arquivo);
        if (caminho) {
          contrato = {
            caminho,
            nome: nomeArquivoContrato(d, { assinado: evento === 'confirmada' }),
            buffer: await fs.promises.readFile(caminho),
          };
        }
      } catch (e) {
        console.warn('[notificacoes] contrato não pôde ser anexado:', e.message);
      }
    }

    /* Destinatários: o vendedor da proposta, o cliente e a lista fixa
       do painel. A deduplicação usa a forma normalizada como chave —
       senão o mesmo número escrito com e sem máscara viraria dois
       destinos, e a pessoa receberia a mensagem duas vezes. */
    const emails = new Map();
    for (const e of [...separar(await getConfig('notif_emails')), d.vendedor_email, d.cliente_email])
      if (e?.trim()) emails.set(e.trim().toLowerCase(), e.trim());

    const zaps = new Map();
    for (const t of [...separar(await getConfig('notif_whatsapps')), d.vendedor_telefone, d.cliente_contato]) {
      const chave = t && normalizarTelefone(t);
      if (chave) zaps.set(chave, t.trim());
    }

    if (emailAtivo) {
      for (const destino of emails.values()) {
        try {
          await transporter.sendMail({
            from: SMTP_FROM || SMTP_USER,
            to: destino,
            subject: titulo,
            text: texto.replace(/\*/g, ''),
            html,
            attachments: contrato
              ? [{ filename: contrato.nome, content: contrato.buffer, contentType: 'application/pdf' }]
              : [],
          });
          await registrar(reservaId, 'email', destino, true);
        } catch (e) {
          console.warn(`[notificacoes] e-mail para ${destino} falhou:`, e.message);
          await registrar(reservaId, 'email', destino, false, e.message);
        }
      }
    }

    if (whatsappAtivo) {
      const base64 = contrato ? contrato.buffer.toString('base64') : null;

      for (const destino of zaps.values()) {
        try {
          await enviarWhatsapp(destino, texto);
          await registrar(reservaId, 'whatsapp', destino, true);
        } catch (e) {
          console.warn(`[notificacoes] WhatsApp para ${destino} falhou:`, e.message);
          await registrar(reservaId, 'whatsapp', destino, false, e.message);
        }

        /* O PDF vai numa segunda mensagem: se o envio de mídia falhar,
           o aviso de texto já chegou. */
        if (base64 && WHATSAPP_PROVIDER === 'evolution') {
          try {
            await enviarEvolutionDocumento(
              normalizarTelefone(destino),
              base64,
              contrato.nome,
              evento === 'confirmada'
                ? `Contrato — Stand ${d.stand_codigo}`
                : `Proposta comercial — Stand ${d.stand_codigo}`
            );
            await registrar(reservaId, 'whatsapp', `${destino} (PDF)`, true);
          } catch (e) {
            console.warn(`[notificacoes] PDF por WhatsApp para ${destino} falhou:`, e.message);
            await registrar(reservaId, 'whatsapp', `${destino} (PDF)`, false, e.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[notificacoes] falha geral:', e.message);
  }
}

/* Dispara sem travar a resposta HTTP da reserva. */
export function notificarEmBackground(reservaId, evento = 'reservada') {
  setImmediate(() => { notificarReserva(reservaId, evento).catch(() => {}); });
}

/* ══ Assinatura eletrônica ═══════════════════════════════════════ */

/** Envia só o código de uso único, para reenvio na tela do cliente. */
export async function enviarCodigoAssinatura({ via, destino, codigo, reserva }) {
  if (!destino) return { ok: false, erro: 'Sem destino para enviar o código.' };

  const texto =
    `*Siran Summit 2026*\n\n` +
    `Seu código para assinar o contrato do stand ${reserva?.stand_codigo ?? ''}:\n\n` +
    `*${codigo}*\n\n` +
    `O código vale por 72 horas e é de uso único. Se você não solicitou, ignore esta mensagem.`;

  try {
    if (via === 'email') {
      if (!emailAtivo) return { ok: false, erro: 'Envio de e-mail não está configurado no servidor.' };
      await transporter.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: destino,
        subject: `Código para assinar o contrato — Siran Summit 2026`,
        text: texto.replace(/\*/g, ''),
        html: `
          <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto">
            <div style="background:#1b4f27;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
              <h2 style="margin:0;font-size:17px">Assinatura do contrato</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:.85">Siran Summit 2026</p>
            </div>
            <div style="border:1px solid #e7e5e4;border-top:0;border-radius:0 0 12px 12px;padding:24px;text-align:center">
              <p style="margin:0 0 14px;font-size:14px;color:#44403c">Use o código abaixo para confirmar sua assinatura:</p>
              <div style="font-size:30px;font-weight:700;letter-spacing:9px;color:#1b4f27;font-family:monospace">${codigo}</div>
              <p style="margin:16px 0 0;font-size:12px;color:#78716c">Válido por 72 horas, de uso único.<br>Se você não solicitou, ignore este e-mail.</p>
            </div>
          </div>`,
      });
      return { ok: true };
    }

    if (!whatsappAtivo) return { ok: false, erro: 'Envio de WhatsApp não está configurado no servidor.' };
    await enviarWhatsapp(destino, texto);
    return { ok: true };
  } catch (e) {
    console.warn('[assinatura] falha ao enviar código:', e.message);
    return { ok: false, erro: e.message };
  }
}

/** Envia o convite de assinatura: link + código, no mesmo canal. */
export async function enviarLinkAssinatura(reservaId, { via, destino, token, codigo }) {
  try {
    const [[d]] = await pool.query(
      `SELECT r.*, s.codigo AS stand_codigo, c.nome AS cota,
              COALESCE(r.valor_negociado, s.preco, c.preco) AS valor,
              u.nome AS vendedor_nome
       FROM reservas r
       JOIN stands s ON s.id = r.stand_id
       LEFT JOIN categorias c ON c.id = s.categoria_id
       JOIN users u ON u.id = r.vendedor_id
       WHERE r.id = ?`,
      [reservaId]
    );
    if (!d) return { ok: false, erro: 'Proposta não encontrada.' };

    const base = (APP_URL || '').replace(/\/+$/, '');
    const link = `${base}/assinar/${token}`;
    const valor = d.valor != null
      ? Number(d.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'a combinar';

    const texto =
      `*Siran Summit 2026 — Contrato de Patrocínio*\n\n` +
      `Olá! ${d.vendedor_nome} enviou o contrato do stand ${d.stand_codigo} ` +
      `(cota ${d.cota ?? '—'}, ${valor}) para sua assinatura.\n\n` +
      `Abra o link abaixo, confira o contrato e assine na tela:\n${link}\n\n` +
      `Seu código de confirmação: *${codigo}*\n\n` +
      `O link vale por 72 horas.`;

    if (via === 'email') {
      if (!emailAtivo) return { ok: false, erro: 'Envio de e-mail não está configurado no servidor.' };
      await transporter.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: destino,
        subject: `Contrato para assinatura — Stand ${d.stand_codigo} — Siran Summit 2026`,
        text: texto.replace(/\*/g, ''),
        html: `
          <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#1b4f27;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
              <h2 style="margin:0;font-size:18px">Contrato de Patrocínio</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:.85">Siran Summit 2026 — Stand ${d.stand_codigo}</p>
            </div>
            <div style="border:1px solid #e7e5e4;border-top:0;border-radius:0 0 12px 12px;padding:22px">
              <p style="margin:0 0 16px;font-size:14px;color:#292524">
                Olá! <strong>${d.vendedor_nome}</strong> enviou o contrato da cota
                <strong>${d.cota ?? '—'}</strong> (${valor}) para sua assinatura.
              </p>
              <a href="${link}" style="display:block;background:#237d36;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:600;font-size:15px;text-align:center">
                Conferir e assinar o contrato
              </a>
              <p style="margin:20px 0 6px;font-size:13px;color:#44403c">Seu código de confirmação:</p>
              <div style="font-size:26px;font-weight:700;letter-spacing:8px;color:#1b4f27;font-family:monospace;text-align:center">${codigo}</div>
              <p style="margin:18px 0 0;font-size:12px;color:#78716c">O link vale por 72 horas e pode ser usado uma única vez.</p>
            </div>
          </div>`,
      });
      return { ok: true };
    }

    if (!whatsappAtivo) return { ok: false, erro: 'Envio de WhatsApp não está configurado no servidor.' };
    await enviarWhatsapp(destino, texto);
    return { ok: true };
  } catch (e) {
    console.warn('[assinatura] falha ao enviar link:', e.message);
    return { ok: false, erro: e.message };
  }
}
