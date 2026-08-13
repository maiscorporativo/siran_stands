/* ── Setup completo do banco ──────────────────────────────────────
   Cria o database (se não existir), todas as tabelas e os dados
   iniciais: usuário master, as cotas do Siran Summit e os stands.

   Uso:  npm run setup
   Idempotente: pode rodar mais de uma vez sem duplicar dados. */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const DB_NAME = process.env.DB_NAME || 'siran_stands';

/* Credenciais do primeiro administrador. Só são usadas quando não há
   nenhum usuário no banco — depois disso, tudo pelo painel. */
const ADMIN_USUARIO = process.env.ADMIN_USUARIO || 'admin';
const ADMIN_SENHA = process.env.ADMIN_SENHA || '123';

/* ── Cotas oficiais do evento ─────────────────────────────────────
   Preço e tamanho aqui são o padrão da cota; um stand específico
   pode sobrescrevê-los (ex: posição privilegiada com valor maior). */
const COTAS = [
  {
    nome: 'Raiz',
    preco: 5000,
    tamanho: '4m² (sem área de exposição)',
    descricao: 'Exclusivo para startup e expositor de animais.',
    beneficios: `Acesso a dados
1 post collab
Sampling no evento

MÍDIA E COMUNICAÇÃO
Presença da marca na comunicação visual na área da cota
1 post de design divulgando a participação
5 inserções de 10' na Rádio Summit Siran

ENTREGA DE MARCA
Direito de utilização da marca Siran Summit em material de divulgação ou brinde
Direito de captar e produzir conteúdos editoriais durante o evento
1 collab com citação do evento, mediante aprovação
Sampling no evento`,
  },
  {
    nome: 'Semeadura',
    preco: 10000,
    tamanho: '18m² (9m² stand / 9m² exposição)',
    descricao: 'Inclui 1 credencial de almoço, acesso a dados e divulgação de produtos/serviços.',
    beneficios: `1 credencial de almoço
Acesso a dados
5 collabs e sampling
Divulgação de produtos/serviços

ENTREGA COMERCIAL
Oferecer uma ou mais condições comerciais para o período do Siran Summit, 10 e 11 de novembro de 2026
Divulgação de oportunidade de produtos ou serviços

MÍDIA E COMUNICAÇÃO
Presença da marca na comunicação visual na área da cota
1 post de design divulgando a participação
1 vídeo do patrocinador em collab nas mídias sociais
10 inserções de 15' na Rádio Summit Siran

ENTREGA DE MARCA
Direito de utilização da marca Siran Summit em material de divulgação ou brinde
Direito de captar e produzir conteúdos editoriais durante o evento
5 collabs com citação do evento, mediante aprovação
Sampling no evento`,
  },
  {
    // PENDENTE: preço, tamanho e benefícios ainda não foram informados.
    // Preencha pelo painel admin (aba Cotas) assim que a diretoria passar.
    nome: 'Colheita',
    preco: null,
    tamanho: null,
    descricao: 'Dados desta cota ainda não informados — preencher no painel.',
    beneficios: null,
  },
  {
    nome: 'Parceiro',
    preco: 30000,
    tamanho: '72m² (36m² stand / 36m² exposição)',
    descricao: 'Cota máxima, com naming rights de painel macro e destaque na comunicação visual.',
    beneficios: `Naming rights de painel macro
4 credenciais de almoço
Destaque na comunicação visual
15 collabs
30 inserções na Rádio Summit Siran`,
  },
];

/* ── Stands por cota ──────────────────────────────────────────────
   QUANTIDADES PROVISÓRIAS — ajuste conforme o mapa definitivo do
   evento. Dá para incluir/remover stands pelo painel admin depois. */
const STANDS_POR_COTA = {
  'Raiz':      { prefixo: 'R', quantidade: 8 },
  'Semeadura': { prefixo: 'S', quantidade: 8 },
  'Colheita':  { prefixo: 'C', quantidade: 6 },
  'Parceiro':  { prefixo: 'P', quantidade: 4 },
};

