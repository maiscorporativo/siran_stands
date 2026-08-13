import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import type { Sessao } from '../types';
import { api } from '../lib/api';
import { Campo, Input, Botao, Erro } from '../components/ui';

export default function Login({ onLogin }: { onLogin: (s: Sessao) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const data = await api<Sessao & { ok: boolean }>('/api/auth/login', {
        method: 'POST',
        json: { username, password },
      });
      onLogin({ token: data.token, id: data.id, username: data.username, nome: data.nome, role: data.role });
      navigate('/');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-siran-900 via-siran-800 to-siran-950 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-siran-100 text-siran-700">
            <Lock size={22} />
          </div>
          <h1 className="text-xl font-bold text-stone-900">Siran Summit 2026</h1>
          <p className="text-sm text-stone-500">Reserva de Stands</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Campo label="Usuário">
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="next"
            />
          </Campo>
          <Campo label="Senha">
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
            />
          </Campo>

          {erro && <Erro>{erro}</Erro>}

          <Botao type="submit" disabled={carregando || !username || !password} className="w-full">
            {carregando ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </div>
    </div>
  );
}
