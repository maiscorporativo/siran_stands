import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db.js';

const router = express.Router();

/* ── Gera token de sessão e insere no banco ───────────────────── */
async function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  await pool.query(
    'INSERT INTO user_sessions (token, user_id, username, role, expires_at) VALUES (?, ?, ?, ?, ?)',
    [token, user.id, user.username, user.role, expiresAt]
  );
  return token;
}

/* ── Middleware: qualquer sessão válida ───────────────────────── */
export async function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM user_sessions WHERE token = ? AND expires_at > NOW() LIMIT 1',
      [token]
    );
    if (!rows.length) return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    req.user = rows[0];
    next();
  } catch (err) {
    console.error('[requireAuth]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
}

/* ── Middleware: sessão válida de role master ─────────────────── */
export async function requireMaster(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas administradores' });
    next();
  });
}

/* ── POST /api/auth/login ─────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND ativo = 1 LIMIT 1',
      [username]
    );
    if (!rows.length) return res.status(401).json({ error: 'Usuário ou senha inválidos' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Usuário ou senha inválidos' });

    const token = await createSession(user);
    res.json({ ok: true, token, id: user.id, username: user.username, nome: user.nome, role: user.role });
  } catch (err) {
    console.error('[POST /api/auth/login]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/auth/logout ────────────────────────────────────── */
router.post('/logout', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    try { await pool.query('DELETE FROM user_sessions WHERE token = ?', [token]); }
    catch { /* silencioso */ }
  }
  res.json({ ok: true });
});

/* ── GET /api/auth/me ─── valida sessão atual ─────────────────── */
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.user_id, username: req.user.username, role: req.user.role });
});

/* ── GET /api/auth/users ─── listar vendedores/admins ─────────── */
router.get('/users', requireMaster, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, nome, email, telefone, role, ativo, created_at
       FROM users ORDER BY role DESC, nome ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/auth/users]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── POST /api/auth/users ─── criar vendedor/admin ────────────── */
router.post('/users', requireMaster, async (req, res) => {
  const { username, password, nome, email, telefone, role } = req.body;
  if (!username || !password || !nome || !role)
    return res.status(400).json({ error: 'Nome, usuário, senha e perfil são obrigatórios' });
  if (!['master', 'vendedor'].includes(role))
    return res.status(400).json({ error: 'Perfil inválido' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, nome, email, telefone, role) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hash, nome, email || null, telefone || null, role]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Este usuário já existe' });
    console.error('[POST /api/auth/users]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── PUT /api/auth/users/:id ─── editar ───────────────────────── */
router.put('/users/:id', requireMaster, async (req, res) => {
  const { id } = req.params;
  const { username, password, nome, email, telefone, role, ativo } = req.body;
  if (!username || !nome || !role)
    return res.status(400).json({ error: 'Nome, usuário e perfil são obrigatórios' });

  // Omitir `ativo` mantém o usuário ativo — nunca desativa por descuido
  const ativoVal = ativo === undefined || ativo ? 1 : 0;

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE users SET username = ?, password_hash = ?, nome = ?, email = ?,
                telefone = ?, role = ?, ativo = ? WHERE id = ?`,
        [username, hash, nome, email || null, telefone || null, role, ativoVal, id]
      );
    } else {
      await pool.query(
        `UPDATE users SET username = ?, nome = ?, email = ?,
                telefone = ?, role = ?, ativo = ? WHERE id = ?`,
        [username, nome, email || null, telefone || null, role, ativoVal, id]
      );
    }
    // Troca de senha ou desativação encerram as sessões abertas
    if (!ativoVal || password) await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Este usuário já existe' });
    console.error('[PUT /api/auth/users]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ── DELETE /api/auth/users/:id ───────────────────────────────── */
router.delete('/users/:id', requireMaster, async (req, res) => {
  const { id } = req.params;
  try {
    const [masters] = await pool.query("SELECT id FROM users WHERE role = 'master' AND ativo = 1");
    const targetIsMaster = masters.some(m => String(m.id) === String(id));
    if (targetIsMaster && masters.length <= 1)
      return res.status(400).json({ error: 'Não é possível excluir o único administrador.' });
    if (String(req.user.user_id) === String(id))
      return res.status(400).json({ error: 'Você não pode excluir a si mesmo.' });

    const [[temReserva]] = await pool.query(
      "SELECT COUNT(*) AS c FROM reservas WHERE vendedor_id = ? AND status IN ('ativa','confirmada')",
      [id]
    );
    if (temReserva.c > 0)
      return res.status(400).json({ error: 'Este vendedor possui reservas ativas ou confirmadas. Desative-o em vez de excluir.' });

    await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [id]);
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/auth/users]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
