export type AulaClaraRole = 'professor' | 'gestao' | 'master';
import { isAccessTokenExpiring } from './authSession';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fdlpzljfgtpinmfczvjx.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_H6bPqgxyGSNAVCi2geFOEQ__0W_NiTH';

export interface AulaClaraSession {
  accessToken: string;
  refreshToken?: string;
  email: string;
  name: string;
  role: AulaClaraRole;
  roleTitle?: string;
  daysRemaining: number;
  lifetime: boolean;
}

export interface AulaClaraSignupResult {
  session?: AulaClaraSession;
  requiresEmailConfirmation: boolean;
}

async function jsonFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('apikey', SUPABASE_ANON_KEY);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || 'Falha de autenticação.');
  return data;
}

export async function signInWithPassword(email: string, password: string): Promise<AulaClaraSession> {
  const cleanEmail = email.trim().toLowerCase();
  const auth = await jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail, password }),
  });
  const token = auth.access_token;
  if (!token) throw new Error('Sessão não foi criada.');

  const grants = await jsonFetch(`${SUPABASE_URL}/rest/v1/access_grants?email=eq.${encodeURIComponent(cleanEmail)}&select=*`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const grant = Array.isArray(grants) ? grants[0] : null;
  if (!grant) throw new Error('Seu usuário ainda não foi liberado no Aula Clara.');
  if (grant.status !== 'active') throw new Error('Seu acesso está bloqueado.');

  const expires = grant.expires_at ? new Date(grant.expires_at).getTime() : null;
  const daysRemaining = grant.lifetime ? 9999 : expires ? Math.max(0, Math.ceil((expires - Date.now()) / 86400000)) : 0;
  if (!grant.lifetime && daysRemaining <= 0) throw new Error('Seu período de acesso expirou.');

  const role: AulaClaraRole = grant.role === 'master' ? 'master' : grant.role === 'gestao' ? 'gestao' : 'professor';
  if (role === 'master' && cleanEmail !== 'ecomnixx@gmail.com') throw new Error('Conta Master não autorizada.');

  const session: AulaClaraSession = {
    accessToken: token,
    refreshToken: auth.refresh_token,
    email: cleanEmail,
    name: grant.display_name || auth.user?.user_metadata?.full_name || cleanEmail.split('@')[0],
    role,
    roleTitle: role === 'master' ? 'Administrador Master' : role === 'gestao' ? 'Coordenação Pedagógica' : 'Docente',
    daysRemaining,
    lifetime: Boolean(grant.lifetime),
  };
  localStorage.setItem('aula_clara_access_token', session.accessToken);
  if (session.refreshToken) localStorage.setItem('aula_clara_refresh_token', session.refreshToken);
  return session;
}

export async function signUpProfessor(name: string, email: string, password: string): Promise<AulaClaraSignupResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const auth = await jsonFetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    body: JSON.stringify({
      email: cleanEmail,
      password,
      data: { name: cleanName, full_name: cleanName },
    }),
  });

  if (!auth.access_token) {
    return { requiresEmailConfirmation: true };
  }

  const session = await sessionFromToken(auth.access_token, auth.refresh_token);
  return { session, requiresEmailConfirmation: false };
}

export function getAccessToken(): string {
  return localStorage.getItem('aula_clara_access_token') || '';
}

let refreshPromise: Promise<string> | null = null;

export async function getValidAccessToken(forceRefresh = false): Promise<string> {
  const currentToken = getAccessToken();
  if (!forceRefresh && currentToken && !isAccessTokenExpiring(currentToken)) return currentToken;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('aula_clara_refresh_token') || '';
    if (!refreshToken) {
      if (currentToken && !forceRefresh) return currentToken;
      throw new Error('Sua sessão expirou. Entre novamente com o Google.');
    }
    const auth = await jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!auth.access_token) throw new Error('Não foi possível renovar a sessão.');
    localStorage.setItem('aula_clara_access_token', auth.access_token);
    if (auth.refresh_token) localStorage.setItem('aula_clara_refresh_token', auth.refresh_token);
    return String(auth.access_token);
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const execute = async (forceRefresh: boolean) => {
    const token = await getValidAccessToken(forceRefresh);
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  let response = await execute(false);
  if (response.status === 401 || response.status === 403) response = await execute(true);
  return response;
}

