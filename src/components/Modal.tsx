import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/* No celular abre como bottom-sheet (o polegar alcança as ações);
   a partir de sm vira o diálogo centralizado tradicional. */
export default function Modal({ titulo, subtitulo, onFechar, children }: {
  titulo: string;
  subtitulo?: ReactNode;
  onFechar: () => void;
  children: ReactNode;
}) {
  // Trava a rolagem do fundo e fecha no Esc / botão voltar do Android
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', onKey);
    };
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho fixo, some da rolagem */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-stone-900">{titulo}</h2>
            {subtitulo && <div className="mt-0.5 text-sm text-stone-500">{subtitulo}</div>}
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-400 active:bg-stone-100"
          >
            <X size={22} />
          </button>
        </div>

        {/* Conteúdo rolável, com folga para a barra de gestos do iPhone */}
        <div className="overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
