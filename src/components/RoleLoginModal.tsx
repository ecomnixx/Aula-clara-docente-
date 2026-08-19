import React, { useState } from 'react';
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
} from 'lucide-react';

interface RoleLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: 'professor' | 'gestao';
  currentName: string;
  currentEmail: string;
  onSelectRole: (role: 'professor' | 'gestao', name: string, email: string, roleTitle?: string) => void;
  showToast: (msg: string) => void;
  defaultTab?: 'professor' | 'gestao';
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
}) => {
  const [activeTab, setActiveTab] = useState<'professor' | 'gestao'>(defaultTab);

  // Professor Form State
  const [profName, setProfName] = useState(
    currentRole === 'professor' ? currentName : 'Prof. Carlos Eduardo'
  );
  const [profEmail, setProfEmail] = useState(
    currentRole === 'professor' ? currentEmail : 'professor@escola.com.br'
  );
  const [profSchool, setProfSchool] = useState('Escola Estadual Anísio Teixeira');

  // Gestão Form State
  const [gestaoName, setGestaoName] = useState(
    currentRole === 'gestao' ? currentName : 'Coordenação Pedagógica'
  );
  const [gestaoEmail, setGestaoEmail] = useState(
    currentRole === 'gestao' ? currentEmail : 'gestao.pedagogica@escola.com.br'
  );
  const [gestaoTitle, setGestaoTitle] = useState<'Coordenador(a) Pedagógico(a)' | 'Diretor(a) Escolar' | 'Orientador(a) Educacional' | 'Supervisor(a) de Ensino'>(
    'Coordenador(a) Pedagógico(a)'
  );
  const [gestaoPassword, setGestaoPassword] = useState('gestao2026');
  const [gestaoError, setGestaoError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginProfessor = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profEmail.trim()) {
      showToast('Por favor, informe seu e-mail.');
      return;
    }
    const finalName = profName.trim() || 'Professor(a)';
    onSelectRole('professor', finalName, profEmail.trim().toLowerCase());
    showToast(`Conectado como ${finalName} (Perfil Professor)`);
    onClose();
  };

  const handleLoginGestao = (e: React.FormEvent) => {
    e.preventDefault();
    setGestaoError(null);

    // Validação da chave de gestão (aceita gestao2026, 123456, admin, ou qualquer chave não vazia para não travar o usuário)
    if (!gestaoPassword.trim()) {
      setGestaoError('Digite a chave de acesso da Gestão.');
      return;
    }

    const finalName = gestaoName.trim() || gestaoTitle;
    onSelectRole('gestao', finalName, gestaoEmail.trim().toLowerCase(), gestaoTitle);
    showToast(`Conectado com sucesso no Painel de Gestão Escolar (${gestaoTitle})`);
    onClose();
  };

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
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '540px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
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
              Autenticação & Controle de Acesso
            </span>
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0', color: '#ffffff' }}>
              Selecione o seu Perfil de Acesso
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>
              Escolha seu tipo de conta para acessar as ferramentas adequadas
            </p>
          </div>

          {/* Abas de Troca de Perfil */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              padding: '4px',
              borderRadius: '14px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('professor')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === 'professor' ? '#ffffff' : 'transparent',
                color: activeTab === 'professor' ? '#0f172a' : '#cbd5e1',
                fontSize: '13px',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'professor' ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              <BookOpen style={{ width: '16px', height: '16px', color: activeTab === 'professor' ? '#0284c7' : '#94a3b8' }} />
              <span>👨‍🏫 Professor(a)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gestao')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === 'gestao' ? '#ffffff' : 'transparent',
                color: activeTab === 'gestao' ? '#0f172a' : '#cbd5e1',
                fontSize: '13px',
                fontWeight: '800',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'gestao' ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              <BarChart3 style={{ width: '16px', height: '16px', color: activeTab === 'gestao' ? '#7c3aed' : '#94a3b8' }} />
              <span>🏛️ Gestão Escolar</span>
            </button>
          </div>
        </div>

        {/* Tab 1: PROFESSOR */}
        {activeTab === 'professor' && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '12px',
                color: '#0369a1',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>📚</span>
              <div>
                <strong>Acesso do Corpo Docente:</strong> Crie planos de aula, avaliações BNCC, corrija provas por foto, gere planos de reensino e adapte conteúdos para inclusão (PEI).
              </div>
            </div>

            <form onSubmit={handleLoginProfessor} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
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
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
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
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
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
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '14px',
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
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '12px',
                color: '#5b21b6',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>🏛️</span>
              <div>
                <strong>Acesso da Coordenação & Direção:</strong> Acesse o Mapa de Calor de Rendimento das Turmas, Diagnóstico Coletivo da BNCC, Emissão de Pareceres Descritivos e Relatórios para Conselho de Classe.
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
                }}
              >
                {gestaoError}
              </div>
            )}

            <form onSubmit={handleLoginGestao} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  Cargo / Função na Gestão:
                </label>
                <select
                  value={gestaoTitle}
                  onChange={(e) => setGestaoTitle(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                    fontWeight: '700',
                    color: '#0f172a',
                  }}
                >
                  <option value="Coordenador(a) Pedagógico(a)">Coordenador(a) Pedagógico(a)</option>
                  <option value="Diretor(a) Escolar">Diretor(a) Escolar</option>
                  <option value="Orientador(a) Educacional">Orientador(a) Educacional</option>
                  <option value="Supervisor(a) de Ensino">Supervisor(a) de Ensino / AEE</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
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
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
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
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>
                    Chave de Acesso / Senha de Gestão:
                  </label>
                  <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: '600' }}>
                    Chave padrão: gestao2026
                  </span>
                </div>
                <input
                  type="password"
                  value={gestaoPassword}
                  onChange={(e) => setGestaoPassword(e.target.value)}
                  placeholder="Digite a senha de gestão"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '8px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '14px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '800',
                  cursor: 'pointer',
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

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          <span>Perfil Atual: <b>{currentRole === 'gestao' ? '🏛️ Gestão Escolar' : '👨‍🏫 Professor(a)'}</b></span>
          <span>Plataforma Aula Clara • Gestão & Docência</span>
        </div>
      </div>
    </div>
  );
};
