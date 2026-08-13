import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Plus, Pencil, Trash2, Ban, Undo2, Save, Tag, Paperclip } from 'lucide-react';
import type { Stand, Usuario, Reserva, Categoria, ConfigSistema, LogNotificacao } from '../types';
import { api, getSessao, formatPreco, formatDataHora } from '../lib/api';
import Modal from '../components/Modal';
import { Campo, Input, Select, Textarea, Botao, Erro } from '../components/ui';
import ListaAnexos from '../components/Anexos';

type Aba = 'stands' | 'cotas' | 'vendedores' | 'reservas' | 'config';

const ABAS: [Aba, string][] = [
  ['stands', 'Stands'],
  ['cotas', 'Cotas'],
  ['vendedores', 'Vendedores'],
  ['reservas', 'Reservas'],
  ['config', 'Ajustes'],
];

export default function Admin() {
  const [aba, setAba] = useState<Aba>('stands');
  return (
    <main className="mx-auto max-w-7xl px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:py-6">
      {/* Abas roláveis no celular */}
      <div className="-mx-3 mb-5 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {ABAS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition ${
              aba === id ? 'bg-siran-700 text-white' : 'bg-white text-stone-600 active:bg-stone-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {aba === 'stands' && <AbaStands />}
      {aba === 'cotas' && <AbaCotas />}
      {aba === 'vendedores' && <AbaVendedores />}
      {aba === 'reservas' && <AbaReservas />}
      {aba === 'config' && <AbaConfig />}
    </main>
  );
}

/* ── Peças reutilizadas ──────────────────────────────────────── */

function Cabecalho({ titulo, acao }: { titulo: string; acao?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-stone-900">{titulo}</h2>
      {acao}
    </div>
  );
}

