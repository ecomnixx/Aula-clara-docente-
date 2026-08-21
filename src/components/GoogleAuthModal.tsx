import React, { useState } from 'react';
import { signInWithPassword, googleOAuthUrl } from '../utils/supabaseAuth';
import { GoogleUser } from '../types';
import {
  ShieldCheck,
  School,
  Loader2,
  Mail,
  ArrowRight,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface GoogleAuthModalProps {
  onLoginSuccess: (user: GoogleUser) => void;
}

export function GoogleAuthModal({ onLoginSuccess }: GoogleAuthModalProps) {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loginWithGoogle = () => {
    window.location.href = googleOAuthUrl();
  };

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsAuthenticating(true);
    try {
      const session = await signInWithPassword(loginEmail, loginPassword);
      const newUser: GoogleUser = {
        id: session.email,
        name: session.name,
        email: session.email,
        picture: '',
        school: '',
        subject: 'Educação Geral',
        hasCompletedOnboarding: true,
        loggedInAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        trialDaysTotal: session.lifetime ? 9999 : session.daysRemaining,
        status: 'Ativo',
        isVitalicio: session.lifetime,
      };
      localStorage.setItem('aula_clara_google_user', JSON.stringify(newUser));
      onLoginSuccess(newUser);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha no login.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-sans">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-50 via-slate-50 to-white p-6 text-center border-b border-slate-200">
          <h2 className="text-2xl font-black text-slate-900">Acessar Aula Clara</h2>
          <p className="text-xs text-slate-500 mt-2">Autenticação protegida pelo Supabase.</p>
        </div>
        <div className="p-6 space-y-4">
          {errorMessage && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold">{errorMessage}</div>}
          <button type="button" onClick={loginWithGoogle} disabled={isAuthenticating} className="w-full py-3 px-4 bg-white text-slate-800 font-extrabold rounded-2xl border-2 border-slate-200 hover:border-indigo-400 disabled:opacity-50">
            Continuar com Google
          </button>
          <form onSubmit={handleEmailPasswordLogin} className="space-y-3">
            <input type="email" required placeholder="professor@escola.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xs font-bold" />
            <input type="password" required placeholder="Senha" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xs font-bold" />
            <button type="submit" disabled={isAuthenticating} className="w-full py-3.5 px-4 bg-indigo-600 text-white font-black rounded-2xl disabled:opacity-50">
              {isAuthenticating ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