async function colunaExiste(conn, tabela, coluna) {
  const [r] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return r[0].c > 0;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log(`\n📦 Criando database "${DB_NAME}" (se não existir)...`);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.changeUser({ database: DB_NAME });

  console.log('📋 Criando tabelas...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      nome          VARCHAR(255) NOT NULL,
      email         VARCHAR(255),
      telefone      VARCHAR(30),
      role          ENUM('master','vendedor') NOT NULL DEFAULT 'vendedor',
      ativo         TINYINT(1) NOT NULL DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS user_sessions (
      token      VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id    INT NOT NULL,
      username   VARCHAR(100) NOT NULL,
      role       ENUM('master','vendedor') NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX idx_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS categorias (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nome       VARCHAR(100) NOT NULL UNIQUE,
      preco      DECIMAL(12,2),
      tamanho    VARCHAR(100),
      descricao  TEXT,
      beneficios TEXT,
      ordem      INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS stands (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      codigo       VARCHAR(20) NOT NULL UNIQUE,
      nome         VARCHAR(255) NOT NULL,
      categoria_id INT,
      descricao    TEXT,
      tamanho      VARCHAR(100),
      preco        DECIMAL(12,2),
      imagem_url   VARCHAR(500),
      status       ENUM('disponivel','reservado','vendido','indisponivel') NOT NULL DEFAULT 'disponivel',
      ordem        INT NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_categoria (categoria_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS reservas (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      stand_id        INT NOT NULL,
      vendedor_id     INT NOT NULL,
      cliente_nome    VARCHAR(255) NOT NULL,
      cliente_empresa VARCHAR(255),
      cliente_contato VARCHAR(255),
      cliente_email   VARCHAR(255),
      observacoes     TEXT,
      -- Dados que alimentam o contrato de patrocínio
      razao_social         VARCHAR(255),
      cnpj                 VARCHAR(20),
      endereco             VARCHAR(255),
      cep                  VARCHAR(12),
      cidade               VARCHAR(120),
      estado               VARCHAR(2),
      representante_nome   VARCHAR(255),
      representante_cpf    VARCHAR(16),
      representante_cargo  VARCHAR(120),
      forma_pagamento      TEXT,
      valor_negociado      DECIMAL(12,2),
      contrato_arquivo     VARCHAR(255),
      contrato_gerado_em   DATETIME NULL,
      -- Assinatura eletrônica
      assinado_em          DATETIME NULL,
      contrato_assinado    VARCHAR(255),
      hash_contrato        CHAR(64),
      status          ENUM('ativa','confirmada','expirada','cancelada') NOT NULL DEFAULT 'ativa',
      criada_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
      expira_em       DATETIME NOT NULL,
      confirmada_em   DATETIME NULL,
      INDEX idx_stand (stand_id),
      INDEX idx_vendedor (vendedor_id),
      INDEX idx_status_expira (status, expira_em),
      FOREIGN KEY (stand_id) REFERENCES stands(id),
      FOREIGN KEY (vendedor_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS reserva_anexos (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      reserva_id    INT NOT NULL,
      arquivo       VARCHAR(255) NOT NULL,
      nome_original VARCHAR(255) NOT NULL,
      mime          VARCHAR(120),
      tamanho       INT,
      enviado_por   INT,
      enviado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reserva (reserva_id),
      FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS assinaturas (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      reserva_id     INT NOT NULL,
      parte          ENUM('patrocinador','organizadora') NOT NULL DEFAULT 'patrocinador',
      -- Quem assinou, como declarado no ato
      nome           VARCHAR(255) NOT NULL,
      cpf            VARCHAR(16),
      cargo          VARCHAR(120),
      email          VARCHAR(255),
      telefone       VARCHAR(30),
      -- O traço, em PNG (data URL do canvas)
      traco          LONGTEXT NOT NULL,
      -- Evidências que sustentam a assinatura
      modo           ENUM('presencial','remoto') NOT NULL DEFAULT 'presencial',
      hash_documento CHAR(64) NOT NULL,
      ip             VARCHAR(45),
      user_agent     VARCHAR(500),
      geolocalizacao VARCHAR(100),
      codigo_validado TINYINT(1) NOT NULL DEFAULT 0,
      validado_por   VARCHAR(30),
      -- Vendedor que conduziu, quando presencial
      testemunha_id  INT,
      assinado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reserva (reserva_id),
      FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS assinatura_tokens (
      token        CHAR(48) NOT NULL PRIMARY KEY,
      reserva_id   INT NOT NULL,
      codigo       VARCHAR(8),
      codigo_envio VARCHAR(120),
      tentativas   INT NOT NULL DEFAULT 0,
      usado_em     DATETIME NULL,
      criado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,
      expira_em    DATETIME NOT NULL,
      INDEX idx_reserva (reserva_id),
      INDEX idx_expira (expira_em),
      FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS notificacoes_log (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      reserva_id INT,
      canal      ENUM('email','whatsapp') NOT NULL,
      destino    VARCHAR(255) NOT NULL,
      status     ENUM('enviado','falha') NOT NULL,
      erro       VARCHAR(500),
      enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reserva (reserva_id),
      INDEX idx_data (enviado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS config (
      chave VARCHAR(50) NOT NULL PRIMARY KEY,
      valor VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  /* ── Upgrade de bancos criados na versão anterior ────────────── */
  if (!(await colunaExiste(conn, 'stands', 'categoria_id'))) {
    console.log('🔄 Migrando schema antigo: adicionando stands.categoria_id...');
    await conn.query('ALTER TABLE stands ADD COLUMN categoria_id INT, ADD INDEX idx_categoria (categoria_id)');
  }
  if (!(await colunaExiste(conn, 'users', 'email'))) {
    console.log('🔄 Migrando schema antigo: adicionando contato dos vendedores...');
    await conn.query('ALTER TABLE users ADD COLUMN email VARCHAR(255), ADD COLUMN telefone VARCHAR(30)');
  }
  if (!(await colunaExiste(conn, 'reservas', 'assinado_em'))) {
    console.log('🔄 Migrando schema antigo: adicionando controle de assinatura...');
    await conn.query(`
      ALTER TABLE reservas
        ADD COLUMN assinado_em        DATETIME NULL,
        ADD COLUMN contrato_assinado  VARCHAR(255),
        ADD COLUMN hash_contrato      CHAR(64)
    `);
  }
  if (!(await colunaExiste(conn, 'reservas', 'razao_social'))) {
    console.log('🔄 Migrando schema antigo: adicionando campos do contrato às propostas...');
    await conn.query(`
      ALTER TABLE reservas
        ADD COLUMN cliente_email        VARCHAR(255),
        ADD COLUMN razao_social         VARCHAR(255),
        ADD COLUMN cnpj                 VARCHAR(20),
        ADD COLUMN endereco             VARCHAR(255),
        ADD COLUMN cep                  VARCHAR(12),
        ADD COLUMN cidade               VARCHAR(120),
        ADD COLUMN estado               VARCHAR(2),
        ADD COLUMN representante_nome   VARCHAR(255),
        ADD COLUMN representante_cpf    VARCHAR(16),
        ADD COLUMN representante_cargo  VARCHAR(120),
        ADD COLUMN forma_pagamento      TEXT,
        ADD COLUMN valor_negociado      DECIMAL(12,2),
        ADD COLUMN contrato_arquivo     VARCHAR(255),
        ADD COLUMN contrato_gerado_em   DATETIME NULL
    `);
  }

  /* ── Config: prazo de reserva ─────────────────────────────── */
  const horas = Number(process.env.RESERVA_HORAS_PADRAO) || 48;
  await conn.query(
    "INSERT IGNORE INTO config (chave, valor) VALUES ('reserva_horas', ?)", [String(horas)]
  );

  /* ── Usuário master inicial ───────────────────────────────── */
  const [users] = await conn.query('SELECT COUNT(*) AS c FROM users');
  if (users[0].c === 0) {
    const hash = await bcrypt.hash(ADMIN_SENHA, 10);
    await conn.query(
      "INSERT INTO users (username, password_hash, nome, role) VALUES (?, ?, 'Administrador', 'master')",
      [ADMIN_USUARIO, hash]
    );
    console.log(`👤 Administrador criado — login: ${ADMIN_USUARIO} / senha: ${ADMIN_SENHA}`);
    console.log('    ⚠️  Troque esta senha antes de publicar o sistema na internet.');
  } else {
    console.log('👤 Usuários já existem — seed de usuário ignorado.');
  }

  /* ── Cotas ────────────────────────────────────────────────────
     O COALESCE no UPDATE garante que rodar o setup de novo nunca
     apague dados preenchidos pelo painel: campos nulos aqui (como
     os da Colheita, ainda pendentes) preservam o que já está lá. */
  for (const [i, c] of COTAS.entries()) {
    await conn.query(
      `INSERT INTO categorias (nome, preco, tamanho, descricao, beneficios, ordem)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         preco      = COALESCE(VALUES(preco),      preco),
         tamanho    = COALESCE(VALUES(tamanho),    tamanho),
         descricao  = COALESCE(VALUES(descricao),  descricao),
         beneficios = COALESCE(VALUES(beneficios), beneficios),
         ordem      = VALUES(ordem)`,
      [c.nome, c.preco ?? null, c.tamanho ?? null, c.descricao ?? null, c.beneficios ?? null, i + 1]
    );
  }
  console.log(`🏷️  ${COTAS.length} cotas cadastradas/atualizadas: ${COTAS.map(c => c.nome).join(', ')}`);

  /* ── Stands ───────────────────────────────────────────────── */
  const [stands] = await conn.query('SELECT COUNT(*) AS c FROM stands');
  if (stands[0].c === 0) {
    const [cats] = await conn.query('SELECT id, nome FROM categorias');
    const idPorNome = Object.fromEntries(cats.map(c => [c.nome, c.id]));

    let ordem = 0, total = 0;
    for (const cota of COTAS) {
      const { prefixo, quantidade } = STANDS_POR_COTA[cota.nome];
      for (let i = 1; i <= quantidade; i++) {
        await conn.query(
          'INSERT INTO stands (codigo, nome, categoria_id, ordem) VALUES (?, ?, ?, ?)',
          [`${prefixo}${i}`, `${cota.nome} ${i}`, idPorNome[cota.nome], ++ordem]
        );
        total++;
      }
    }
    // Todos nascem disponíveis: o bloqueio manual é demonstrado ao vivo
    // pelo painel (aba Stands → ícone de bloquear).
    console.log(`🏗️  ${total} stands criados, todos disponíveis.`);
    console.log('    ⚠️  Quantidades provisórias — ajuste pelo painel quando o mapa do evento for definido.');
  } else {
    console.log('🏗️  Stands já existem — seed ignorado.');
  }

  await conn.end();
  console.log('\n✅ Setup concluído com sucesso!\n');
}

main().catch(err => {
  console.error('\n❌ Erro no setup:', err.message);
  process.exit(1);
});
