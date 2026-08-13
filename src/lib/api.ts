import type { Sessao } from '../types';

const KEY = 'siran_sessao';

export function getSessao(): Sessao | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Sessao) : null;
  } catch {
    return null;
  }
}

export function setSessao(s: Sessao | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

/* ── Wrapper de fetch com token e tratamento de erro ──────────── */
export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, ...rest } = options;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };

  const sessao = getSessao();
  if (sessao) headers.Authorization = `Bearer ${sessao.token}`;
  if (json !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (res.status === 401) {
    // Sessão expirou no servidor — força novo login
    setSessao(null);
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  return data as T;
}

export function formatPreco(v: number | string | null): string {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTamanho(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ── Baixa um arquivo protegido por sessão ────────────────────────
   O link não pode ser um <a href> direto: a rota exige o header de
   autorização, então buscamos com fetch e salvamos o blob. */
export async function baixarAnexo(id: number, nome: string) {
  const sessao = getSessao();
  const res = await fetch(`/api/reservas/anexos/${id}`, {
    headers: sessao ? { Authorization: `Bearer ${sessao.token}` } : {},
  });
  if (!res.ok) throw new Error('Não foi possível baixar o arquivo');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── Baixa a proposta/contrato em PDF de uma reserva ──────────── */
export async function baixarContrato(reservaId: number, standCodigo: string) {
  const sessao = getSessao();
  const res = await fetch(`/api/reservas/${reservaId}/contrato`, {
    headers: sessao ? { Authorization: `Bearer ${sessao.token}` } : {},
  });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error((erro as { error?: string }).error || 'Não foi possível gerar o documento');
  }

  // O nome vem no Content-Disposition; cai para um padrão se não vier
  const cd = res.headers.get('content-disposition') ?? '';
  const nome = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1];

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome ? decodeURIComponent(nome) : `Proposta-${standCodigo}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── Tempo restante até expirar (ex: "23h 15min") ─────────────── */
export function tempoRestante(expiraEm: string): string {
  const ms = new Date(expiraEm).getTime() - Date.now();
  if (ms <= 0) return 'expirada';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return h > 0 ? `${h}h ${min}min` : `${min}min`;
}
