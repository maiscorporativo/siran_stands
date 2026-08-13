import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { requireAuth, requireMaster } from './auth.js';
import { liberarReservasExpiradas } from '../reservas-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── Diretório de uploads (persistente em produção) ───────────── */
export const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `stand-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|webp|gif|svg|pdf)$/i.test(file.originalname);
    cb(ok ? null : new Error('Formato inválido. Use JPG, PNG, WEBP, GIF, SVG ou PDF.'), ok);
  },
});

const router = express.Router();

/* ── GET /api/stands ─── lista com dados da reserva vigente ───────
   Os dados do cliente só acompanham a resposta quando quem consulta
   é o dono da reserva ou um master — um vendedor não enxerga a
   carteira do outro. */
router.get('/', requireAuth, async (req, res) => {
  try {
    await liberarReservasExpiradas();
    // preco/tamanho do stand sobrescrevem o padrão da cota quando preenchidos
    const [rows] = await pool.query(`
      SELECT s.id, s.codigo, s.nome, s.categoria_id, s.descricao, s.imagem_url,
             s.status, s.ordem,
             s.preco   AS preco_proprio,
             s.tamanho AS tamanho_proprio,
             COALESCE(s.preco, c.preco)     AS preco,
             COALESCE(s.tamanho, c.tamanho) AS tamanho,
             c.nome       AS categoria,
             c.descricao  AS categoria_descricao,
             c.beneficios AS categoria_beneficios,
             r.id              AS reserva_id,
             r.status          AS reserva_status,
             r.vendedor_id     AS reserva_vendedor_id,
             u.nome            AS reserva_vendedor_nome,
             r.expira_em       AS reserva_expira_em,
             r.cliente_nome    AS reserva_cliente_nome,
             r.cliente_empresa AS reserva_cliente_empresa
      FROM stands s
      LEFT JOIN categorias c ON c.id = s.categoria_id
      LEFT JOIN reservas r
        ON r.stand_id = s.id AND r.status IN ('ativa', 'confirmada')
      LEFT JOIN users u ON u.id = r.vendedor_id
      ORDER BY s.ordem ASC, s.codigo ASC
    `);

    const isMaster = req.user.role === 'master';
    for (const s of rows) {
      const dono = String(s.reserva_vendedor_id) === String(req.user.user_id);
      if (!isMaster && !dono) {
        s.reserva_cliente_nome = null;
        s.reserva_cliente_empresa = null;
      }
    }
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/stands]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/stands ─── criar (master) ──────────────────────── */
router.post('/', requireMaster, upload.single('imagem'), async (req, res) => {
  const { codigo, nome, descricao, categoria_id, tamanho, preco, ordem } = req.body;
  if (!codigo || !nome)
    return res.status(400).json({ error: 'Código e nome são obrigatórios' });

  try {
    const imagemUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const [result] = await pool.query(
      `INSERT INTO stands (codigo, nome, descricao, categoria_id, tamanho, preco, imagem_url, ordem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo, nome, descricao || null, categoria_id ? Number(categoria_id) : null,
       tamanho || null, preco ? Number(preco) : null, imagemUrl, ordem ? Number(ordem) : 0]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Já existe um stand com este código' });
    console.error('[POST /api/stands]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── PUT /api/stands/:id ─── editar (master) ──────────────────── */
router.put('/:id', requireMaster, upload.single('imagem'), async (req, res) => {
  const { id } = req.params;
  const { codigo, nome, descricao, categoria_id, tamanho, preco, ordem, remover_imagem } = req.body;
  if (!codigo || !nome)
    return res.status(400).json({ error: 'Código e nome são obrigatórios' });

  try {
    const [[atual]] = await pool.query('SELECT imagem_url FROM stands WHERE id = ?', [id]);
    if (!atual) return res.status(404).json({ error: 'Stand não encontrado' });

    let imagemUrl = atual.imagem_url;
    if (req.file) imagemUrl = `/uploads/${req.file.filename}`;
    else if (remover_imagem === '1') imagemUrl = null;

    // Remove o arquivo antigo do disco quando substituído/removido
    if (atual.imagem_url && atual.imagem_url !== imagemUrl) {
      const antigo = path.join(uploadsDir, path.basename(atual.imagem_url));
      fs.promises.unlink(antigo).catch(() => {});
    }

    await pool.query(
      `UPDATE stands SET codigo = ?, nome = ?, descricao = ?, categoria_id = ?,
              tamanho = ?, preco = ?, imagem_url = ?, ordem = ? WHERE id = ?`,
      [codigo, nome, descricao || null, categoria_id ? Number(categoria_id) : null,
       tamanho || null, preco ? Number(preco) : null, imagemUrl, ordem ? Number(ordem) : 0, id]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Já existe um stand com este código' });
    console.error('[PUT /api/stands]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── PUT /api/stands/:id/status ─── bloquear/liberar (master) ───
   Permite marcar um stand como 'indisponivel' (ex: já vendido fora
   do sistema) ou devolvê-lo para 'disponivel'. */
router.put('/:id/status', requireMaster, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['disponivel', 'indisponivel'].includes(status))
    return res.status(400).json({ error: "Status deve ser 'disponivel' ou 'indisponivel'" });

  try {
    const [result] = await pool.query(
      "UPDATE stands SET status = ? WHERE id = ? AND status IN ('disponivel', 'indisponivel')",
      [status, id]
    );
    if (result.affectedRows === 0)
      return res.status(409).json({ error: 'Stand possui reserva vigente. Cancele a reserva primeiro.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/stands/:id/status]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── DELETE /api/stands/:id ─── excluir (master) ──────────────── */
router.delete('/:id', requireMaster, async (req, res) => {
  const { id } = req.params;
  try {
    const [[stand]] = await pool.query('SELECT status, imagem_url FROM stands WHERE id = ?', [id]);
    if (!stand) return res.status(404).json({ error: 'Stand não encontrado' });
    if (['reservado', 'vendido'].includes(stand.status))
      return res.status(409).json({ error: 'Stand possui reserva vigente. Cancele a reserva antes de excluir.' });

    if (stand.imagem_url) {
      const arquivo = path.join(uploadsDir, path.basename(stand.imagem_url));
      fs.promises.unlink(arquivo).catch(() => {});
    }
    await pool.query('DELETE FROM reservas WHERE stand_id = ?', [id]);
    await pool.query('DELETE FROM stands WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/stands]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── Erros do multer viram mensagem legível ao invés de 500 ───── */
router.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'Arquivo muito grande. O limite é 10 MB.' });
  console.error('[stands upload]', err.message);
  res.status(400).json({ error: err.message || 'Falha no envio do arquivo' });
});

export default router;
