import { useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, ChevronDown } from 'lucide-react';
import { Campo, Input, Textarea, Botao, Erro } from './ui';
import { SeletorArquivos } from './Anexos';
import { formatPreco } from '../lib/api';

export interface DadosProposta {
  cliente_nome: string;
  cliente_empresa: string;
  cliente_contato: string;
  cliente_email: string;
  observacoes: string;
  razao_social: string;
  cnpj: string;
  endereco: string;
  cep: string;
  cidade: string;
  estado: string;
  representante_nome: string;
  representante_cpf: string;
  representante_cargo: string;
  forma_pagamento: string;
  valor_negociado: string;
}

export const PROPOSTA_VAZIA: DadosProposta = {
  cliente_nome: '', cliente_empresa: '', cliente_contato: '', cliente_email: '', observacoes: '',
  razao_social: '', cnpj: '', endereco: '', cep: '', cidade: '', estado: '',
  representante_nome: '', representante_cpf: '', representante_cargo: '',
  forma_pagamento: '', valor_negociado: '',
};

/* ── Máscaras leves: formatam enquanto digita, sem travar o campo ── */
const soDigitos = (v: string) => v.replace(/\D/g, '');

export function mascaraCnpj(v: string) {
  const d = soDigitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function mascaraCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function mascaraCep(v: string) {
  const d = soDigitos(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}

function Secao({ titulo, descricao, children, aberta: inicial = true }: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  aberta?: boolean;
}) {
  const [aberta, setAberta] = useState(inicial);
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200">
      <button
        type="button"
        onClick={() => setAberta(a => !a)}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 bg-stone-50 px-4 text-left active:bg-stone-100"
      >
        <span>
          <span className="block text-sm font-semibold text-stone-800">{titulo}</span>
          {descricao && <span className="block text-xs text-stone-500">{descricao}</span>}
        </span>
        <ChevronDown size={18} className={`shrink-0 text-stone-400 transition ${aberta ? 'rotate-180' : ''}`} />
      </button>
      {aberta && <div className="space-y-3.5 p-4">{children}</div>}
    </div>
  );
}

/* ── Formulário da proposta comercial ─────────────────────────────
   Os campos abaixo são exatamente os que o contrato de patrocínio
   precisa. Só nome do cliente é obrigatório para não travar o
   vendedor em campo — o resto pode ser completado depois, e o PDF
   sai com os espaços em branco do modelo original. */
