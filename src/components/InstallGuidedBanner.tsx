import React, { useState, useEffect } from 'react';

interface InstallGuidedBannerProps {
  deferredPrompt: any;
  isInstalled: boolean;
  onInstallAccepted?: () => void;
}

export const InstallGuidedBanner: React.FC<InstallGuidedBannerProps> = ({
  deferredPrompt,
  isInstalled,
  onInstallAccepted,
}) => {
  const [visible, setVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('android');
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('aula-clara-install-banner-dismissed') === '1';

    // Device detection
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);

    if (isIOS) {
      setDeviceType('ios');
    } else if (isAndroid) {
      setDeviceType('android');
    } else {
      setDeviceType('desktop');
    }

    // Only show if not installed and not dismissed
    if (!isInstalled && !isDismissed) {
      // Small delay for smooth entry after load
      const timer = setTimeout(() => {
        setVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [isInstalled]);

  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem('aula-clara-install-banner-dismissed', '1');
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          if (onInstallAccepted) onInstallAccepted();
          setVisible(false);
        }
      } catch (err) {
        console.warn('[PWA Install Error]', err);
        setGuideOpen(true);
      }
    } else {
      // Open guided modal if native prompt is not ready or on iOS
      setGuideOpen(true);
    }
  };

  const handleCopyLink = () => {
    const url = window.location.origin + '/baixar.html';
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  if (isInstalled || !visible) return null;

  return (
    <>
      {/* Floating Bottom Install Toast / Banner */}
      <aside
        id="pwa-install-toast"
        role="region"
        aria-label="Instalar aplicativo oficial"
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '520px',
          zIndex: 9999,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderRadius: '18px',
          padding: '12px 14px',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          animation: 'slideUpToast 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              minHeight: '44px',
              justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
            }}
          >
            📲
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#f8fafc', whiteSpace: 'nowrap' }}>
                Instalar Aplicativo
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: '800',
                  background: '#10b981',
                  color: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                }}
              >
                100% Grátis
              </span>
            </div>
            <div
              style={{
                fontSize: '11.5px',
                color: '#94a3b8',
                lineHeight: '1.25',
                marginTop: '1px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Adicione à tela inicial para abrir em tela cheia sem navegador.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            id="btn-trigger-pwa-install"
            onClick={handleInstallClick}
            style={{
              minHeight: '44px',
              padding: '9px 14px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'transform 0.1s ease',
            }}
          >
            <span>Instalar</span>
            <span style={{ fontSize: '14px' }}>›</span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            title="Lembrar mais tarde"
          >
            ✕
          </button>
        </div>
      </aside>

      {/* Guided Step-by-Step Installation Modal */}
      {guideOpen && (
        <div
          className="admin-backdrop"
          onClick={() => setGuideOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 10000,
          }}
        >
          <div
            className="account-panel install-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '100%',
              background: '#ffffff',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.3)',
              border: '1px solid #e2e8f0',
              color: '#0f172a',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                padding: '18px 20px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>📲</span>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '900', letterSpacing: '0.04em' }}>
                    ADICIONAR À TELA INICIAL
                  </div>
                  <div style={{ fontSize: '11px', color: '#bae6fd' }}>
                    Passo a passo guiado para seu aparelho
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              {/* Device Selector Tabs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginBottom: '16px',
                  background: '#f1f5f9',
                  padding: '4px',
                  borderRadius: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setDeviceType('android')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: deviceType === 'android' ? '#ffffff' : 'transparent',
                    color: deviceType === 'android' ? '#0284c7' : '#64748b',
                    fontWeight: '800',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    boxShadow: deviceType === 'android' ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🤖</span>
                  <span>Android (Chrome)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceType('ios')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: deviceType === 'ios' ? '#ffffff' : 'transparent',
                    color: deviceType === 'ios' ? '#0284c7' : '#64748b',
                    fontWeight: '800',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    boxShadow: deviceType === 'ios' ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🍎</span>
                  <span>iPhone (iOS)</span>
                </button>
              </div>

              {/* Step list for Android */}
              {deviceType === 'android' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                      Toque no menu do Chrome nos <b>3 pontinhos (⋮)</b> no canto superior direito do navegador.
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                      Selecione a opção <b>"Instalar aplicativo"</b> ou <b>"Adicionar à tela inicial"</b>.
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      3
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                      Confirme em <b>"Instalar"</b>. O ícone oficial do <b>Aula Clara</b> será adicionado à sua tela inicial e funcionará como um aplicativo!
                    </div>
                  </div>
                </div>
              )}

              {/* Step list for iOS */}
              {deviceType === 'ios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                      No <b>Safari</b>, toque no botão de <b>Compartilhar 📤</b> na barra inferior.
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                      Role a lista para baixo e toque em <b>"Adicionar à Tela de Início ➕"</b>.
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      3
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                      Toque em <b>"Adicionar"</b> no canto superior direito para fixar o aplicativo.
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons in Modal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '18px' }}>
                {deferredPrompt && (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                    }}
                  >
                    📲 Tentar Instalação Automática 1-Toque
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    background: '#f8fafc',
                    color: '#0284c7',
                    border: '1.5px solid #bae6fd',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{isCopied ? '✓ Link copiado!' : '📋 Copiar link da página de download'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  style={{
                    width: '100%',
                    padding: '9px 16px',
                    background: 'none',
                    color: '#64748b',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Entendi, fechar guia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