function BotaoIcone({ onClick, titulo, cor = 'neutro', children }: {
  onClick: () => void;
  titulo: string;
  cor?: 'neutro' | 'verde' | 'vermelho';
  children: ReactNode;
}) {
  const cores = {
    neutro: 'text-stone-500 active:bg-stone-100',
    verde: 'text-siran-600 active:bg-siran-50',
    vermelho: 'text-red-500 active:bg-red-50',
  }[cor];
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${cores}`}
    >
      {children}
    </button>
  );
}

const BADGE_STAND: Record<Stand['status'], string> = {
  disponivel: 'bg-siran-100 text-siran-800',
  reservado: 'bg-amber-100 text-amber-800',
  vendido: 'bg-red-100 text-red-700',
  indisponivel: 'bg-stone-200 text-stone-600',
};
const LABEL_STAND: Record<Stand['status'], string> = {
  disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', indisponivel: 'Indisponível',
};

/* ══ STANDS ══════════════════════════════════════════════════════ */

function AbaStands() {
  const [stands, setStands] = useState<Stand[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [editando, setEditando] = useState<Stand | 'novo' | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api<Stand[]>('/api/stands'),
        api<Categoria[]>('/api/categorias'),
      ]);
      setStands(s); setCategorias(c); setErro('');
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(s: Stand, status: 'disponivel' | 'indisponivel') {
    try {
      await api(`/api/stands/${s.id}/status`, { method: 'PUT', json: { status } });
      carregar();
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }

  async function excluir(s: Stand) {
    if (!confirm(`Excluir o stand ${s.codigo}? Esta ação não pode ser desfeita.`)) return;
    try { await api(`/api/stands/${s.id}`, { method: 'DELETE' }); carregar(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }

  const acoes = (s: Stand) => (
    <>
      <BotaoIcone onClick={() => setEditando(s)} titulo="Editar"><Pencil size={17} /></BotaoIcone>
      {s.status === 'disponivel' && (
        <BotaoIcone onClick={() => mudarStatus(s, 'indisponivel')} titulo="Marcar indisponível"><Ban size={17} /></BotaoIcone>
      )}
      {s.status === 'indisponivel' && (
        <BotaoIcone onClick={() => mudarStatus(s, 'disponivel')} titulo="Tornar disponível" cor="verde"><Undo2 size={17} /></BotaoIcone>
      )}
      <BotaoIcone onClick={() => excluir(s)} titulo="Excluir" cor="vermelho"><Trash2 size={17} /></BotaoIcone>
    </>
  );

  return (
    <section>
      <Cabecalho
        titulo={`Stands (${stands.length})`}
        acao={<Botao onClick={() => setEditando('novo')}><Plus size={17} /> Novo</Botao>}
      />
      {erro && <div className="mb-4"><Erro>{erro}</Erro></div>}

      {/* Celular: cards */}
      <div className="space-y-2.5 sm:hidden">
        {stands.map(s => (
          <div key={s.id} className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-900">{s.codigo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_STAND[s.status]}`}>
                    {LABEL_STAND[s.status]}
                  </span>
                </div>
                <div className="truncate text-sm text-stone-600">{s.nome}</div>
                <div className="mt-0.5 text-xs text-stone-500">
                  {[s.categoria, s.tamanho].filter(Boolean).join(' · ') || 'Sem cota'}
                </div>
                <div className="text-sm font-semibold text-siran-700">{formatPreco(s.preco)}</div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-0.5">{acoes(s)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Cota</th>
              <th className="px-4 py-3">Tamanho</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {stands.map(s => (
              <tr key={s.id} className="border-t border-stone-100">
                <td className="px-4 py-2 font-semibold">{s.codigo}</td>
                <td className="px-4 py-2">{s.nome}</td>
                <td className="px-4 py-2">{s.categoria || '—'}</td>
                <td className="px-4 py-2">{s.tamanho || '—'}</td>
                <td className="px-4 py-2">{formatPreco(s.preco)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_STAND[s.status]}`}>
                    {LABEL_STAND[s.status]}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-0.5">{acoes(s)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <StandForm
          stand={editando === 'novo' ? null : editando}
          categorias={categorias}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}
    </section>
  );
}

function StandForm({ stand, categorias, onFechar, onSalvo }: {
  stand: Stand | null;
  categorias: Categoria[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [f, setF] = useState({
    codigo: stand?.codigo ?? '',
    nome: stand?.nome ?? '',
    descricao: stand?.descricao ?? '',
    categoria_id: stand?.categoria_id ? String(stand.categoria_id) : '',
    // Só o valor próprio do stand — vazio significa "herda da cota"
    tamanho: stand?.tamanho_proprio ?? '',
    preco: stand?.preco_proprio != null ? String(stand.preco_proprio) : '',
    ordem: stand ? String(stand.ordem) : '0',
  });
  const [imagem, setImagem] = useState<File | null>(null);
  const [removerImagem, setRemoverImagem] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const cota = categorias.find(c => String(c.id) === f.categoria_id);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      if (imagem) fd.append('imagem', imagem);
      if (removerImagem) fd.append('remover_imagem', '1');

      const res = await fetch(stand ? `/api/stands/${stand.id}` : '/api/stands', {
        method: stand ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${getSessao()?.token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
      setCarregando(false);
    }
  }

  return (
    <Modal titulo={stand ? `Editar ${stand.codigo}` : 'Novo stand'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código *">
            <Input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} required autoCapitalize="characters" />
          </Campo>
          <Campo label="Ordem">
            <Input type="number" inputMode="numeric" value={f.ordem} onChange={e => setF({ ...f, ordem: e.target.value })} />
          </Campo>
        </div>

        <Campo label="Nome *">
          <Input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} required />
        </Campo>

        <Campo label="Cota">
          <Select value={f.categoria_id} onChange={e => setF({ ...f, categoria_id: e.target.value })}>
            <option value="">Sem cota</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </Campo>

        <Campo label="Descrição do stand">
          <Textarea
            value={f.descricao}
            onChange={e => setF({ ...f, descricao: e.target.value })}
            rows={2}
            placeholder="Detalhe específico deste stand (localização, esquina…)"
          />
        </Campo>

        <div className="rounded-xl bg-stone-50 p-3">
          <p className="mb-2.5 text-xs text-stone-500">
            Preço e tamanho vêm da cota. Preencha abaixo só para <strong>sobrescrever</strong> neste stand.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tamanho próprio" hint={cota?.tamanho ? `Cota: ${cota.tamanho}` : undefined}>
              <Input value={f.tamanho} onChange={e => setF({ ...f, tamanho: e.target.value })} placeholder="herdado" />
            </Campo>
            <Campo label="Preço próprio (R$)" hint={cota?.preco != null ? `Cota: ${formatPreco(cota.preco)}` : undefined}>
              <Input
                type="number" inputMode="decimal" step="0.01"
                value={f.preco} onChange={e => setF({ ...f, preco: e.target.value })}
                placeholder="herdado"
              />
            </Campo>
          </div>
        </div>

        <Campo label="Imagem / planta" hint="JPG, PNG, WEBP, SVG ou PDF — até 10 MB">
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf"
            onChange={e => setImagem(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-stone-600 file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-siran-100 file:px-4 file:font-medium file:text-siran-700"
          />
        </Campo>
        {stand?.imagem_url && !imagem && (
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={removerImagem} onChange={e => setRemoverImagem(e.target.checked)} className="h-5 w-5 accent-red-600" />
            Remover imagem atual
          </label>
        )}

        {erro && <Erro>{erro}</Erro>}

        <Botao type="submit" disabled={carregando} className="w-full">
          <Save size={17} /> {carregando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </form>
    </Modal>
  );
}

/* ══ COTAS ═══════════════════════════════════════════════════════ */

function AbaCotas() {
  const [cotas, setCotas] = useState<Categoria[]>([]);
  const [editando, setEditando] = useState<Categoria | 'nova' | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setCotas(await api<Categoria[]>('/api/categorias')); setErro(''); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(c: Categoria) {
    if (!confirm(`Excluir a cota ${c.nome}?`)) return;
    try { await api(`/api/categorias/${c.id}`, { method: 'DELETE' }); carregar(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }

  return (
    <section>
      <Cabecalho
        titulo={`Cotas (${cotas.length})`}
        acao={<Botao onClick={() => setEditando('nova')}><Plus size={17} /> Nova</Botao>}
      />
      {erro && <div className="mb-4"><Erro>{erro}</Erro></div>}

      <div className="grid gap-3 sm:grid-cols-2">
        {cotas.map(c => {
          const incompleta = c.preco == null || !c.beneficios;
          return (
            <div key={c.id} className={`rounded-xl border bg-white p-4 shadow-sm ${incompleta ? 'border-amber-300' : 'border-stone-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-stone-900">
                    <Tag size={15} className="shrink-0 text-siran-600" /> {c.nome}
                  </div>
                  <div className="mt-0.5 text-sm text-stone-600">{c.tamanho || 'tamanho não definido'}</div>
                  <div className="text-lg font-bold text-siran-700">{formatPreco(c.preco)}</div>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <BotaoIcone onClick={() => setEditando(c)} titulo="Editar"><Pencil size={17} /></BotaoIcone>
                  <BotaoIcone onClick={() => excluir(c)} titulo="Excluir" cor="vermelho"><Trash2 size={17} /></BotaoIcone>
                </div>
              </div>

              <div className="mt-2 text-xs text-stone-500">
                {c.total_stands ?? 0} stand(s) · {c.disponiveis ?? 0} disponível(is)
              </div>

              {incompleta && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Faltam dados nesta cota (preço e/ou benefícios).
                </p>
              )}
            </div>
          );
        })}
      </div>

      {editando && (
        <CotaForm
          cota={editando === 'nova' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}
    </section>
  );
}

