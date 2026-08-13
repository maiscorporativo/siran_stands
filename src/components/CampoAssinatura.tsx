import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

/* ── Campo onde a pessoa assina com o dedo ou a caneta ────────────
   Desenha num canvas em resolução de tela (devicePixelRatio), para
   o traço não sair borrado no celular, e usa Pointer Events, que
   cobrem dedo, caneta e mouse com o mesmo código. */
export default function CampoAssinatura({ onChange, altura = 200 }: {
  onChange: (dataUrl: string | null) => void;
  altura?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const ultimoPonto = useRef<{ x: number; y: number } | null>(null);
  const temTraco = useRef(false);
  const [vazio, setVazio] = useState(true);

  /* Ajusta o buffer do canvas ao tamanho real em pixels. Redesenhar
     zera o conteúdo, então só rodamos quando a largura muda. */
  const preparar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const escala = window.devicePixelRatio || 1;
    const largura = canvas.clientWidth;
    if (canvas.width === Math.floor(largura * escala)) return;

    canvas.width = Math.floor(largura * escala);
    canvas.height = Math.floor(altura * escala);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#12243f';
  }, [altura]);

  useEffect(() => {
    preparar();
    window.addEventListener('resize', preparar);
    return () => window.removeEventListener('resize', preparar);
  }, [preparar]);

  function posicao(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    ultimoPonto.current = posicao(e);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const anterior = ultimoPonto.current;
    if (!ctx || !anterior) return;

    const p = posicao(e);
    ctx.beginPath();
    ctx.moveTo(anterior.x, anterior.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimoPonto.current = p;

    if (!temTraco.current) {
      temTraco.current = true;
      setVazio(false);
    }
  }

  function terminar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    ultimoPonto.current = null;
    if (temTraco.current) onChange(canvasRef.current?.toDataURL('image/png') ?? null);
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    temTraco.current = false;
    setVazio(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-white">
        <canvas
          ref={canvasRef}
          style={{ height: altura, touchAction: 'none' }}
          className="w-full cursor-crosshair"
          onPointerDown={iniciar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          onPointerCancel={terminar}
        />

        {vazio && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-stone-400">
            <PenLine size={26} />
            <span className="text-sm font-medium">Assine aqui com o dedo</span>
          </div>
        )}

        {/* Linha de apoio, como a de um documento impresso */}
        <div className="pointer-events-none absolute inset-x-8 bottom-9 border-b border-stone-200" />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-stone-500">
          {vazio ? 'O campo está em branco' : 'Assinatura registrada'}
        </span>
        <button
          type="button"
          onClick={limpar}
          disabled={vazio}
          className="flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-stone-600 disabled:opacity-40 active:bg-stone-100"
        >
          <Eraser size={15} /> Refazer
        </button>
      </div>
    </div>
  );
}
