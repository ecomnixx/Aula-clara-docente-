import React, { useState, useEffect } from 'react';
import { signInWithPassword, googleOAuthUrl } from '../utils/supabaseAuth';
import {
  School,
  Lock,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Award,
  BarChart3,
  BookOpen,
  Users,
  Crown,
  Key,
  Sliders,
  Search,
  Eye,
  EyeOff,
  LogOut,
  ShieldAlert,
  Clock,
  Check,
} from 'lucide-react';

interface RoleLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: 'professor' | 'gestao' | 'master';
  currentName: string;
  currentEmail: string;
  onSelectRole: (role: 'professor' | 'gestao' | 'master', name: string, email: string, roleTitle?: string) => void;
  showToast: (msg: string) => void;
  defaultTab?: 'professor' | 'gestao' | 'master';
  onOpenAccessManager?: () => void;
  onLogout?: () => void;
  isDarkMode?: boolean;
}

export const RoleLoginModal: React.FC<RoleLoginModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  currentName,
  currentEmail,
  onSelectRole,
  showToast,
  defaultTab = 'professor',
  onOpenAccessManager,
  onLogout,
  isDarkMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<'professor' | 'gestao' | 'master'>(defaultTab);

  // Sync activeTab when defaultTab changes
  useEffect(() => {
    if (isOpen && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // Professor Form State
  const [profName, setProfName] = useState(
    currentRole === 'professor' ? currentName : 'Prof. Carlos Eduardo'
  );
  const [profEmail, setProfEmail] = useState(
    currentRole === 'professor' ? currentEmail : 'professor@escola.com.br'
  );
  const [profSchool, setProfSchool] = useState('Escola Estadual Anísio Teixeira');
  const [profPassword, setProfPassword] = useState('');

  // Gestão Form State
  const [gestaoName, setGestaoName] = useState(
    currentRole === 'gestao' ? currentName : 'Coordenação Pedagógica'
  );
  const [gestaoEmail, setGestaoEmail] = useState(
    currentRole === 'gestao' ? currentEmail : 'gestao.pedagogica@escola.com.br'
  );
  const [gestaoTitle, setGestaoTitle] = useState<
    'Coordenador(a) Pedagógico(a)' | 'Diretor(a) Escolar' | 'Orientador(a) Educacional' | 'Supervisor(a) de Ensino'
  >('Coordenador(a) Pedagógico(a)');
  const [gestaoPassword, setGestaoPassword] = useState('');
  const [gestaoError, setGestaoError] = useState<string | null>(null);
  const [showGestaoPassword, setShowGestaoPassword] = useState(false);

  // Master Form State
  const [masterName, setMasterName] = useState(
    currentRole === 'master' ? currentName : 'Administrador Master'
  );
  const [masterEmail, setMasterEmail] = useState(
    currentRole === 'master'
      ? currentEmail
      : currentEmail?.includes('familiacardoso')
      ? 'familiacardoso21@gmail.com'
      : 'ecomnixx@gmail.com'
  );
  const [masterPassword, setMasterPassword] = useState('');
  const [masterError, setMasterError] = useState<string | null>(null);
  const [showMasterPassword, setShowMasterPassword] = useState(false);

  // Remember login state
  const [rememberLogin, setRememberLogin] = useState(true);

  // Brute Force Protection & Rate Limiting
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    let timer: any = null;
    if (lockoutSeconds > 0) {
      timer = setInterval(() => {
        setLockoutSeconds((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [lockoutSeconds]);

  if (!isOpen) return null;

  const handleLoginProfessor = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profEmail.trim()) return showToast('Por favor, informe seu e-mail.');
    if (!profPassword.trim()) return showToast('Digite sua senha.');
    try {
      const session = await signInWithPassword(profEmail, profPassword);
      if (session.role !== 'professor') throw new Error('Esta conta não possui perfil Professor.');
      onSelectRole(session.role, session.name, session.email, session.roleTitle);
      showToast(`Conectado com sucesso como ${session.name}`);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Falha no login.');
    }
  };

  const handleLoginGestao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return setGestaoError(`Acesso bloqueado temporariamente. Aguarde ${lockoutSeconds}s.`);
    try {
      setGestaoError(null);
      const session = await signInWithPassword(gestaoEmail, gestaoPassword);
      if (session.role !== 'gestao') throw new Error('Esta conta não possui perfil de Gestão.');
      setFailedAttempts(0);
      onSelectRole(session.role, session.name, session.email, gestaoTitle);
      showToast(`Conectado com sucesso no Painel de Gestão Escolar`);
      onClose();
    } catch (err: any) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 4) setLockoutSeconds(30);
      setGestaoError(err?.message || 'Falha no login de Gestão.');
    }
  };

  const handleLoginMaster = async (e?: React.FormEvent, openDirectAccessManager = false) => {
    if (e) e.preventDefault();
    if (lockoutSeconds > 0) return setMasterError(`Acesso bloqueado temporariamente. Aguarde ${lockoutSeconds}s.`);
    try {
      setMasterError(null);
      if (masterEmail.trim().toLowerCase() !== 'ecomnixx@gmail.com') throw new Error('Conta Master não autorizada.');
      const session = await signInWithPassword(masterEmail, masterPassword);
      if (session.role !== 'master') throw new Error('Esta conta não possui perfil Master.');
      setFailedAttempts(0);
      onSelectRole(session.role, session.name, session.email, 'Administrador Master');
      showToast(`👑 Conectado como ${session.name}`);
      onClose();
      if (openDirectAccessManager && onOpenAccessManager) setTimeout(onOpenAccessManager, 150);
    } catch (err: any) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 4) setLockoutSeconds(30);
      setMasterError(err?.message || 'Falha no login Master.');
    }
  };

  // Helper for password strength calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: 'Vazia', color: '#94a3b8' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[A-Z]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 1) return { score: 1, label: 'Fraca', color: '#ef4444' };
    if (score === 2) return { score: 2, label: 'Média', color: '#f59e0b' };
    if (score === 3) return { score: 3, label: 'Boa', color: '#3b82f6' };
    return { score: 4, label: 'Forte & Segura', color: '#10b981' };
  };

  const gestaoStrength = getPasswordStrength(gestaoPassword);
  const masterStrength = getPasswordStrength(masterPassword);

  const handleGoogleLogin = () => { window.location.href = googleOAuthUrl(); };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isDarkMode ? '#1e293b' : '#ffffff',
          color: isDarkMode ? '#f8fafc' : '#0f172a',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '560px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com Abas de Separação de Perfil */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            padding: '24px 24px 16px',
            color: '#ffffff',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#ffffff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Fechar"
          >
            ×
          </button>

          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.12)',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: '#93c5fd',
                marginBottom: '8px',
              }}
            >
              <ShieldCheck style={{ width: '14px', height: '14px' }} />
              Autenticação & Controle de Acesso Seguro
            </span>
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0', color: '#ffffff' }}>
              Selecione o seu Perfil de Acesso
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>
              Proteção de credenciais, criptografia de sessão e controle de permissões
            </p>
          </div>

          {/* Abas de Troca de Perfil - 3 Abas: Professor, Gestão e Master */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1.15fr',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.08)',
              padding: '4px',
              borderRadius: '14px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('professor');
                setGestaoError(null);
                setMasterError(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 10px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === 'professor' ? '#ffffff' : 'transparent',
                color: activeTab === 'professor' ? '#0f172a' : '#cbd5e1',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'professor' ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              <BookOpen
                style={{ width: '14px', height: '14px', color: activeTab === 'professor' ? '#0284c7' : '#94a3b8' }}
              />
              <span>👨‍🏫 Professor</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('gestao');
                setGestaoError(null);
                setMasterError(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 10px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === 'gestao' ? '#ffffff' : 'transparent',
                color: activeTab === 'gestao' ? '#0f172a' : '#cbd5e1',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'gestao' ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              <BarChart3
                style={{ width: '14px', height: '14px', color: activeTab === 'gestao' ? '#7c3aed' : '#94a3b8' }}
              />
              <span>🏛️ Gestão</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('master');
                setGestaoError(null);
                setMasterError(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 10px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === 'master' ? '#fbbf24' : 'transparent',
                color: activeTab === 'master' ? '#78350f' : '#fde68a',
                fontSize: '12px',
                fontWeight: '900',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'master' ? '0 4px 12px rgba(245, 158, 11, 0.4)' : 'none',
              }}
            >
              <Crown
                style={{ width: '14px', height: '14px', color: activeTab === 'master' ? '#92400e' : '#fbbf24' }}
              />
              <span>👑 Login Master</span>
            </button>
          </div>
        </div>

        {/* Lockout Warning Banner */}
        {lockoutSeconds > 0 && (
          <div
            style={{
              background: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#991b1b',
              fontSize: '13px',
              fontWeight: '700',
            }}
          >
            <Clock style={{ width: '18px', height: '18px', flexShrink: 0 }} />
            <div>
              Bloqueio de segurança temporário ativado. Aguarde <b>{lockoutSeconds} segundos</b> para tentar novamente.
            </div>
          </div>
        )}

        {/* Tab 1: PROFESSOR */}
        {activeTab === 'professor' && (
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                background: isDarkMode ? '#0f2744' : '#f0f9ff',
                border: isDarkMode ? '1px solid #0369a1' : '1px solid #bae6fd',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '12px',
                color: isDarkMode ? '#bae6fd' : '#0369a1',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>📚</span>
              <div>
                <strong>Acesso do Corpo Docente:</strong> Crie planos de aula, avaliações BNCC, corrija provas por foto,
                gere planos de reensino e adapte conteúdos para inclusão (PEI).
              </div>
            </div>

            <button type="button" onClick={handleGoogleLogin} style={{width:'100%',padding:'12px',marginBottom:'10px',borderRadius:'12px',border:'1px solid #cbd5e1',background:'#fff',fontWeight:800,cursor:'pointer'}}>Continuar com Google</button>
              <form onSubmit={handleLoginProfessor} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  Nome do Professor(a):
                </label>
                <input
                  type="text"
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  placeholder="Ex: Prof. Carlos Eduardo"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  E-mail do Professor:
                </label>
                <input
                  type="email"
                  required
                  value={profEmail}
                  onChange={(e) => setProfEmail(e.target.value)}
                  placeholder="professor@escola.com.br"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: isDarkMode ? '#cbd5e1' : '#475569', marginBottom: '4px' }}>Senha:</label>
                <input
                  type="password"
                  required
                  value={profPassword}
                  onChange={(e) => setProfPassword(e.target.value)}
                  placeholder="Sua senha do Aula Clara"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1', fontSize: '13px', background: isDarkMode ? '#0f172a' : '#f8fafc', color: isDarkMode ? '#ffffff' : '#0f172a', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  Escola / Colégio:
                </label>
                <input
                  type="text"
                  value={profSchool}
                  onChange={(e) => setProfSchool(e.target.value)}
                  placeholder="Nome da sua escola"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Remember Me Toggle */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: isDarkMode ? '#94a3b8' : '#64748b',
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginTop: '2px',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberLogin}
                  onChange={(e) => setRememberLogin(e.target.checked)}
                  style={{ accentColor: '#0284c7', width: '15px', height: '15px' }}
                />
                <span>Manter conectado com segurança neste navegador</span>
              </label>

              <button
                type="submit"
                style={{
                  marginTop: '6px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '13px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                }}
              >
                <span>Entrar como Professor(a)</span>
                <ArrowRight style={{ width: '16px', height: '16px' }} />
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: GESTÃO ESCOLAR */}
        {activeTab === 'gestao' && (
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                background: isDarkMode ? '#281a4d' : '#f5f3ff',
                border: isDarkMode ? '1px solid #6d28d9' : '1px solid #ddd6fe',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '12px',
                color: isDarkMode ? '#ddd6fe' : '#5b21b6',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>🏛️</span>
              <div>
                <strong>Acesso da Coordenação & Direção:</strong> Acesse o Mapa de Calor de Rendimento das Turmas,
                Diagnóstico Coletivo da BNCC, Emissão de Pareceres Descritivos e Relatórios para Conselho de Classe.
              </div>
            </div>

            {gestaoError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#b91c1c',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                <span>{gestaoError}</span>
              </div>
            )}

            <form onSubmit={handleLoginGestao} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  Cargo / Função na Gestão:
                </label>
                <select
                  value={gestaoTitle}
                  onChange={(e) => setGestaoTitle(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    fontWeight: '700',
                    outline: 'none',
                  }}
                >
                  <option value="Coordenador(a) Pedagógico(a)">Coordenador(a) Pedagógico(a)</option>
                  <option value="Diretor(a) Escolar">Diretor(a) Escolar</option>
                  <option value="Orientador(a) Educacional">Orientador(a) Educacional</option>
                  <option value="Supervisor(a) de Ensino">Supervisor(a) de Ensino / AEE</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  Nome do Gestor / Coordenador:
                </label>
                <input
                  type="text"
                  value={gestaoName}
                  onChange={(e) => setGestaoName(e.target.value)}
                  placeholder="Ex: Profa. Helena Vasconcelos (Coordenação)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  E-mail Institucional da Gestão:
                </label>
                <input
                  type="email"
                  required
                  value={gestaoEmail}
                  onChange={(e) => setGestaoEmail(e.target.value)}
                  placeholder="coordenacao@escola.com.br"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Password field with Eye toggle and strength meter */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: isDarkMode ? '#cbd5e1' : '#475569',
                    }}
                  >
                    Chave de Acesso / Senha de Gestão:
                  </label>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showGestaoPassword ? 'text' : 'password'}
                    value={gestaoPassword}
                    onChange={(e) => setGestaoPassword(e.target.value)}
                    placeholder="Digite a senha de gestão"
                    disabled={lockoutSeconds > 0}
                    style={{
                      width: '100%',
                      padding: '10px 38px 10px 12px',
                      borderRadius: '10px',
                      border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                      fontSize: '13px',
                      background: isDarkMode ? '#0f172a' : '#f8fafc',
                      color: isDarkMode ? '#ffffff' : '#0f172a',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGestaoPassword(!showGestaoPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0,
                    }}
                    title={showGestaoPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showGestaoPassword ? (
                      <EyeOff style={{ width: '16px', height: '16px' }} />
                    ) : (
                      <Eye style={{ width: '16px', height: '16px' }} />
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      flex: 1,
                      height: '4px',
                      background: isDarkMode ? '#334155' : '#e2e8f0',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${(gestaoStrength.score / 4) * 100}%`,
                        height: '100%',
                        background: gestaoStrength.color,
                        transition: 'all 0.3s',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '10.5px', color: gestaoStrength.color, fontWeight: '700' }}>
                    {gestaoStrength.label}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={lockoutSeconds > 0}
                style={{
                  marginTop: '6px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '13px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '800',
                  cursor: lockoutSeconds > 0 ? 'not-allowed' : 'pointer',
                  opacity: lockoutSeconds > 0 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                }}
              >
                <span>Entrar no Painel da Gestão Escolar</span>
                <ArrowRight style={{ width: '16px', height: '16px' }} />
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: LOGIN MASTER (ADMINISTRADOR MASTER COM GERENCIAR ACESSOS) */}
        {activeTab === 'master' && (
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Card informativo Master */}
            <div
              style={{
                background: isDarkMode ? '#3a2707' : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: isDarkMode ? '1.5px solid #d97706' : '1.5px solid #fde68a',
                borderRadius: '14px',
                padding: '12px 14px',
                fontSize: '12px',
                color: isDarkMode ? '#fef3c7' : '#92400e',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#f59e0b',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '18px',
                  boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)',
                }}
              >
                👑
              </div>
              <div>
                <strong
                  style={{ display: 'block', fontSize: '13px', color: isDarkMode ? '#fde68a' : '#78350f' }}
                >
                  Perfil Administrador Master (Acesso Vitalício & Gestão Total)
                </strong>
                Controle central da plataforma: gerencie professores, adicione/retire dias, conceda licenças vitalícias
                e audite acessos em tempo real.
              </div>
            </div>

            {/* Ação em Destaque: ABRIR GERENCIAR ACESSOS DIRETAMENTE */}
            <div
              style={{
                background: isDarkMode ? '#0f172a' : '#ffffff',
                border: '2px dashed #f59e0b',
                borderRadius: '14px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: isDarkMode ? '#1e293b' : '#eff6ff',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Search style={{ width: '16px', height: '16px' }} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: '800',
                      color: isDarkMode ? '#f8fafc' : '#0f172a',
                    }}
                  >
                    Painel Gerenciar Acessos
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Pesquise professores com lupa, ajuste dias e bloqueie/desbloqueie
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleLoginMaster(undefined, true)}
                disabled={lockoutSeconds > 0}
                style={{
                  padding: '9px 14px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: lockoutSeconds > 0 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                }}
              >
                ⚡ Abrir Painel
              </button>
            </div>

            {masterError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#b91c1c',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                <span>{masterError}</span>
              </div>
            )}

            {/* Formulário de Login Master */}
            <form
              onSubmit={(e) => handleLoginMaster(e, false)}
              style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  Nome do Administrador Master:
                </label>
                <input
                  type="text"
                  value={masterName}
                  onChange={(e) => setMasterName(e.target.value)}
                  placeholder="Ex: Administrador Master"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: isDarkMode ? '#cbd5e1' : '#475569',
                    marginBottom: '4px',
                  }}
                >
                  E-mail Master Autorizado:
                </label>
                <input
                  type="email"
                  required
                  value={masterEmail}
                  onChange={(e) => setMasterEmail(e.target.value)}
                  placeholder="ecomnixx@gmail.com"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: isDarkMode ? '#0f172a' : '#f8fafc',
                    color: isDarkMode ? '#ffffff' : '#0f172a',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Password field with Eye toggle and strength meter */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: isDarkMode ? '#cbd5e1' : '#475569',
                    }}
                  >
                    Chave de Acesso / Senha Master:
                  </label>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showMasterPassword ? 'text' : 'password'}
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    placeholder="Digite a senha master"
                    disabled={lockoutSeconds > 0}
                    style={{
                      width: '100%',
                      padding: '10px 38px 10px 12px',
                      borderRadius: '10px',
                      border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1',
                      fontSize: '13px',
                      background: isDarkMode ? '#0f172a' : '#f8fafc',
                      color: isDarkMode ? '#ffffff' : '#0f172a',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowMasterPassword(!showMasterPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0,
                    }}
                    title={showMasterPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showMasterPassword ? (
                      <EyeOff style={{ width: '16px', height: '16px' }} />
                    ) : (
                      <Eye style={{ width: '16px', height: '16px' }} />
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      flex: 1,
                      height: '4px',
                      background: isDarkMode ? '#334155' : '#e2e8f0',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${(masterStrength.score / 4) * 100}%`,
                        height: '100%',
                        background: masterStrength.color,
                        transition: 'all 0.3s',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '10.5px', color: masterStrength.color, fontWeight: '700' }}>
                    {masterStrength.label}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                <button
                  type="submit"
                  disabled={lockoutSeconds > 0}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: '800',
                    cursor: lockoutSeconds > 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                  }}
                >
                  <Crown style={{ width: '15px', height: '15px' }} />
                  <span>Entrar como Master</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoginMaster(undefined, true)}
                  disabled={lockoutSeconds > 0}
                  style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: '800',
                    cursor: lockoutSeconds > 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)',
                  }}
                >
                  <ShieldCheck style={{ width: '15px', height: '15px', color: '#38bdf8' }} />
                  <span>Gerenciar Acessos</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Footer with Logout & Security Status */}
        <div
          style={{
            padding: '12px 20px',
            background: isDarkMode ? '#0f172a' : '#f8fafc',
            borderTop: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: isDarkMode ? '#94a3b8' : '#64748b',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>
              Perfil Ativo:{' '}
              <b style={{ color: isDarkMode ? '#f8fafc' : '#0f172a' }}>
                {currentRole === 'master'
                  ? '👑 Administrador Master'
                  : currentRole === 'gestao'
                  ? '🏛️ Gestão Escolar'
                  : '👨‍🏫 Professor(a)'}
              </b>
            </span>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
                color: '#b91c1c',
                fontWeight: '700',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title="Desconectar conta atual e limpar sessão"
            >
              <LogOut style={{ width: '12px', height: '12px' }} />
              <span>Sair / Desconectar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
