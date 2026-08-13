import { useCallback, useEffect, useState } from 'react';
import { Paperclip, Download, Trash2, FileText, Image as ImageIcon, X } from 'lucide-react';
import type { Anexo } from '../types';
import { api, getSessao, baixarAnexo, formatTamanho } from '../lib/api';
import { Erro } from './ui';

export const ACEITA_ANEXOS =
  '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods,.rtf';

function Icone({ mime, nome }: { mime: string | null; nome: string }) {
  const ehImagem = mime?.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(nome);
  return ehImagem
    ? <ImageIcon size={17} className="shrink-0 text-stone-400" />
    : <FileText size={17} className="shrink-0 text-stone-400" />;
}

/* Envia os arquivos de uma reserva já existente. Usado tanto na tela
   do vendedor quanto no painel admin. */
export async function enviarAnexos(reservaId: number, arquivos: File[]) {
  if (!arquivos.length) return;
  const fd = new FormData();
  arquivos.forEach(f => fd.append('arquivos', f));

  const res = await fetch(`/api/reservas/${reservaId}/anexos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getSessao()?.token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao enviar os documentos');
}

/* ── Seletor de arquivos (antes da reserva existir) ───────────── */
export function SeletorArquivos({ arquivos, onChange }: {
  arquivos: File[];
  onChange: (a: File[]) => void;
}) {
  return (
    <div>
      <label className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 px-4 text-sm font-medium text-stone-600 active:bg-stone-50">
        <Paperclip size={17} />
        {arquivos.length ? 'Adicionar mais documentos' : 'Anexar documentos'}
        <input
          type="file"
          multiple
          accept={ACEITA_ANEXOS}
          onChange={e => {
            onChange([...arquivos, ...Array.from(e.target.files ?? [])]);
            e.target.value = ''; // permite escolher o mesmo arquivo de novo
          }}
          className="hidden"
        />
      </label>

      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm">
              <Icone mime={f.type} nome={f.name} />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-stone-500">{formatTamanho(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(arquivos.filter((_, j) => j !== i))}
                aria-label={`Remover ${f.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 active:bg-stone-200"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-xs text-stone-500">
        Fotos, PDF, Word, Excel, PowerPoint ou TXT — até 15 MB cada, 10 por envio.
      </p>
    </div>
  );
}

/* ── Lista de anexos de uma reserva existente ─────────────────── */
export default function ListaAnexos({ reservaId, podeEditar }: {
  reservaId: number;
  podeEditar: boolean;
}) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try { setAnexos(await api<Anexo[]>(`/api/reservas/${reservaId}/anexos`)); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
  }, [reservaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar(lista: FileList | null) {
    if (!lista?.length) return;
    setErro('');
    setEnviando(true);
    try {
      await enviarAnexos(reservaId, Array.from(lista));
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar');
    } finally {
      setEnviando(false);
    }
  }

  async function baixar(a: Anexo) {
    setErro('');
    try { await baixarAnexo(a.id, a.nome_original); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro ao baixar'); }
  }

  async function excluir(a: Anexo) {
    if (!confirm(`Excluir o documento "${a.nome_original}"?`)) return;
    setErro('');
    try { await api(`/api/reservas/anexos/${a.id}`, { method: 'DELETE' }); await carregar(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro ao excluir'); }
  }

  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
        <Paperclip size={15} /> Documentos {anexos.length > 0 && `(${anexos.length})`}
      </h4>

      {erro && <div className="mb-2"><Erro>{erro}</Erro></div>}

      {anexos.length === 0 && <p className="mb-2 text-sm text-stone-500">Nenhum documento anexado.</p>}

      <ul className="space-y-1.5">
        {anexos.map(a => (
          <li key={a.id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <Icone mime={a.mime} nome={a.nome_original} />
            <button
              onClick={() => baixar(a)}
              className="min-w-0 flex-1 truncate text-left text-siran-700 underline-offset-2 active:underline"
            >
              {a.nome_original}
            </button>
            <span className="shrink-0 text-xs text-stone-500">{formatTamanho(a.tamanho)}</span>
            <button
              onClick={() => baixar(a)}
              aria-label={`Baixar ${a.nome_original}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 active:bg-stone-100"
            >
              <Download size={16} />
            </button>
            {podeEditar && (
              <button
                onClick={() => excluir(a)}
                aria-label={`Excluir ${a.nome_original}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 active:bg-red-50"
              >
                <Trash2 size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {podeEditar && (
        <label className="mt-2.5 flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 px-4 text-sm font-medium text-stone-600 active:bg-stone-50">
          <Paperclip size={16} />
          {enviando ? 'Enviando…' : 'Anexar documentos'}
          <input
            type="file"
            multiple
            accept={ACEITA_ANEXOS}
            disabled={enviando}
            onChange={e => { adicionar(e.target.files); e.target.value = ''; }}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
