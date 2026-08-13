import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import TelaAssinatura from '../components/TelaAssinatura';
import type { DocumentoParaAssinar } from '../components/TelaAssinatura';

/* ── Página aberta pelo signatário, sem login ─────────────────────
   É a única tela do sistema acessível a quem não tem conta: chega
   pelo link enviado por WhatsApp ou e-mail, com token de uso único. */
export default function AssinarPublico() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<DocumentoParaAssinar | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [assinado, setAssinado] = useState<{ hash: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/assinaturas/publico/${token}`);
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.error || 'Link inválido.');
        setDoc(dados);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Link inválido.');
      } finally {
        setCarregando(false);
      }
    })();
  }, [token]);

  async function assinar(dados: Parameters<Parameters<typeof TelaAssinatura>[0]['onAssinar']>[0]) {
    const res = await fetch(`/api/assinaturas/publico/${token}/assinar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dados, hash_documento: doc?.hash }),
    });
    const corpo = await res.json();
    if (!res.ok) throw new Error(corpo.error || 'Não foi possível assinar.');
    setAssinado({ hash: corpo.hash });
  }

  async function reenviar() {
    const res = await fetch(`/api/assinaturas/publico/${token}/reenviar`, { method: 'POST' });
    const corpo = await res.json();
    if (!res.ok) throw new Error(corpo.error || 'Falha ao reenviar.');
  }

  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="bg-siran-800 pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto max-w-lg px-4 py-3">
          <div className="text-base font-bold">Siran Summit 2026</div>
          <div className="text-xs text-siran-200">Assinatura do contrato de patrocínio</div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {carregando && <p className="py-16 text-center text-stone-500">Carregando o contrato…</p>}

        {erro && !carregando && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <AlertCircle size={40} className="mx-auto mb-3 text-amber-500" />
            <h2 className="text-lg font-bold text-stone-900">Não foi possível abrir</h2>
            <p className="mt-1.5 text-sm text-stone-600">{erro}</p>
            <p className="mt-4 text-xs text-stone-500">
              Fale com o vendedor que enviou o contrato para receber um novo link.
            </p>
          </div>
        )}

        {assinado && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-siran-600" />
            <h2 className="text-xl font-bold text-stone-900">Contrato assinado</h2>
            <p className="mt-2 text-sm text-stone-600">
              Pronto! O contrato assinado foi enviado para você, para o vendedor e para a
              organização do evento.
            </p>
            <div className="mt-5 rounded-xl bg-stone-100 p-4 text-left">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                <ShieldCheck size={13} /> Código de verificação do documento
              </p>
              <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-stone-600">
                {assinado.hash}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                Guarde este código: com ele é possível conferir a autenticidade do contrato a
                qualquer momento.
              </p>
            </div>
          </div>
        )}

        {doc && !assinado && !erro && (
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <TelaAssinatura
              doc={doc}
              pedirCodigo
              urlContrato={`/api/assinaturas/publico/${token}/contrato`}
              onAssinar={assinar}
              onReenviarCodigo={reenviar}
            />
          </div>
        )}
      </main>
    </div>
  );
}
