import React from 'react';
import { Database, Wifi, WifiOff, RefreshCw, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { SyncStateInfo } from '../utils/indexedDBStorage';

interface OfflineSyncBadgeProps {
  syncState: SyncStateInfo;
  onClick: () => void;
}

export const OfflineSyncBadge: React.FC<OfflineSyncBadgeProps> = ({ syncState, onClick }) => {
  const { isOnline, isSyncing, pendingCount } = syncState;

  if (!isOnline) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer shadow-xs bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
        title="Você está offline. Suas edições de planos e provas estão sendo salvas no IndexedDB local e serão sincronizadas assim que a internet voltar."
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
        <WifiOff className="w-3.5 h-3.5 text-amber-700" />
        <span className="hidden sm:inline">Offline ·</span>
        <span>{pendingCount > 0 ? `${pendingCount} no Cache (IndexedDB)` : 'Cache Local Ativo'}</span>
      </button>
    );
  }

  if (isSyncing) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer shadow-xs bg-blue-50 border-blue-300 text-blue-900"
        title="Sincronizando planos e provas salvos no IndexedDB com o servidor..."
      >
        <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
        <span className="hidden sm:inline">Sincronizando com a Nuvem...</span>
        <span className="sm:hidden">Sincronizando...</span>
      </button>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer shadow-xs bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
        title="Existem planos ou avaliações no IndexedDB aguardando sincronização com o servidor."
      >
        <Clock className="w-3.5 h-3.5 text-amber-600" />
        <span>{pendingCount} para Sincronizar</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
      title="Cache Local IndexedDB ativo e 100% sincronizado com a nuvem."
    >
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      <span>Cache IndexedDB: Sincronizado</span>
    </button>
  );
};
