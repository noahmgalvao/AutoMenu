import React, { useState } from 'react';
import { ChefHat, Loader2 } from 'lucide-react';

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (payload: { email: string; password: string; fullName: string; workspaceName: string }) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSignIn, onSignUp, loading, error }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'signin') {
      await onSignIn(email, password);
      return;
    }

    await onSignUp({
      email,
      password,
      fullName,
      workspaceName,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="px-8 pt-8 pb-6 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-white/15 p-2 rounded-xl">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-semibold">AutoMenu AI</div>
              <div className="text-sm text-indigo-100">Ambiente privado no Supabase</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-white text-indigo-700' : 'bg-white/10 text-white'}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-white text-indigo-700' : 'bg-white/10 text-white'}`}
            >
              Criar conta
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="px-8 py-8 space-y-4">
          {mode === 'signup' && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-600">Nome</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Nome do responsável"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-600">Negócio</label>
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Nome do restaurante ou negócio"
                  required
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-600">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="email@empresa.com"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-600">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Mínimo de 6 caracteres"
              minLength={6}
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
};