async function sessionFromToken(token: string, refreshToken?: string): Promise<AulaClaraSession> {
  const user = await jsonFetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
  const cleanEmail = String(user.email || '').toLowerCase();
  const grants = await jsonFetch(`${SUPABASE_URL}/rest/v1/access_grants?email=eq.${encodeURIComponent(cleanEmail)}&select=*`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const grant = Array.isArray(grants) ? grants[0] : null;
  if (!grant || grant.status !== 'active') throw new Error('Seu cadastro foi criado, mas o acesso ainda não está ativo.');
  const expires = grant.expires_at ? new Date(grant.expires_at).getTime() : null;
  const daysRemaining = grant.lifetime ? 9999 : expires ? Math.max(0, Math.ceil((expires - Date.now()) / 86400000)) : 0;
  const role: AulaClaraRole = grant.role === 'master' ? 'master' : grant.role === 'gestao' ? 'gestao' : 'professor';
  const session: AulaClaraSession = {
    accessToken: token,
    refreshToken,
    email: cleanEmail,
    name: grant.display_name || user.user_metadata?.full_name || cleanEmail,
    role,
    roleTitle: role === 'master' ? 'Administrador Master' : role === 'gestao' ? 'Coordenação Pedagógica' : 'Docente',
    daysRemaining,
    lifetime: Boolean(grant.lifetime),
  };
  localStorage.setItem('aula_clara_access_token', token);
  if (refreshToken) localStorage.setItem('aula_clara_refresh_token', refreshToken);
  return session;
}

export async function logoutSupabase() {
  const token = getAccessToken();
  try {
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } finally {
    localStorage.removeItem('aula_clara_access_token');
    localStorage.removeItem('aula_clara_refresh_token');
  }
}

export function googleOAuthUrl() {
  const redirectTo = `${window.location.origin}/`;
  return `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
}

export async function hydrateOAuthSessionFromHash(): Promise<AulaClaraSession | null> {
  if (!window.location.hash.includes('access_token=')) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('access_token');
  const refreshToken = params.get('refresh_token') || undefined;
  if (!token) return null;
  const user = await jsonFetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
  const cleanEmail = String(user.email || '').toLowerCase();
  const grants = await jsonFetch(`${SUPABASE_URL}/rest/v1/access_grants?email=eq.${encodeURIComponent(cleanEmail)}&select=*`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const grant = Array.isArray(grants) ? grants[0] : null;
  if (!grant || grant.status !== 'active') throw new Error('Seu usuário não possui acesso ativo ao Aula Clara.');
  const expires = grant.expires_at ? new Date(grant.expires_at).getTime() : null;
  const daysRemaining = grant.lifetime ? 9999 : expires ? Math.max(0, Math.ceil((expires - Date.now()) / 86400000)) : 0;
  if (!grant.lifetime && daysRemaining <= 0) throw new Error('Seu período de acesso expirou.');
  const role: AulaClaraRole = grant.role === 'master' ? 'master' : grant.role === 'gestao' ? 'gestao' : 'professor';
  if (role === 'master' && cleanEmail !== 'ecomnixx@gmail.com') throw new Error('Conta Master não autorizada.');
  const session = { accessToken: token, refreshToken, email: cleanEmail, name: grant.display_name || user.user_metadata?.full_name || cleanEmail, role, roleTitle: role === 'master' ? 'Administrador Master' : role === 'gestao' ? 'Coordenação Pedagógica' : 'Docente', daysRemaining, lifetime: Boolean(grant.lifetime) };
  localStorage.setItem('aula_clara_access_token', token);
  if (refreshToken) localStorage.setItem('aula_clara_refresh_token', refreshToken);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return session;
}
