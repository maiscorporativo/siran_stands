import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, CheckCircle2, XCircle, RefreshCw, Search, FileText, FileDown, PenLine } from 'lucide-react';
import type { Sessao, Stand, StandStatus, Categoria } from '../types';
import { api, formatPreco, tempoRestante, baixarContrato } from '../lib/api';
import Modal from '../components/Modal';
import { Input, Botao, Erro } from '../components/ui';
import ListaAnexos, { enviarAnexos } from '../components/Anexos';
import FormularioProposta from '../components/FormularioProposta';
import type { DadosProposta } from '../components/FormularioProposta';
import ModalAssinatura from '../components/ModalAssinatura';

const STATUS: Record<StandStatus, {
  label: string; card: string; badge: string; ponto: string; filtroAtivo: string;
}> = {
  disponivel: {
    label: 'Disponível', card: 'border-siran-300 bg-white active:bg-siran-50',
    badge: 'bg-siran-100 text-siran-800', ponto: 'bg-siran-500',
    filtroAtivo: 'border-siran-500 bg-siran-50 ring-siran-300',
  },
  reservado: {
    label: 'Reservado', card: 'border-amber-300 bg-amber-50',
    badge: 'bg-amber-100 text-amber-800', ponto: 'bg-amber-500',
    filtroAtivo: 'border-amber-500 bg-amber-50 ring-amber-300',
  },
  vendido: {
    label: 'Vendido', card: 'border-red-200 bg-red-50',
    badge: 'bg-red-100 text-red-700', ponto: 'bg-red-500',
    filtroAtivo: 'border-red-400 bg-red-50 ring-red-300',
  },
  indisponivel: {
    label: 'Indisponível', card: 'border-stone-200 bg-stone-100 opacity-75',
    badge: 'bg-stone-200 text-stone-600', ponto: 'bg-stone-400',
    filtroAtivo: 'border-stone-400 bg-stone-100 ring-stone-300',
  },
};

