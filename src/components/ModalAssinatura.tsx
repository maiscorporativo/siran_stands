import { useEffect, useState } from 'react';
import { CheckCircle2, Send, PenLine, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import TelaAssinatura from './TelaAssinatura';
import type { DocumentoParaAssinar } from './TelaAssinatura';
import { Botao, Erro } from './ui';
import { api } from '../lib/api';

type Etapa = 'escolha' | 'presencial' | 'enviado' | 'pronto';

/* ── Coleta da assinatura pelo vendedor ───────────────────────────
   Dois caminhos: passar o aparelho para o cliente assinar ali mesmo,
   ou mandar o link para ele assinar de onde estiver. */
export default function ModalAssinatura({ reservaId, standCodigo, onFechar, onAssinado }: {
  reservaId: number;
  standCodigo: string;
  onFechar: () => void;
  onAssinado: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('escolha');
  const [doc, setDoc] = useState<DocumentoParaAssinar | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [destinoEnvio, setDestinoEnvio] = useState('');
  const [hash, setHash] = useState('');

  useEffect(() => {
    api<DocumentoParaAssinar>(`/api/assinaturas/${reservaId}/preparar`)
      .then(setDoc)
      .catch(err => setErro(err instanceof Error ? err.message : 'Erro ao preparar o documento'));
  }, [reservaId]);

  async function enviarLink(via: 'whatsapp' | 'email') {
    setErro('');
    setEnviando(true);
    try {
      const r = await api<{ destino: string }>(`/api/assinaturas/${reservaId}/enviar-link`, {
        method: 'POST',
        json: { via },
      });
      setDestinoEnvio(r.destino);
      setEtapa('enviado');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar o link');
    } finally {
      setEnviando(false);
    }
  }

  async function assinarPresencial(dados: Parameters<Parameters<typeof TelaAssinatura>[0]['onAssinar']>[0]) {
    const r = await api<{ hash: string }>(`/api/assinaturas/${reservaId}/presencial`, {
      method: 'POST',
      json: { ...dados, hash_documento: doc?.hash },
    });
    setHash(r.hash);
    setEtapa('pronto');
  }

  const titulo =
    etapa === 'presencial' ? `Assinatura — Stand ${standCodigo}` :
    etapa === 'pronto' ? 'Contrato assinado' :
    `Assinar contrato — Stand ${standCodigo}`;

  return (
    <Modal titulo={titulo} onFechar={etapa === 'pronto' ? onAssinado : onFechar}>
      {erro && <div className="mb-4"><Erro>{erro}</Erro></div>}

      {etapa === 'escolha' && (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            Como o cliente vai assinar o contrato?
          </p>

          <button
            onClick={() => setEtapa('presencial')}
            disabled={!doc}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-siran-300 bg-siran-50 p-4 text-left active:bg-siran-100 disabled:opacity-50"
          >
            <PenLine size={22} className="mt-0.5 shrink-0 text-siran-700" />
            <span>
              <span className="block font-semibold text-siran-900">Aqui, neste aparelho</span>
              <span className="mt-0.5 block text-sm text-siran-800">
                Passe o celular ou tablet para o cliente assinar na tela agora.
              </span>
            </span>
          </button>

          <div className="rounded-xl border border-stone-200 p-4">
            <div className="flex items-start gap-3">
              <Send size={20} className="mt-0.5 shrink-0 text-stone-500" />
              <span>
                <span className="block font-semibold text-stone-800">Enviar link para o cliente</span>
                <span className="mt-0.5 block text-sm text-stone-600">
                  Ele recebe o contrato e um código para assinar de onde estiver.
                </span>
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Botao variante="secundario" onClick={() => enviarLink('whatsapp')} disabled={enviando} className="flex-1">
                WhatsApp
              </Botao>
              <Botao variante="secundario" onClick={() => enviarLink('email')} disabled={enviando} className="flex-1">
                E-mail
              </Botao>
            </div>
          </div>

          {!doc && !erro && <p className="text-center text-sm text-stone-500">Preparando o contrato…</p>}
        </div>
      )}

      {etapa === 'presencial' && doc && (
        <TelaAssinatura
          doc={doc}
          urlContrato={`/api/reservas/${reservaId}/contrato`}
          onAssinar={assinarPresencial}
        />
      )}

      {etapa === 'enviado' && (
        <div className="py-4 text-center">
          <Send size={40} className="mx-auto mb-3 text-siran-600" />
          <h3 className="text-lg font-bold text-stone-900">Link enviado</h3>
          <p className="mt-1.5 text-sm text-stone-600">
            O contrato foi enviado para <strong>{destinoEnvio}</strong> com um código de
            confirmação. O link vale por 72 horas.
          </p>
          <p className="mt-3 text-xs text-stone-500">
            Assim que o cliente assinar, o stand passa para vendido e todos recebem o contrato
            assinado.
          </p>
          <Botao onClick={onFechar} className="mt-5 w-full">Entendi</Botao>
        </div>
      )}

      {etapa === 'pronto' && (
        <div className="py-4 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-3 text-siran-600" />
          <h3 className="text-xl font-bold text-stone-900">Contrato assinado</h3>
          <p className="mt-2 text-sm text-stone-600">
            O stand {standCodigo} passou para <strong>vendido</strong>. O contrato assinado foi
            enviado para o cliente, para você e para a diretoria.
          </p>
          {hash && (
            <div className="mt-4 rounded-xl bg-stone-100 p-3 text-left">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                <ShieldCheck size={13} /> Código de verificação
              </p>
              <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-stone-600">{hash}</p>
            </div>
          )}
          <Botao onClick={onAssinado} className="mt-5 w-full">Concluir</Botao>
        </div>
      )}
    </Modal>
  );
}