export default function FormularioProposta({
  precoCota, cota, arquivos, onArquivos, onSubmit, carregando, textoBotao = 'Gerar proposta e reservar',
  valorInicial = PROPOSTA_VAZIA, erro,
}: {
  precoCota: number | null;
  cota: string | null;
  arquivos?: File[];
  onArquivos?: (a: File[]) => void;
  onSubmit: (dados: DadosProposta) => void;
  carregando: boolean;
  textoBotao?: string;
  valorInicial?: DadosProposta;
  erro?: string;
}) {
  const [f, setF] = useState<DadosProposta>(valorInicial);
  const [mesmoContato, setMesmoContato] = useState(false);

  const set = (k: keyof DadosProposta) => (v: string) =>
    setF(prev => ({
      ...prev,
      [k]: v,
      // Com o checkbox ligado, o nome do representante acompanha o contato
      ...(k === 'cliente_nome' && mesmoContato ? { representante_nome: v } : {}),
    }));

  function submeter(e: FormEvent) {
    e.preventDefault();
    onSubmit(f);
  }

  return (
    <form onSubmit={submeter} className="space-y-3.5">
      <div className="rounded-xl bg-siran-50 px-4 py-3 text-sm text-siran-900">
        <p className="flex items-center gap-2 font-semibold">
          <FileText size={16} /> Proposta comercial
        </p>
        <p className="mt-1 text-siran-800">
          Estes dados preenchem o contrato de patrocínio, que é gerado em PDF e enviado por
          e-mail e WhatsApp para você, para o cliente e para a diretoria.
        </p>
      </div>

      <Secao titulo="Contato do cliente" descricao="Quem recebe a proposta">
        <Campo label="Nome do contato *">
          <Input value={f.cliente_nome} onChange={e => set('cliente_nome')(e.target.value)} required autoComplete="name" />
        </Campo>
        <Campo label="Nome fantasia / empresa">
          <Input value={f.cliente_empresa} onChange={e => set('cliente_empresa')(e.target.value)} autoComplete="organization" />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="WhatsApp" hint="Recebe a proposta">
            <Input
              value={f.cliente_contato}
              onChange={e => set('cliente_contato')(e.target.value)}
              inputMode="tel"
              placeholder="(14) 98807-2950"
            />
          </Campo>
          <Campo label="E-mail" hint="Recebe o PDF">
            <Input
              type="email"
              value={f.cliente_email}
              onChange={e => set('cliente_email')(e.target.value)}
              inputMode="email"
              autoCapitalize="none"
            />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Dados da empresa (contrato)" descricao="Qualificação do PATROCINADOR">
        <Campo label="Razão social">
          <Input value={f.razao_social} onChange={e => set('razao_social')(e.target.value)} placeholder="Fazenda Boa Vista Agropecuária Ltda." />
        </Campo>
        <Campo label="CNPJ">
          <Input value={f.cnpj} onChange={e => set('cnpj')(mascaraCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" />
        </Campo>
        <Campo label="Endereço completo">
          <Input value={f.endereco} onChange={e => set('endereco')(e.target.value)} placeholder="Av. Brasília, 2098" />
        </Campo>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo label="CEP">
            <Input value={f.cep} onChange={e => set('cep')(mascaraCep(e.target.value))} inputMode="numeric" placeholder="00000-000" />
          </Campo>
          <div className="col-span-1 sm:col-span-2">
            <Campo label="Cidade">
              <Input value={f.cidade} onChange={e => set('cidade')(e.target.value)} />
            </Campo>
          </div>
          <Campo label="UF">
            <Input
              value={f.estado}
              onChange={e => set('estado')(e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              placeholder="SP"
            />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Representante legal" descricao="Quem assina pelo patrocinador">
        {/* Na maioria das vendas quem negocia é quem assina — evita
            digitar o mesmo nome duas vezes. */}
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl bg-stone-100 px-3 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={mesmoContato}
            onChange={e => {
              const marcado = e.target.checked;
              setMesmoContato(marcado);
              if (marcado) setF(prev => ({ ...prev, representante_nome: prev.cliente_nome }));
            }}
            className="h-5 w-5 shrink-0 accent-siran-600"
          />
          É a mesma pessoa do contato do cliente
        </label>

        <Campo label="Nome do representante">
          <Input
            value={f.representante_nome}
            onChange={e => { set('representante_nome')(e.target.value); setMesmoContato(false); }}
            autoComplete="name"
            readOnly={mesmoContato}
            className={mesmoContato ? 'bg-stone-50 text-stone-600' : ''}
          />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="CPF">
            <Input value={f.representante_cpf} onChange={e => set('representante_cpf')(mascaraCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
          </Campo>
          <Campo label="Cargo">
            <Input value={f.representante_cargo} onChange={e => set('representante_cargo')(e.target.value)} placeholder="Diretor Comercial" />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Valores e pagamento" descricao="Cláusula 4 do contrato">
        <Campo
          label="Valor negociado (R$)"
          hint={precoCota != null ? `Valor da cota ${cota ?? ''}: ${formatPreco(precoCota)}. Preencha só se for diferente.` : undefined}
        >
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={f.valor_negociado}
            onChange={e => set('valor_negociado')(e.target.value)}
            placeholder={precoCota != null ? String(precoCota) : ''}
          />
        </Campo>
        <Campo label="Forma de pagamento" hint="Vai no contrato exatamente como escrito aqui.">
          <Textarea
            value={f.forma_pagamento}
            onChange={e => set('forma_pagamento')(e.target.value)}
            rows={3}
            placeholder="Ex: Entrada de R$ 5.000,00 na assinatura e 2 parcelas de R$ 5.000,00 em 30 e 60 dias, via PIX."
          />
        </Campo>
      </Secao>

      <Secao titulo="Observações e documentos" descricao="Opcional" aberta={false}>
        <Campo label="Observações internas" hint="Não aparece no contrato.">
          <Textarea value={f.observacoes} onChange={e => set('observacoes')(e.target.value)} rows={2} />
        </Campo>
        {arquivos && onArquivos && (
          <SeletorArquivos arquivos={arquivos} onChange={onArquivos} />
        )}
      </Secao>

      {erro && <Erro>{erro}</Erro>}

      <Botao type="submit" disabled={carregando || !f.cliente_nome.trim()} className="w-full">
        {carregando ? 'Gerando proposta…' : textoBotao}
      </Botao>
      <p className="text-center text-xs text-stone-500">
        O stand fica bloqueado para os outros vendedores assim que a proposta for gerada.
      </p>
    </form>
  );
}
