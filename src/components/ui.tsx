import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

/* Altura mínima de 44px em todos os controles — é o alvo de toque
   confortável recomendado para uso com o polegar. */
const base =
  'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 outline-none ' +
  'transition focus:border-siran-500 focus:ring-2 focus:ring-siran-200 sm:py-2.5';

export function Campo({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${base} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${base} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${base} ${props.className ?? ''}`} />;
}

type BotaoProps = {
  variante?: 'primario' | 'secundario' | 'perigo';
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Botao({ variante = 'primario', children, className = '', ...props }: BotaoProps) {
  const estilos = {
    primario: 'bg-siran-600 text-white active:bg-siran-800 disabled:opacity-50',
    secundario: 'border border-stone-300 bg-white text-stone-700 active:bg-stone-100',
    perigo: 'border border-red-300 bg-white text-red-600 active:bg-red-50',
  }[variante];

  return (
    <button
      {...props}
      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-semibold transition sm:min-h-[42px] ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

export function Erro({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>;
}
