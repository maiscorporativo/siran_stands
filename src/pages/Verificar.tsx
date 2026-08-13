import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ShieldX, Search } from 'lucide-react';
import { Input, Botao } from '../components/ui';
import { formatPreco, formatDataHora } from '../lib/api';

interface Resultado {
  ok: boolean;
  documento: {
    stand: string; cota: string | null; valor: number | null;
    razao_social: string | null; cnpj: string | null;
    vendedor: string; assinado_em: string | null;
  };
  assinaturas: {
    parte: string; nome: string; cpf: string | null;
    modo: string; assinado_em: string;
    confirmado: boolean; validado_por: string | null;
  }[];
}

/* ── Conferência pública de autenticidade ─────────────────────────
   Qualquer pessoa com o código impresso no contrato pode confirmar
   que o documento é legítimo e ver quem assinou. Não expõe o PDF
   nem dados de contato — só o suficiente para conferir. */
export default function Verificar() {
  const [params, setParams] = useSearchParams();
  const [hash, setHash] = useState(params.get('codigo') ?? '');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);

  async function consultar(codigo: string) {
    setErro('');
    setResultado(null);
    setBuscando(true);
    try {
      const res = await fetch(`/api/assinaturas/verificar/${encodeURIComponent(codigo.trim())}`);
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || 'Documento não encontrado.');
      setResultado(dados);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro na consulta.');
    } finally {
      setBuscando(false);
    }
  }

  // Permite chegar com o código já na URL, vindo do PDF
  useEffect(() => {
    const inicial = params.get('codigo');
    if (inicial) consultar(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buscar(e: FormEvent) {
    e.preventDefault();
    setParams(hash.trim() ? { codigo: hash.trim() } : {});
    consultar(hash);
  }

  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="bg-siran-800 pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto max-w-lg px-4 py-3">
          <div className="text-base font-bold">Siran Summit 2026</div>
          <div className="text-xs text-siran-200">Verificação de autenticidade de contrato</div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        <form onSubmit={buscar} className="rounded-2xl bg-white p-5 shadow-sm">
          <label className="mb-1.5 block text-sm font-medium text-stone-700">
            Código de verificação
          </label>
          <p className="mb-3 text-xs text-stone-500">
            É a sequência impressa na última página do contrato assinado.
          </p>
          <Input
            value={hash}
            onChange={e => setHash(e.target.value)}
            placeholder="Cole aqui o código do documento"
            autoCapitalize="none"
            autoCorrect="off"
            className="font-mono text-sm"
          />
          <Botao type="submit" disabled={buscando || !hash.trim()} className="mt-3 w-full">
            <Search size={17} /> {buscando ? 'Consultando…' : 'Verificar'}
          </Botao>
        </form>

        {erro && (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center shadow-sm">
            <ShieldX size={40} className="mx-auto mb-3 text-red-500" />
            <h2 className="font-bold text-stone-900">Documento não encontrado</h2>
            <p className="mt-1.5 text-sm text-stone-600">{erro}</p>
            <p className="mt-3 text-xs text-stone-500">
              Confira se o código foi copiado por inteiro. Um código que não consta aqui pode
              indicar documento adulterado.
            </p>
          </div>
        )}

        {resultado && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border-2 border-siran-300 bg-white p-5 text-center shadow-sm">
              <ShieldCheck size={44} className="mx-auto mb-2 text-siran-600" />
              <h2 className="text-lg font-bold text-siran-900">Documento autêntico</h2>
              <p className="mt-1 text-sm text-stone-600">
                Assinado em {formatDataHora(resultado.documento.assinado_em)}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-stone-900">Contrato</h3>
              <dl className="space-y-2 text-sm">
                {([
                  ['Stand', resultado.documento.stand],
                  ['Cota', resultado.documento.cota],
                  ['Valor', resultado.documento.valor != null ? formatPreco(resultado.documento.valor) : null],
                  ['Patrocinador', resultado.documento.razao_social],
                  ['CNPJ', resultado.documento.cnpj],
                  ['Vendedor', resultado.documento.vendedor],
                ] as [string, string | null][])
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-28 shrink-0 text-stone-500">{k}</dt>
                      <dd className="font-medium text-stone-800">{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-stone-900">
                Assinaturas ({resultado.assinaturas.length})
              </h3>
              <div className="space-y-3">
                {resultado.assinaturas.map((a, i) => (
                  <div key={i} className="rounded-xl bg-stone-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-800">{a.nome}</span>
                      <span className="rounded-full bg-siran-100 px-2 py-0.5 text-[11px] font-medium text-siran-800">
                        {a.parte === 'organizadora' ? 'Organizadora' : 'Patrocinador'}
                      </span>
                    </div>
                    {a.cpf && <div className="text-xs text-stone-500">CPF {a.cpf}</div>}
                    <div className="mt-1 text-xs text-stone-500">
                      {formatDataHora(a.assinado_em)} ·{' '}
                      {a.modo === 'remoto' ? 'assinatura remota' : 'assinatura presencial'}
                      {a.confirmado && a.validado_por && ` · confirmada por ${a.validado_por}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
