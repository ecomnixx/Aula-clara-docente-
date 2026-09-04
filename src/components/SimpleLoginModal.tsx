import React from 'react';
import { googleOAuthUrl } from '../utils/supabaseAuth';

interface SimpleLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  currentEmail: string;
  onLogout?: () => void;
}

export const SimpleLoginModal: React.FC<SimpleLoginModalProps> = ({
  isOpen,
  onClose,
  currentName,
  currentEmail,
  onLogout,
}) => {
  if (!isOpen) return null;
  const hasSession = Boolean(localStorage.getItem('aula_clara_access_token'));

  return (
    <div className="simple-login-backdrop" onClick={hasSession ? onClose : undefined}>
      <section className="simple-login-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} aria-labelledby="simple-login-title">
        {hasSession && (
          <button type="button" className="simple-login-close" onClick={onClose} aria-label="Fechar">×</button>
        )}
        <div className="simple-login-brand" aria-hidden="true">A</div>
        <p className="simple-login-eyebrow">AULA CLARA</p>
        <h1 id="simple-login-title">Acesse sua conta</h1>
        <p className="simple-login-description">
          Entre com o Google para continuar com segurança.
        </p>

        {hasSession ? (
          <div className="simple-login-current-user">
            <strong>{currentName}</strong>
            <span>{currentEmail}</span>
            <button type="button" onClick={onLogout}>Sair da conta</button>
          </div>
        ) : (
          <>
            <button type="button" className="google-login-button" onClick={() => { window.location.href = googleOAuthUrl(); }}>
              <span className="google-mark" aria-hidden="true">G</span>
              Continuar com Google
            </button>
            <p className="simple-login-signup">
              Ainda não tem cadastro? <button type="button" onClick={() => { window.location.href = googleOAuthUrl(); }}>Crie sua conta com Google</button>
            </p>
            <small>Novos professores recebem 15 dias de acesso automaticamente.</small>
          </>
        )}
      </section>
    </div>
  );
};
