import React from 'react';
import {
  Database,
  CloudOff,
  Cloud,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  FileText,
  Trash2,
  ArrowRight,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CachedMaterial, SyncStateInfo, SyncQueueItem } from '../utils/indexedDBStorage';

interface OfflineSyncCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncState: SyncStateInfo;
  materials: CachedMaterial[];
  onForceSync: () => void;
  onSelectMaterial?: (item: CachedMaterial) => void;
  showToast: (msg: string) => void;
}

export const OfflineSyncCenterModal: React.FC<OfflineSyncCenterModalProps> = ({
  isOpen,
  onClose,
  syncState,
  materials,
  onForceSync,
  onSelectMaterial,
  showToast,
}) => {
  if (!isOpen) return null;

  const pendingMaterials = materials.filter((m) => !m.synced || m.syncStatus === 'pending');
  const syncedMaterials = materials.filter((m) => m.synced && m.syncStatus === 'synced');

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
          maxWidth: '620px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: syncState.isOnline
              ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
              : 'linear-gradient(135deg, #78350f 0%, #92400e 100%)',
            padding: '22px 24px 18px',
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
              background: 'rgba(255, 255, 255, 0.12)',
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: syncState.isOnline ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.25)',
                color: syncState.isOnline ? '#86efac' : '#fde68a',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                border: `1px solid ${syncState.isOnline ? 'rgba(34, 197, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
              }}
            >
              {syncState.isOnline ? (
                <>
                  <Wifi style={{ width: '13px', height: '13px' }} />
                  Conectado à Rede
                </>
              ) : (
                <>
                  <WifiOff style={{ width: '13px', height: '13px' }} />
                  Modo Offline Ativo
                </>
              )}
            </span>

            {syncState.isSyncing && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(59, 130, 246, 0.25)',
                  color: '#93c5fd',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: '700',
                }}
              >
                <RefreshCw style={{ width: '12px', height: '12px', animation: 'spin 1s linear infinite' }} />
                Sincronizando...
              </span>
            )}
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 4px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database style={{ width: '22px', height: '22px', color: '#38bdf8' }} />
            Cache Local (IndexedDB) & Sincronização
          </h2>
          <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: 1.4 }}>
            Edições de planos de aula e avaliações são salvas no banco de dados local do navegador e sincronizadas automaticamente quando a conexão for restabelecida.
          </p>
        </div>

        {/* Body Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Status Metrics Banner */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
            }}
          >
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                Armazenados Local
              </div>
              <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>
                {materials.length}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Planos e Provas</div>
            </div>

            <div
              style={{
                background: pendingMaterials.length > 0 ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${pendingMaterials.length > 0 ? '#fde68a' : '#bbf7d0'}`,
                borderRadius: '14px',
                padding: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: '700', color: pendingMaterials.length > 0 ? '#b45309' : '#15803d', textTransform: 'uppercase' }}>
                Pendentes de Sinc
              </div>
              <div style={{ fontSize: '22px', fontWeight: '900', color: pendingMaterials.length > 0 ? '#d97706' : '#16a34a', marginTop: '2px' }}>
                {pendingMaterials.length}
              </div>
              <div style={{ fontSize: '11px', color: pendingMaterials.length > 0 ? '#b45309' : '#166534' }}>
                {pendingMaterials.length > 0 ? 'Salvos no IndexedDB' : 'Tudo em dia'}
              </div>
            </div>

            <div
              style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '14px',
                padding: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#0369a1', textTransform: 'uppercase' }}>
                Último Envio
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#0284c7', marginTop: '4px' }}>
                {syncState.lastSyncTime || 'Agora'}
              </div>
              <div style={{ fontSize: '11px', color: '#0284c7' }}>Sincronizado</div>
            </div>
          </div>

          {/* Action Button: Forçar Sincronização */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck style={{ width: '16px', height: '16px', color: '#16a34a' }} />
                Proteção Automática Ativa
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {syncState.isOnline
                  ? 'Você está online. O sistema envia automaticamente todas as alterações.'
                  : 'Você está sem internet. Edite livremente, seus dados estão seguros no IndexedDB.'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onForceSync();
                showToast(syncState.isOnline ? 'Sincronizando com a nuvem...' : 'Aguardando conexão com a internet...');
              }}
              disabled={syncState.isSyncing}
              style={{
                padding: '10px 16px',
                background: syncState.isOnline ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#94a3b8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '12.5px',
                fontWeight: '800',
                cursor: syncState.isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                boxShadow: syncState.isOnline ? '0 2px 8px rgba(2, 132, 199, 0.3)' : 'none',
              }}
            >
              <RefreshCw style={{ width: '14px', height: '14px', animation: syncState.isSyncing ? 'spin 1s linear infinite' : 'none' }} />
              <span>{syncState.isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
            </button>
          </div>

          {/* List of Materials with status */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Arquivos em Cache Local ({materials.length})</span>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                IndexedDB: <b>AulaClara_OfflineDB_v2</b>
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
              {materials.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: '14px',
                    border: '1px dashed #cbd5e1',
                    color: '#64748b',
                    fontSize: '13px',
                  }}
                >
                  Nenhum plano ou avaliação salvo ainda. Gere ou edite um material para salvar no cache.
                </div>
              ) : (
                materials.map((m) => {
                  const isPending = !m.synced || m.syncStatus === 'pending';
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        if (onSelectMaterial) {
                          onSelectMaterial(m);
                          onClose();
                        }
                      }}
                      style={{
                        padding: '12px 14px',
                        background: isPending ? '#fffbeb' : '#ffffff',
                        border: `1px solid ${isPending ? '#fde68a' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: onSelectMaterial ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: m.type === 'aula' ? '#e0f2fe' : '#f5f3ff',
                            color: m.type === 'aula' ? '#0284c7' : '#7c3aed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            fontSize: '13px',
                            flexShrink: 0,
                          }}
                        >
                          {m.type === 'aula' ? '▤' : '✓'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {m.title}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {m.className} • {m.bimester}º Bimestre • {m.grade}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {isPending ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              background: '#fef3c7',
                              color: '#b45309',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                            }}
                          >
                            <Clock style={{ width: '12px', height: '12px' }} />
                            Salvo Offline
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              background: '#dcfce7',
                              color: '#15803d',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                            }}
                          >
                            <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                            Sincronizado
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <span>Tecnologia IndexedDB HTML5 • Armazenamento Local Seguro</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
