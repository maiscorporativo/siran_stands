import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { requireAuth, requireMaster } from './auth.js';
import { liberarReservasExpiradas, getReservaHoras } from '../reservas-lib.js';
import { statusNotificacoes } from '../notificacoes.js';
import { anexosDir } from '../anexos-dir.js';
import {
  gerarEGuardarContrato, caminhoContrato, dadosDoContrato, processarEmBackground,
} from '../contratos-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXTENSOES_OK = /\.(jpe?g|png|webp|gif|heic|heif|pdf|docx?|xlsx?|pptx?|txt|csv|odt|ods|rtf)$/i;

const uploadAnexos = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, anexosDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `anexo-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const ok = EXTENSOES_OK.test(file.originalname);
    cb(ok ? null : new Error('Formato não permitido. Use imagens, PDF, Word, Excel, PowerPoint ou TXT.'), ok);
  },
});

const router = express.Router();

/* ── Carrega reserva validando permissão (dono ou master) ─────────
   Devolve null e já responde o erro quando não pode prosseguir. */
async function carregarReservaPermitida(req, res) {
  const [[reserva]] = await pool.query('SELECT * FROM reservas WHERE id = ?', [req.params.id]);
  if (!reserva) {
    res.status(404).json({ error: 'Reserva não encontrada' });
    return null;
  }
  const dono = String(reserva.vendedor_id) === String(req.user.user_id);
  if (!dono && req.user.role !== 'master') {
    res.status(403).json({ error: 'Esta reserva pertence a outro vendedor' });
    return null;
  }
  return reserva;
}

/* ── GET /api/reservas ─── master vê todas; vendedor só as suas ── */
router.get('/', requireAuth, async (req, res) => {
  try {
    await liberarReservasExpiradas();
    const soMinhas = req.user.role !== 'master';
    const [rows] = await pool.query(
      `SELECT r.*, s.codigo AS stand_codigo, s.nome AS stand_nome, s.preco AS stand_preco,
              u.nome AS vendedor_nome
       FROM reservas r
       JOIN stands s ON s.id = r.stand_id
       JOIN users u ON u.id = r.vendedor_id
       ${soMinhas ? 'WHERE r.vendedor_id = ?' : ''}
       ORDER BY r.criada_em DESC`,
      soMinhas ? [req.user.user_id] : []
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/reservas]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/reservas ─── reservar um stand ─────────────────────
   O UPDATE condicional garante atomicidade: se dois vendedores
   clicarem ao mesmo tempo, apenas um consegue mudar o status de
   'disponivel' para 'reservado' — o outro recebe 409. */
router.post('/', requireAuth, async (req, res) => {
  const {
    stand_id, cliente_nome, cliente_empresa, cliente_contato, cliente_email, observacoes,
    razao_social, cnpj, endereco, cep, cidade, estado,
    representante_nome, representante_cpf, representante_cargo,
    forma_pagamento, valor_negociado,
  } = req.body;
  if (!stand_id || !cliente_nome)
    return res.status(400).json({ error: 'Stand e nome do cliente são obrigatórios' });

  try {
    await liberarReservasExpiradas();

    const [lock] = await pool.query(
      "UPDATE stands SET status = 'reservado' WHERE id = ? AND status = 'disponivel'",
      [stand_id]
    );
    if (lock.affectedRows === 0)
      return res.status(409).json({ error: 'Este stand não está mais disponível.' });

    const horas = await getReservaHoras();
    const [result] = await pool.query(
      `INSERT INTO reservas (stand_id, vendedor_id, cliente_nome, cliente_empresa,
                             cliente_contato, cliente_email, observacoes,
                             razao_social, cnpj, endereco, cep, cidade, estado,
                             representante_nome, representante_cpf, representante_cargo,
                             forma_pagamento, valor_negociado,
                             status, expira_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'ativa', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [stand_id, req.user.user_id, cliente_nome, cliente_empresa || null,
       cliente_contato || null, cliente_email || null, observacoes || null,
       razao_social || null, cnpj || null, endereco || null, cep || null,
       cidade || null, (estado || '').slice(0, 2) || null,
       representante_nome || null, representante_cpf || null, representante_cargo || null,
       forma_pagamento || null, valor_negociado ? Number(valor_negociado) : null,
       horas]
    );
    const [[reserva]] = await pool.query('SELECT * FROM reservas WHERE id = ?', [result.insertId]);
    res.json({ ok: true, reserva, horas });

    // Depois da resposta: gerar o PDF e avisar não podem atrasar a proposta
    processarEmBackground(reserva.id, 'reservada');
  } catch (err) {
    // Falha após o lock: devolve o stand para não travar indevidamente
    await pool.query(
      "UPDATE stands SET status = 'disponivel' WHERE id = ? AND status = 'reservado'", [stand_id]
    ).catch(() => {});
    console.error('[POST /api/reservas]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ══ Rotas de caminho fixo ════════════════════════════════════════
   Precisam vir ANTES de qualquer rota com /:id — senão o Express
   casa "/config" como se "config" fosse o id de uma proposta. */

async function lerConfig(chave, padrao = '') {
  const [rows] = await pool.query('SELECT valor FROM config WHERE chave = ? LIMIT 1', [chave]);
  return rows[0]?.valor ?? padrao;
}

router.get('/config', requireAuth, async (req, res) => {
  try {
    res.json({
      reserva_horas: await getReservaHoras(),
      notif_emails: await lerConfig('notif_emails'),
      notif_whatsapps: await lerConfig('notif_whatsapps'),
      canais: statusNotificacoes(),
    });
  } catch (err) {
    console.error('[GET /api/reservas/config]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/config', requireMaster, async (req, res) => {
  const { reserva_horas, notif_emails, notif_whatsapps } = req.body;
  const horas = Number(reserva_horas);
  if (!Number.isFinite(horas) || horas < 1 || horas > 720)
    return res.status(400).json({ error: 'Informe um prazo entre 1 e 720 horas' });

  try {
    const salvar = (chave, valor) => pool.query(
      'INSERT INTO config (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
      [chave, valor]
    );
    await salvar('reserva_horas', String(horas));
    if (notif_emails !== undefined) await salvar('notif_emails', String(notif_emails).slice(0, 255));
    if (notif_whatsapps !== undefined) await salvar('notif_whatsapps', String(notif_whatsapps).slice(0, 255));
    res.json({ ok: true, reserva_horas: horas });
  } catch (err) {
    console.error('[PUT /api/reservas/config]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── GET /api/reservas/notificacoes/log ─── diagnóstico ────────── */
router.get('/notificacoes/log', requireMaster, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.*, s.codigo AS stand_codigo
       FROM notificacoes_log l
       LEFT JOIN reservas r ON r.id = l.reserva_id
       LEFT JOIN stands s ON s.id = r.stand_id
       ORDER BY l.enviado_em DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/reservas/notificacoes/log]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ══ Rotas por proposta ══════════════════════════════════════════ */

/* ── GET /api/reservas/:id/anexos ─── lista documentos ────────── */
router.get('/:id/anexos', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;

    const [rows] = await pool.query(
      `SELECT a.id, a.nome_original, a.mime, a.tamanho, a.enviado_em, u.nome AS enviado_por_nome
       FROM reserva_anexos a
       LEFT JOIN users u ON u.id = a.enviado_por
       WHERE a.reserva_id = ? ORDER BY a.enviado_em ASC`,
      [reserva.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/reservas/:id/anexos]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/reservas/:id/anexos ─── envia documentos ───────── */
router.post('/:id/anexos', requireAuth, uploadAnexos.array('arquivos', 10), async (req, res) => {
  const arquivos = req.files || [];
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) {
      // Sem permissão: não deixa os arquivos já gravados no disco
      arquivos.forEach(f => fs.promises.unlink(f.path).catch(() => {}));
      return;
    }
    if (!arquivos.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    for (const f of arquivos) {
      await pool.query(
        `INSERT INTO reserva_anexos (reserva_id, arquivo, nome_original, mime, tamanho, enviado_por)
         VALUES (?, ?, ?, ?, ?, ?)`,
        // originalname chega como latin1 no multipart; reinterpreta em utf8
        // para não perder acentos no nome do arquivo
        [reserva.id, f.filename, Buffer.from(f.originalname, 'latin1').toString('utf8'),
         f.mimetype, f.size, req.user.user_id]
      );
    }
    res.json({ ok: true, total: arquivos.length });
  } catch (err) {
    arquivos.forEach(f => fs.promises.unlink(f.path).catch(() => {}));
    console.error('[POST /api/reservas/:id/anexos]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── GET /api/reservas/anexos/:anexoId ─── baixa o documento ──────
   Único caminho de saída dos anexos: valida a sessão e a permissão
   antes de entregar o arquivo, que fica fora de qualquer pasta
   pública. Servido como attachment para o navegador nunca renderizar
   conteúdo enviado por terceiros na origem do sistema. */
router.get('/anexos/:anexoId', requireAuth, async (req, res) => {
  try {
    const [[anexo]] = await pool.query(
      `SELECT a.*, r.vendedor_id FROM reserva_anexos a
       JOIN reservas r ON r.id = a.reserva_id WHERE a.id = ?`,
      [req.params.anexoId]
    );
    if (!anexo) return res.status(404).json({ error: 'Anexo não encontrado' });

    const dono = String(anexo.vendedor_id) === String(req.user.user_id);
    if (!dono && req.user.role !== 'master')
      return res.status(403).json({ error: 'Este anexo pertence à reserva de outro vendedor' });

    // basename impede que um nome manipulado escape do diretório
    const caminho = path.join(anexosDir, path.basename(anexo.arquivo));
    if (!fs.existsSync(caminho))
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });

    res.download(caminho, anexo.nome_original);
  } catch (err) {
    console.error('[GET /api/reservas/anexos/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── DELETE /api/reservas/anexos/:anexoId ─────────────────────── */
router.delete('/anexos/:anexoId', requireAuth, async (req, res) => {
  try {
    const [[anexo]] = await pool.query(
      `SELECT a.*, r.vendedor_id FROM reserva_anexos a
       JOIN reservas r ON r.id = a.reserva_id WHERE a.id = ?`,
      [req.params.anexoId]
    );
    if (!anexo) return res.status(404).json({ error: 'Anexo não encontrado' });

    const dono = String(anexo.vendedor_id) === String(req.user.user_id);
    if (!dono && req.user.role !== 'master')
      return res.status(403).json({ error: 'Este anexo pertence à reserva de outro vendedor' });

    await pool.query('DELETE FROM reserva_anexos WHERE id = ?', [anexo.id]);
    fs.promises.unlink(path.join(anexosDir, path.basename(anexo.arquivo))).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/reservas/anexos/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── GET /api/reservas/:id/contrato ─── baixa a proposta/contrato ──
   Gera na hora se ainda não existir (proposta antiga ou falha no
   disparo em background). */
router.get('/:id/contrato', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;

    let caminho = caminhoContrato(reserva.contrato_arquivo);
    let nomeVisivel = null;

    if (!caminho) {
      const gerado = await gerarEGuardarContrato(reserva.id, {
        assinado: reserva.status === 'confirmada',
      });
      if (!gerado) return res.status(500).json({ error: 'Não foi possível gerar o contrato' });
      caminho = gerado.caminho;
      nomeVisivel = gerado.nome;
    }

    if (!nomeVisivel) {
      const d = await dadosDoContrato(reserva.id);
      const { nomeArquivoContrato } = await import('../contrato-pdf.js');
      nomeVisivel = nomeArquivoContrato(d ?? {}, { assinado: reserva.status === 'confirmada' });
    }
    res.download(caminho, nomeVisivel);
  } catch (err) {
    console.error('[GET /api/reservas/:id/contrato]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/reservas/:id/contrato ─── regera o documento ────────
   Usado depois de corrigir dados da proposta. */
router.post('/:id/contrato', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;

    const gerado = await gerarEGuardarContrato(reserva.id, {
      assinado: reserva.status === 'confirmada',
    });
    if (!gerado) return res.status(500).json({ error: 'Não foi possível gerar o contrato' });
    res.json({ ok: true, arquivo: gerado.nome });
  } catch (err) {
    console.error('[POST /api/reservas/:id/contrato]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── PUT /api/reservas/:id ─── corrige dados da proposta ──────────
   Regera o contrato com os dados novos. */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;
    if (!['ativa', 'confirmada'].includes(reserva.status))
      return res.status(409).json({ error: 'Esta proposta não está mais em andamento.' });

    const campos = [
      'cliente_nome', 'cliente_empresa', 'cliente_contato', 'cliente_email', 'observacoes',
      'razao_social', 'cnpj', 'endereco', 'cep', 'cidade', 'estado',
      'representante_nome', 'representante_cpf', 'representante_cargo', 'forma_pagamento',
    ];
    const sets = [];
    const valores = [];
    for (const c of campos) {
      if (req.body[c] !== undefined) {
        sets.push(`${c} = ?`);
        valores.push(c === 'estado' ? String(req.body[c]).slice(0, 2) || null : req.body[c] || null);
      }
    }
    if (req.body.valor_negociado !== undefined) {
      sets.push('valor_negociado = ?');
      valores.push(req.body.valor_negociado ? Number(req.body.valor_negociado) : null);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });

    valores.push(reserva.id);
    await pool.query(`UPDATE reservas SET ${sets.join(', ')} WHERE id = ?`, valores);

    const gerado = await gerarEGuardarContrato(reserva.id, {
      assinado: reserva.status === 'confirmada',
    });
    res.json({ ok: true, arquivo: gerado?.nome });
  } catch (err) {
    console.error('[PUT /api/reservas/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/reservas/:id/confirmar ─── efetiva a venda ─────── */
router.post('/:id/confirmar', requireAuth, async (req, res) => {
  try {
    await liberarReservasExpiradas();
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;

    const [upd] = await pool.query(
      "UPDATE reservas SET status = 'confirmada', confirmada_em = NOW() WHERE id = ? AND status = 'ativa'",
      [reserva.id]
    );
    if (upd.affectedRows === 0)
      return res.status(409).json({ error: 'Reserva não está mais ativa (expirou ou já foi tratada).' });

    await pool.query("UPDATE stands SET status = 'vendido' WHERE id = ?", [reserva.stand_id]);
    res.json({ ok: true });

    processarEmBackground(reserva.id, 'confirmada');
  } catch (err) {
    console.error('[POST /api/reservas/:id/confirmar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/reservas/:id/cancelar ─── libera o stand ─────────
   Vendedor cancela a própria reserva ativa; master pode cancelar
   qualquer uma, inclusive confirmada (desfaz a venda). */
router.post('/:id/cancelar', requireAuth, async (req, res) => {
  try {
    const reserva = await carregarReservaPermitida(req, res);
    if (!reserva) return;

    const statusPermitidos = req.user.role === 'master' ? ['ativa', 'confirmada'] : ['ativa'];
    if (!statusPermitidos.includes(reserva.status))
      return res.status(409).json({ error: 'Esta reserva não pode mais ser cancelada.' });

    await pool.query("UPDATE reservas SET status = 'cancelada' WHERE id = ?", [reserva.id]);
    await pool.query(
      "UPDATE stands SET status = 'disponivel' WHERE id = ? AND status IN ('reservado', 'vendido')",
      [reserva.stand_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/reservas/:id/cancelar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── Erros do multer viram mensagem legível ───────────────────── */
router.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'Arquivo muito grande. O limite é 15 MB por arquivo.' });
  if (err.code === 'LIMIT_FILE_COUNT')
    return res.status(413).json({ error: 'Máximo de 10 arquivos por envio.' });
  console.error('[reservas anexos]', err.message);
  res.status(400).json({ error: err.message || 'Falha no envio do arquivo' });
});

export default router;
