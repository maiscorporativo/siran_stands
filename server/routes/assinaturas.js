import express from 'express';
import pool from '../db.js';
import { requireAuth } from './auth.js';
import {
  documentoParaAssinar, registrarAssinatura, assinaturasDaReserva,
  criarToken, lerToken, marcarTokenUsado, conferirCodigo,
  gerarCodigo, ipDaRequisicao,
} from '../assinaturas-lib.js';
import { enviarCodigoAssinatura, enviarLinkAssinatura } from '../notificacoes.js';
import { processarEmBackground } from '../contratos-lib.js';

const router = express.Router();

/* ══ Rotas autenticadas (vendedor / admin) ═══════════════════════ */

async function carregarReservaPermitida(req, res) {
  const [[reserva]] = await pool.query('SELECT * FROM reservas WHERE id = ?', [req.params.id]);
  if (!reserva) {
    res.status(404).json({ error: 'Proposta não encontrada' });
    return null;
  }
  const dono = String(reserva.vendedor_id) === String(req.user.user_id);
  if (!dono && req.user.role !== 'master') {
    res.status(403).json({ error: 'Esta proposta pertence a outro vendedor' });
    return null;
  }
  return reserva;
}

/* ── GET /:id/preparar ─── documento e hash para assinar agora ─── */
router.get('/:id/preparar', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;
    if (reserva.assinado_em)
      return res.status(409).json({ error: 'Esta proposta já foi assinada.' });

    const doc = await documentoParaAssinar(reserva.id);
    if (!doc) return res.status(500).json({ error: 'Não foi possível preparar o documento' });

    res.json({
      hash: doc.hash,
      stand_codigo: doc.dados.stand_codigo,
      cota: doc.dados.cota,
      valor: doc.dados.valor,
      razao_social: doc.dados.razao_social,
      representante_nome: doc.dados.representante_nome,
      representante_cpf: doc.dados.representante_cpf,
      representante_cargo: doc.dados.representante_cargo,
      cliente_email: doc.dados.cliente_email,
      cliente_contato: doc.dados.cliente_contato,
    });
  } catch (err) {
    console.error('[GET /api/assinaturas/:id/preparar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /:id/presencial ─── cliente assina no aparelho do vendedor ──
   O vendedor está logado e presente, então não há código: a própria
   sessão dele é registrada como quem conduziu o ato. */
router.post('/:id/presencial', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;
    if (reserva.assinado_em)
      return res.status(409).json({ error: 'Esta proposta já foi assinada.' });

    const { nome, cpf, cargo, traco, hash_documento, geolocalizacao } = req.body;
    if (!nome || !traco) return res.status(400).json({ error: 'Informe o nome e assine no campo indicado.' });

    const resultado = await registrarAssinatura(reserva.id, {
      parte: 'patrocinador',
      nome, cpf, cargo,
      email: reserva.cliente_email,
      telefone: reserva.cliente_contato,
      traco,
      modo: 'presencial',
      hash_documento,
      ip: ipDaRequisicao(req),
      user_agent: req.headers['user-agent'],
      geolocalizacao,
      testemunha_id: req.user.user_id,
    });

    await efetivarVenda(reserva);
    res.json({ ok: true, hash: resultado?.hash });
    processarEmBackground(reserva.id, 'assinada');
  } catch (err) {
    console.error('[POST /api/assinaturas/:id/presencial]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /:id/enviar-link ─── manda o link para o cliente assinar ── */
router.post('/:id/enviar-link', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;
    if (reserva.assinado_em)
      return res.status(409).json({ error: 'Esta proposta já foi assinada.' });

    const via = req.body.via === 'email' ? 'email' : 'whatsapp';
    const destino = via === 'email' ? reserva.cliente_email : reserva.cliente_contato;
    if (!destino)
      return res.status(400).json({
        error: via === 'email'
          ? 'Esta proposta não tem e-mail do cliente. Edite a proposta e informe.'
          : 'Esta proposta não tem WhatsApp do cliente. Edite a proposta e informe.',
      });

    const codigo = gerarCodigo();
    const token = await criarToken(reserva.id, { codigo, envio: via });
    const enviado = await enviarLinkAssinatura(reserva.id, { via, destino, token, codigo });

    if (!enviado.ok) return res.status(502).json({ error: enviado.erro || 'Falha ao enviar o link.' });
    res.json({ ok: true, via, destino });
  } catch (err) {
    console.error('[POST /api/assinaturas/:id/enviar-link]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── GET /:id ─── assinaturas registradas ─────────────────────── */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;
    const lista = await assinaturasDaReserva(reserva.id);
    // O traço é pesado e não serve para exibir em lista
    res.json(lista.map(({ traco, ...resto }) => ({ ...resto, tem_traco: Boolean(traco) })));
  } catch (err) {
    console.error('[GET /api/assinaturas/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ══ Rotas públicas (o signatário não tem conta no sistema) ══════ */

/* ── GET /publico/:token ─── dados para a tela de assinatura ───── */
router.get('/publico/:token', async (req, res) => {
  try {
    const { token, erro } = await lerToken(req.params.token);
    if (erro) return res.status(410).json({ error: erro });

    const doc = await documentoParaAssinar(token.reserva_id);
    if (!doc) return res.status(404).json({ error: 'Proposta não encontrada.' });
    if (doc.dados.assinado_em) return res.status(409).json({ error: 'Esta proposta já foi assinada.' });

    res.json({
      hash: doc.hash,
      stand_codigo: doc.dados.stand_codigo,
      cota: doc.dados.cota,
      valor: doc.dados.valor,
      razao_social: doc.dados.razao_social,
      representante_nome: doc.dados.representante_nome,
      representante_cpf: doc.dados.representante_cpf,
      representante_cargo: doc.dados.representante_cargo,
      vendedor_nome: doc.dados.vendedor_nome,
      // Só a dica do destino, nunca o contato inteiro
      codigo_enviado_para: mascarar(token.codigo_envio === 'email'
        ? doc.dados.cliente_email : doc.dados.cliente_contato),
    });
  } catch (err) {
    console.error('[GET /api/assinaturas/publico/:token]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── GET /publico/:token/contrato ─── o PDF para leitura ──────── */
router.get('/publico/:token/contrato', async (req, res) => {
  try {
    const { token, erro } = await lerToken(req.params.token);
    if (erro) return res.status(410).json({ error: erro });

    const doc = await documentoParaAssinar(token.reserva_id);
    if (!doc) return res.status(404).json({ error: 'Proposta não encontrada.' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrato-${doc.dados.stand_codigo}.pdf"`);
    res.send(doc.buffer);
  } catch (err) {
    console.error('[GET /api/assinaturas/publico/:token/contrato]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /publico/:token/assinar ─── assinatura remota ───────── */
router.post('/publico/:token/assinar', async (req, res) => {
  try {
    const { token, erro } = await lerToken(req.params.token);
    if (erro) return res.status(410).json({ error: erro });

    const { nome, cpf, cargo, traco, hash_documento, codigo, geolocalizacao } = req.body;
    if (!nome || !traco) return res.status(400).json({ error: 'Informe o nome e assine no campo indicado.' });

    const conferencia = await conferirCodigo(req.params.token, codigo ?? '');
    if (!conferencia.ok) return res.status(401).json({ error: conferencia.erro });

    const [[reserva]] = await pool.query('SELECT * FROM reservas WHERE id = ?', [token.reserva_id]);
    if (!reserva) return res.status(404).json({ error: 'Proposta não encontrada.' });
    if (reserva.assinado_em) return res.status(409).json({ error: 'Esta proposta já foi assinada.' });

    const resultado = await registrarAssinatura(reserva.id, {
      parte: 'patrocinador',
      nome, cpf, cargo,
      email: reserva.cliente_email,
      telefone: reserva.cliente_contato,
      traco,
      modo: 'remoto',
      hash_documento,
      ip: ipDaRequisicao(req),
      user_agent: req.headers['user-agent'],
      geolocalizacao,
      codigo_validado: 1,
      validado_por: conferencia.envio === 'email' ? 'e-mail' : 'WhatsApp',
    });

    await marcarTokenUsado(req.params.token);
    await efetivarVenda(reserva);
    res.json({ ok: true, hash: resultado?.hash });
    processarEmBackground(reserva.id, 'assinada');
  } catch (err) {
    console.error('[POST /api/assinaturas/publico/:token/assinar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /publico/:token/reenviar ─── novo código ────────────── */
router.post('/publico/:token/reenviar', async (req, res) => {
  try {
    const { token, erro } = await lerToken(req.params.token);
    if (erro) return res.status(410).json({ error: erro });

    const [[reserva]] = await pool.query('SELECT * FROM reservas WHERE id = ?', [token.reserva_id]);
    const codigo = gerarCodigo();
    await pool.query(
      'UPDATE assinatura_tokens SET codigo = ?, tentativas = 0 WHERE token = ?',
      [codigo, req.params.token]
    );

    const destino = token.codigo_envio === 'email' ? reserva.cliente_email : reserva.cliente_contato;
    const envio = await enviarCodigoAssinatura({ via: token.codigo_envio, destino, codigo, reserva });
    if (!envio.ok) return res.status(502).json({ error: envio.erro || 'Falha ao reenviar o código.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/assinaturas/publico/:token/reenviar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── GET /verificar/:hash ─── autenticidade, sem login ────────── */
router.get('/verificar/:hash', async (req, res) => {
  try {
    const [[r]] = await pool.query(
      `SELECT r.id, r.assinado_em, r.razao_social, r.cnpj,
              s.codigo AS stand_codigo, c.nome AS cota,
              COALESCE(r.valor_negociado, s.preco, c.preco) AS valor,
              u.nome AS vendedor_nome
       FROM reservas r
       JOIN stands s ON s.id = r.stand_id
       LEFT JOIN categorias c ON c.id = s.categoria_id
       JOIN users u ON u.id = r.vendedor_id
       WHERE r.hash_contrato = ? LIMIT 1`,
      [String(req.params.hash).trim().toLowerCase()]
    );

    if (!r) return res.status(404).json({ ok: false, error: 'Nenhum documento encontrado com este código.' });

    const assinaturas = await assinaturasDaReserva(r.id);
    res.json({
      ok: true,
      documento: {
        stand: r.stand_codigo, cota: r.cota, valor: r.valor,
        razao_social: r.razao_social, cnpj: r.cnpj,
        vendedor: r.vendedor_nome, assinado_em: r.assinado_em,
      },
      assinaturas: assinaturas.map(a => ({
        parte: a.parte, nome: a.nome, cpf: mascararCpf(a.cpf),
        modo: a.modo, assinado_em: a.assinado_em,
        confirmado: Boolean(a.codigo_validado), validado_por: a.validado_por,
      })),
    });
  } catch (err) {
    console.error('[GET /api/assinaturas/verificar/:hash]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── Máscaras: confirmam sem expor o dado inteiro ─────────────── */
function mascarar(v) {
  const s = String(v ?? '');
  if (!s) return null;
  if (s.includes('@')) {
    const [u, d] = s.split('@');
    return `${u.slice(0, 2)}${'•'.repeat(Math.max(2, u.length - 2))}@${d}`;
  }
  const d = s.replace(/\D/g, '');
  return d.length >= 4 ? `${'•'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : s;
}

function mascararCpf(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null;
}

/* Assinou, virou venda: o stand deixa de ser reserva. */
async function efetivarVenda(reserva) {
  await pool.query(
    "UPDATE reservas SET status = 'confirmada', confirmada_em = COALESCE(confirmada_em, NOW()) WHERE id = ?",
    [reserva.id]
  );
  await pool.query("UPDATE stands SET status = 'vendido' WHERE id = ?", [reserva.stand_id]);
}

export default router;
