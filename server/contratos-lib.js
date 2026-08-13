/* ── Ciclo de vida do contrato/proposta ───────────────────────────
   Monta os dados a partir da proposta, gera o PDF e guarda no disco
   junto dos anexos (área privada, servida só por rota autenticada). */
import fs from 'fs';
import path from 'path';
import pool from './db.js';
import { gerarContratoPDF, nomeArquivoContrato } from './contrato-pdf.js';
import { anexosDir } from './anexos-dir.js';

export const contratosDir = path.join(anexosDir, 'contratos');
fs.mkdirSync(contratosDir, { recursive: true });

/* Junta proposta + stand + cota + vendedor no formato que o gerador
   de PDF espera. O valor do contrato é o negociado quando houver,
   senão o preço efetivo do stand (próprio ou herdado da cota). */
export async function dadosDoContrato(reservaId) {
  const [[d]] = await pool.query(
    `SELECT r.*, s.codigo AS stand_codigo, s.nome AS stand_nome,
            COALESCE(s.preco, c.preco) AS preco_stand,
            c.nome AS cota,
            u.nome AS vendedor_nome, u.email AS vendedor_email, u.telefone AS vendedor_telefone
     FROM reservas r
     JOIN stands s ON s.id = r.stand_id
     LEFT JOIN categorias c ON c.id = s.categoria_id
     JOIN users u ON u.id = r.vendedor_id
     WHERE r.id = ?`,
    [reservaId]
  );
  if (!d) return null;

  return {
    ...d,
    proposta_id: d.id,
    valor: d.valor_negociado ?? d.preco_stand,
  };
}

/* Gera (ou regenera) o PDF da proposta/contrato e registra o arquivo
   na reserva. Devolve { caminho, nome, buffer } ou null se falhar. */
export async function gerarEGuardarContrato(reservaId, { assinado = false } = {}) {
  const dados = await dadosDoContrato(reservaId);
  if (!dados) return null;

  const buffer = await gerarContratoPDF(dados, { assinado });
  const nome = nomeArquivoContrato(dados, { assinado });
  const arquivo = `contrato-${reservaId}-${assinado ? 'assinado' : 'proposta'}.pdf`;
  const caminho = path.join(contratosDir, arquivo);

  await fs.promises.writeFile(caminho, buffer);
  await pool.query(
    'UPDATE reservas SET contrato_arquivo = ?, contrato_gerado_em = NOW() WHERE id = ?',
    [arquivo, reservaId]
  );

  return { caminho, arquivo, nome, buffer, dados };
}

/** Caminho do PDF já gerado, ou null quando ainda não existe. */
export function caminhoContrato(arquivo) {
  if (!arquivo) return null;
  const p = path.join(contratosDir, path.basename(arquivo));
  return fs.existsSync(p) ? p : null;
}

/* Gera o documento e só então dispara os avisos — a ordem importa,
   porque o PDF vai anexado. Roda fora do ciclo da resposta HTTP: se
   algo aqui falhar, a proposta já está salva e o stand, garantido. */
export function processarEmBackground(reservaId, evento) {
  setImmediate(async () => {
    try {
      /* Quando o evento é a assinatura, o PDF já foi produzido pelo
         fluxo de assinatura — com o traço e a trilha de auditoria.
         Regerar aqui apagaria justamente isso. */
      if (evento !== 'assinada') {
        await gerarEGuardarContrato(reservaId, { assinado: evento === 'confirmada' });
      }
    } catch (e) {
      console.warn(`[contrato] falha ao gerar PDF da proposta ${reservaId}:`, e.message);
    }
    try {
      const { notificarReserva } = await import('./notificacoes.js');
      await notificarReserva(reservaId, evento);
    } catch (e) {
      console.warn(`[contrato] falha ao notificar proposta ${reservaId}:`, e.message);
    }
  });
}
