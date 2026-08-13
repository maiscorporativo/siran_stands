/* ── Assinatura eletrônica do contrato ────────────────────────────
   Modelo adotado: assinatura eletrônica com trilha de evidências,
   na forma do art. 10, §2º da MP 2.200-2/2001 (válida quando aceita
   pelas partes). Não usa certificado ICP-Brasil — a força probatória
   vem do conjunto: identificação do signatário, confirmação por
   código de uso único (no fluxo remoto), IP, dispositivo, data/hora
   e hash do documento exibido no momento da assinatura. */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pool from './db.js';
import { gerarContratoPDF, nomeArquivoContrato } from './contrato-pdf.js';
import { dadosDoContrato, contratosDir } from './contratos-lib.js';

/** SHA-256 em hexadecimal — identifica o conteúdo exato do arquivo. */
export function hashDocumento(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function gerarToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** Código de 6 dígitos para confirmar posse do telefone/e-mail. */
export function gerarCodigo() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Primeiro IP real da requisição, respeitando o proxy da hospedagem. */
export function ipDaRequisicao(req) {
  const encaminhado = req.headers['x-forwarded-for'];
  if (encaminhado) return String(encaminhado).split(',')[0].trim();
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

/* ── Assinaturas já coletadas para uma proposta ────────────────── */
export async function assinaturasDaReserva(reservaId) {
  const [rows] = await pool.query(
    `SELECT a.*, u.nome AS testemunha_nome
     FROM assinaturas a
     LEFT JOIN users u ON u.id = a.testemunha_id
     WHERE a.reserva_id = ? ORDER BY a.assinado_em ASC`,
    [reservaId]
  );
  return rows;
}

/* ── Documento que o signatário está prestes a assinar ─────────────
   Gera o PDF no estado atual e devolve junto o hash, que é gravado
   com a assinatura: é a prova de qual versão a pessoa viu. */
export async function documentoParaAssinar(reservaId) {
  const dados = await dadosDoContrato(reservaId);
  if (!dados) return null;

  const assinaturas = await assinaturasDaReserva(reservaId);
  const buffer = await gerarContratoPDF(dados, { assinado: false, assinaturas });
  return { dados, buffer, hash: hashDocumento(buffer), assinaturas };
}

/* ── Registra a assinatura e produz o contrato assinado ───────────
   Depois de gravar a firma, o PDF é refeito com o traço no lugar da
   linha e com a página de trilha de auditoria. O hash do arquivo
   final fica guardado na proposta para a verificação pública. */
export async function registrarAssinatura(reservaId, dadosAssinatura) {
  const {
    parte = 'patrocinador', nome, cpf, cargo, email, telefone,
    traco, modo = 'presencial', hash_documento,
    ip, user_agent, geolocalizacao,
    codigo_validado = 0, validado_por = null, testemunha_id = null,
  } = dadosAssinatura;

  if (!nome || !traco) throw new Error('Nome e assinatura são obrigatórios');

  await pool.query(
    `INSERT INTO assinaturas
       (reserva_id, parte, nome, cpf, cargo, email, telefone, traco, modo,
        hash_documento, ip, user_agent, geolocalizacao,
        codigo_validado, validado_por, testemunha_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [reservaId, parte, nome, cpf || null, cargo || null, email || null, telefone || null,
     traco, modo, hash_documento || '', ip || null,
     (user_agent || '').slice(0, 500) || null, geolocalizacao || null,
     codigo_validado ? 1 : 0, validado_por, testemunha_id]
  );

  return gerarContratoAssinado(reservaId);
}

/* Refaz o PDF já com as firmas e a auditoria, grava no disco e
   atualiza a proposta. Devolve { arquivo, nome, buffer, hash }. */
export async function gerarContratoAssinado(reservaId) {
  const dados = await dadosDoContrato(reservaId);
  if (!dados) return null;

  const assinaturas = await assinaturasDaReserva(reservaId);

  /* O hash precisa estar impresso no próprio PDF, mas só existe
     depois que o arquivo é gerado. Resolvemos em duas passadas:
     a primeira produz o conteúdo, a segunda o reimprime já com o
     hash daquele conteúdo estampado na trilha de auditoria. */
  const previa = await gerarContratoPDF(dados, { assinado: true, assinaturas });
  const hash = hashDocumento(previa);

  const buffer = await gerarContratoPDF(
    { ...dados, hash_contrato: hash, url_verificacao: urlVerificacao() },
    { assinado: true, assinaturas }
  );

  const arquivo = `contrato-${reservaId}-assinado.pdf`;
  await fs.promises.writeFile(path.join(contratosDir, arquivo), buffer);

  await pool.query(
    `UPDATE reservas
     SET contrato_assinado = ?, hash_contrato = ?, assinado_em = COALESCE(assinado_em, NOW()),
         contrato_arquivo = ?, contrato_gerado_em = NOW()
     WHERE id = ?`,
    [arquivo, hash, arquivo, reservaId]
  );

  return { arquivo, nome: nomeArquivoContrato(dados, { assinado: true }), buffer, hash };
}

function urlVerificacao() {
  const base = (process.env.APP_URL || '').replace(/\/+$/, '');
  return base ? `${base}/verificar` : 'verificar no sistema Siran Stands';
}

/* ── Tokens do fluxo remoto ──────────────────────────────────────
   Link de uso único, com validade curta e código enviado à parte. */
export async function criarToken(reservaId, { horas = 72, codigo = null, envio = null } = {}) {
  const token = gerarToken();
  await pool.query(
    `INSERT INTO assinatura_tokens (token, reserva_id, codigo, codigo_envio, expira_em)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [token, reservaId, codigo, envio, horas]
  );
  return token;
}

export async function lerToken(token) {
  const [[t]] = await pool.query(
    'SELECT * FROM assinatura_tokens WHERE token = ? LIMIT 1', [token]
  );
  if (!t) return { erro: 'Link inválido.' };
  if (t.usado_em) return { erro: 'Este link já foi utilizado.' };
  if (new Date(t.expira_em) < new Date()) return { erro: 'Este link expirou. Peça um novo ao vendedor.' };
  return { token: t };
}

export async function marcarTokenUsado(token) {
  await pool.query('UPDATE assinatura_tokens SET usado_em = NOW() WHERE token = ?', [token]);
}

/** Bloqueia após 5 tentativas para não permitir adivinhar o código. */
export async function conferirCodigo(token, codigo) {
  const [[t]] = await pool.query('SELECT * FROM assinatura_tokens WHERE token = ? LIMIT 1', [token]);
  if (!t) return { ok: false, erro: 'Link inválido.' };
  if (t.tentativas >= 5) return { ok: false, erro: 'Muitas tentativas. Peça um novo link ao vendedor.' };

  if (String(t.codigo) !== String(codigo).trim()) {
    await pool.query('UPDATE assinatura_tokens SET tentativas = tentativas + 1 WHERE token = ?', [token]);
    return { ok: false, erro: 'Código incorreto.' };
  }
  return { ok: true, envio: t.codigo_envio };
}