function CotaForm({ cota, onFechar, onSalvo }: {
  cota: Categoria | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [f, setF] = useState({
    nome: cota?.nome ?? '',
    preco: cota?.preco != null ? String(cota.preco) : '',
    tamanho: cota?.tamanho ?? '',
    descricao: cota?.descricao ?? '',
    beneficios: cota?.beneficios ?? '',
    ordem: cota ? String(cota.ordem) : '0',
  });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      await api(cota ? `/api/categorias/${cota.id}` : '/api/categorias', {
        method: cota ? 'PUT' : 'POST',
        json: f,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
      setCarregando(false);
    }
  }

  return (
    <Modal titulo={cota ? `Editar cota ${cota.nome}` : 'Nova cota'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-3.5">
        <Campo label="Nome da cota *">
          <Input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} required placeholder="Semeadura" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Preço (R$)">
            <Input type="number" inputMode="decimal" step="0.01" value={f.preco} onChange={e => setF({ ...f, preco: e.target.value })} />
          </Campo>
          <Campo label="Ordem">
            <Input type="number" inputMode="numeric" value={f.ordem} onChange={e => setF({ ...f, ordem: e.target.value })} />
          </Campo>
        </div>

        <Campo label="Tamanho">
          <Input value={f.tamanho} onChange={e => setF({ ...f, tamanho: e.target.value })} placeholder="18m² (9m² stand / 9m² exposição)" />
        </Campo>

        <Campo label="Descrição curta" hint="Aparece abaixo do nome da cota">
          <Textarea value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} rows={2} />
        </Campo>

        <Campo label="Benefícios" hint="Um por linha. Linhas em MAIÚSCULAS funcionam como título de seção.">
          <Textarea
            value={f.beneficios}
            onChange={e => setF({ ...f, beneficios: e.target.value })}
            rows={10}
            placeholder={'1 credencial de almoço\nAcesso a dados\n\nMÍDIA E COMUNICAÇÃO\n1 post de design divulgando a participação'}
          />
        </Campo>

        {erro && <Erro>{erro}</Erro>}

        <Botao type="submit" disabled={carregando} className="w-full">
          <Save size={17} /> {carregando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </form>
    </Modal>
  );
}

/* ══ VENDEDORES ══════════════════════════════════════════════════ */

function AbaVendedores() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setUsuarios(await api<Usuario[]>('/api/auth/users')); setErro(''); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(u: Usuario) {
    if (!confirm(`Excluir o usuário ${u.nome}?`)) return;
    try { await api(`/api/auth/users/${u.id}`, { method: 'DELETE' }); carregar(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }

  return (
    <section>
      <Cabecalho
        titulo={`Usuários (${usuarios.length})`}
        acao={<Botao onClick={() => setEditando('novo')}><Plus size={17} /> Novo</Botao>}
      />
      {erro && <div className="mb-4"><Erro>{erro}</Erro></div>}

      <div className="space-y-2.5">
        {usuarios.map(u => (
          <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-stone-900">{u.nome}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  u.ativo ? 'bg-siran-100 text-siran-800' : 'bg-stone-200 text-stone-600'
                }`}>
                  {u.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="truncate text-sm text-stone-500">
                {u.username} · {u.role === 'master' ? 'Administrador' : 'Vendedor'}
              </div>
              {(u.email || u.telefone) && (
                <div className="truncate text-xs text-stone-400">
                  {[u.email, u.telefone].filter(Boolean).join(' · ')}
                </div>
              )}
              {!u.email && !u.telefone && (
                <div className="text-xs text-amber-600">Sem contato — não recebe notificações</div>
              )}
            </div>
            <div className="flex shrink-0 gap-0.5">
              <BotaoIcone onClick={() => setEditando(u)} titulo="Editar"><Pencil size={17} /></BotaoIcone>
              <BotaoIcone onClick={() => excluir(u)} titulo="Excluir" cor="vermelho"><Trash2 size={17} /></BotaoIcone>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <UsuarioForm
          usuario={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}
    </section>
  );
}

function UsuarioForm({ usuario, onFechar, onSalvo }: {
  usuario: Usuario | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [f, setF] = useState({
    nome: usuario?.nome ?? '',
    username: usuario?.username ?? '',
    email: usuario?.email ?? '',
    telefone: usuario?.telefone ?? '',
    password: '',
    role: usuario?.role ?? 'vendedor',
  });
  const [ativo, setAtivo] = useState(usuario ? !!usuario.ativo : true);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      await api(usuario ? `/api/auth/users/${usuario.id}` : '/api/auth/users', {
        method: usuario ? 'PUT' : 'POST',
        json: usuario
          ? { ...f, password: f.password || undefined, ativo }
          : f,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
      setCarregando(false);
    }
  }

  return (
    <Modal titulo={usuario ? `Editar ${usuario.nome}` : 'Novo usuário'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-3.5">
        <Campo label="Nome completo *">
          <Input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} required autoComplete="name" />
        </Campo>
        <Campo label="Usuário (login) *">
          <Input
            value={f.username}
            onChange={e => setF({ ...f, username: e.target.value })}
            required
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Campo>
        <Campo label="E-mail" hint="Recebe as notificações de reserva deste vendedor">
          <Input
            type="email"
            inputMode="email"
            value={f.email}
            onChange={e => setF({ ...f, email: e.target.value })}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
          />
        </Campo>
        <Campo label="WhatsApp" hint="Com DDD. Ex: (17) 99999-8888">
          <Input
            type="tel"
            inputMode="tel"
            value={f.telefone}
            onChange={e => setF({ ...f, telefone: e.target.value })}
            autoComplete="tel"
          />
        </Campo>
        <Campo label={usuario ? 'Nova senha' : 'Senha *'} hint={usuario ? 'Deixe em branco para manter a atual' : undefined}>
          <Input
            type="password"
            value={f.password}
            onChange={e => setF({ ...f, password: e.target.value })}
            required={!usuario}
            autoComplete="new-password"
          />
        </Campo>
        <Campo label="Perfil">
          <Select value={f.role} onChange={e => setF({ ...f, role: e.target.value as 'master' | 'vendedor' })}>
            <option value="vendedor">Vendedor</option>
            <option value="master">Administrador</option>
          </Select>
        </Campo>
        {usuario && (
          <label className="flex min-h-[44px] items-center gap-2.5 text-sm text-stone-700">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="h-5 w-5 accent-siran-600" />
            Usuário ativo (pode entrar no sistema)
          </label>
        )}

        {erro && <Erro>{erro}</Erro>}

        <Botao type="submit" disabled={carregando} className="w-full">
          <Save size={17} /> {carregando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </form>
    </Modal>
  );
}

/* ══ RESERVAS ════════════════════════════════════════════════════ */

const BADGE_RESERVA: Record<Reserva['status'], string> = {
  ativa: 'bg-amber-100 text-amber-800',
  confirmada: 'bg-siran-100 text-siran-800',
  expirada: 'bg-stone-200 text-stone-600',
  cancelada: 'bg-red-100 text-red-700',
};
const LABEL_RESERVA: Record<Reserva['status'], string> = {
  ativa: 'Aguardando confirmação', confirmada: 'Confirmada', expirada: 'Expirada', cancelada: 'Cancelada',
};

function AbaReservas() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [aberta, setAberta] = useState<number | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setReservas(await api<Reserva[]>('/api/reservas')); setErro(''); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function acaoReserva(r: Reserva, acao: 'confirmar' | 'cancelar') {
    // Ambas mexem no estado do stand e disparam aviso externo: confirmar antes
    const pergunta = acao === 'cancelar'
      ? `Cancelar a reserva do stand ${r.stand_codigo}?\n\nO stand volta a ficar disponível para todos os vendedores.`
      : `Fechar a VENDA do stand ${r.stand_codigo}?\n\nCliente: ${r.cliente_nome}\nVendedor: ${r.vendedor_nome}\n\n` +
        `O stand passa para "vendido" e um aviso de venda confirmada é enviado por e-mail e WhatsApp.`;
    if (!confirm(pergunta)) return;

    try { await api(`/api/reservas/${r.id}/${acao}`, { method: 'POST' }); carregar(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }

  return (
    <section>
      <Cabecalho titulo={`Reservas (${reservas.length})`} />
      {erro && <div className="mb-4"><Erro>{erro}</Erro></div>}

      <div className="space-y-2.5">
        {reservas.map(r => (
          <div key={r.id} className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-stone-900">{r.stand_codigo}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_RESERVA[r.status]}`}>
                {LABEL_RESERVA[r.status]}
              </span>
            </div>

            <div className="mt-1.5 text-sm text-stone-700">
              {r.cliente_nome}
              {r.cliente_empresa && <span className="text-stone-500"> · {r.cliente_empresa}</span>}
            </div>
            {r.cliente_contato && (
              <a href={`tel:${r.cliente_contato.replace(/\D/g, '')}`} className="text-sm text-siran-700 underline">
                {r.cliente_contato}
              </a>
            )}

            <div className="mt-1.5 text-xs text-stone-500">
              Vendedor: {r.vendedor_nome} · criada em {formatDataHora(r.criada_em)}
              {r.status === 'ativa' && ` · expira em ${formatDataHora(r.expira_em)}`}
            </div>

            {r.observacoes && (
              <p className="mt-1.5 text-sm text-stone-600">{r.observacoes}</p>
            )}

            <button
              onClick={() => setAberta(aberta === r.id ? null : r.id)}
              className="mt-2 flex min-h-[36px] items-center gap-1.5 text-sm font-medium text-siran-700"
            >
              <Paperclip size={14} /> Documentos {aberta === r.id ? '−' : '+'}
            </button>
            {aberta === r.id && (
              <div className="mt-2 border-t border-stone-100 pt-3">
                <ListaAnexos reservaId={r.id} podeEditar />
              </div>
            )}

            {['ativa', 'confirmada'].includes(r.status) && (
              <div className="mt-3 flex gap-2">
                {r.status === 'ativa' && (
                  <Botao onClick={() => acaoReserva(r, 'confirmar')} className="flex-1 text-sm">Fechar venda</Botao>
                )}
                <Botao variante="perigo" onClick={() => acaoReserva(r, 'cancelar')} className="flex-1 text-sm">Cancelar</Botao>
              </div>
            )}
          </div>
        ))}
      </div>

      {reservas.length === 0 && (
        <p className="py-10 text-center text-sm text-stone-500">Nenhuma reserva registrada ainda.</p>
      )}
    </section>
  );
}

