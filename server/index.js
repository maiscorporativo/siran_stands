import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRouter from './routes/auth.js';
import standsRouter, { uploadsDir } from './routes/stands.js';
import categoriasRouter from './routes/categorias.js';
import reservasRouter from './routes/reservas.js';
import assinaturasRouter from './routes/assinaturas.js';
import pool from './db.js';
import { liberarReservasExpiradas } from './reservas-lib.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ─────────────────────────────────────────────── */
app.use(cors({ origin: true, credentials: true }));
// 10mb comporta o PNG da assinatura desenhada na tela
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* ── Uploads estáticos (imagens/plantas dos stands) ─────────── */
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(join(__dirname, '..', 'public')));

/* ── API Routes ─────────────────────────────────────────────── */
app.use('/api/auth', authRouter);
app.use('/api/stands', standsRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/reservas', reservasRouter);
app.use('/api/assinaturas', assinaturasRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ── Serve React em produção ────────────────────────────────── */
const distPath = join(__dirname, '..', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

/* ── Job de background: libera reservas vencidas ────────────────
   A expiração também é verificada a cada requisição de listagem;
   este job garante a liberação mesmo sem ninguém acessar. */
setInterval(async () => {
  try {
    const n = await liberarReservasExpiradas();
    if (n > 0) console.log(`⏰ ${n} reserva(s) expirada(s) liberada(s)`);
  } catch (e) {
    console.warn('⚠️ Job de expiração falhou:', e.message);
  }
}, 60 * 1000);

/* ── Start ──────────────────────────────────────────────────── */
app.listen(PORT, async () => {
  try {
    await pool.query('DELETE FROM user_sessions WHERE expires_at < NOW()');
  } catch (e) {
    console.warn('⚠️ Limpeza de sessões falhou (banco criado? rode npm run setup):', e.message);
  }
  console.log(`\n🚀 Siran Stands API rodando em http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Banco:    ${process.env.DB_NAME || 'siran_stands'} @ ${process.env.DB_HOST || 'localhost'}\n`);
});
