/* ── Geração do contrato/proposta em PDF ──────────────────────────
   Reproduz o contrato de patrocínio dos templates .docx, aplicado
   sobre o papel timbrado da Mais Corporativo (mesma arte dos modelos
   originais). Enquanto não estiver assinado, o documento sai marcado
   como PROPOSTA COMERCIAL. */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MODELOS_CONTRATO } from './contratos-modelos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAPEL = path.join(__dirname, 'assets', 'papel-timbrado.jpg');
// Assinatura digitalizada do diretor, extraída dos modelos em Word
const ASSINATURA = path.join(__dirname, 'assets', 'assinatura-organizadora.png');

/* A4 em pontos. As margens respeitam a arte do timbrado:
   - o logo da Mais Corporativo desce até ~114pt do topo, então o
     conteúdo só começa depois disso, com folga — nada de texto
     por cima da marca;
   - a faixa laranja do rodapé começa em ~777pt, e o conteúdo para
     bem antes para não encostar nela. */
const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = { topo: 140, base: 104, esquerda: 74, direita: 74 };
const LOGO_LIMITE = 120;  // nada pode ser impresso acima disso

const COR = {
  texto: '#1a1a1a',
  titulo: '#1f2b52',   // azul-marinho da identidade
  vazio: '#c0392b',    // placeholders não preenchidos, como no modelo
  suave: '#6b7280',
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const COTAS_ORDEM = ['Raiz', 'Semeadura', 'Colheita', 'Parceiro'];

export function formatarMoeda(v) {
  if (v === null || v === undefined || v === '') return 'R$ 0,00';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataPorExtenso(d = new Date()) {
  return `Araçatuba/SP, ${String(d.getDate()).padStart(2, '0')} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/* ── Gera o PDF e devolve um Buffer ───────────────────────────────
   `assinaturas` é a lista de firmas eletrônicas coletadas; quando
   vem preenchida, o traço do patrocinador aparece sobre a linha e o
   documento ganha uma página final de trilha de auditoria. */
export function gerarContratoPDF(dados, { assinado = false, assinaturas = [] } = {}) {
  return new Promise((resolve, reject) => {
    const modelo = MODELOS_CONTRATO[dados.cota] || null;
    const firmaPatrocinador = assinaturas.find(a => a.parte === 'patrocinador') || null;

    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: MARGEM.topo, bottom: MARGEM.base,
        left: MARGEM.esquerda, right: MARGEM.direita,
      },
      bufferPages: true,
      info: {
        Title: `${assinado ? 'Contrato' : 'Proposta'} de Patrocínio — ${dados.cota ?? ''} — Siran Summit 2026`,
        Author: 'ZRN Viagens e Turismo Ltda. — Mais Corporativo',
        Subject: `Stand ${dados.stand_codigo ?? ''}`,
      },
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = MARGEM.esquerda;
    const largura = A4.largura - MARGEM.esquerda - MARGEM.direita;

    /* ── Peças de texto ──────────────────────────────────────────
       `trechos` aceita string ou { t, cor } para pintar de vermelho
       os campos que ficaram em branco, como no modelo em Word. */
    const paragrafo = (trechos, opcoes = {}) => {
      const lista = Array.isArray(trechos) ? trechos : [trechos];
      doc.font('Helvetica').fontSize(9.5).fillColor(COR.texto);
      lista.forEach((parte, i) => {
        const ultimo = i === lista.length - 1;
        const texto = typeof parte === 'string' ? parte : parte.t;
        const cor = typeof parte === 'string' ? COR.texto : (parte.cor ?? COR.texto);
        const negrito = typeof parte !== 'string' && parte.negrito;
        doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fillColor(cor)
          .text(texto, {
            width: largura, align: 'justify', lineGap: 1.6,
            continued: !ultimo, ...opcoes,
          });
      });
      doc.fillColor(COR.texto);
    };

    /** Campo do contrato: usa o valor, ou o placeholder em vermelho. */
    const campo = (valor, placeholder) => {
      const v = String(valor ?? '').trim();
      return v ? { t: v, negrito: true } : { t: placeholder, cor: COR.vazio, negrito: true };
    };

    const tituloClausula = t => {
      doc.moveDown(0.9);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.titulo)
        .text(t, { width: largura });
      doc.moveDown(0.3);
    };

    /* ── Fundo timbrado em toda página nova ──────────────────────
       Precisa ser desenhado antes do conteúdo, senão cobre o texto. */
    const aplicarFundo = () => {
      if (fs.existsSync(PAPEL)) {
        try {
          doc.image(PAPEL, 0, 0, { width: A4.largura, height: A4.altura });
        } catch { /* segue sem o timbrado */ }
      }
      // Garante que a página nova comece abaixo do logo
      if (doc.y < LOGO_LIMITE) doc.y = MARGEM.topo;
    };
    aplicarFundo();
    doc.on('pageAdded', aplicarFundo);

    /* O documento sai igual ao modelo em Word, sem tarja de aviso.
       Proposta e contrato assinado se distinguem pelo nome do
       arquivo e pela identificação no rodapé. */

    /* ── Preâmbulo ───────────────────────────────────────────── */
    paragrafo([
      'CONTRATO DE PATROCÍNIO que celebram, de um lado, ZRN Viagens e Turismo Ltda. – Mais ' +
      'Corporativo, pessoa jurídica de direito privado, inscrita no CNPJ nº 07.934.448/0001-21, ' +
      'com sede na Av. Brasília, 2098, Araçatuba/SP, neste ato representada por seu Diretor ' +
      'Financeiro, Sr. Adriano Dias Zago, doravante denominada "ORGANIZADORA", e de outro lado, ',
      campo(dados.razao_social, 'RAZÃO SOCIAL'),
      ', inscrito no CNPJ sob o nº ',
      campo(dados.cnpj, '00.000.000/0000-00'),
      ', com sede na ',
      campo(dados.endereco, 'ENDEREÇO COMPLETO'),
      ', CEP: ',
      campo(dados.cep, '00.000-000'),
      ', ',
      campo(
        dados.cidade && dados.estado ? `${dados.cidade}/${dados.estado}` : '',
        'CIDADE/ESTADO'
      ),
      ', neste ato representado por ',
      campo(dados.representante_nome, 'NOME DO REPRESENTANTE DA EMPRESA'),
      ', CPF ',
      campo(dados.representante_cpf, '000.000.000-00'),
      ', doravante denominado "PATROCINADOR", têm entre si justo e acordado o presente ' +
      'contrato, que será regido pelas seguintes cláusulas e condições:',
    ]);

    /* ── Cláusula 1 ──────────────────────────────────────────── */
    tituloClausula('CLÁUSULA 1 – DO OBJETO');
    paragrafo('1.1. O presente contrato tem por objeto o apoio financeiro, promocional e ' +
      'institucional do PATROCINADOR ao evento 4º SIRAN Summit Agronegócio, que ocorrerá nos ' +
      'dias 10 e 11 de novembro de 2026, no Recinto de Exposições Clibas de Almeida Prado, em ' +
      'Araçatuba/SP.');
    doc.moveDown(0.35);
    paragrafo('1.2. O PATROCINADOR compromete-se a aportar o valor estipulado na Cota Especial ' +
      'de Patrocínio, conforme Cláusula 2.');

    /* ── Cláusula 2 ──────────────────────────────────────────── */
    tituloClausula('CLÁUSULA 2 – DA COTA ESPECIAL DE PARCERIA');
    paragrafo('2.1. Em caráter especial de fortalecimento da parceria institucional entre a ' +
      'ORGANIZADORA e o PATROCINADOR, este contrato contempla a seguinte Cota de Patrocínio:');
    doc.moveDown(0.45);

    /* A cota correta vem sempre do dado, nunca do modelo.
       Os trechos são posicionados à mão: `continued` combinado com
       align:'center' faz o pdfkit recentralizar cada pedaço no mesmo
       ponto, empilhando os quatro rótulos um sobre o outro. */
    const partesCota = [];
    COTAS_ORDEM.forEach((c, i) => {
      const marcada = c === dados.cota;
      partesCota.push({
        t: `${marcada ? '(X)' : '(  )'} ${c.toUpperCase()}`,
        negrito: marcada,
        cor: marcada ? COR.titulo : COR.suave,
      });
      if (i < COTAS_ORDEM.length - 1) {
        partesCota.push({ t: '   |   ', negrito: false, cor: COR.suave });
      }
    });

    doc.fontSize(10);
    let larguraTotal = 0;
    for (const p of partesCota) {
      doc.font(p.negrito ? 'Helvetica-Bold' : 'Helvetica');
      larguraTotal += doc.widthOfString(p.t);
    }

    const yCota = doc.y;
    let xCota = L + Math.max(0, (largura - larguraTotal) / 2);
    for (const p of partesCota) {
      doc.font(p.negrito ? 'Helvetica-Bold' : 'Helvetica').fillColor(p.cor)
        .text(p.t, xCota, yCota, { lineBreak: false });
      xCota += doc.widthOfString(p.t);
    }

    doc.fillColor(COR.texto);
    doc.x = L;
    doc.y = yCota + 16;
    doc.moveDown(0.5);

    if (modelo) {
      for (const secao of modelo.secoes) {
        // Evita título de seção órfão no fim da página
        if (doc.y > A4.altura - MARGEM.base - 60) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COR.titulo)
          .text(secao.titulo, { width: largura });
        doc.moveDown(0.15);
        doc.font('Helvetica').fontSize(9).fillColor(COR.texto);
        for (const item of secao.itens) {
          doc.text(`•  ${item}`, { width: largura - 14, indent: 10, lineGap: 0.8 });
        }
        doc.moveDown(0.45);
      }
    } else {
      paragrafo({ t: '(Benefícios da cota a definir.)', cor: COR.vazio });
    }

    /* ── Cláusula 3 ──────────────────────────────────────────── */
    tituloClausula('CLÁUSULA 3 – DAS OBRIGAÇÕES DA ORGANIZADORA');
    paragrafo('3.1. A ORGANIZADORA compromete-se a:');
    doc.moveDown(0.2);
    [
      'a) Garantir os benefícios e estruturas descritos na Cláusula 2;',
      'b) Inserir a logomarca do PATROCINADOR nos materiais de divulgação impressos e digitais do evento;',
      'c) Disponibilizar espaço físico conforme definido;',
      'd) Entregar relatório de visibilidade e impacto até 30 dias após o evento;',
      'e) Garantir a participação do PATROCINADOR nas atividades institucionais do evento.',
    ].forEach(l => { paragrafo(l, { indent: 12 }); doc.moveDown(0.15); });

    /* ── Cláusula 4 ──────────────────────────────────────────── */
    tituloClausula('CLÁUSULA 4 – DAS OBRIGAÇÕES DO PATROCINADOR');
    paragrafo('4.1. O PATROCINADOR compromete-se a:');
    doc.moveDown(0.2);
    paragrafo([
      'a) Efetuar o pagamento do valor de ',
      { t: formatarMoeda(dados.valor), negrito: true },
      ', conforme abaixo:',
    ], { indent: 12 });
    doc.moveDown(0.3);

    const pagamento = String(dados.forma_pagamento ?? '').trim();
    doc.font('Helvetica-Bold').fontSize(9.5)
      .fillColor(pagamento ? COR.texto : COR.vazio)
      .text(pagamento || 'Descrever a forma de pagamento negociada',
        L + 22, doc.y, { width: largura - 22 });
    doc.fillColor(COR.texto);
    doc.moveDown(0.5);

    [
      'b) Fornecer logomarca em alta resolução e materiais institucionais para fins de divulgação;',
      'c) Participar ativamente das atividades propostas no evento;',
      'd) Custear todas as despesas referentes a deslocamento, hospedagem e alimentação do nome indicado para participação no evento.',
    ].forEach(l => { paragrafo(l, { indent: 12 }); doc.moveDown(0.15); });

    /* ── Cláusulas 5 e 6 ─────────────────────────────────────── */
    tituloClausula('CLÁUSULA 5 – DA VIGÊNCIA');
    paragrafo('5.1. O presente contrato entra em vigor na data de sua assinatura e tem validade ' +
      'até 11 de novembro de 2026, contemplando todas as entregas institucionais, promocionais ' +
      'e relatórios previstos.');

    tituloClausula('CLÁUSULA 6 – DAS DISPOSIÇÕES GERAIS');
    paragrafo('6.1. Nenhuma das partes poderá transferir ou ceder, total ou parcialmente, seus ' +
      'direitos ou obrigações decorrentes deste contrato sem anuência prévia e por escrito da ' +
      'outra parte.');
    doc.moveDown(0.35);
    paragrafo('6.2. O não comparecimento ao evento não exime o PATROCINADOR das obrigações aqui assumidas.');
    doc.moveDown(0.35);
    paragrafo('6.3. As partes elegem o foro da comarca de Araçatuba/SP para dirimir quaisquer ' +
      'dúvidas ou controvérsias oriundas deste contrato.');

    doc.moveDown(0.7);
    paragrafo('E, por estarem assim justas e contratadas, firmam o presente instrumento em duas ' +
      'vias de igual teor e forma, na presença de testemunhas.');

    /* ── Data + assinaturas ──────────────────────────────────────
       Data, firmas e testemunhas formam um bloco só: se não couberem
       inteiros no que resta da página, tudo desce junto para a
       próxima — a data nunca fica órfã no pé da folha anterior. */
    const ALTURA_FECHAMENTO =
      14 +   // linha da data
      34 +   // respiro antes das firmas
      105 +  // título, rubrica, linha e 4 linhas de identificação
      95;    // bloco de testemunhas

    doc.moveDown(1);
    if (doc.y + ALTURA_FECHAMENTO > A4.altura - MARGEM.base) doc.addPage();

    doc.font('Helvetica').fontSize(9.5).fillColor(COR.texto)
      .text(dados.data_contrato || dataPorExtenso(), L, doc.y, { width: largura });

    doc.moveDown(2.4);

    const yAss = doc.y;
    const col = (largura - 34) / 2;

    /* `assinatura` desenha a rubrica logo acima da linha — a do
       diretor vem dos modelos em Word; a do patrocinador é o traço
       feito na tela, quando já houver assinatura eletrônica. */
    const blocoAssinatura = (x, papel, linhas, { assinatura = false, traco = null } = {}) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.titulo)
        .text(papel, x, yAss, { width: col });

      const yLinha = yAss + 46;
      if (traco) {
        try {
          const png = Buffer.from(String(traco).replace(/^data:image\/\w+;base64,/, ''), 'base64');
          doc.image(png, x + 6, yLinha - 40, { fit: [col - 20, 38], align: 'left' });
        } catch { /* traço inválido: fica só a linha */ }
      } else if (assinatura && fs.existsSync(ASSINATURA)) {
        try {
          doc.image(ASSINATURA, x + 6, yLinha - 36, { height: 34 });
        } catch { /* segue sem a rubrica */ }
      }

      doc.moveTo(x, yLinha).lineTo(x + col, yLinha).lineWidth(0.7).strokeColor('#9ca3af').stroke();
      let y = yLinha + 6;
      doc.font('Helvetica').fontSize(8.5).fillColor(COR.texto);
      for (const l of linhas) {
        doc.text(l, x, y, { width: col });
        y = doc.y;
      }
      return y;
    };

    const yEsq = blocoAssinatura(L, 'ORGANIZADORA', [
      'ZRN Viagens e Turismo Ltda. – Mais Corporativo',
      'Nome: Adriano Dias Zago',
      'Cargo: Diretor Financeiro',
    ], { assinatura: true });
    const yDir = blocoAssinatura(L + col + 34, 'PATROCINADOR', [
      String(dados.razao_social ?? '').trim() || 'RAZÃO SOCIAL DA EMPRESA',
      `Nome: ${firmaPatrocinador?.nome ?? String(dados.representante_nome ?? '').trim()}`,
      `CPF: ${firmaPatrocinador?.cpf ?? String(dados.representante_cpf ?? '').trim()}`,
      `Cargo: ${firmaPatrocinador?.cargo ?? String(dados.representante_cargo ?? '').trim()}`,
    ], { traco: firmaPatrocinador?.traco ?? null });

    doc.y = Math.max(yEsq, yDir) + 22;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.titulo).text('Testemunhas:', L, doc.y);
    doc.moveDown(1.1);
    doc.font('Helvetica').fontSize(9).fillColor(COR.texto);
    doc.text('1. Nome: ______________________________________  CPF: ____________________', L);
    doc.moveDown(1.2);
    doc.text('2. Nome: ______________________________________  CPF: ____________________', L);

    /* ── Trilha de auditoria ─────────────────────────────────────
       Página final com as evidências que sustentam a assinatura
       eletrônica: quem assinou, quando, de onde, e o hash do
       documento que a pessoa tinha diante de si no momento. */
    if (assinaturas.length) {
      doc.addPage();

      doc.font('Helvetica-Bold').fontSize(12).fillColor(COR.titulo)
        .text('TRILHA DE AUDITORIA DA ASSINATURA ELETRÔNICA', L, doc.y, { width: largura });
      doc.moveDown(0.4);

      doc.font('Helvetica').fontSize(8.5).fillColor(COR.suave)
        .text(
          'Documento assinado eletronicamente na forma do art. 10, §2º da MP 2.200-2/2001. ' +
          'As informações abaixo comprovam a autoria e a integridade do documento.',
          { width: largura, align: 'justify' }
        );
      doc.moveDown(0.9);

      for (const a of assinaturas) {
        const alturaBloco = 150;
        if (doc.y + alturaBloco > A4.altura - MARGEM.base) doc.addPage();

        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COR.titulo)
          .text(a.parte === 'organizadora' ? 'ORGANIZADORA' : 'PATROCINADOR', L, doc.y, { width: largura });
        doc.moveDown(0.3);

        const linhas = [
          ['Assinado por', a.nome],
          ['CPF', a.cpf],
          ['Cargo', a.cargo],
          ['E-mail', a.email],
          ['Telefone', a.telefone],
          ['Data e hora', a.assinado_em
            ? new Date(a.assinado_em).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' })
            : null],
          ['Modo', a.modo === 'remoto'
            ? 'Remoto, por link enviado ao signatário'
            : 'Presencial, no dispositivo do vendedor'],
          ['Confirmação', a.codigo_validado
            ? `Código de uso único validado por ${a.validado_por || 'mensagem'}`
            : 'Assinatura colhida presencialmente, na presença do vendedor'],
          ['Conduzido por', a.testemunha_nome],
          ['Endereço IP', a.ip],
          ['Dispositivo', a.user_agent ? String(a.user_agent).slice(0, 95) : null],
          ['Localização', a.geolocalizacao],
        ].filter(l => l[1]);

        doc.fontSize(8.5);
        for (const [rotulo, valor] of linhas) {
          const y = doc.y;
          doc.font('Helvetica').fillColor(COR.suave).text(`${rotulo}:`, L + 6, y, { width: 96 });
          doc.font('Helvetica-Bold').fillColor(COR.texto)
            .text(String(valor), L + 106, y, { width: largura - 112 });
          doc.moveDown(0.15);
        }
        doc.moveDown(0.7);
      }

      /* O hash é o que prova que o arquivo não mudou depois de
         assinado: qualquer alteração produz um valor diferente. */
      if (dados.hash_contrato) {
        if (doc.y + 90 > A4.altura - MARGEM.base) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COR.titulo)
          .text('INTEGRIDADE DO DOCUMENTO', L, doc.y, { width: largura });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(8.5).fillColor(COR.suave)
          .text('Código de verificação (SHA-256) do documento assinado:', L + 6, doc.y, { width: largura - 12 });
        doc.moveDown(0.25);
        doc.font('Courier-Bold').fontSize(8).fillColor(COR.texto)
          .text(String(dados.hash_contrato).replace(/(.{32})/g, '$1\n'), L + 6, doc.y, { width: largura - 12 });
        doc.moveDown(0.5);

        if (dados.url_verificacao) {
          doc.font('Helvetica').fontSize(8.5).fillColor(COR.suave)
            .text('Confira a autenticidade em: ', L + 6, doc.y, { width: largura - 12, continued: true })
            .fillColor(COR.titulo).text(dados.url_verificacao);
        }
      }
    }

    /* ── Identificação discreta, logo acima da faixa do rodapé ────
       A escrita acontece abaixo da margem inferior; sem zerar a
       margem, o pdfkit entende que o texto não cabe e cria uma
       página nova para cada rodapé. Por isso mexemos na margem e a
       restauramos em seguida. Também desligamos o pageAdded, para
       nenhuma página extra receber o fundo por engano. */
    doc.removeAllListeners('pageAdded');

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      const margemOriginal = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.font('Helvetica').fontSize(7).fillColor(COR.suave)
        .text(
          `Stand ${dados.stand_codigo ?? '—'} · Cota ${dados.cota ?? '—'} · ` +
          `${assinado ? 'Contrato' : 'Proposta'} nº ${dados.proposta_id ?? '—'} · ` +
          `Vendedor: ${dados.vendedor_nome ?? '—'} · Pág. ${i + 1}/${paginas.count}`,
          L, A4.altura - 96, { width: largura, align: 'center' }
        );

      doc.page.margins.bottom = margemOriginal;
    }

    doc.end();
  });
}

/** Nome de arquivo estável e legível para anexos. */
export function nomeArquivoContrato(dados, { assinado = false } = {}) {
  const empresa = String(dados.razao_social || dados.cliente_nome || 'patrocinador')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${assinado ? 'Contrato' : 'Proposta'}-SiranSummit2026-${dados.stand_codigo ?? ''}-${empresa}.pdf`;
}
