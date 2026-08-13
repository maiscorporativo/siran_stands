import express from 'express';
import pool from '../db.js';
import { requireAuth, requireMaster } from './auth.js';

const router = express.Router();

/* ── GET /api/categorias ─── lista com contagem de stands ─────── */
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*,
             COUNT(s.id) AS total_stands,
             SUM(s.status = 'disponivel') AS disponiveis
      FROM categorias c
      LEFT JOIN stands s ON s.categoria_id = c.id
      GROUP BY c.id
      ORDER BY c.ordem ASC, c.nome ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/categorias]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/categorias ─────────────────────────────────────── */
router.post('/', requireMaster, async (req, res) => {
  const { nome, preco, tamanho, descricao, beneficios, ordem } = req.body;
  if (!nome) return res.status(400).json({ error: 'O nome da cota é obrigatório' });

  try {
    const [r] = await pool.query(
      `INSERT INTO categorias (nome, preco, tamanho, descricao, beneficios, ordem)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, preco ? Number(preco) : null, tamanho || null,
       descricao || null, beneficios || null, Number(ordem) || 0]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Já existe uma cota com este nome' });
    console.error('[POST /api/categorias]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── PUT /api/categorias/:id ──────────────────────────────────── */
router.put('/:id', requireMaster, async (req, res) => {
  const { nome, preco, tamanho, descricao, beneficios, ordem } = req.body;
  if (!nome) return res.status(400).json({ error: 'O nome da cota é obrigatório' });

  try {
    const [r] = await pool.query(
      `UPDATE categorias SET nome = ?, preco = ?, tamanho = ?,
              descricao = ?, beneficios = ?, ordem = ? WHERE id = ?`,
      [nome, preco ? Number(preco) : null, tamanho || null,
       descricao || null, beneficios || null, Number(ordem) || 0, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Cota não encontrada' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Já existe uma cota com este nome' });
    console.error('[PUT /api/categorias]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── DELETE /api/categorias/:id ───────────────────────────────── */
router.delete('/:id', requireMaster, async (req, res) => {
  try {
    const [[uso]] = await pool.query(
      'SELECT COUNT(*) AS c FROM stands WHERE categoria_id = ?', [req.params.id]
    );
    if (uso.c > 0)
      return res.status(409).json({
        error: `Esta cota tem ${uso.c} stand(s) vinculado(s). Mova ou exclua os stands antes.`,
      });

    await pool.query('DELETE FROM categorias WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/categorias]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