export default function Mapa({ sessao }: { sessao: Sessao }) {
  const [stands, setStands] = useState<Stand[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [selecionado, setSelecionado] = useState<Stand | null>(null);
  const [cota, setCota] = useState('todas');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StandStatus | 'todos'>('todos');
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [, setTick] = useState(0); // redesenha a contagem regressiva

  const carregar = useCallback(async (comSpinner = false) => {
    if (comSpinner) setAtualizando(true);
    try {
      const [s, c] = await Promise.all([
        api<Stand[]>('/api/stands'),
        api<Categoria[]>('/api/categorias'),
      ]);
      setStands(s);
      setCategorias(c);
      setErro('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar stands');
    } finally {
      if (comSpinner) setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const poll = setInterval(() => carregar(), 15000);
    const tick = setInterval(() => setTick(t => t + 1), 30000);
    // Vendedor volta ao app depois de uma ligação: recarrega na hora
    const aoVoltar = () => { if (!document.hidden) carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [carregar]);

  // Mantém o modal sincronizado quando o polling traz dados novos
  useEffect(() => {
    if (!selecionado) return;
    const atualizado = stands.find(s => s.id === selecionado.id);
    if (atualizado && JSON.stringify(atualizado) !== JSON.stringify(selecionado)) {
      setSelecionado(atualizado);
    }
  }, [stands, selecionado]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return stands.filter(s =>
      (cota === 'todas' || s.categoria === cota) &&
      (status === 'todos' || s.status === status) &&
      (!termo ||
        s.codigo.toLowerCase().includes(termo) ||
        s.nome.toLowerCase().includes(termo) ||
        (s.categoria ?? '').toLowerCase().includes(termo))
    );
  }, [stands, cota, status, busca]);

  const contagem = useMemo(() => {
    const c = { disponivel: 0, reservado: 0, vendido: 0, indisponivel: 0 };
    for (const s of stands) c[s.status]++;
    return c;
  }, [stands]);

  return (
    <main className="mx-auto max-w-7xl px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:py-6">
      {/* ── Resumo clicável: cada card filtra a lista por status ── */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {(Object.keys(STATUS) as StandStatus[]).map(st => {
          const ativo = status === st;
          return (
            <button
              key={st}
              // Clicar de novo no card ativo volta a mostrar todos
              onClick={() => setStatus(ativo ? 'todos' : st)}
              aria-pressed={ativo}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left shadow-sm transition ${
                ativo
                  ? `${STATUS[st].filtroAtivo} ring-2`
                  : 'border-stone-200 bg-white active:bg-stone-50'
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS[st].ponto}`} />
              <div className="min-w-0">
                <div className="text-xl font-bold leading-none text-stone-900">{contagem[st]}</div>
                <div className="truncate text-xs text-stone-500">{STATUS[st].label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Busca + filtros ────────────────────────────────────── */}
      <div className="mb-4 space-y-2.5">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            type="search"
            inputMode="search"
            placeholder="Buscar por código, nome ou cota…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-11"
          />
        </div>

        {/* Cotas em chips roláveis — melhor que <select> no polegar */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip ativo={cota === 'todas'} onClick={() => setCota('todas')}>
            Todas ({stands.length})
          </Chip>
          {categorias.map(c => (
            <Chip key={c.id} ativo={cota === c.nome} onClick={() => setCota(c.nome)}>
              {c.nome} ({c.disponiveis ?? 0}/{c.total_stands ?? 0})
            </Chip>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm text-stone-600">
            {visiveis.length === stands.length ? (
              <>Mostrando todos os {stands.length} stands</>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                <strong className="text-stone-900">{visiveis.length}</strong>
                {visiveis.length === 1 ? 'stand' : 'stands'}
                {status !== 'todos' && <Tag>{STATUS[status].label}</Tag>}
                {cota !== 'todas' && <Tag>{cota}</Tag>}
                {busca.trim() && <Tag>“{busca.trim()}”</Tag>}
                <button
                  onClick={() => { setStatus('todos'); setCota('todas'); setBusca(''); }}
                  className="ml-0.5 rounded-lg px-1.5 py-0.5 text-siran-700 underline underline-offset-2 active:bg-siran-50"
                >
                  limpar
                </button>
              </span>
            )}
          </div>
          <button
            onClick={() => carregar(true)}
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm text-stone-600 active:bg-stone-200"
          >
            <RefreshCw size={15} className={atualizando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="mb-4"><Erro>{erro}</Erro></div>}

      {/* ── Grade de stands ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {visiveis.map(s => {
          const info = STATUS[s.status];
          const minha = s.reserva_status === 'ativa' && s.reserva_vendedor_id === sessao.id;
          return (
            <button
              key={s.id}
              onClick={() => setSelecionado(s)}
              className={`flex flex-col rounded-xl border-2 p-3 text-left shadow-sm transition sm:p-4 ${info.card} ${
                minha ? 'ring-2 ring-amber-400' : ''
              }`}
            >
              <div className="mb-1.5 flex items-start justify-between gap-1.5">
                <span className="text-lg font-bold leading-tight text-stone-900">{s.codigo}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight sm:text-xs ${info.badge}`}>
                  {minha ? 'Sua' : info.label}
                </span>
              </div>

              <div className="mb-2 line-clamp-2 text-xs text-stone-600 sm:text-sm">{s.categoria || s.nome}</div>

              {s.imagem_url && !s.imagem_url.toLowerCase().endsWith('.pdf') && (
                <img
                  src={s.imagem_url}
                  alt=""
                  loading="lazy"
                  className="mb-2 h-20 w-full rounded-lg object-cover sm:h-28"
                />
              )}

              <div className="mt-auto">
                {s.tamanho && <div className="truncate text-[11px] text-stone-500 sm:text-xs">{s.tamanho}</div>}
                <div className="font-semibold text-siran-700">{formatPreco(s.preco)}</div>
              </div>

              {s.status === 'reservado' && s.reserva_expira_em && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 sm:text-xs">
                  <Clock size={12} className="shrink-0" />
                  <span className="truncate">
                    {minha ? 'Confirmar em ' : 'Libera em '}{tempoRestante(s.reserva_expira_em)}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-stone-500">Nenhum stand encontrado com os filtros atuais.</p>
          <button
            onClick={() => { setStatus('todos'); setCota('todas'); setBusca(''); }}
            className="mt-3 min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 active:bg-stone-100"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {selecionado && (
        <StandModal
          stand={selecionado}
          sessao={sessao}
          onFechar={() => setSelecionado(null)}
          onAtualizar={() => { setSelecionado(null); carregar(); }}
        />
      )}
    </main>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
      {children}
    </span>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[38px] shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition ${
        ativo ? 'bg-siran-700 text-white' : 'border border-stone-300 bg-white text-stone-600 active:bg-stone-100'
      }`}
    >
      {children}
    </button>
  );
}

/* ── Detalhe do stand / reserva ───────────────────────────────── */
function StandModal({ stand, sessao, onFechar, onAtualizar }: {
  stand: Stand;
  sessao: Sessao;
  onFechar: () => void;
  onAtualizar: () => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [verBeneficios, setVerBeneficios] = useState(false);
  const [assinando, setAssinando] = useState(false);

  const minhaAtiva = stand.reserva_status === 'ativa' && stand.reserva_vendedor_id === sessao.id;
  const podeGerenciar = minhaAtiva || (sessao.role === 'master' && stand.reserva_status === 'ativa');

  async function acao(fn: () => Promise<unknown>) {
    setErro('');
    setCarregando(true);
    try {
      await fn();
      onAtualizar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
      setCarregando(false);
    }
  }

  /* A proposta é criada primeiro, sozinha: ela é que garante o stand,
     e não pode depender do upload de vários megabytes. Se os anexos
     falharem depois, a proposta continua de pé e o vendedor reenvia
     os documentos pela própria tela do stand. */
  async function criarProposta(dados: DadosProposta) {
    setErro('');
    setAviso('');
    setCarregando(true);
    try {
      const { reserva } = await api<{ reserva: { id: number } }>('/api/reservas', {
        method: 'POST',
        json: { stand_id: stand.id, ...dados },
      });

      if (arquivos.length) {
        try {
          await enviarAnexos(reserva.id, arquivos);
        } catch (err) {
          setAviso(
            `Proposta gerada e stand reservado, mas os documentos não subiram (${
              err instanceof Error ? err.message : 'erro'
            }). Abra o stand de novo para anexá-los.`
          );
          setCarregando(false);
          setArquivos([]);
          return;
        }
      }
      onAtualizar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
      setCarregando(false);
    }
  }

  const ehPdf = stand.imagem_url?.toLowerCase().endsWith('.pdf');

  // A coleta de assinatura substitui o modal do stand enquanto dura
  if (assinando && stand.reserva_id) {
    return (
      <ModalAssinatura
        reservaId={stand.reserva_id}
        standCodigo={stand.codigo}
        onFechar={() => setAssinando(false)}
        onAssinado={onAtualizar}
      />
    );
  }

  return (
    <Modal
      titulo={`${stand.codigo} — ${stand.nome}`}
      subtitulo={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {stand.categoria && <span className="font-medium text-siran-700">{stand.categoria}</span>}
          {stand.tamanho && <span>{stand.tamanho}</span>}
          {stand.preco != null && <span className="font-semibold text-stone-700">{formatPreco(stand.preco)}</span>}
        </span>
      }
      onFechar={onFechar}
    >
      {stand.imagem_url && (
        ehPdf ? (
          <a
            href={stand.imagem_url}
            target="_blank"
            rel="noreferrer"
            className="mb-4 flex min-h-[48px] items-center gap-2 rounded-xl bg-siran-50 px-4 font-medium text-siran-700 active:bg-siran-100"
          >
            <FileText size={18} /> Abrir planta do stand (PDF)
          </a>
        ) : (
          <img src={stand.imagem_url} alt={`Planta do stand ${stand.codigo}`} className="mb-4 w-full rounded-xl" />
        )
      )}

      {stand.descricao && <p className="mb-4 text-sm text-stone-700">{stand.descricao}</p>}

      {/* Benefícios da cota, recolhidos por padrão para não empurrar
          o formulário de reserva para fora da tela do celular */}
      {stand.categoria_beneficios && (
        <div className="mb-4 overflow-hidden rounded-xl border border-stone-200">
          <button
            onClick={() => setVerBeneficios(v => !v)}
            className="flex min-h-[48px] w-full items-center justify-between px-4 text-left text-sm font-semibold text-stone-700 active:bg-stone-50"
          >
            O que a cota {stand.categoria} inclui
            <span className="text-stone-400">{verBeneficios ? '−' : '+'}</span>
          </button>
          {verBeneficios && (
            <p className="whitespace-pre-line border-t border-stone-100 px-4 py-3 text-sm leading-relaxed text-stone-600">
              {stand.categoria_beneficios}
            </p>
          )}
        </div>
      )}

      {stand.reserva_status && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            <strong>{stand.reserva_status === 'confirmada' ? 'Vendido' : 'Reservado'}</strong>
            {' '}por {stand.reserva_vendedor_nome}
          </p>
          {stand.reserva_cliente_nome && (
            <p className="mt-1">
              Cliente: {stand.reserva_cliente_nome}
              {stand.reserva_cliente_empresa && ` (${stand.reserva_cliente_empresa})`}
            </p>
          )}
          {stand.reserva_status === 'ativa' && stand.reserva_expira_em && (
            <p className="mt-1 flex items-center gap-1.5 font-medium">
              <Clock size={14} /> Prazo para confirmar: {tempoRestante(stand.reserva_expira_em)}
            </p>
          )}
        </div>
      )}

      {/* Proposta/contrato em PDF e documentos anexados — só quem tem
          acesso aos dados do cliente enxerga este bloco */}
      {stand.reserva_id && stand.reserva_cliente_nome && (
        <div className="mb-4 space-y-4">
          <button
            onClick={() => baixarContrato(stand.reserva_id!, stand.codigo)}
            className="flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-siran-300 bg-siran-50 px-4 text-sm font-semibold text-siran-800 active:bg-siran-100"
          >
            <FileDown size={18} />
            {stand.reserva_status === 'confirmada' ? 'Baixar contrato (PDF)' : 'Baixar proposta (PDF)'}
          </button>
          <ListaAnexos reservaId={stand.reserva_id} podeEditar={podeGerenciar || minhaAtiva} />
        </div>
      )}

      {erro && <div className="mb-4"><Erro>{erro}</Erro></div>}
      {aviso && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{aviso}</p>
      )}

      {stand.status === 'disponivel' && (
        <FormularioProposta
          precoCota={stand.preco}
          cota={stand.categoria}
          arquivos={arquivos}
          onArquivos={setArquivos}
          onSubmit={criarProposta}
          carregando={carregando}
        />
      )}

      {podeGerenciar && (
        <div className="space-y-3">
          {/* Caminho principal: assinar. Fechar a venda sem assinatura
              continua disponível para quem fecha por fora do sistema. */}
          <Botao onClick={() => setAssinando(true)} className="w-full">
            <PenLine size={18} /> Coletar assinatura do cliente
          </Botao>

          <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
            O cliente pode assinar <strong className="text-stone-800">neste aparelho</strong> ou
            receber um <strong className="text-stone-800">link por WhatsApp</strong>. Assinado, o
            stand vira venda e o contrato assinado vai para todos. Se ninguém fizer nada até o
            prazo, a reserva expira e o stand é liberado.
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row">
          <Botao
            onClick={() => {
              const ok = confirm(
                `Fechar a VENDA do stand ${stand.codigo}?\n\n` +
                `Cliente: ${stand.reserva_cliente_nome ?? '—'}\n\n` +
                `O stand passa para "vendido" e um aviso de venda confirmada é enviado ` +
                `por e-mail e WhatsApp. Só o administrador consegue desfazer.\n\n` +
                `Se você só quer segurar o stand, feche esta janela — ele já está reservado.`
              );
              if (ok) acao(() => api(`/api/reservas/${stand.reserva_id}/confirmar`, { method: 'POST' }));
            }}
            disabled={carregando}
            className="flex-1"
          >
            <CheckCircle2 size={18} /> Fechar sem assinar
          </Botao>
          <Botao
            variante="perigo"
            onClick={() => {
              if (confirm('Cancelar esta reserva? O stand voltará a ficar disponível para todos.'))
                acao(() => api(`/api/reservas/${stand.reserva_id}/cancelar`, { method: 'POST' }));
            }}
            disabled={carregando}
            className="flex-1"
          >
            <XCircle size={18} /> Cancelar reserva
          </Botao>
          </div>
        </div>
      )}
    </Modal>
  );
}