/* ══ AJUSTES ═════════════════════════════════════════════════════ */

function AbaConfig() {
  const [cfg, setCfg] = useState<ConfigSistema | null>(null);
  const [horas, setHoras] = useState('');
  const [emails, setEmails] = useState('');
  const [zaps, setZaps] = useState('');
  const [log, setLog] = useState<LogNotificacao[]>([]);
  const [verLog, setVerLog] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<ConfigSistema>('/api/reservas/config')
      .then(d => {
        setCfg(d);
        setHoras(String(d.reserva_horas));
        setEmails(d.notif_emails ?? '');
        setZaps(d.notif_whatsapps ?? '');
      })
      .catch(() => setErro('Erro ao carregar configuração'));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg(''); setErro('');
    try {
      await api('/api/reservas/config', {
        method: 'PUT',
        json: { reserva_horas: Number(horas), notif_emails: emails, notif_whatsapps: zaps },
      });
      setMsg('Configurações salvas.');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  async function carregarLog() {
    setVerLog(true);
    try { setLog(await api<LogNotificacao[]>('/api/reservas/notificacoes/log')); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }

  return (
    <section className="max-w-2xl space-y-4">
      <Cabecalho titulo="Ajustes" />

      <form onSubmit={salvar} className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <Campo
            label="Prazo para confirmar uma reserva (horas)"
            hint="Sem confirmação dentro do prazo, a reserva expira e o stand volta a ficar disponível automaticamente."
          >
            <Input type="number" inputMode="numeric" min={1} max={720} value={horas} onChange={e => setHoras(e.target.value)} />
          </Campo>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 font-semibold text-stone-900">Notificações de reserva</h3>
          <p className="mb-3 text-sm text-stone-500">
            Enviadas quando um stand é reservado e quando a venda é confirmada.
            O vendedor da reserva é sempre avisado, usando o contato do cadastro dele.
          </p>

          {/* Estado real dos canais: sem credenciais no .env não sai nada */}
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${
              cfg?.canais.email ? 'bg-siran-100 text-siran-800' : 'bg-stone-200 text-stone-600'
            }`}>
              E-mail: {cfg?.canais.email ? 'configurado' : 'desligado'}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${
              cfg?.canais.whatsapp ? 'bg-siran-100 text-siran-800' : 'bg-stone-200 text-stone-600'
            }`}>
              WhatsApp: {cfg?.canais.whatsapp ? `via ${cfg.canais.whatsapp_provider}` : 'desligado'}
            </span>
          </div>

          {cfg && (!cfg.canais.email || !cfg.canais.whatsapp) && (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Canal desligado significa que faltam credenciais no arquivo <code>.env</code> do
              servidor. Os destinatários abaixo já podem ser cadastrados — passam a receber assim
              que as credenciais forem preenchidas.
            </p>
          )}

          <div className="space-y-3.5">
            <Campo label="E-mails que recebem cópia" hint="Separe por vírgula ou quebra de linha.">
              <Textarea
                value={emails}
                onChange={e => setEmails(e.target.value)}
                rows={2}
                placeholder="diretoria@siran.com.br, comercial@siran.com.br"
                autoCapitalize="none"
              />
            </Campo>
            <Campo label="WhatsApps que recebem cópia" hint="Com DDD, separados por vírgula.">
              <Textarea
                value={zaps}
                onChange={e => setZaps(e.target.value)}
                rows={2}
                placeholder="(17) 99999-8888, (11) 98888-7777"
              />
            </Campo>
          </div>
        </div>

        <Botao type="submit" className="w-full"><Save size={17} /> Salvar configurações</Botao>

        {msg && <p className="rounded-xl bg-siran-50 px-4 py-3 text-sm text-siran-800">{msg}</p>}
        {erro && <Erro>{erro}</Erro>}
      </form>

      {/* Diagnóstico: envio roda em segundo plano, então sem histórico
          fica impossível saber por que uma notificação não chegou */}
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <button
          onClick={() => (verLog ? setVerLog(false) : carregarLog())}
          className="flex min-h-[40px] w-full items-center justify-between font-semibold text-stone-900"
        >
          Histórico de envios <span className="text-stone-400">{verLog ? '−' : '+'}</span>
        </button>

        {verLog && (
          <div className="mt-3 space-y-2">
            {log.length === 0 && <p className="text-sm text-stone-500">Nenhum envio registrado ainda.</p>}
            {log.map(l => (
              <div key={l.id} className="flex items-start gap-2 border-t border-stone-100 pt-2 text-sm">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  l.status === 'enviado' ? 'bg-siran-500' : 'bg-red-500'
                }`} />
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{l.canal === 'email' ? 'E-mail' : 'WhatsApp'}</span>
                    {' → '}{l.destino}
                    {l.stand_codigo && <span className="text-stone-500"> · {l.stand_codigo}</span>}
                  </div>
                  <div className="text-xs text-stone-400">{formatDataHora(l.enviado_em)}</div>
                  {l.erro && <div className="mt-0.5 text-xs text-red-600">{l.erro}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
