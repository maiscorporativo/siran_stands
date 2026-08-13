import express from 'express';
import crypto from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

/* ── Manutenção pelo navegador, sem terminal ──────────────────────
   Em hospedagens sem acesso SSH, é o único jeito de criar as tabelas
   e o primeiro administrador.

   A rota só existe quando SETUP_TOKEN está definido no ambiente.
   Depois de usar uma vez, REMOVA a variável e reinicie o app: a rota
   volta a responder 404 e deixa de ser superfície de ataque. */

function tokenValido(req) {
  const esperado = process.env.SETUP_TOKEN;
  if (!esperado) return false;

  const recebido = String(req.query.token ?? '');
  // Comparação de tempo constante evita descobrir o token por tentativa
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function exigirToken(req, res, next) {
  // Sem SETUP_TOKEN a rota simplesmente não existe
  if (!process.env.SETUP_TOKEN) return res.status(404).send('Not found');
  if (!tokenValido(req)) return res.status(403).json({ error: 'Token inválido.' });
  next();
}

/* ── GET /api/setup/status ─── diagnóstico do ambiente ─────────── */
router.get('/status', exigirToken, async (req, res) => {
  const resposta = {
    node: process.version,
    ambiente: process.env.NODE_ENV || 'development',
    banco: {
      host: process.env.DB_HOST || 'localhost',
      nome: process.env.DB_NAME || '(padrão)',
      conectado: false,
    },
    pastas: {
      uploads: process.env.UPLOADS_DIR || '(padrão: public/uploads)',
      anexos: process.env.ANEXOS_DIR || '(padrão: anexos_privados)',
    },
    canais: { email: Boolean(process.env.SMTP_HOST), whatsapp: Boolean(process.env.WHATSAPP_PROVIDER) },
    app_url: process.env.APP_URL || '(não definido)',
  };

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()`
    );
    resposta.banco.conectado = true;
    resposta.banco.tabelas = total;

    if (total > 0) {
      const [[u]] = await pool.query('SELECT COUNT(*) AS c FROM users');
      const [[s]] = await pool.query('SELECT COUNT(*) AS c FROM stands');
      resposta.banco.usuarios = u.c;
      resposta.banco.stands = s.c;
    }
  } catch (e) {
    resposta.banco.erro = e.message;
  }

  res.json(resposta);
});

/* ── GET /api/setup/instalar ─── cria tabelas e dados iniciais ────
   Roda o mesmo script do `npm run setup`, em processo separado para
   não derrubar a API se algo falhar. É idempotente: rodar de novo
   não duplica nem apaga o que já existe. */
router.get('/instalar', exigirToken, (req, res) => {
  const script = path.join(__dirname, '..', 'setup-full.js');
  const processo = spawn(process.execPath, [script], {
    cwd: path.join(__dirname, '..', '..'),
    env: process.env,
  });

  let saida = '';
  processo.stdout.on('data', d => { saida += d.toString(); });
  processo.stderr.on('data', d => { saida += d.toString(); });

  processo.on('close', codigo => {
    res.type('text/plain; charset=utf-8').status(codigo === 0 ? 200 : 500).send(
      (codigo === 0
        ? '✅ Instalação concluída.\n\n'
        : `❌ Falhou (código ${codigo}).\n\n`) +
      saida +
      '\n\n────────────────────────────────────────────\n' +
      'IMPORTANTE: remova agora a variável SETUP_TOKEN do painel\n' +
      'e reinicie o aplicativo, para desativar esta rota.\n'
    );
  });

  processo.on('error', e => {
    res.status(500).type('text/plain').send(`Erro ao executar o instalador: ${e.message}`);
  });
});

/* ── GET /api/setup/redefinir-admin ─── recupera o acesso ─────────
   Para quando a senha do administrador se perde. Usa ADMIN_USUARIO
   e ADMIN_SENHA do ambiente. */
router.get('/redefinir-admin', exigirToken, async (req, res) => {
  const usuario = process.env.ADMIN_USUARIO || 'admin';
  const senha = process.env.ADMIN_SENHA;
  if (!senha)
    return res.status(400).json({ error: 'Defina ADMIN_SENHA no painel antes de redefinir.' });

  try {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(senha, 10);

    const [[existente]] = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1', [usuario]
    );

    if (existente) {
      await pool.query(
        "UPDATE users SET password_hash = ?, role = 'master', ativo = 1 WHERE id = ?",
        [hash, existente.id]
      );
      await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [existente.id]);
    } else {
      await pool.query(
        "INSERT INTO users (username, password_hash, nome, role) VALUES (?, ?, 'Administrador', 'master')",
        [usuario, hash]
      );
    }

    res.type('text/plain; charset=utf-8').send(
      `✅ Administrador "${usuario}" ${existente ? 'teve a senha redefinida' : 'foi criado'}.\n\n` +
      'Entre no sistema e troque a senha.\n\n' +
      'IMPORTANTE: remova a variável SETUP_TOKEN do painel e reinicie\n' +
      'o aplicativo para desativar esta rota.\n'
    );
  } catch (err) {
    console.error('[setup/redefinir-admin]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
