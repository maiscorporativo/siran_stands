import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Campo, Input, Botao, Erro } from './ui';
import CampoAssinatura from './CampoAssinatura';
import { formatPreco } from '../lib/api';

export interface DocumentoParaAssinar {
  hash: string;
  stand_codigo: string;
  cota: string | null;
  valor: number | null;
  razao_social: string | null;
  representante_nome: string | null;
  representante_cpf: string | null;
  representante_cargo: string | null;
  vendedor_nome?: string;
  codigo_enviado_para?: string | null;
}

/* ── Tela de assinatura ───────────────────────────────────────────
   Serve aos dois fluxos: presencial (o vendedor passa o aparelho e
   não há código) e remoto (o signatário abriu o link e confirma com
   o código recebido). A diferença é só a presença de `pedirCodigo`. */
export default function TelaAssinatura({
  doc, pedirCodigo = false, onAssinar, onReenviarCodigo, urlContrato, erroExterno,
}: {
  doc: DocumentoParaAssinar;
  pedirCodigo?: boolean;
  urlContrato: string;
  onAssinar: (dados: {
    nome: string; cpf: string; cargo: string;
    traco: string; codigo?: string; geolocalizacao?: string;
  }) => Promise<void>;
  onReenviarCodigo?: () => Promise<void>;
  erroExterno?: string;
}) {
  const [nome, setNome] = useState(doc.representante_nome ?? '');
  const [cpf, setCpf] = useState(doc.representante_cpf ?? '');
  const [cargo, setCargo] = useState(doc.representante_cargo ?? '');
  const [codigo, setCodigo] = useState('');
  const [traco, setTraco] = useState<string | null>(null);
  const [leu, setLeu] = useState(false);
  const [aceita, setAceita] = useState(false);
  const [local, setLocal] = useState<string | undefined>();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  /* A localização é opcional e só entra se a pessoa permitir — sem
     ela a assinatura vale igual, apenas com uma evidência a menos. */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => setLocal(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`),
      () => {},
      { timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!traco) return setErro('Assine no campo indicado antes de continuar.');
    if (pedirCodigo && codigo.trim().length < 4) return setErro('Digite o código que você recebeu.');

    setEnviando(true);
    try {
      await onAssinar({ nome, cpf, cargo, traco, codigo: codigo.trim(), geolocalizacao: local });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível registrar a assinatura.');
      setEnviando(false);
    }
  }

  const pronto = Boolean(nome.trim() && traco && leu && aceita && (!pedirCodigo || codigo.trim()));

  return (
    <form onSubmit={enviar} className="space-y-4">
      {/* Resumo do que está sendo assinado */}
      <div className="rounded-xl border border-siran-200 bg-siran-50 p-4">
        <h3 className="text-sm font-bold text-siran-900">
          Stand {doc.stand_codigo}{doc.cota ? ` — Cota ${doc.cota}` : ''}
        </h3>
        {doc.razao_social && <p className="mt-0.5 text-sm text-siran-800">{doc.razao_social}</p>}
        {doc.valor != null && (
          <p className="mt-1 text-lg font-bold text-siran-900">{formatPreco(doc.valor)}</p>
        )}
        {doc.vendedor_nome && (
          <p className="mt-1 text-xs text-siran-700">Enviado por {doc.vendedor_nome}</p>
        )}
      </div>

      <a
        href={urlContrato}
        target="_blank"
        rel="noreferrer"
        onClick={() => setLeu(true)}
        className="flex min-h-[52px] items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-4 font-medium text-stone-800 active:bg-stone-50"
      >
        <FileText size={19} className="shrink-0 text-siran-700" />
        <span className="flex-1">Ler o contrato completo</span>
        {leu && <CheckCircle2 size={18} className="shrink-0 text-siran-600" />}
      </a>

      <div className="space-y-3.5 rounded-xl border border-stone-200 p-4">
        <h3 className="text-sm font-semibold text-stone-800">Quem está assinando</h3>
        <Campo label="Nome completo *">
          <Input value={nome} onChange={e => setNome(e.target.value)} required autoComplete="name" />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="CPF">
            <Input value={cpf} onChange={e => setCpf(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" />
          </Campo>
          <Campo label="Cargo">
            <Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Diretor" />
          </Campo>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-stone-800">Sua assinatura</h3>
        <CampoAssinatura onChange={setTraco} />
      </div>

      {pedirCodigo && (
        <div className="space-y-2 rounded-xl border border-stone-200 p-4">
          <h3 className="text-sm font-semibold text-stone-800">Código de confirmação</h3>
          <p className="text-xs text-stone-500">
            Enviamos um código para {doc.codigo_enviado_para || 'seu contato'}.
          </p>
          <Input
            value={codigo}
            onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="text-center text-2xl font-bold tracking-[0.5em]"
          />
          {onReenviarCodigo && (
            <button
              type="button"
              onClick={async () => {
                setErro('');
                try { await onReenviarCodigo(); setReenviado(true); }
                catch (err) { setErro(err instanceof Error ? err.message : 'Falha ao reenviar'); }
              }}
              className="min-h-[38px] text-sm text-siran-700 underline underline-offset-2"
            >
              {reenviado ? 'Código reenviado' : 'Não recebi o código'}
            </button>
          )}
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-stone-100 p-4 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={aceita}
          onChange={e => setAceita(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-siran-600"
        />
        <span>
          Li o contrato e concordo com seus termos. Reconheço esta assinatura eletrônica como
          válida, nos termos do art. 10, §2º da MP 2.200-2/2001.
        </span>
      </label>

      {(erro || erroExterno) && <Erro>{erro || erroExterno}</Erro>}

      <Botao type="submit" disabled={!pronto || enviando} className="w-full">
        <ShieldCheck size={18} /> {enviando ? 'Registrando assinatura…' : 'Assinar contrato'}
      </Botao>

      <p className="flex items-start gap-1.5 text-xs text-stone-500">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        Serão registrados data, hora, endereço IP, dispositivo e um código de verificação do
        documento, para comprovar a autenticidade da assinatura.
      </p>
    </form>
  );
}
