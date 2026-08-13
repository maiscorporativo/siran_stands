import pool from './db.js';

/* ── Libera reservas cujo prazo de confirmação venceu ─────────────
   Chamada antes de qualquer listagem/reserva e também pelo job de
   background em server/index.js. Marca a reserva como 'expirada' e
   devolve o stand para 'disponivel'. */
export async function liberarReservasExpiradas() {
  const [expiradas] = await pool.query(
    "SELECT id, stand_id FROM reservas WHERE status = 'ativa' AND expira_em < NOW()"
  );
  if (!expiradas.length) return 0;

  const ids = expiradas.map(r => r.id);
  const standIds = expiradas.map(r => r.stand_id);

  await pool.query("UPDATE reservas SET status = 'expirada' WHERE id IN (?)", [ids]);
  await pool.query(
    "UPDATE stands SET status = 'disponivel' WHERE id IN (?) AND status = 'reservado'",
    [standIds]
  );
  return expiradas.length;
}

/* ── Tempo de reserva (horas) configurado no painel ───────────── */
export async function getReservaHoras() {
  const [rows] = await pool.query("SELECT valor FROM config WHERE chave = 'reserva_horas' LIMIT 1");
  const horas = Number(rows[0]?.valor);
  return Number.isFinite(horas) && horas > 0 ? horas : 48;
}
