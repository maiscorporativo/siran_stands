import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, LayoutGrid, Settings } from 'lucide-react';
import type { Sessao } from './types';
import { getSessao, setSessao, api } from './lib/api';
import Login from './pages/Login';
import Mapa from './pages/Mapa';
import Admin from './pages/Admin';
import AssinarPublico from './pages/AssinarPublico';
import Verificar from './pages/Verificar';

function Header({ sessao, onLogout }: { sessao: Sessao; onLogout: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const linkClasse = (ativo: boolean) =>
    `flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition sm:px-3 ${
      ativo ? 'bg-siran-900 text-white' : 'text-siran-100 active:bg-siran-700'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-siran-800 pt-[env(safe-area-inset-top)] text-white shadow-md">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <Link to="/" className="min-w-0 flex-1">
          <div className="truncate text-base font-bold leading-tight sm:text-lg">Siran Summit 2026</div>
          <div className="truncate text-[11px] text-siran-200 sm:text-sm">
            {sessao.nome} · {sessao.role === 'master' ? 'Administrador' : 'Vendedor'}
          </div>
        </Link>

        <nav className="flex shrink-0 items-center gap-1">
          <Link to="/" className={linkClasse(pathname === '/')} aria-label="Stands">
            <LayoutGrid size={18} /> <span className="hidden sm:inline">Stands</span>
          </Link>
          {sessao.role === 'master' && (
            <Link to="/admin" className={linkClasse(pathname === '/admin')} aria-label="Administração">
              <Settings size={18} /> <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          <button
            onClick={async () => {
              try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* silencioso */ }
              onLogout();
              navigate('/login');
            }}
            className={linkClasse(false)}
            aria-label="Sair"
          >
            <LogOut size={18} /> <span className="hidden sm:inline">Sair</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  const [sessao, setSessaoState] = useState<Sessao | null>(getSessao);

  const handleLogin = (s: Sessao) => { setSessao(s); setSessaoState(s); };
  const handleLogout = () => { setSessao(null); setSessaoState(null); };

  /* As rotas de assinatura e verificação são públicas: quem assina o
     contrato não tem conta no sistema, e a conferência precisa
     funcionar para qualquer pessoa com o código do documento. */
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/assinar/:token" element={<AssinarPublico />} />
        <Route path="/verificar" element={<Verificar />} />

        {sessao ? (
          <>
            <Route
              path="/"
              element={<><Header sessao={sessao} onLogout={handleLogout} /><Mapa sessao={sessao} /></>}
            />
            <Route
              path="/admin"
              element={sessao.role === 'master'
                ? <><Header sessao={sessao} onLogout={handleLogout} /><Admin /></>
                : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <Route path="*" element={<Login onLogin={handleLogin} />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
