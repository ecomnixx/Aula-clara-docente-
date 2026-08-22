import React, { useState, useEffect, useRef } from 'react';
import { DISCIPLINAS_LIST, SEGMENTOS_LIST, ANOS_POR_SEGMENTO, DISCIPLINAS_POR_SEGMENTO, BNCC_SKILLS_DATABASE } from './data/bnccData';
import {
  BnccSkill,
  DisciplinaType,
  SegmentoType,
  ProcessedMaterialCache,
  RelatorioCorrecaoProva,
  PlanoReensinoResult,
  AdaptacaoInclusivaResult,
  ParecerDescritivoResult,
  TeacherAccess,
} from './types';
import { CorrigirProvaView } from './components/CorrigirProvaView';
import { DiagnosticoTurmaView } from './components/DiagnosticoTurmaView';
import { ReensinoRecuperacaoView } from './components/ReensinoRecuperacaoView';
import { AdaptacaoInclusivaView } from './components/AdaptacaoInclusivaView';
import { ParecerDescritivoView } from './components/ParecerDescritivoView';
import { SimpleLoginModal } from './components/SimpleLoginModal';
import { GeminiChatbotView } from './components/GeminiChatbotView';
import { BnccStepFilter } from './components/BnccStepFilter';
import { InstallGuidedBanner } from './components/InstallGuidedBanner';
import { ExportPdfModal } from './components/ExportPdfModal';
import { indexedDBStorage, CachedMaterial, SyncStateInfo } from './utils/indexedDBStorage';
import { OfflineSyncBadge } from './components/OfflineSyncBadge';
import { OfflineSyncCenterModal } from './components/OfflineSyncCenterModal';
import { compressImage, fileToBase64, safeFetchJson } from './utils/api';
import { getAccessToken, hydrateOAuthSessionFromHash, logoutSupabase } from './utils/supabaseAuth';
import { loadMaterialImageDraft, saveMaterialImageDraft } from './utils/imageDraftStorage';
import { MaterialSourcesView } from './components/MaterialSourcesView';

export interface SavedMaterial {
  id: number;
  type: 'aula' | 'prova' | 'correcao_prova' | 'diagnostico' | 'reensino' | 'adaptacao_inclusiva' | 'parecer' | 'chat';
  title: string;
  subject: string;
  grade: string;
  className: string;
  bimester: number;
  content: string;
  createdAt: string;
  updatedAt?: string;
  authorEmail?: string;
  authorName?: string;
  synced?: boolean;
  syncStatus?: 'synced' | 'pending' | 'syncing' | 'error';
}

type MaterialSourceStatus = 'pending' | 'reading' | 'ready' | 'error';

interface MaterialImageSource {
  id: string;
  file: File;
  url: string;
  name: string;
  selected: boolean;
  status: MaterialSourceStatus;
  text: string;
  error?: string;
}

interface AppNotification {
  id: string;
  type: 'registration' | 'update';
  title: string;
  message: string;
  createdAt: string;
}

function composeSourceText(sources: MaterialImageSource[]): string {
  return sources
    .filter((source) => source.selected && source.status === 'ready' && source.text.trim())
    .map((source, index) => `【Fonte ${index + 1}: ${source.name}】\n${source.text.trim()}`)
    .join('\n\n')
    .trim();
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map((part) => Number(part) || 0);
  const currentParts = current.split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index++) {
    const difference = (latestParts[index] || 0) - (currentParts[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'home' | 'create' | 'sources' | 'saved' | 'corrigir_prova' | 'diagnostico_turma' | 'plano_reensino' | 'adaptacao_inclusiva' | 'parecer_descritivo' | 'chat'
  >('create');
  const [reensinoDefasagensTransit, setReensinoDefasagensTransit] = useState<string>('');
  const [adaptacaoConteudoTransit, setAdaptacaoConteudoTransit] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [accessManagerOpen, setAccessManagerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('aula-clara-notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [exportPdfData, setExportPdfData] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
    materialType: 'aula' | 'prova' | 'reensino' | 'adaptacao' | 'outro';
    subject: string;
    grade: string;
    className: string;
    bimester: number | string;
    gabarito?: string;
  } | null>(null);

  // User state & Role (Professor vs Gestão Escolar vs Master)
  const [userRole, setUserRole] = useState<'professor' | 'gestao' | 'master'>(() => {
    return (localStorage.getItem('aula_clara_user_role') as 'professor' | 'gestao' | 'master') || 'professor';
  });
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('aula_clara_user_name') || 'Professor';
  });
  const [userEmail, setUserEmail] = useState(() => {
    return localStorage.getItem('aula_clara_user_email') || 'professor@escola.com.br';
  });
  const [gestaoRoleTitle, setGestaoRoleTitle] = useState(() => {
    return localStorage.getItem('aula_clara_gestao_role_title') || 'Coordenação Pedagógica';
  });
  const [loginModalOpen, setLoginModalOpen] = useState(() => !getAccessToken());
  const [loginModalDefaultTab, setLoginModalDefaultTab] = useState<'professor' | 'gestao' | 'master'>('professor');

  const handleSelectRole = (role: 'professor' | 'gestao' | 'master', name: string, email: string, roleTitle?: string) => {
    setUserRole(role);
    setUserName(name);
    setUserEmail(email);
    if (roleTitle) {
      setGestaoRoleTitle(roleTitle);
      localStorage.setItem('aula_clara_gestao_role_title', roleTitle);
    }
    localStorage.setItem('aula_clara_user_role', role);
    localStorage.setItem('aula_clara_user_name', name);
    localStorage.setItem('aula_clara_user_email', email);
  };

  useEffect(() => {
    if (!window.location.hash.includes('access_token=')) return;
    hydrateOAuthSessionFromHash()
      .then((session) => {
        if (!session) return;
        handleSelectRole(session.role, session.name, session.email, session.roleTitle);
        setLoginModalOpen(false);
        showToast(`Bem-vindo(a), ${session.name}!`);
      })
      .catch((error: any) => {
        setLoginModalOpen(true);
        showToast(error?.message || 'Não foi possível concluir o acesso com Google.');
      });
  }, []);

  const handleLogout = async () => {
    if (!window.confirm('Deseja sair da sua conta no Aula Clara?')) return;
    await logoutSupabase();
    localStorage.removeItem('aula_clara_user_role');
    localStorage.removeItem('aula_clara_user_name');
    localStorage.removeItem('aula_clara_user_email');
    localStorage.removeItem('aula_clara_gestao_role_title');
    localStorage.removeItem('aula_clara_google_user');
    setUserRole('professor');
    setUserName('Professor');
    setUserEmail('professor@escola.com.br');
    setGestaoRoleTitle('Coordenação Pedagógica');
    setAccountBlockedMessage(null);
    setDrawerOpen(false);
    setAccountModalOpen(false);
    setAccessManagerOpen(false);
    setLoginModalDefaultTab('professor');
    setLoginModalOpen(true);
    showToast('Sessão encerrada com segurança.');
  };

  // Master é uma identidade explícita, nunca inferida por palavras no e-mail.
  const isMaster = userRole === 'master' && userEmail.trim().toLowerCase() === 'ecomnixx@gmail.com';

  // Step 1: Subject, Segment, Grade, Lessons
  const [segmento, setSegmento] = useState<SegmentoType>('Ensino Fundamental – Anos Finais');
  const [disciplina, setDisciplina] = useState<DisciplinaType>('Língua Portuguesa');
  const [ano, setAno] = useState<string>('6º Ano');
  const [tipoEdFisica, setTipoEdFisica] = useState<'prática' | 'teórica'>('prática');
  const [qtdAulas, setQtdAulas] = useState<number>(2);
  const [isCustomAulas, setIsCustomAulas] = useState<boolean>(false);

  // Update grade and discipline when segment changes
  useEffect(() => {
    const grades = ANOS_POR_SEGMENTO[segmento] || [];
    if (grades.length > 0 && !grades.includes(ano)) {
      setAno(grades[0]);
    }
    const discs = DISCIPLINAS_POR_SEGMENTO[segmento] || [];
    if (discs.length > 0 && !discs.includes(disciplina)) {
      setDisciplina(discs[0]);
    }
  }, [segmento]);

  // Step 2: Images & OCR
  const [selectedImages, setSelectedImages] = useState<MaterialImageSource[]>([]);
  const imageDraftHydratedRef = useRef(false);
  const [isReadingOcr, setIsReadingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [isOcrExpanded, setIsOcrExpanded] = useState(false);

  // Dificuldade da Prova (Fácil / Médio / Difícil)
  const [dificuldadeProva, setDificuldadeProva] = useState<'Fácil' | 'Médio' | 'Difícil'>('Médio');

  // Structured Material Cache State
  const [structuredMaterial, setStructuredMaterial] = useState<ProcessedMaterialCache | null>(null);
  const [isStructuring, setIsStructuring] = useState<boolean>(false);

  // Pinned / Selected BNCC Skills
  const [selectedPinnedSkills, setSelectedPinnedSkills] = useState<BnccSkill[]>([]);

  const handleTogglePinSkill = (skill: BnccSkill) => {
    setSelectedPinnedSkills((prev) => {
      const exists = prev.some((s) => s.codigo === skill.codigo);
      if (exists) {
        return prev.filter((s) => s.codigo !== skill.codigo);
      } else {
        return [...prev, skill];
      }
    });
  };

  const handleClearPinnedSkills = () => {
    setSelectedPinnedSkills([]);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadMaterialImageDraft()
      .then((storedImages) => {
        if (cancelled || storedImages.length === 0) return;
        const validStoredImages = storedImages.filter((stored) => stored.blob?.size > 0);
        if (validStoredImages.length !== storedImages.length) {
          saveMaterialImageDraft(validStoredImages);
          showToast('Uma foto vazia foi removida. Tire a foto novamente.');
        }
        if (validStoredImages.length === 0) return;
        setSelectedImages(validStoredImages.map((stored) => {
          const file = new File([stored.blob], stored.name, {
            type: stored.type || stored.blob.type || 'image/jpeg',
          });
          return {
            ...stored,
            file,
            url: URL.createObjectURL(file),
            status: stored.status === 'ready' ? 'ready' : 'pending',
          };
        }));
        showToast(`${storedImages.length} foto(s) recuperada(s) no aplicativo.`);
      })
      .catch((error) => console.warn('[Fotos] Não foi possível recuperar o rascunho:', error))
      .finally(() => {
        imageDraftHydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!imageDraftHydratedRef.current) return;
    saveMaterialImageDraft(selectedImages.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.file.type,
      blob: source.file,
      selected: source.selected,
      status: source.status === 'reading' ? 'pending' : source.status,
      text: source.text,
      error: source.error,
    }))).catch((error) => console.warn('[Fotos] Não foi possível salvar o rascunho:', error));
  }, [selectedImages]);

  // Step 5: Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState<'analise' | 'validacao' | 'geracao' | 'revisao' | 'etapa1' | 'etapa2' | null>(null);
  const [generatedType, setGeneratedType] = useState<'aula' | 'prova' | null>(null);
  const [generatedContent, setGeneratedContent] = useState('');
  const [generatedAnoSerie, setGeneratedAnoSerie] = useState('');
  const [generatedDisciplina, setGeneratedDisciplina] = useState('');
  const [lastInterpretacao, setLastInterpretacao] = useState<{
    titulo_identificado?: string;
    tema_principal?: string;
    subtemas?: string[];
    pessoas_eventos_conceitos_importantes?: string[];
    resumo_fiel?: string;
    confianca_interpretacao?: string;
    confianca_score?: number;
    titulo_exato?: string;
    ano_serie_lido?: string;
    volume_lido?: string;
    capitulo_lido?: string;
    dados_concretos?: string[];
  } | null>(null);
  const [targetClass, setTargetClass] = useState('Turma A');
  const [selectedBimester, setSelectedBimester] = useState<number>(1);

  // Saved materials
  const [savedMaterials, setSavedMaterials] = useState<SavedMaterial[]>(() => {
    try {
      const saved = localStorage.getItem('aula-clara-saved');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [folderBimesterTab, setFolderBimesterTab] = useState<number>(1);
  const [editingMaterial, setEditingMaterial] = useState<SavedMaterial | null>(null);

  // Offline IndexedDB Sync State
  const [syncState, setSyncState] = useState<SyncStateInfo>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    totalCached: 0,
  });
  const [syncModalOpen, setSyncModalOpen] = useState<boolean>(false);
  const [draftSavedText, setDraftSavedText] = useState<string | null>(null);
  const draftDebounceRef = useRef<any>(null);

  // Initialize IndexedDB cache & listen for sync events
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await indexedDBStorage.seedFromLocalStorage();
        const allCached = await indexedDBStorage.getAllMaterials();
        if (isMounted && allCached && allCached.length > 0) {
          setSavedMaterials(allCached as SavedMaterial[]);
        }
        const initialStatus = await indexedDBStorage.getSyncState();
        if (isMounted) {
          setSyncState(initialStatus);
        }
      } catch (err) {
        console.warn('[IndexedDB] Init error:', err);
      }
    })();

    const unsubscribe = indexedDBStorage.subscribe((state) => {
      if (isMounted) {
        setSyncState(state);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Save material to robust local IndexedDB cache & queue cloud sync
  const persistMaterialLocallyAndSync = async (
    mat: Omit<SavedMaterial, 'id'> & { id?: number }
  ): Promise<CachedMaterial> => {
    const finalMat: CachedMaterial = {
      id: mat.id || Date.now(),
      type: mat.type,
      title: mat.title,
      subject: mat.subject,
      grade: mat.grade,
      className: mat.className,
      bimester: mat.bimester,
      content: mat.content,
      createdAt: mat.createdAt || new Date().toLocaleDateString('pt-BR'),
      updatedAt: new Date().toISOString(),
      authorEmail: userEmail,
      authorName: userName,
      synced: false,
      syncStatus: 'pending',
    };

    const saved = await indexedDBStorage.saveMaterial(finalMat);
    setSavedMaterials((prev) => {
      const idx = prev.findIndex((item) => item.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved as SavedMaterial;
        return copy;
      }
      return [saved as SavedMaterial, ...prev];
    });
    return saved;
  };

  // Delete material from IndexedDB and queue deletion sync
  const deleteMaterialLocallyAndSync = async (id: number) => {
    await indexedDBStorage.deleteMaterial(id);
    setSavedMaterials((prev) => prev.filter((item) => item.id !== id));
  };

  // Access management (Master panel)
  const [accessList, setAccessList] = useState<TeacherAccess[]>(() => {
    try {
      const saved = localStorage.getItem('aula-clara-access-list');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: 'master-1', name: 'Administrador Master', email: 'ecomnixx@gmail.com', role: 'master', roleTitle: 'Administrador Geral', daysRemaining: 9999, status: 'Ativo', createdAt: '19/08/2026' },
      { id: '1', name: 'Prof. Lucas Ribeiro', email: 'lucas.ribeiro@escola.com', role: 'professor', roleTitle: 'Língua Portuguesa', daysRemaining: 28, status: 'Ativo', createdAt: '10/08/2026' },
      { id: '2', name: 'Profª. Carla Menezes', email: 'carla.menezes@escola.com', role: 'professor', roleTitle: 'Matemática', daysRemaining: 15, status: 'Ativo', createdAt: '02/08/2026' },
      { id: '3', name: 'Coord. Helena Souza', email: 'helena.coordenacao@escola.com', role: 'gestao', roleTitle: 'Coordenação Pedagógica', daysRemaining: 30, status: 'Ativo', createdAt: '15/08/2026' }
    ];
  });
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherRole, setNewTeacherRole] = useState<'professor' | 'gestao'>('professor');
  const [newTeacherRoleTitle, setNewTeacherRoleTitle] = useState('');
  const [newTeacherDays, setNewTeacherDays] = useState(15);
  const [accessFilter, setAccessFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [accessSearch, setAccessSearch] = useState('');
  const [syncLastTime, setSyncLastTime] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [accountBlockedMessage, setAccountBlockedMessage] = useState<string | null>(null);

  // Per-user interactive days adjustment state
  const [daysAdjustmentMap, setDaysAdjustmentMap] = useState<Record<string, { delta: number; mode: 'add' | 'subtract' }>>({});

  const getUserAdjustment = (id: string, currentDays: number) => {
    const adj = daysAdjustmentMap[id] || { delta: 1, mode: 'add' };
    const validDelta = isNaN(adj.delta) ? 0 : adj.delta;
    const afterDays = adj.mode === 'add' ? Math.max(0, currentDays + validDelta) : Math.max(0, currentDays - validDelta);
    return { delta: validDelta, mode: adj.mode, afterDays };
  };

  const setUserAdjustmentDelta = (id: string, delta: number) => {
    setDaysAdjustmentMap((prev) => ({
      ...prev,
      [id]: { delta: isNaN(delta) ? 0 : Math.max(0, delta), mode: prev[id]?.mode || 'add' },
    }));
  };

  const setUserAdjustmentMode = (id: string, mode: 'add' | 'subtract') => {
    setDaysAdjustmentMap((prev) => ({
      ...prev,
      [id]: { delta: prev[id]?.delta ?? 1, mode },
    }));
  };

  const getExpirationInfo = (days: number) => {
    if (days <= 0) return 'Expirado';
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = d.toLocaleDateString('pt-BR');
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} às ${timeStr}`;
  };

  // Mobile App / PWA Installation & Updates States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(true);
  const [installDeviceTab, setInstallDeviceTab] = useState<'android' | 'ios' | 'apk'>('android');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateStatusText, setUpdateStatusText] = useState<string>('Seu aplicativo está atualizado.');

  const addNotification = (notification: AppNotification) => {
    setNotifications((previous) => {
      if (previous.some((item) => item.id === notification.id)) return previous;
      return [notification, ...previous].slice(0, 20);
    });
  };

  const dismissNotification = (notification: AppNotification) => {
    setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
    setNotificationsOpen(false);
    if (notification.type === 'registration') {
      setAccessManagerOpen(true);
    } else {
      setAccountModalOpen(true);
      handleCheckUpdate();
    }
  };

  useEffect(() => {
    localStorage.setItem('aula-clara-notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    // Check if running in standalone mode (installed mobile app)
    const isNativeAndroid = /AulaClaraAndroid/i.test(window.navigator.userAgent);
    const isStandalone =
      isNativeAndroid ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');
    
    if (isStandalone) {
      setIsInstalled(true);
      setShowInstallBanner(false);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      showToast('Aplicativo Aula Clara instalado com sucesso no seu celular!');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('Instalando aplicativo Aula Clara...');
      }
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    } else {
      setInstallModalOpen(true);
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Não foi possível consultar a versão.');
      const data = await res.json();
      const nativeBridge = (window as any).AulaClaraAndroid;
      const userAgentVersion = window.navigator.userAgent.match(/AulaClaraAndroid\/([0-9.]+)/i)?.[1];
      const currentVersion = nativeBridge?.getVersionName?.() || userAgentVersion || data.version;
      const latestVersion = String(data.version || currentVersion);
      const toParts = (value: string) => value.split('.').map((part) => Number(part) || 0);
      const currentParts = toParts(String(currentVersion));
      const latestParts = toParts(latestVersion);
      const hasUpdate = [0, 1, 2].some((index) => {
        if ((latestParts[index] || 0) === (currentParts[index] || 0)) return false;
        return (latestParts[index] || 0) > (currentParts[index] || 0)
          && latestParts.slice(0, index).every((part, previous) => part === (currentParts[previous] || 0));
      });

      if (!hasUpdate) {
        setUpdateStatusText(`Versão ${currentVersion}: aplicativo atualizado.`);
        showToast(`Versão ${currentVersion} verificada: tudo atualizado!`);
        return;
      }

      const apkUrl = new URL(data.apkUrl || '/aula-clara-android.apk', window.location.origin).href;
      setUpdateStatusText(`Nova versão ${latestVersion} disponível. Preparando instalação...`);
      showToast(`Atualização ${latestVersion} encontrada. O download vai começar.`);
      if (nativeBridge?.installUpdate) {
        nativeBridge.installUpdate(apkUrl, latestVersion);
      } else {
        window.location.assign(`${apkUrl}?v=${encodeURIComponent(latestVersion)}`);
      }
    } catch (e: any) {
      setUpdateStatusText('Não foi possível verificar a versão agora.');
      showToast(e?.message || 'Falha ao verificar atualização.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const checkForUpdateNotification = async () => {
      try {
        const response = await fetch(`/api/version?notification=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const nativeBridge = (window as any).AulaClaraAndroid;
        const userAgentVersion = window.navigator.userAgent.match(/AulaClaraAndroid\/([0-9.]+)/i)?.[1];
        const currentVersion = String(nativeBridge?.getVersionName?.() || userAgentVersion || data.version);
        const latestVersion = String(data.version || currentVersion);
        if (!cancelled && isNewerVersion(latestVersion, currentVersion)) {
          addNotification({
            id: `update:${latestVersion}`,
            type: 'update',
            title: `Nova versão ${latestVersion}`,
            message: `Atualize o Aula Clara. Você está usando a versão ${currentVersion}.`,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn('[NOTIFICAÇÕES] Falha ao verificar atualização:', error);
      }
    };
    checkForUpdateNotification();
    const interval = setInterval(checkForUpdateNotification, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleOpenDownloadPage = () => {
    window.open('/baixar.html', '_blank');
  };

  const handleDirectApkDownload = () => {
    const link = document.createElement('a');
    link.href = '/aula-clara-android.apk?v=3.1.7';
    link.download = 'Aula-Clara-3.1.7.apk';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Download do APK iniciado no seu celular!');
  };

  const handleShareWithColleagues = async () => {
    const downloadUrl = `${window.location.origin}/baixar.html`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Aula Clara — Aplicativo Oficial',
          text: 'Baixe o aplicativo oficial do Aula Clara para preparar aulas, provas e materiais com IA:',
          url: downloadUrl,
        });
        showToast('Compartilhado com sucesso!');
      } catch (e) {}
    } else {
      navigator.clipboard.writeText(downloadUrl);
      showToast('Link de download copiado para a área de transferência!');
    }
  };

  // Real-time synchronization with central server
  const syncWithServer = async () => {
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;
      setIsSyncing(true);
      const res = await fetch(`/api/sync/state?email=${encodeURIComponent(userEmail)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.users && Array.isArray(data.users)) {
          if (isMaster) {
            const knownKey = `aula-clara-known-access-emails:${userEmail.trim().toLowerCase()}`;
            const currentEmails = data.users.map((item: TeacherAccess) => item.email.trim().toLowerCase());
            try {
              const savedKnown = localStorage.getItem(knownKey);
              if (savedKnown) {
                const knownEmails = new Set<string>(JSON.parse(savedKnown));
                data.users
                  .filter((item: TeacherAccess) => !knownEmails.has(item.email.trim().toLowerCase()))
                  .forEach((item: TeacherAccess) => addNotification({
                    id: `registration:${item.email.trim().toLowerCase()}`,
                    type: 'registration',
                    title: 'Novo cadastro',
                    message: `${item.name} (${item.email}) entrou no Aula Clara.`,
                    createdAt: new Date().toISOString(),
                  }));
              }
              localStorage.setItem(knownKey, JSON.stringify(currentEmails));
            } catch (error) {
              console.warn('[NOTIFICAÇÕES] Falha ao comparar cadastros:', error);
            }
          }
          setAccessList(data.users);
          localStorage.setItem('aula-clara-access-list', JSON.stringify(data.users));
        }
        if (data.currentUser) {
          // If Master updated this user's role on the server, reflect dynamically
          if (data.currentUser.role && data.currentUser.role !== 'master') {
            if (data.currentUser.role !== userRole) {
              setUserRole(data.currentUser.role);
              localStorage.setItem('aula_clara_user_role', data.currentUser.role);
              if (data.currentUser.roleTitle) {
                setGestaoRoleTitle(data.currentUser.roleTitle);
                localStorage.setItem('aula_clara_gestao_role_title', data.currentUser.roleTitle);
              }
            }
          }
          if (data.currentUser.status === 'Bloqueado' || (data.currentUser.daysRemaining <= 0 && !isMaster)) {
            setAccountBlockedMessage('Seu acesso foi temporariamente pausado ou expirou. Entre em contato com a administração Master (ecomnixx@gmail.com) para liberação.');
          } else {
            setAccountBlockedMessage(null);
          }
        }
        setSyncLastTime(new Date().toLocaleTimeString('pt-BR'));
      }
    } catch (e) {
      console.warn('[SYNC] Erro na sincronização com servidor:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    syncWithServer();
    const interval = setInterval(syncWithServer, 5000);
    return () => clearInterval(interval);
  }, [userEmail, isMaster]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handle image files selection directly without cropping modal
  const handleFilesLegacy = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: MaterialImageSource[] = [];
    Array.from(files).forEach((file, index) => {
      newItems.push({
        id: `legacy-${Date.now()}-${index}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name || `Imagem ${index + 1}`,
        selected: true,
        status: 'pending',
        text: '',
      });
    });
    if (newItems.length > 0) {
      setSelectedImages((prev) => [...prev, ...newItems]);
      showToast(`${newItems.length} imagem(ns) adicionada(s)!`);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: MaterialImageSource[] = [];
    Array.from(files).forEach((file, index) => {
      newItems.push({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name || `Imagem ${selectedImages.length + index + 1}`,
        selected: true,
        status: 'pending',
        text: '',
      });
    });

    if (newItems.length > 0) {
      setSelectedImages((prev) => [...prev, ...newItems]);
      setStructuredMaterial(null);
      showToast(`${newItems.length} imagem(ns) adicionada(s)!`);
    }
  };

  // Perform OCR reading. Images are compressed and sent ONE AT A TIME to avoid
  // Vercel's request body limit (HTTP 413) while preserving page order.
  const handleReadImagesLegacy = async (): Promise<string> => {
    if (selectedImages.length === 0) return '';
    setIsReadingOcr(true);
    setOcrProgress(5);

    try {
      const transcriptions: string[] = [];

      for (let i = 0; i < selectedImages.length; i++) {
        const file = selectedImages[i].file;
        setOcrProgress(Math.round(5 + (i / selectedImages.length) * 85));

        // Keep printed text readable while reducing the request enough for Vercel.
        const { base64 } = await compressImage(file, 1400, 1400, 0.72);
        if (!base64) {
          throw new Error(`Não foi possível preparar a imagem ${i + 1} para leitura.`);
        }

        const data = await safeFetchJson<{ text?: string; error?: string }>('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: [
              {
                base64,
                mimeType: 'image/jpeg',
              },
            ],
          }),
        });

        if (!data.text || !data.text.trim()) {
          throw new Error(data.error || `Não foi possível extrair o texto da imagem ${i + 1}.`);
        }

        transcriptions.push(data.text.trim());
        setOcrProgress(Math.round(5 + ((i + 1) / selectedImages.length) * 90));
      }

      const combinedText = transcriptions.join('\n\n').trim();
      if (!combinedText) {
        throw new Error('Não foi possível extrair texto das imagens.');
      }

      setOcrText(combinedText);
      setOcrProgress(100);
      showToast('Texto lido com sucesso pela IA!');
      return combinedText;
    } catch (err: any) {
      console.error('Erro na extração OCR:', err);
      showToast(err.message || 'Erro ao digitalizar a imagem. Tente novamente em instantes.');
      return '';
    } finally {
      setIsReadingOcr(false);
    }
  };

  const handleReadImages = async (): Promise<string> => {
    const activeSources = selectedImages.filter((source) => source.selected);
    if (activeSources.length === 0) {
      showToast('Selecione ao menos uma fonte para leitura.');
      return '';
    }

    setIsReadingOcr(true);
    setOcrProgress(5);
    const successful = new Map<string, string>();
    let failedCount = 0;

    try {
      for (let index = 0; index < activeSources.length; index++) {
        const source = activeSources[index];
        setOcrProgress(Math.round(5 + (index / activeSources.length) * 85));
        setSelectedImages((previous) => previous.map((item) =>
          item.id === source.id ? { ...item, status: 'reading', error: undefined } : item
        ));

        try {
          const base64 = await fileToBase64(source.file);
          if (!base64) throw new Error(`Não foi possível preparar ${source.name}.`);

          const response = await safeFetchJson<{ text?: string; error?: string }>('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: {
                id: source.id,
                title: source.name,
                index: index + 1,
                total: activeSources.length,
              },
              images: [{ base64, mimeType: source.file.type || 'image/jpeg' }],
            }),
          });

          const sourceText = response.text?.trim() || '';
          if (!sourceText) throw new Error(response.error || `Nenhum texto encontrado em ${source.name}.`);
          successful.set(source.id, sourceText);
          setSelectedImages((previous) => previous.map((item) =>
            item.id === source.id ? { ...item, status: 'ready', text: sourceText, error: undefined } : item
          ));
        } catch (sourceError: any) {
          failedCount += 1;
          setSelectedImages((previous) => previous.map((item) =>
            item.id === source.id
              ? { ...item, status: 'error', error: sourceError.message || 'Falha na leitura desta fonte.' }
              : item
          ));
        }

        setOcrProgress(Math.round(5 + ((index + 1) / activeSources.length) * 90));
      }

      const mergedSources = selectedImages.map((source) => {
        const freshText = successful.get(source.id);
        return freshText ? { ...source, status: 'ready' as const, text: freshText, error: undefined } : source;
      });
      const combinedText = composeSourceText(mergedSources);
      if (!combinedText) throw new Error('Não foi possível extrair texto das fontes selecionadas.');

      setOcrText(combinedText);
      setStructuredMaterial(null);
      setOcrProgress(100);
      showToast(failedCount > 0
        ? `${successful.size} fonte(s) lida(s); ${failedCount} precisa(m) de nova foto.`
        : `${successful.size} fonte(s) lida(s) com sucesso!`
      );
      return combinedText;
    } catch (error: any) {
      showToast(error.message || 'Erro ao ler as fontes.');
      return '';
    } finally {
      setIsReadingOcr(false);
    }
  };

  // Find relevant BNCC skills
  const relevantSkills = BNCC_SKILLS_DATABASE.filter(
    (s) => s.disciplina === disciplina && s.segmento === segmento
  );
  const sampleSkill = relevantSkills.length > 0
    ? `${relevantSkills[0].codigo} — ${relevantSkills[0].descricao}`
    : `(EF06LP01) Reconhecer a impossibilidade de uma neutralidade absoluta no relato de fatos e os diferentes pontos de vista em ${disciplina}.`;

  const curriculumDescription = `Alinhamento BNCC para ${disciplina} (${ano} · ${segmento}): ${sampleSkill}`;

  // Process and Structure Material (Single Reading Flow)
  const handleProcessMaterial = async (forceFresh = false) => {
    if (selectedImages.length === 0 && (!ocrText || ocrText.trim().length === 0)) {
      showToast('Por favor, adicione fotos da apostila ou digite o texto.');
      return null;
    }

    setIsStructuring(true);
    showToast('Lendo e estruturando material pedagogicamente...');

    try {
      // Do not send the original photos again. OCR them first, then send only text.
      let materialText = ocrText.trim();
      if (!materialText && selectedImages.length > 0) {
        materialText = await handleReadImages();
      }
      if (!materialText) {
        throw new Error('Não foi possível ler o texto das imagens para estruturar o material.');
      }

      const res = await fetch('/api/process-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disciplina,
          segmento,
          ano,
          texto_ocr: materialText,
          images: [],
          forceFresh,
          habilidadesFixadas: selectedPinnedSkills.map((s) => `${s.codigo}: ${s.descricao}`),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Falha ao estruturar material');
      }

      if (data.data) {
        setStructuredMaterial(data.data);
        if (data.interpretacao) {
          setLastInterpretacao(data.interpretacao);
        }
        if (data.data.analise?.ano_serie_lido && data.data.analise.ano_serie_lido !== 'não identificado na imagem') {
          setGeneratedAnoSerie(data.data.analise.ano_serie_lido);
        }
        if (data.data.analise?.componente_curricular_lido && data.data.analise.componente_curricular_lido !== 'não identificado na imagem') {
          setGeneratedDisciplina(data.data.analise.componente_curricular_lido);
        }
        showToast('Material lido e estruturado com sucesso! Pronto para gerar aulas ou provas.');
        return data.data as ProcessedMaterialCache;
      }
    } catch (err: any) {
      console.error('[CLIENT] Erro ao estruturar material:', err);
      showToast(err.message || 'Erro ao estruturar material.');
    } finally {
      setIsStructuring(false);
    }
    return null;
  };

  // Generate Lesson or Exam via Full AI Pipeline
  const handleGenerate = async (type: 'aula' | 'prova', modoOrigem: 'material' | 'plano' = 'material') => {
    if (!ano || ano.trim() === '') {
      showToast('Por favor, selecione o Ano/Série antes de gerar a avaliação.');
      return;
    }

    setIsGenerating(true);
    setGeneratingStep('geracao');
    setGeneratedType(null);

    // Keep generation requests small: use OCR text, never the original image bytes.
    let materialText = ocrText.trim();
    if (!structuredMaterial && !materialText && selectedImages.length > 0) {
      materialText = await handleReadImages();
      if (!materialText) {
        setIsGenerating(false);
        showToast('Não foi possível ler as imagens. Tente fotografar novamente.');
        return;
      }
    }

    const promptDetails = {
      disciplina,
      segmento,
      ano,
      tipo: type === 'aula' ? (disciplina === 'Educação Física' && tipoEdFisica === 'prática' ? 'Atividade Prática' : 'Plano de Aula') : 'Prova',
      texto_ocr: materialText,
      images: [], // OCR is sent as text; avoids Vercel 413 payload errors.
      quantidadeAulas: qtdAulas,
      tipoAulaEdFisica: disciplina === 'Educação Física' ? (tipoEdFisica === 'prática' ? 'Prática' : 'Teórica') : undefined,
      dificuldade: dificuldadeProva,
      hash_material: structuredMaterial?.hash_material,
      modoOrigem,
      planoOrigem: modoOrigem === 'plano' ? generatedContent : undefined,
      habilidadesFixadas: selectedPinnedSkills.map((s) => `${s.codigo}: ${s.descricao}`),
    };

    try {
      console.log('[CLIENT] Enviando requisição de geração para /api/generate:', {
        disciplina: promptDetails.disciplina,
        ano: promptDetails.ano,
        segmento: promptDetails.segmento,
        tipo: promptDetails.tipo,
        qtdAulas: promptDetails.quantidadeAulas,
        cached: Boolean(structuredMaterial),
        modoOrigem,
      });

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptDetails),
      });

      const data = await res.json();
      console.log('[CLIENT] Resposta recebida de /api/generate:', data);

      if (!res.ok || data.error) {
        throw new Error(data.error || `Erro do servidor (${res.status})`);
      }

      if (data && data.content) {
        setGeneratedContent(typeof data.content === 'string' ? data.content : JSON.stringify(data.content, null, 2));
        if (data.interpretacao) {
          setLastInterpretacao(data.interpretacao);
        } else if (data.data?.interpretacao) {
          setLastInterpretacao(data.data.interpretacao);
        }
        if (data.data?.ano_serie) {
          setGeneratedAnoSerie(data.data.ano_serie);
        } else if (data.interpretacao?.ano_serie_lido && data.interpretacao.ano_serie_lido !== 'não identificado na imagem') {
          setGeneratedAnoSerie(data.interpretacao.ano_serie_lido);
        }
        if (data.data?.disciplina) {
          setGeneratedDisciplina(data.data.disciplina);
        }
        if (data.uncertain) {
          showToast('Aviso: Conteúdo identificado com baixa nitidez.');
        } else {
          showToast(type === 'aula' ? 'Plano de aula gerado com sucesso!' : `Prova (${dificuldadeProva}) gerada com sucesso!`);
        }
      } else {
        throw new Error(data.error || 'A API não retornou conteúdo pedagógico.');
      }
    } catch (e: any) {
      console.error('[CLIENT] Falha na geração do plano:', e);
      showToast(`Erro na geração: ${e.message || 'Falha ao conectar com o servidor'}`);
      setGeneratedContent(`# ⚠️ Falha na Geração\n\nNão foi possível gerar o plano com o modelo de IA:\n\n> **${e.message || 'Erro de conexão ou serviço indisponível'}**\n\nPor favor, tente novamente em alguns instantes.`);
    } finally {
      setGeneratedType(type);
      setIsGenerating(false);
      setGeneratingStep(null);
      setTimeout(() => {
        document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // Save to bimester folder with IndexedDB & Auto-Sync
  const handleSaveToFolder = async () => {
    if (!generatedType) return;
    const finalSubject = generatedDisciplina || disciplina;
    const finalGrade = generatedAnoSerie || ano;
    const newMaterial: Omit<SavedMaterial, 'id'> = {
      type: generatedType,
      title: generatedType === 'aula' ? `Plano — ${finalSubject} (${finalGrade})` : `Avaliação — ${finalSubject} (${finalGrade})`,
      subject: finalSubject,
      grade: finalGrade,
      className: targetClass || 'Turma A',
      bimester: selectedBimester,
      content: generatedContent,
      createdAt: new Date().toLocaleDateString('pt-BR'),
    };

    await persistMaterialLocallyAndSync(newMaterial);
    await indexedDBStorage.clearDraft('active_generator_draft');
    setDraftSavedText(null);

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnline) {
      showToast(`Salvo e sincronizado em ${targetClass} / ${selectedBimester}º bimestre!`);
    } else {
      showToast(`Salvo no cache offline (IndexedDB) para ${targetClass}! Sincronizará quando reconectar.`);
    }
  };

  // Download Word (.doc) with Almanac School Header
  const handleDownloadWord = async () => {
    let logoBase64 = '';
    try {
      const res = await fetch('/colegio-almanac.jpg');
      if (res.ok) {
        const blob = await res.blob();
        logoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn(e);
    }

    const htmlDoc = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Avaliação Bimestral - ${disciplina}</title>
        <style>
          @page { size: A4; margin: 1.5cm 1.5cm 1.5cm 1.5cm; }
          body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #000; line-height: 1.3; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; border: 1.5pt solid #000; }
          .header-table td { border: 1pt solid #000; padding: 8px; vertical-align: middle; }
          .logo-col { width: 75px; text-align: center; }
          .school-info { text-align: center; }
          .school-info b { font-size: 14pt; }
          .side-info { width: 100px; text-align: center; font-size: 10pt; }
          .student-row { margin-top: 8px; font-size: 10.5pt; }
          .question { margin-top: 14px; margin-bottom: 8px; font-weight: bold; }
          .answer-lines { margin-top: 4px; line-height: 22pt; color: #444; }
          .page-break { page-break-before: always; }
          .gabarito-title { font-size: 14pt; font-weight: bold; margin-top: 20px; border-bottom: 2pt solid #000; padding-bottom: 4px; }
        </style>
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td class="logo-col">
              ${logoBase64 ? `<img src="${logoBase64}" width="70" alt="Logo" />` : '<b>COLÉGIO</b>'}
            </td>
            <td class="school-info">
              <b>COLÉGIO ALMANAC</b><br>
              AVALIAÇÃO BIMESTRAL DE <b>${disciplina.toUpperCase()} — ${selectedBimester}º BIMESTRE</b>
              <div class="student-row">
                ALUNO(A): _____________________________________________ Nº ____ &nbsp; ${ano} - ${targetClass}
              </div>
            </td>
            <td class="side-info">
              <b>NOTA:</b><br><br>
              <b>DATA:</b><br>
              ___/___/2026
            </td>
          </tr>
        </table>

        <div style="white-space: pre-wrap;">${generatedContent}</div>
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF', htmlDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Avaliacao-${disciplina}-${ano}-${selectedBimester}Bimestre.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Prova baixada em Word (.doc)!');
  };

  // Access management helpers (Master authority)
  const masterRequestHeaders = (includeJson = false) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${getAccessToken()}` };
    if (includeJson) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const handleAddTeacher = async () => {
    if (!newTeacherName.trim() || !newTeacherEmail.trim()) {
      showToast('Preencha o nome e o e-mail do usuário.');
      return;
    }
    const cleanEmail = newTeacherEmail.trim().toLowerCase();
    const payload = {
      id: `user-${Date.now()}`,
      name: newTeacherName.trim(),
      email: cleanEmail,
      role: newTeacherRole,
      roleTitle: newTeacherRoleTitle.trim() || (newTeacherRole === 'gestao' ? 'Coordenação Pedagógica' : 'Docente'),
      daysRemaining: Math.max(1, newTeacherDays || 15),
      status: 'Ativo',
    };

    try {
      const res = await fetch('/api/sync/users', {
        method: 'POST',
        headers: masterRequestHeaders(true),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setAccessList(data.users);
        localStorage.setItem('aula-clara-access-list', JSON.stringify(data.users));
        setNewTeacherName('');
        setNewTeacherEmail('');
        setNewTeacherRoleTitle('');
        showToast(`${newTeacherRole === 'gestao' ? 'Gestor(a)' : 'Professor(a)'} cadastrado(a) e sincronizado(a) com sucesso!`);
      } else {
        showToast(data.error || 'Erro ao cadastrar usuário.');
      }
    } catch (e: any) {
      showToast(`Erro de conexão: ${e.message}`);
    }
  };

  const handleToggleRole = async (userId: string, targetRole: 'professor' | 'gestao') => {
    const user = accessList.find((u) => u.id === userId);
    if (!user) return;
    const roleTitle = targetRole === 'gestao' ? 'Coordenação Pedagógica' : 'Docente';
    try {
      const res = await fetch('/api/sync/users', {
        method: 'POST',
        headers: masterRequestHeaders(true),
        body: JSON.stringify({
          ...user,
          role: targetRole,
          roleTitle,
        }),
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setAccessList(data.users);
        localStorage.setItem('aula-clara-access-list', JSON.stringify(data.users));
        showToast(`Papel de ${user.name} alterado para ${targetRole === 'gestao' ? 'Gestão Escolar' : 'Professor(a)'}!`);
      }
    } catch (e: any) {
      showToast(`Erro ao alterar papel: ${e.message}`);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    const user = accessList.find((u) => u.id === userId);
    if (!user) return;
    const newStatus = user.status === 'Ativo' ? 'Bloqueado' : 'Ativo';
    try {
      const res = await fetch('/api/sync/users', {
        method: 'POST',
        headers: masterRequestHeaders(true),
        body: JSON.stringify({
          ...user,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setAccessList(data.users);
        localStorage.setItem('aula-clara-access-list', JSON.stringify(data.users));
        showToast(`Acesso de ${user.name} agora está ${newStatus}!`);
      }
    } catch (e: any) {
      showToast(`Erro ao alterar status: ${e.message}`);
    }
  };

  const handleAddDays = async (userId: string, days: number) => {
    const user = accessList.find((u) => u.id === userId);
    if (!user) return;
    const newDays = Math.max(0, (user.daysRemaining || 0) + days);
    try {
      const res = await fetch('/api/sync/users', {
        method: 'POST',
        headers: masterRequestHeaders(true),
        body: JSON.stringify({
          ...user,
          daysRemaining: newDays,
          status: newDays > 0 ? 'Ativo' : user.status,
        }),
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setAccessList(data.users);
        localStorage.setItem('aula-clara-access-list', JSON.stringify(data.users));
        showToast(`Adicionados +${days} dias para ${user.name}!`);
      }
    } catch (e: any) {
      showToast(`Erro ao adicionar dias: ${e.message}`);
    }
  };

  const handleSaveUserDays = async (teacher: TeacherAccess) => {
    const { afterDays } = getUserAdjustment(teacher.id, teacher.daysRemaining);
    try {
      const res = await fetch('/api/sync/users', {
        method: 'POST',
        headers: masterRequestHeaders(true),
        body: JSON.stringify({
          ...teacher,
          daysRemaining: afterDays,
          status: afterDays > 0 ? 'Ativo' : 'Bloqueado',
        }),
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setAccessList(data.users);
        localStorage.setItem('aula-clara-access-list', JSON.stringify(data.users));
        showToast(`Novo prazo de ${afterDays} dias salvo para ${teacher.name}!`);
      } else {
        showToast(data.error || 'Erro ao salvar novo prazo.');
      }
    } catch (e: any) {
      showToast(`Erro de conexão: ${e.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const user = accessList.find((u) => u.id === userId);
    if (!user) return;
    if (user.email.toLowerCase() === 'ecomnixx@gmail.com') {
      showToast('O usuário Master não pode ser excluído.');
      return;
    }
    setDeletingUserId(userId);
    try {
      // Cadastros locais antigos usavam IDs no formato "user-...", enquanto o
      // servidor identifica cada acesso pelo e-mail, que é a chave estável.
      const res = await fetch(`/api/sync/users/${encodeURIComponent(user.email.trim().toLowerCase())}`, {
        method: 'DELETE',
        headers: masterRequestHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.users) {
        const stillExists = data.users.some((item: TeacherAccess) =>
          item.email.trim().toLowerCase() === user.email.trim().toLowerCase()
        );
        if (stillExists) {
          showToast('O servidor não confirmou a exclusão. Entre novamente e tente outra vez.');
          return;
        }
        setAccessList(data.users);
        localStorage.setItem('aula-clara-access-list', JSON.stringify(data.users));
        setPendingDeleteUserId(null);
        showToast(`Usuário ${user.name} removido com sucesso.`);
      } else {
        showToast(data.error || 'Não foi possível excluir o cadastro. Entre novamente e tente outra vez.');
      }
    } catch (e: any) {
      showToast(`Erro ao remover usuário: ${e.message}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const filteredAccessList = accessList.filter((a) => {
    if (accessFilter === 'active' && a.status !== 'Ativo') return false;
    if (accessFilter === 'blocked' && a.status !== 'Bloqueado') return false;
    if (accessSearch) {
      const q = accessSearch.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <main className={`app-shell ${isInstalled ? 'is-installed' : ''}`}>
      {/* Top Bar */}
      <header className="topbar">
        <button
          className="menu-button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
        >
          ☰
        </button>
        <button className="brand" onClick={() => setActiveTab('create')}>
          <span className="logo">A</span>
          <span>
            <b>Aula Clara</b>
            <small>Da apostila para o bimestre inteiro.</small>
          </span>
        </button>

        {/* Chat IA Button in TopBar */}
        <button
          type="button"
          className="topbar-chat"
          onClick={() => setActiveTab('chat')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '20px',
            border: activeTab === 'chat' ? '1.5px solid #4f46e5' : '1px solid #c7d2fe',
            background: activeTab === 'chat' ? '#4f46e5' : 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
            color: activeTab === 'chat' ? '#ffffff' : '#3730a3',
            fontSize: '12px',
            fontWeight: '800',
            cursor: 'pointer',
            marginLeft: 'auto',
            marginRight: '6px',
            boxShadow: '0 2px 6px rgba(79, 70, 229, 0.15)',
            whiteSpace: 'nowrap',
          }}
          title="Abrir Assistente Pedagógico Gemini"
        >
          <span>💬</span>
          <span>Chat IA</span>
          <span
            style={{
              fontSize: '9px',
              padding: '1px 5px',
              borderRadius: '8px',
              background: activeTab === 'chat' ? '#10b981' : '#4f46e5',
              color: '#ffffff',
              fontWeight: '800',
            }}
          >
            Gemini
          </span>
        </button>

        {/* Role Switcher Pill Badge in TopBar */}
        <button
          type="button"
          className="topbar-role"
          onClick={() => {
            setLoginModalDefaultTab(userRole);
            setLoginModalOpen(true);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '20px',
            border: userRole === 'gestao' ? '1px solid #c4b5fd' : '1px solid #bae6fd',
            background: userRole === 'gestao' ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)' : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            color: userRole === 'gestao' ? '#6d28d9' : '#0369a1',
            fontSize: '11px',
            fontWeight: '800',
            cursor: 'pointer',
            marginRight: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            whiteSpace: 'nowrap',
          }}
          title="Clique para alternar perfil (Professor / Gestão)"
        >
          <span>{userRole === 'gestao' ? '🏛️ Gestão' : '👨‍🏫 Professor'}</span>
          <span style={{ fontSize: '10px', opacity: 0.7 }}>⇄</span>
        </button>

        {/* Offline Cache & Sync Badge */}
        <OfflineSyncBadge
          syncState={syncState}
          onClick={() => setSyncModalOpen(true)}
        />

        {/* Mobile App Install Button in Topbar */}
        {!isInstalled && (
          <button
            type="button"
            className="topbar-install"
            onClick={handleInstallPWA}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 11px',
              borderRadius: '20px',
              border: '1px solid #10b981',
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              color: '#065f46',
              fontSize: '11px',
              fontWeight: '800',
              cursor: 'pointer',
              marginRight: '6px',
              boxShadow: '0 1px 4px rgba(16, 185, 129, 0.2)',
              whiteSpace: 'nowrap',
            }}
            title="Instalar Aula Clara como aplicativo no celular"
          >
            <span>📲 Instalar App</span>
          </button>
        )}

        {(
          <button
            className="notification-bell"
            onClick={() => setNotificationsOpen((open) => !open)}
            aria-label={`${notifications.length} notificações`}
            style={{ position: 'relative' }}
          >
            🔔
            {notifications.length > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px', minWidth: '18px', height: '18px',
                padding: '0 4px', borderRadius: '10px', background: '#dc2626', color: '#fff',
                fontSize: '10px', fontWeight: '900', display: 'grid', placeItems: 'center',
                border: '2px solid #fff',
              }}>
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
        )}
        <button
          className="avatar"
          onClick={() => setAccountModalOpen(true)}
          aria-label="Minha conta"
        >
          {userName
            .split(' ')
            .slice(0, 2)
            .map((n) => n[0])
            .join('')
            .toUpperCase()}
        </button>
      </header>

      {notificationsOpen && (
        <>
          <button
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setNotificationsOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 79, border: 0, background: 'transparent' }}
          />
          <section style={{
            position: 'fixed', top: '62px', right: '12px', zIndex: 80, width: 'min(360px, calc(100vw - 24px))',
            maxHeight: '70vh', overflowY: 'auto', borderRadius: '16px', background: '#fff',
            border: '1px solid #e2e8f0', boxShadow: '0 18px 45px rgba(15,23,42,.22)', padding: '12px',
          }} aria-label="Central de notificações">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 10px' }}>
              <b>Notificações</b>
              {notifications.length > 0 && (
                <button type="button" onClick={() => setNotifications([])} style={{ fontSize: '11px' }}>
                  Limpar todas
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p style={{ margin: '14px 4px', color: '#64748b', fontSize: '13px' }}>Nenhuma novidade no momento.</p>
            ) : notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                onClick={() => dismissNotification(notification)}
                style={{
                  width: '100%', display: 'flex', gap: '10px', textAlign: 'left', padding: '12px', marginBottom: '8px',
                  borderRadius: '12px', border: '1px solid #dbeafe', background: '#f8fbff', color: '#0f172a',
                }}
              >
                <span style={{ fontSize: '20px' }}>{notification.type === 'registration' ? '👤' : '📲'}</span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: '13px' }}>{notification.title}</b>
                  <small style={{ display: 'block', marginTop: '3px', color: '#475569', lineHeight: 1.35 }}>{notification.message}</small>
                  <small style={{ display: 'block', marginTop: '6px', color: '#0284c7' }}>Toque para abrir e marcar como lida</small>
                </span>
              </button>
            ))}
          </section>
        </>
      )}

      {/* Lateral Drawer Menu */}
      {drawerOpen && (
        <div className="menu-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} style={{ width: '310px', maxWidth: '85vw', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <button
              className="close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Fechar menu"
            >
              ×
            </button>

            {/* Profile & Switcher Box */}
            <div
              style={{
                margin: '16px 14px 10px',
                padding: '14px',
                background:
                  userRole === 'master'
                    ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
                    : userRole === 'gestao'
                    ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)'
                    : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                borderRadius: '16px',
                border:
                  userRole === 'master'
                    ? '1.5px solid #fde68a'
                    : userRole === 'gestao'
                    ? '1px solid #ddd6fe'
                    : '1px solid #bae6fd',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: userRole === 'master' ? '0 2px 8px rgba(245, 158, 11, 0.15)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background:
                      userRole === 'master'
                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                        : userRole === 'gestao'
                        ? '#7c3aed'
                        : '#0284c7',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '800',
                    fontSize: '14px',
                    flexShrink: 0,
                    boxShadow: userRole === 'master' ? '0 2px 6px rgba(245, 158, 11, 0.3)' : 'none',
                  }}
                >
                  {userRole === 'master' ? '👑' : userRole === 'gestao' ? '🏛️' : '👨‍🏫'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {userName}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color:
                        userRole === 'master'
                          ? '#b45309'
                          : userRole === 'gestao'
                          ? '#6d28d9'
                          : '#0369a1',
                      fontWeight: '800',
                    }}
                  >
                    {userRole === 'master'
                      ? '👑 Administrador Master'
                      : userRole === 'gestao'
                      ? `🏛️ ${gestaoRoleTitle || 'Gestão Escolar'}`
                      : '👨‍🏫 Perfil Professor(a)'}
                  </div>
                </div>
              </div>

              {/* Botão de Acesso Direto para Master: GERENCIAR ACESSOS */}
              {isMaster && (
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setAccessManagerOpen(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 10px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '11.5px',
                    fontWeight: '800',
                    color: '#ffffff',
                    cursor: 'pointer',
                    width: '100%',
                    boxShadow: '0 2px 6px rgba(245, 158, 11, 0.25)',
                  }}
                >
                  <span>🛡️ Gerenciar Acessos (Painel Master)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setLoginModalDefaultTab(userRole === 'master' ? 'master' : (userRole === 'gestao' ? 'professor' : 'master'));
                  setLoginModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 10px',
                  background: '#ffffff',
                  border:
                    userRole === 'master'
                      ? '1px solid #fde68a'
                      : userRole === 'gestao'
                      ? '1px solid #c4b5fd'
                      : '1px solid #93c5fd',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '700',
                  color:
                    userRole === 'master'
                      ? '#b45309'
                      : userRole === 'gestao'
                      ? '#6d28d9'
                      : '#0284c7',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <span>🔄 Alternar Perfil (Master / Gestão / Prof)</span>
              </button>
            </div>

            {/* SEÇÃO 1: ESPAÇO PEDAGÓGICO DO PROFESSOR */}
            <div style={{ padding: '0 14px 2px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: '#64748b',
                  padding: '6px 4px 2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>📚</span>
                <span>Espaço do Professor</span>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveTab('create');
                setDrawerOpen(false);
              }}
            >
              <span className="icon">⌂</span>
              Área inicial (Aulas e Provas)
              <span>›</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('sources');
                setDrawerOpen(false);
              }}
              style={{ background: activeTab === 'sources' ? '#ecfdf5' : undefined, fontWeight: activeTab === 'sources' ? '700' : undefined }}
            >
              <span className="icon">📚</span>
              Adicionar material / fonte
              <span>›</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('chat');
                setDrawerOpen(false);
              }}
              style={{
                background: activeTab === 'chat' ? '#eef2ff' : undefined,
                fontWeight: activeTab === 'chat' ? '700' : undefined,
              }}
            >
              <span className="icon">💬</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Assistente Pedagógico Gemini</span>
              <span
                style={{
                  fontSize: '9px',
                  background: '#10b981',
                  color: '#ffffff',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                }}
              >
                Chat IA
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('corrigir_prova');
                setDrawerOpen(false);
              }}
            >
              <span className="icon">📋</span>
              Corrigir Prova com IA
              <span>›</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('plano_reensino');
                setDrawerOpen(false);
              }}
            >
              <span className="icon">⚡</span>
              Plano de Reensino & Recuperação
              <span>›</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('adaptacao_inclusiva');
                setDrawerOpen(false);
              }}
            >
              <span className="icon">🎯</span>
              Adaptação Inclusiva & PEI (AEE)
              <span>›</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('saved');
                setDrawerOpen(false);
              }}
            >
              <span className="icon">□</span>
              Pastas dos Bimestres e Arquivos
              <span>›</span>
            </button>

            {/* SEÇÃO 2: ESPAÇO DE GESTÃO ESCOLAR & COORDENAÇÃO */}
            <div style={{ padding: '12px 14px 2px', marginTop: '4px', borderTop: '1px solid #e2e8f0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '2px 4px 4px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: '800',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🏛️</span>
                  <span>Gestão & Coordenação</span>
                </div>
                {userRole !== 'gestao' && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: '800',
                      background: '#ede9fe',
                      color: '#6d28d9',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Acesso restrito
                  </span>
                )}
              </div>
            </div>

            <button
              style={{
                background: userRole === 'gestao' ? '#fdf4ff' : undefined,
                position: 'relative',
              }}
              onClick={() => {
                if (userRole !== 'gestao') {
                  setDrawerOpen(false);
                  setLoginModalDefaultTab('gestao');
                  setLoginModalOpen(true);
                  showToast('Faça login com a Gestão Escolar para acessar o Mapa de Calor.');
                } else {
                  setActiveTab('diagnostico_turma');
                  setDrawerOpen(false);
                }
              }}
            >
              <span className="icon">📊</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Mapa de Calor & Diagnóstico</span>
              {userRole !== 'gestao' ? <span className="management-access-badge">Entrar como Gestão</span> : <span>›</span>}
            </button>

            <button
              style={{
                background: userRole === 'gestao' ? '#fdf4ff' : undefined,
                position: 'relative',
              }}
              onClick={() => {
                if (userRole !== 'gestao') {
                  setDrawerOpen(false);
                  setLoginModalDefaultTab('gestao');
                  setLoginModalOpen(true);
                  showToast('Faça login com a Gestão Escolar para emitir Pareceres Oficiais.');
                } else {
                  setActiveTab('parecer_descritivo');
                  setDrawerOpen(false);
                }
              }}
            >
              <span className="icon">📝</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Parecer Descritivo do Bimestre</span>
              {userRole !== 'gestao' ? <span className="management-access-badge">Entrar como Gestão</span> : <span>›</span>}
            </button>

            {/* SEÇÃO 3: SISTEMA E CONTA */}
            <div style={{ padding: '12px 14px 2px', marginTop: '4px', borderTop: '1px solid #e2e8f0' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: '#64748b',
                  padding: '2px 4px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>⚙️</span>
                <span>Configurações & App</span>
              </div>
            </div>

            <button
              onClick={() => {
                setAccountModalOpen(true);
                setDrawerOpen(false);
              }}
            >
              <span className="icon">👤</span>
              Minha Conta e Perfil
              <span>›</span>
            </button>

            <button
              onClick={() => {
                setInstallModalOpen(true);
                setDrawerOpen(false);
              }}
              style={{
                background: '#f0fdf4',
                color: '#166534',
                fontWeight: '700',
                borderLeft: '3px solid #10b981',
              }}
            >
              <span className="icon">📲</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Instalar Aplicativo no Celular</span>
              <span style={{ fontSize: '9px', background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '6px', fontWeight: '800' }}>APP</span>
            </button>

            {isMaster && (
              <button
                className="master-menu-item"
                onClick={() => {
                  setAccessManagerOpen(true);
                  setDrawerOpen(false);
                }}
              >
                <span className="icon">⌕</span>
                Gerenciar acessos
                <span>›</span>
              </button>
            )}

            <button
              type="button"
              className="drawer-logout-button"
              onClick={handleLogout}
            >
              <span className="drawer-logout-icon" aria-hidden="true">↪</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Sair da conta</span>
            </button>
            <footer>Aula Clara v3.0 · Plataforma Docente</footer>
          </aside>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === 'sources' && (
        <main className="main-content">
          <MaterialSourcesView
            showToast={showToast}
            onUseSource={(text, sourceTitle) => {
              setOcrText(text);
              setStructuredMaterial(null);
              setActiveTab('create');
              showToast(`Fonte “${sourceTitle}” selecionada. O conteúdo salvo será reutilizado.`);
            }}
          />
        </main>
      )}

      {activeTab === 'create' && (
        <section className="page create-page">
          <div className="page-heading create-welcome">
            <span className="eyebrow">AULA CLARA · PLANEJAMENTO INTELIGENTE</span>
            <h1>Professor(a) {userName.split(' ')[0]}, vamos começar!</h1>
            <p>Cada aula preparada com cuidado faz a diferença na educação do futuro.</p>
          </div>

          {/* Mobile App Install Quick Banner (shown if not installed in standalone) */}
          {!isInstalled && showInstallBanner && (
            <div
              className="install-quick-banner"
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                color: '#ffffff',
                padding: '14px 16px',
                borderRadius: '16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  📱
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Instalar Aula Clara no Celular</span>
                    <span style={{ fontSize: '9px', background: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: '4px' }}>OFICIAL</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: '1.3', marginTop: '2px' }}>
                    Abra em tela cheia na sua tela inicial como um app nativo.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleInstallPWA}
                  style={{
                    padding: '8px 14px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  📲 Instalar
                </button>
                <button
                  type="button"
                  onClick={() => setShowInstallBanner(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '16px',
                    cursor: 'pointer',
                    padding: '4px 6px',
                  }}
                  title="Fechar aviso"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Discipline, Segment & Grade Setup */}
          <section className="card setup-card">
            <div className="card-title">
              <span className="icon">▤</span>
              <div>
                <b>Passo 1: selecionar segmento, disciplina e ano/série</b>
                <small>Selecione a etapa, componente curricular e ano/série da turma para precisão pedagógica.</small>
              </div>
            </div>

            <label>
              Segmento / Etapa
              <select
                value={segmento}
                onChange={(e) => setSegmento(e.target.value as SegmentoType)}
              >
                {SEGMENTOS_LIST.map((seg) => (
                  <option key={seg} value={seg}>
                    {seg}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Disciplina
              <select
                value={disciplina}
                onChange={(e) => setDisciplina(e.target.value as DisciplinaType)}
              >
                {(DISCIPLINAS_POR_SEGMENTO[segmento] || DISCIPLINAS_LIST).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Ano / Série
              <select
                value={ano}
                onChange={(e) => setAno(e.target.value)}
              >
                {(ANOS_POR_SEGMENTO[segmento] || []).map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>

            <div className="configured-subject">
              ✓ <span>Disciplina: <b>{disciplina}</b> · Ano/Série: <b>{ano}</b> ({segmento})</span>
            </div>

            {disciplina === 'Educação Física' && (
              <div className="pe-option">
                <b>Educação Física — escolha o formato da aula</b>
                <div className="choice-row">
                  <button
                    type="button"
                    className={tipoEdFisica === 'prática' ? 'active' : ''}
                    onClick={() => setTipoEdFisica('prática')}
                  >
                    🏃 Atividade prática
                  </button>
                  <button
                    type="button"
                    className={tipoEdFisica === 'teórica' ? 'active' : ''}
                    onClick={() => setTipoEdFisica('teórica')}
                  >
                    ▤ Aula teórica
                  </button>
                </div>
              </div>
            )}

            <div className="lesson-selector" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>
                Quantas aulas deseja planejar para este conteúdo?
              </span>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    style={{
                      padding: '10px 0',
                      borderRadius: '10px',
                      border: qtdAulas === n && !isCustomAulas ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      backgroundColor: qtdAulas === n && !isCustomAulas ? '#eff6ff' : '#ffffff',
                      color: qtdAulas === n && !isCustomAulas ? '#1d4ed8' : '#334155',
                      fontWeight: qtdAulas === n && !isCustomAulas ? '700' : '500',
                      cursor: 'pointer',
                      fontSize: '14px',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => {
                      setIsCustomAulas(false);
                      setQtdAulas(n);
                    }}
                  >
                    {n} {n === 1 ? 'aula' : 'aulas'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: isCustomAulas ? '2px solid #2563eb' : '1px dashed #94a3b8',
                    backgroundColor: isCustomAulas ? '#f8fafc' : '#ffffff',
                    color: isCustomAulas ? '#1d4ed8' : '#64748b',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setIsCustomAulas(!isCustomAulas);
                    if (!isCustomAulas && qtdAulas <= 5) {
                      setQtdAulas(6);
                    }
                  }}
                >
                  {isCustomAulas ? '✓ Quantidade personalizada ativa' : '+ Preciso de mais aulas (digitar quantidade)'}
                </button>

                {isCustomAulas && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={qtdAulas}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                        setQtdAulas(val);
                      }}
                      style={{
                        width: '72px',
                        padding: '6px 10px',
                        border: '2px solid #2563eb',
                        borderRadius: '8px',
                        fontWeight: '700',
                        fontSize: '15px',
                        textAlign: 'center',
                        color: '#0f172a',
                        backgroundColor: '#ffffff'
                      }}
                    />
                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>aulas</span>
                  </div>
                )}
              </div>
              <small style={{ color: '#64748b', fontSize: '12px' }}>
                {qtdAulas <= 5 && !isCustomAulas
                  ? `Configurado para gerar ${qtdAulas} ${qtdAulas === 1 ? 'aula' : 'aulas'}. Toque acima para alterar.`
                  : `Configurado para gerar manualmente ${qtdAulas} aulas para este conteúdo.`}
              </small>
            </div>

            {/* BNCC Skill Filter & Selector by Code or Eixo */}
            <BnccStepFilter
              disciplina={disciplina}
              segmento={segmento}
              ano={ano}
              selectedPinnedSkills={selectedPinnedSkills}
              onTogglePinSkill={handleTogglePinSkill}
              onClearPinnedSkills={handleClearPinnedSkills}
              showToast={showToast}
            />
          </section>

          {/* Step 2: Image Capture & Material Input */}
          <section className="card capture-card">
            <div className="camera-hero" aria-hidden="true">
              <span className="camera-shape">
                <i />
              </span>
            </div>
            <div className="card-title">
              <span className="icon">▣</span>
              <div>
                <b>2. Capture ou selecione o seu material</b>
                <small>Tire quantas fotos quiser ou escolha imagens da galeria. Você pode cortar e editar antes de confirmar.</small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <button type="button" onClick={() => cameraInputRef.current?.click()} style={{ flex: '1 1 auto' }}>
                📷 Abrir câmera
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ flex: '1 1 auto' }}>
                ↥ Escolher arquivos
              </button>
              <button
                type="button"
                onClick={() => {
                  selectedImages.forEach((source) => URL.revokeObjectURL(source.url));
                  setSelectedImages([]);
                  setOcrText('');
                  setStructuredMaterial(null);
                  setIsOcrExpanded(false);
                }}
                style={{ flex: '1 1 auto' }}
              >
                ⌫ Limpar material lido
              </button>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />

            {selectedImages.length > 0 && (
              <>
                <div className="selected-count">
                  <span>✓ <b>{selectedImages.length} {selectedImages.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'} para leitura</b></span>
                </div>
                <div className="reference-thumbs">
                  {selectedImages.map((img, idx) => (
                    <figure key={img.id} className={`source-card source-${img.status}`} style={{ position: 'relative' }}>
                      <img src={img.url} alt={`Imagem ${idx + 1}`} />
                      <label className="source-select" title="Incluir esta fonte na leitura">
                        <input
                          type="checkbox"
                          checked={img.selected}
                          onChange={() => {
                            setSelectedImages((previous) => {
                              const updated = previous.map((source) =>
                                source.id === img.id ? { ...source, selected: !source.selected } : source
                              );
                              setOcrText(composeSourceText(updated));
                              setStructuredMaterial(null);
                              return updated;
                            });
                          }}
                        />
                        <span />
                      </label>
                      <div style={{ position: 'absolute', top: 2, right: 2 }}>
                        <button
                          type="button"
                          aria-label={`Remover imagem ${idx + 1}`}
                          title="Remover imagem"
                          onClick={() => {
                            URL.revokeObjectURL(img.url);
                            setSelectedImages((previous) => {
                              const updated = previous.filter((source) => source.id !== img.id);
                              setOcrText(composeSourceText(updated));
                              setStructuredMaterial(null);
                              return updated;
                            });
                          }}
                          style={{
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <figcaption>
                        <b title={img.name}>{img.name}</b>
                        <small>
                          {img.status === 'reading' && 'Lendo com Gemini…'}
                          {img.status === 'ready' && `${img.text.length.toLocaleString('pt-BR')} caracteres`}
                          {img.status === 'error' && (img.error || 'Falha na leitura')}
                          {img.status === 'pending' && 'Pronta para leitura'}
                        </small>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              className={`read-btn ${isReadingOcr ? 'reading-active' : ''}`}
              disabled={isReadingOcr || selectedImages.length === 0}
              onClick={handleReadImages}
            >
              {isReadingOcr ? (
                <>
                  <span className="reading-spinner" />
                  Lendo texto das imagens da apostila… {ocrProgress}%
                </>
              ) : (
                'Ler imagens'
              )}
            </button>
          </section>

          {/* Step 3: OCR Extracted Text */}
          <section className="card ocr-result-card">
            <div className="ocr-result-heading">
              <div className="card-title">
                <span className="icon">≡</span>
                <div>
                  <b>3. Texto identificado da imagem / apostila</b>
                  <small>Abaixo está somente o conteúdo extraído das fotos, sem rodapés e números de página.</small>
                </div>
              </div>
              {ocrText && (
                <span className="ocr-character-count">
                  Digitalizado na íntegra<br />
                  <b>{ocrText.length.toLocaleString('pt-BR')} caracteres</b>
                </span>
              )}
            </div>

            <textarea
              className={isOcrExpanded ? 'expanded' : ''}
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder={
                isReadingOcr
                  ? 'A leitura está em andamento…'
                  : 'O texto digitalizado da apostila aparecerá aqui na íntegra após tocar em “Ler imagens”.'
              }
            />

            {ocrText && (
              <div className="ocr-result-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                <button
                  type="button"
                  className="more-btn"
                  onClick={() => setIsOcrExpanded(!isOcrExpanded)}
                >
                  {isOcrExpanded ? 'Ler menos' : 'Ler mais / conferir texto'}
                </button>
                <button
                  type="button"
                  className="copy-ocr-button"
                  onClick={() => {
                    navigator.clipboard.writeText(ocrText);
                    showToast('Texto copiado!');
                  }}
                >
                  Copiar texto
                </button>
                <button
                  type="button"
                  className="delete-ocr-button"
                  style={{
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onClick={() => {
                    setOcrText('');
                    setStructuredMaterial(null);
                    setIsOcrExpanded(false);
                    showToast('Conteúdo lido excluído com sucesso!');
                  }}
                >
                  🗑 Excluir conteúdo lido
                </button>
              </div>
            )}
          </section>

          {/* Structured Material Status & Fast Pipeline Card */}
          {(structuredMaterial || (selectedImages.length > 0 || ocrText.trim().length > 10)) && (
            <section
              className="card"
              style={{
                background: structuredMaterial ? '#f0fdf4' : '#f8fafc',
                border: structuredMaterial ? '1.5px solid #86efac' : '1px dashed #cbd5e1',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>{structuredMaterial ? '⚡' : '🔍'}</span>
                  <div>
                    <b style={{ color: structuredMaterial ? '#166534' : '#1e293b', fontSize: '14px' }}>
                      {structuredMaterial
                        ? 'Material Lido e Estruturado com Sucesso (Cache Ativo)'
                        : 'Estruturação Pedagógica do Material'}
                    </b>
                    <div style={{ fontSize: '12px', color: structuredMaterial ? '#15803d' : '#64748b' }}>
                      {structuredMaterial
                        ? '✓ A IA não relerá as imagens ao gerar aulas ou provas. Processamento instantâneo!'
                        : 'A leitura e OCR acontecem uma única vez, estruturando o conteúdo para gerar aulas e avaliações rapidamente.'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {structuredMaterial ? (
                    <button
                      type="button"
                      onClick={() => handleProcessMaterial(true)}
                      disabled={isStructuring}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #bbf7d0',
                        color: '#166534',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      ↻ Reanalisar material
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleProcessMaterial(false)}
                      disabled={isStructuring}
                      style={{
                        background: '#2563eb',
                        border: 'none',
                        color: '#ffffff',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {isStructuring ? (
                        <>
                          <span className="reading-spinner" style={{ width: '14px', height: '14px' }} />
                          Estruturando…
                        </>
                      ) : (
                        '⚡ Estruturar material agora'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {structuredMaterial && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #dcfce7', fontSize: '13px', color: '#166534' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <b>Tema Central:</b> {structuredMaterial.analise?.tema_principal || structuredMaterial.titulo_exato}
                  </div>
                  {structuredMaterial.conceitos_principais && structuredMaterial.conceitos_principais.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      <span style={{ fontWeight: 600 }}>Conceitos-chave:</span>
                      {structuredMaterial.conceitos_principais.slice(0, 5).map((c, i) => (
                        <span
                          key={i}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #86efac',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: '#166534',
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Step 4: Generate Options */}
          <section className="card">
            <div className="card-title">
              <span className="icon">✦</span>
              <div>
                <b>4. O que deseja gerar?</b>
                <small>Escolha o tipo de material e configure a dificuldade desejada.</small>
              </div>
            </div>

            {/* Dificuldade da Prova Selector */}
            <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                  🎯 Nível de Dificuldade da Prova (Contextualização):
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: dificuldadeProva === 'Fácil' ? '#dcfce7' : dificuldadeProva === 'Médio' ? '#fef3c7' : '#fee2e2', color: dificuldadeProva === 'Fácil' ? '#15803d' : dificuldadeProva === 'Médio' ? '#b45309' : '#b91c1c' }}>
                  {dificuldadeProva === 'Fácil' ? 'Menos Contextualizada' : dificuldadeProva === 'Médio' ? 'Contextualização Equilibrada' : 'Alta Contextualização'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {(['Fácil', 'Médio', 'Difícil'] as const).map((dif) => (
                  <button
                    key={dif}
                    type="button"
                    onClick={() => setDificuldadeProva(dif)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: dificuldadeProva === dif ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: dificuldadeProva === dif ? '#eff6ff' : '#ffffff',
                      color: dificuldadeProva === dif ? '#1d4ed8' : '#475569',
                      transition: 'all 0.2s',
                    }}
                  >
                    {dif === 'Fácil' ? '🟢 Fácil' : dif === 'Médio' ? '🟡 Médio' : '🔴 Difícil'}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0 0', lineHeight: 1.4 }}>
                {dificuldadeProva === 'Fácil'
                  ? '• Fácil: Enunciados diretos, menos contextualizada, foco na fixação dos conceitos fundamentais do material.'
                  : dificuldadeProva === 'Médio'
                  ? '• Médio: Contextualização equilibrada com exemplos práticos do cotidiano escolar.'
                  : '• Difícil: Alta contextualização, problemas complexos, análise crítica e interpretação aprofundada.'}
              </p>
            </div>

            <div className="generate-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <button type="button" onClick={() => handleGenerate('aula')}>
                <span className="icon">▤</span>
                <b>Gerar aula</b>
                <span>
                  {disciplina === 'Educação Física' && tipoEdFisica === 'prática'
                    ? 'Plano prático com organização e adaptações'
                    : 'Planejamento teórico completo'}
                </span>
              </button>
              <button type="button" onClick={() => handleGenerate('prova')}>
                <span className="icon">✓</span>
                <b>Gerar prova ({dificuldadeProva})</b>
                <span>10 questões: 5 Múltipla Escolha (A, B, C, D, E) + 5 Dissertativas</span>
              </button>
            </div>
          </section>

          {/* Generating Indicator - Clean and Direct as Requested */}
          {isGenerating && (
            <div
              className="generating"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '36px 20px',
                textAlign: 'center',
                gap: '14px',
                background: '#f8fafc',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                margin: '20px 0',
              }}
            >
              <span className="reading-spinner" style={{ width: '36px', height: '36px', borderWidth: '3px', borderColor: '#cbd5e1', borderTopColor: '#2563eb' }} />
              <b style={{ fontSize: '18px', color: '#1e293b' }}>
                Carregando o que o professor solicitou...
              </b>
              <p style={{ margin: 0, color: '#64748b', fontSize: '14px', maxWidth: '480px', lineHeight: 1.5 }}>
                Processando o material didático e estruturando a avaliação com 10 questões (5 múltipla escolha A, B, C, D, E e 5 dissertativas) com gabarito alinhado à BNCC.
              </p>
            </div>
          )}

          {/* Generated Result Section */}
          {generatedType && !isGenerating && (
            <section className="result-card" id="result-section">
              {/* Card 1: Conteúdo Identificado */}
              <div
                style={{
                  background: lastInterpretacao?.confianca_score !== undefined && lastInterpretacao.confianca_score < 40 ? '#fffbeb' : '#f0fdf4',
                  border: lastInterpretacao?.confianca_score !== undefined && lastInterpretacao.confianca_score < 40 ? '1px solid #fde68a' : '1px solid #bbf7d0',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '20px',
                  color: lastInterpretacao?.confianca_score !== undefined && lastInterpretacao.confianca_score < 40 ? '#92400e' : '#166534',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <b style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✦</span> Conteúdo identificado
                  </b>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        background: lastInterpretacao?.confianca_score !== undefined && lastInterpretacao.confianca_score < 40 ? '#fef3c7' : '#dcfce7',
                        color: lastInterpretacao?.confianca_score !== undefined && lastInterpretacao.confianca_score < 40 ? '#b45309' : '#15803d',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontWeight: '700',
                      }}
                    >
                      Confiança: {lastInterpretacao?.confianca_score !== undefined ? `${lastInterpretacao.confianca_score}%` : (lastInterpretacao?.confianca_interpretacao === 'baixa' ? '30%' : (lastInterpretacao?.confianca_interpretacao === 'media' ? '65%' : '95%'))}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '14px', marginBottom: '6px' }}>
                  <b>Tema:</b> {lastInterpretacao?.tema_principal || lastInterpretacao?.titulo_identificado || 'Conteúdo do Material'}
                </div>

                {lastInterpretacao?.titulo_exato && lastInterpretacao.titulo_exato !== lastInterpretacao.tema_principal && (
                  <div style={{ fontSize: '13px', marginBottom: '6px', color: '#4b5563' }}>
                    <b>Título lido na página:</b> <i>"{lastInterpretacao.titulo_exato}"</i>
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0', fontSize: '12px', color: '#475569' }}>
                  <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <b>Ano/Série na imagem:</b> {lastInterpretacao?.ano_serie_lido || 'não identificado na imagem'}
                  </span>
                  {lastInterpretacao?.volume_lido && lastInterpretacao.volume_lido !== 'não identificado na imagem' && (
                    <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <b>Volume:</b> {lastInterpretacao.volume_lido}
                    </span>
                  )}
                  {lastInterpretacao?.capitulo_lido && lastInterpretacao.capitulo_lido !== 'não identificado na imagem' && (
                    <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <b>Capítulo:</b> {lastInterpretacao.capitulo_lido}
                    </span>
                  )}
                </div>

                {Array.isArray(lastInterpretacao?.subtemas) && lastInterpretacao.subtemas.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Principais conteúdos:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {lastInterpretacao.subtemas.map((item, sIdx) => (
                        <span
                          key={sIdx}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            padding: '3px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#1e293b',
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(lastInterpretacao?.dados_concretos) && lastInterpretacao.dados_concretos.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Elementos concretos citados na página:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {lastInterpretacao.dados_concretos.map((item, dIdx) => (
                        <span
                          key={dIdx}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: '#334155',
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {lastInterpretacao?.confianca_score !== undefined && lastInterpretacao.confianca_score < 40 && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '10px 12px',
                      background: '#ffffff',
                      borderRadius: '8px',
                      border: '1px dashed #f59e0b',
                      fontSize: '13px',
                      color: '#b45309',
                    }}
                  >
                    ⚠️ <b>Aviso:</b> Não consegui identificar este conteúdo com segurança. Tente fotografar novamente a página com boa iluminação e foco.
                  </div>
                )}
              </div>

              {/* Card 2: Resultado Pedagógico */}
              <div className="result-head">
                <span className="eyebrow">
                  {generatedType === 'prova'
                    ? 'AVALIAÇÃO GERADA · 10 QUESTÕES COM GABARITO'
                    : 'PLANO DE AULA GERADO · BNCC ALINHADA'}
                </span>
                <h2>
                  {generatedType === 'aula'
                    ? `Plano de aula — ${generatedDisciplina || disciplina}`
                    : `Avaliação — ${generatedDisciplina || disciplina}`}
                </h2>
                <p>
                  {generatedType === 'prova'
                    ? `${generatedAnoSerie || ano} · 10 questões (Valor Total: 10,0 pontos) · Dificuldade: ${dificuldadeProva}`
                    : `${generatedAnoSerie || ano} · ${qtdAulas} aula(s) de 50 min`}
                </p>
              </div>

              {generatedType === 'aula' && ocrText && (
                <details className="scanned-source">
                  <summary>📝 Conteúdo Original Escaneado · Ver mais / Editar</summary>
                  <textarea
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder="O conteúdo integral reconhecido nas imagens aparecerá aqui."
                  />
                </details>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 6px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                  ✏️ Edite o plano ou prova livremente abaixo:
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: draftSavedText ? '#047857' : (!syncState.isOnline ? '#b45309' : '#475569'),
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: draftSavedText ? '#ecfdf5' : (!syncState.isOnline ? '#fef3c7' : '#f1f5f9'),
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: draftSavedText ? '1px solid #a7f3d0' : (!syncState.isOnline ? '1px solid #fde68a' : '1px solid #e2e8f0'),
                  }}
                >
                  {draftSavedText ? (
                    <>
                      <span>💾</span>
                      <span>{draftSavedText}</span>
                    </>
                  ) : !syncState.isOnline ? (
                    <>
                      <span>📡</span>
                      <span>Modo Offline: Edições salvas no IndexedDB</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Cache IndexedDB ativo</span>
                    </>
                  )}
                </span>
              </div>

              <textarea
                className="editable-result"
                value={generatedContent}
                onChange={(e) => {
                  const val = e.target.value;
                  setGeneratedContent(val);
                  if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
                  draftDebounceRef.current = setTimeout(async () => {
                    try {
                      await indexedDBStorage.saveDraft({
                        key: 'active_generator_draft',
                        type: generatedType || 'aula',
                        content: val,
                        subject: generatedDisciplina || disciplina,
                        grade: generatedAnoSerie || ano,
                        className: targetClass || 'Turma A',
                        bimester: selectedBimester,
                        updatedAt: new Date().toISOString(),
                      });
                      setDraftSavedText(`Rascunho salvo no cache às ${new Date().toLocaleTimeString('pt-BR')}`);
                      setTimeout(() => setDraftSavedText(null), 3000);
                    } catch (err) {
                      console.warn('[Draft] Erro ao salvar no IndexedDB:', err);
                    }
                  }, 600);
                }}
              />

              <div className="save-location">
                <label>
                  Turma
                  <input
                    value={targetClass}
                    onChange={(e) => setTargetClass(e.target.value)}
                  />
                </label>
                <label>
                  Pasta
                  <select
                    value={selectedBimester}
                    onChange={(e) => setSelectedBimester(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((b) => (
                      <option key={b} value={b}>
                        {b}º bimestre
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="result-actions multi">
                {generatedType === 'aula' && (
                  <button
                    type="button"
                    style={{
                      background: '#eff6ff',
                      border: '1.5px solid #3b82f6',
                      color: '#1d4ed8',
                      fontWeight: '700',
                    }}
                    onClick={() => handleGenerate('prova', 'plano')}
                  >
                    📝 Gerar Prova desta Aula
                  </button>
                )}
                <button
                  type="button"
                  style={{
                    background: '#f5f3ff',
                    border: '1.5px solid #8b5cf6',
                    color: '#6d28d9',
                    fontWeight: '700',
                  }}
                  onClick={() => {
                    setAdaptacaoConteudoTransit(generatedContent);
                    setActiveTab('adaptacao_inclusiva');
                  }}
                >
                  🎯 Adaptar para Inclusão (PEI)
                </button>
                <button
                  type="button"
                  style={{
                    background: 'linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: '800',
                    boxShadow: '0 2px 8px rgba(29, 78, 216, 0.3)',
                  }}
                  onClick={() => {
                    setExportPdfData({
                      isOpen: true,
                      title:
                        generatedType === 'prova'
                          ? `Avaliação — ${generatedDisciplina || disciplina}`
                          : `Plano de Aula — ${generatedDisciplina || disciplina}`,
                      content: generatedContent,
                      materialType: generatedType === 'prova' ? 'prova' : 'aula',
                      subject: generatedDisciplina || disciplina,
                      grade: generatedAnoSerie || ano,
                      className: targetClass || 'Turma A',
                      bimester: selectedBimester,
                    });
                  }}
                >
                  📄 Exportar PDF Oficial
                </button>
                <button type="button" onClick={handleSaveToFolder}>
                  ☆ Salvar na pasta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: 'Aula Clara', text: generatedContent });
                    } else {
                      navigator.clipboard.writeText(generatedContent);
                      showToast('Copiado para a área de transferência!');
                    }
                  }}
                >
                  ↗ Compartilhar
                </button>
                {generatedType === 'prova' && (
                  <button type="button" className="primary" onClick={handleDownloadWord}>
                    ↓ Baixar Word
                  </button>
                )}
              </div>
            </section>
          )}
        </section>
      )}

      {/* CORRIGIR PROVA TAB (NEW DEDICATED FUNCTION) */}
      {activeTab === 'corrigir_prova' && (
        <section className="page" style={{ padding: '16px 8px' }}>
          <CorrigirProvaView
            initialDisciplina={disciplina}
            initialSegmento={segmento}
            initialAno={ano}
            onBack={() => setActiveTab('create')}
            showToast={showToast}
            onSaveCorrecao={(rel: RelatorioCorrecaoProva) => {
              const formattedContent = [
                `RELATÓRIO DE CORREÇÃO DE PROVA`,
                `Disciplina: ${rel.disciplina} | Ano/Série: ${rel.ano_serie || ano}`,
                rel.nomeAlunoDetectado ? `Aluno: ${rel.nomeAlunoDetectado}` : '',
                `Data: ${rel.dataAvaliacao || new Date().toLocaleDateString('pt-BR')}`,
                `Nota Final: ${rel.notaFinal.toFixed(2).replace('.', ',')} / ${rel.notaMaximaTotal.toFixed(2).replace('.', ',')}`,
                `Gabarito: ${rel.modoGabarito === 'com_gabarito' ? 'Fornecido pelo Professor' : 'Inferido pela IA'}`,
                `\nQUESTÕES CORRIGIDAS:`,
                ...rel.questoes.map(
                  (q) =>
                    `\nQuestão ${q.numero} (${q.tipo}) — Nota: ${q.notaAtribuida.toFixed(2).replace('.', ',')} / ${q.valorMaximo.toFixed(2).replace('.', ',')}\nEnunciado: ${q.enunciado}\nResposta do Aluno: ${q.respostaAlunoTexto || q.alternativaMarcada || 'Não identificada'}\nGabarito: ${q.gabaritoEsperado}\nFeedback: ${q.feedbackConciso}`
                ),
              ]
                .filter(Boolean)
                .join('\n');

              const newSaved: Omit<SavedMaterial, 'id'> = {
                type: 'correcao_prova',
                title: `Correção Prova - ${rel.nomeAlunoDetectado || 'Aluno'} (${rel.disciplina})`,
                subject: rel.disciplina,
                grade: rel.ano_serie || ano,
                className: targetClass || 'Turma A',
                bimester: selectedBimester,
                content: formattedContent,
                createdAt: new Date().toLocaleDateString('pt-BR'),
              };

              persistMaterialLocallyAndSync(newSaved);
              showToast('Correção salva com sucesso no cache local e sincronizada!');
            }}
          />
        </section>
      )}

      {/* 1. MAPA DE CALOR & DIAGNÓSTICO DA TURMA TAB */}
      {activeTab === 'diagnostico_turma' && (
        <section className="page" style={{ padding: '16px 8px' }}>
          {userRole !== 'gestao' ? (
            <div
              style={{
                maxWidth: '600px',
                margin: '40px auto',
                padding: '32px 24px',
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  margin: '0 auto 16px',
                }}
              >
                🔒
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px' }}>
                Acesso Restrito à Gestão Escolar
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: '0 0 24px' }}>
                O <b>Mapa de Calor & Diagnóstico da Turma</b> é uma ferramenta exclusiva para a Coordenação Pedagógica e Direção Escolar acompanhar a proficiência da BNCC e emitir relatórios institucionais.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginModalDefaultTab('gestao');
                    setLoginModalOpen(true);
                  }}
                  style={{
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
                  }}
                >
                  🏛️ Fazer Login como Gestão Escolar
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  style={{
                    padding: '10px 16px',
                    background: '#f8fafc',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Voltar para Área do Professor
                </button>
              </div>
            </div>
          ) : (
            <DiagnosticoTurmaView
              initialDisciplina={disciplina}
              initialSegmento={segmento}
              initialAno={ano}
              initialTurma={targetClass || 'Turma A'}
              initialBimestre={`${selectedBimester}º Bimestre`}
              onBack={() => setActiveTab('create')}
              onNavigateToReensino={(defasagens, disc, anoSerie) => {
                setReensinoDefasagensTransit(defasagens);
                if (disc) setDisciplina(disc as DisciplinaType);
                if (anoSerie) setAno(anoSerie);
                setActiveTab('plano_reensino');
              }}
              showToast={showToast}
            />
          )}
        </section>
      )}

      {/* 2. PLANO DE REENSINO & RECUPERAÇÃO PARALELA TAB */}
      {activeTab === 'plano_reensino' && (
        <section className="page" style={{ padding: '16px 8px' }}>
          <ReensinoRecuperacaoView
            initialDefasagens={reensinoDefasagensTransit}
            initialDisciplina={disciplina}
            initialSegmento={segmento}
            initialAno={ano}
            onBack={() => setActiveTab('create')}
            showToast={showToast}
            onSaveMaterial={(plano: PlanoReensinoResult) => {
              const formatted = [
                `PLANO DE REENSINO E RECUPERAÇÃO PARALELA`,
                `Disciplina: ${plano.disciplina} | Ano/Série: ${plano.ano_serie}`,
                `Tópico: ${plano.topicoPrincipal}`,
                `\nLacunas Focadas:\n${plano.lacunasFocadas.map((l) => `• ${l}`).join('\n')}`,
                `\nObjetivos:\n${plano.objetivosAprendizagem.map((o) => `• ${o}`).join('\n')}`,
                `\n--- AULA DE REENSINO (${plano.planoAulaReensino.tempoTotalMinutos} min) ---`,
                `1. Diagnóstica: ${plano.planoAulaReensino.etapaDiagnostica}`,
                `2. Metodologia Ativa: ${plano.planoAulaReensino.etapaMetodologiaAtiva}`,
                `3. Prática Guiada: ${plano.planoAulaReensino.praticaGuiada}`,
                `4. Fechamento: ${plano.planoAulaReensino.fechamentoConsolidacao}`,
                `\n--- ATIVIDADE DE RECUPERAÇÃO ---`,
                `Instruções: ${plano.atividadeRecuperacaoParalela.instrucoesAluno}`,
                ...plano.atividadeRecuperacaoParalela.questoes.map(
                  (q) =>
                    `\nQuestão ${q.numero}:\n${q.enunciado}\n[Dica/Andaime]: ${q.dicaAndaime}\n[Gabarito]: ${q.gabaritoComentado}`
                ),
              ].join('\n');

              const newSaved: Omit<SavedMaterial, 'id'> = {
                type: 'reensino',
                title: `Plano Reensino: ${plano.topicoPrincipal}`,
                subject: plano.disciplina,
                grade: plano.ano_serie,
                className: targetClass || 'Turma A',
                bimester: selectedBimester,
                content: formatted,
                createdAt: new Date().toLocaleDateString('pt-BR'),
              };

              persistMaterialLocallyAndSync(newSaved);
              showToast('Plano de Reensino salvo no cache IndexedDB com sucesso!');
            }}
          />
        </section>
      )}

      {/* 3. ADAPTAÇÃO INCLUSIVA & REGISTRO DE PEI (AEE) TAB */}
      {activeTab === 'adaptacao_inclusiva' && (
        <section className="page" style={{ padding: '16px 8px' }}>
          <AdaptacaoInclusivaView
            initialConteudo={adaptacaoConteudoTransit}
            initialDisciplina={disciplina}
            initialSegmento={segmento}
            initialAno={ano}
            onBack={() => setActiveTab('create')}
            showToast={showToast}
            onSaveMaterial={(adaptacao: AdaptacaoInclusivaResult) => {
              const formatted = [
                `ADAPTAÇÃO INCLUSIVA & FICHA DE PEI / AEE`,
                `Especificidade: ${adaptacao.tipoNecessidade}`,
                `Disciplina: ${adaptacao.disciplina} | Ano/Série: ${adaptacao.ano_serie}`,
                `Flexibilização: ${adaptacao.tempoSugeridoFlexibilizacao}`,
                `\n--- CONTEÚDO ADAPTADO ---\n${adaptacao.conteudoAdaptadoFormatado}`,
                `\n--- REGISTRO OFICIAL PEI / AEE ---`,
                `Objetivo: ${adaptacao.registroPeiAee.objetivoIndividualizado}`,
                `Barreiras: ${adaptacao.registroPeiAee.barreirasIdentificadas.join('; ')}`,
                `Estratégias: ${adaptacao.registroPeiAee.estrategiasDiferenciadas.join('; ')}`,
                `Critérios: ${adaptacao.registroPeiAee.criteriosAvaliativosFlexibilizados.join('; ')}`,
                `Observações Prontuário: ${adaptacao.registroPeiAee.observacoesParaProntuario}`,
              ].join('\n');

              const newSaved: Omit<SavedMaterial, 'id'> = {
                type: 'adaptacao_inclusiva',
                title: `PEI Adaptado (${adaptacao.tipoNecessidade}) - ${adaptacao.disciplina}`,
                subject: adaptacao.disciplina,
                grade: adaptacao.ano_serie,
                className: targetClass || 'Turma A',
                bimester: selectedBimester,
                content: formatted,
                createdAt: new Date().toLocaleDateString('pt-BR'),
              };

              persistMaterialLocallyAndSync(newSaved);
              showToast('Adaptação e Registro de PEI salvos com sucesso!');
            }}
          />
        </section>
      )}

      {/* 4. PARECER DESCRITIVO OFICIAL TAB */}
      {activeTab === 'parecer_descritivo' && (
        <section className="page" style={{ padding: '16px 8px' }}>
          {userRole !== 'gestao' ? (
            <div
              style={{
                maxWidth: '600px',
                margin: '40px auto',
                padding: '32px 24px',
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  margin: '0 auto 16px',
                }}
              >
                📝
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px' }}>
                Acesso Restrito à Gestão Escolar
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: '0 0 24px' }}>
                O módulo de <b>Pareceres Descritivos Oficiais</b> é exclusivo para a Coordenação Pedagógica e Direção Escolar emitirem e validarem pareceres formativos do bimestre para boletins e conselhos de classe.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginModalDefaultTab('gestao');
                    setLoginModalOpen(true);
                  }}
                  style={{
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(22, 101, 52, 0.3)',
                  }}
                >
                  🏛️ Fazer Login como Gestão Escolar
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  style={{
                    padding: '10px 16px',
                    background: '#f8fafc',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Voltar para Área do Professor
                </button>
              </div>
            </div>
          ) : (
            <ParecerDescritivoView
              initialDisciplina={disciplina}
              initialSegmento={segmento}
              initialAno={ano}
              initialTurma={targetClass || 'Turma A'}
              initialBimestre={`${selectedBimester}º Bimestre`}
              onBack={() => setActiveTab('create')}
              showToast={showToast}
              onSaveMaterial={(parecer: ParecerDescritivoResult) => {
                const formatted = [
                  `PARECER DESCRITIVO OFICIAL`,
                  `Estudante: ${parecer.nomeAluno} | Turma: ${parecer.turma}`,
                  `Disciplina: ${parecer.disciplina} | Ano/Série: ${parecer.ano_serie} | Bimestre: ${parecer.bimestre}`,
                  `\n--- TEXTO DO PARECER FORMATIVO ---\n${parecer.parecerCompletoFormatado}`,
                  `\n--- HABILIDADES BNCC ---\n${parecer.sinteseHabilidadesBncc.map((h) => `• ${h}`).join('\n')}`,
                  `\nAspectos Socioemocionais: ${parecer.aspectosSocioemocionais}`,
                  `Recomendações Família: ${parecer.recomendacoesFamilia}`,
                  `Metas Próximo Bimestre: ${parecer.metasProximoBimestre}`,
                ].join('\n');

                const newSaved: Omit<SavedMaterial, 'id'> = {
                  type: 'parecer',
                  title: `Parecer: ${parecer.nomeAluno} (${parecer.bimestre})`,
                  subject: parecer.disciplina,
                  grade: parecer.ano_serie,
                  className: parecer.turma,
                  bimester: selectedBimester,
                  content: formatted,
                  createdAt: new Date().toLocaleDateString('pt-BR'),
                };

                persistMaterialLocallyAndSync(newSaved);
                showToast('Parecer Descritivo salvo com sucesso!');
              }}
            />
          )}
        </section>
      )}

      {/* GEMINI PEDAGOGICAL CHATBOT & IMAGE ANALYZER TAB */}
      {activeTab === 'chat' && (
        <section className="page" style={{ padding: '16px 8px' }}>
          <GeminiChatbotView
            initialDisciplina={disciplina}
            initialSegmento={segmento}
            initialAno={ano}
            userRole={userRole}
            gestaoRoleTitle={gestaoRoleTitle}
            userName={userName}
            onBack={() => setActiveTab('create')}
            showToast={showToast}
            onSaveMaterial={(title, content) => {
              const newSaved: Omit<SavedMaterial, 'id'> = {
                type: 'chat',
                title: title || 'Orientação Pedagógica - Gemini',
                subject: disciplina,
                grade: ano,
                className: targetClass || 'Turma A',
                bimester: selectedBimester,
                content,
                createdAt: new Date().toLocaleDateString('pt-BR'),
              };
              persistMaterialLocallyAndSync(newSaved);
              showToast('Conteúdo salvo na pasta do bimestre e cache!');
            }}
          />
        </section>
      )}

      {/* SAVED MATERIALS TAB (PASTAS) */}
      {activeTab === 'saved' && (
        <section className="page saved-page">
          <div className="page-heading">
            <span className="eyebrow">ARQUIVOS SALVOS</span>
            <h1>Turmas e bimestres</h1>
            <p>Abra uma pasta para consultar e editar o conteúdo.</p>
          </div>

          <div className="folder-tabs">
            {[1, 2, 3, 4].map((b) => (
              <button
                key={b}
                type="button"
                className={folderBimesterTab === b ? 'active' : ''}
                onClick={() => setFolderBimesterTab(b)}
              >
                □
                <span>{b}º bimestre</span>
                <small>
                  {savedMaterials.filter((m) => m.bimester === b).length} arquivo(s)
                </small>
              </button>
            ))}
          </div>

          <div className="saved-list">
            {savedMaterials
              .filter((m) => m.bimester === folderBimesterTab)
              .map((m) => (
                <article key={m.id} onClick={() => setEditingMaterial(m)}>
                  <span className="icon">{m.type === 'aula' ? '▤' : '✓'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <small>
                        {m.className} · {m.type === 'aula' ? 'PLANO' : m.type === 'prova' ? 'PROVA' : m.type?.toUpperCase()}
                      </small>
                      {m.syncStatus === 'pending' || m.synced === false ? (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: '700',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                          }}
                          title="Salvo localmente no IndexedDB. Aguardando sincronização com a nuvem."
                        >
                          ⏳ Cache Local
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: '700',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                          }}
                          title="Sincronizado na nuvem"
                        >
                          ☁️ Sincronizado
                        </span>
                      )}
                    </div>
                    <b>{m.title}</b>
                    <span>
                      {m.grade} · {m.createdAt} {m.updatedAt ? `(atualizado)` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await deleteMaterialLocallyAndSync(m.id);
                      showToast('Arquivo removido do cache e sincronizado');
                    }}
                  >
                    ×
                  </button>
                </article>
              ))}

            {!savedMaterials.some((m) => m.bimester === folderBimesterTab) && (
              <div className="empty">
                <span className="icon">□</span>
                <h2>Pasta vazia</h2>
                <p>Salve um material neste bimestre para ele aparecer aqui.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Edit Modal */}
      {editingMaterial && (
        <div className="edit-modal">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h2 style={{ margin: 0 }}>Editar arquivo</h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: !syncState.isOnline ? '#b45309' : '#047857',
                  background: !syncState.isOnline ? '#fef3c7' : '#ecfdf5',
                  padding: '3px 8px',
                  borderRadius: '6px',
                }}
              >
                {!syncState.isOnline ? '📡 Edição Offline (IndexedDB)' : '⚡ Sincronização Ativa'}
              </span>
            </div>
            <input
              value={editingMaterial.title}
              onChange={(e) =>
                setEditingMaterial({ ...editingMaterial, title: e.target.value })
              }
            />
            <textarea
              value={editingMaterial.content}
              onChange={(e) =>
                setEditingMaterial({ ...editingMaterial, content: e.target.value })
              }
            />
            <footer>
              <button
                type="button"
                style={{
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  marginRight: 'auto',
                }}
                onClick={() => {
                  setExportPdfData({
                    isOpen: true,
                    title: editingMaterial.title,
                    content: editingMaterial.content,
                    materialType: editingMaterial.type === 'prova' ? 'prova' : 'aula',
                    subject: editingMaterial.subject,
                    grade: editingMaterial.grade,
                    className: editingMaterial.className,
                    bimester: editingMaterial.bimester,
                  });
                }}
              >
                📄 Exportar PDF Oficial
              </button>
              <button type="button" onClick={() => setEditingMaterial(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  await persistMaterialLocallyAndSync(editingMaterial);
                  setEditingMaterial(null);
                  showToast('Alterações salvas no cache IndexedDB e sincronizadas!');
                }}
              >
                Salvar alterações
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {accountModalOpen && (
        <div className="admin-backdrop" onClick={() => setAccountModalOpen(false)}>
          <div className="account-panel" onClick={(e) => e.stopPropagation()}>
            <button className="panel-close" onClick={() => setAccountModalOpen(false)}>
              ×
            </button>
            <span className="eyebrow">
              {userRole === 'master' ? '👑 ADMINISTRADOR MASTER' : userRole === 'gestao' ? '🏛️ GESTÃO ESCOLAR' : '👨‍🏫 CONTA DOCENTE'}
            </span>
            <h2>Minha conta e acessos</h2>
            <div className="access-status">
              <p>
                Identificação: <b>{userName}</b>
              </p>
              <p>
                Perfil Atual:{' '}
                <b>
                  {userRole === 'master'
                    ? '👑 Administrador Master'
                    : userRole === 'gestao'
                    ? `🏛️ ${gestaoRoleTitle || 'Gestão Escolar'}`
                    : '👨‍🏫 Professor(a)'}
                </b>
              </p>
              <p>
                E-mail: <b>{userEmail}</b>
              </p>
              <p>
                Status do acesso:{' '}
                <span className="badge-active" style={isMaster ? { background: '#f59e0b', color: '#fff' } : {}}>
                  {isMaster ? 'Vitalício • Ilimitado' : 'Ativo'}
                </span>
              </p>
              <p>
                Licença: <b>{isMaster ? 'Acesso Vitalício & Gestão Central' : '30 dias de uso institucional'}</b>
              </p>
            </div>

            {/* Painel Master: Gerenciar Acessos Button inside Profile */}
            {isMaster && (
              <div style={{ marginTop: '14px', marginBottom: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setAccountModalOpen(false);
                    setAccessManagerOpen(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '13.5px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                  }}
                >
                  <span>👑 Abrir Painel: Gerenciar Acessos</span>
                </button>
              </div>
            )}

            {/* Alternar Perfil Button */}
            <div style={{ marginTop: '10px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => {
                  setAccountModalOpen(false);
                  setLoginModalDefaultTab(userRole === 'master' ? 'master' : (userRole === 'gestao' ? 'professor' : 'master'));
                  setLoginModalOpen(true);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  background:
                    userRole === 'master'
                      ? '#fffbeb'
                      : userRole === 'gestao'
                      ? '#f5f3ff'
                      : '#eff6ff',
                  border:
                    userRole === 'master'
                      ? '1.5px solid #fde68a'
                      : userRole === 'gestao'
                      ? '1.5px solid #c4b5fd'
                      : '1.5px solid #bfdbfe',
                  borderRadius: '12px',
                  color:
                    userRole === 'master'
                      ? '#b45309'
                      : userRole === 'gestao'
                      ? '#6d28d9'
                      : '#1d4ed8',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>🔄 Alternar Perfil (Master / Gestão / Professor)</span>
              </button>
            </div>

            <div className="install-link-actions">
              <a
                href="/aula-clara-android.apk"
                download="Aula-Clara-3.1.7.apk"
                className="login-primary install-app-button android-download-button"
              >
                ↓ Baixar App Aula Clara para Android (.APK)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Atualizações e Download Modal */}
      {installModalOpen && (
        <div className="admin-backdrop" onClick={() => setInstallModalOpen(false)}>
          <div
            className="account-panel install-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '92%',
              padding: 0,
              overflow: 'hidden',
              borderRadius: '24px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
            }}
          >
            {/* Top Bar - Clean Slate/Blue */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📚</span>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: '900',
                    letterSpacing: '0.06em',
                    color: '#ffffff',
                    textTransform: 'uppercase',
                  }}
                >
                  AULA CLARA · APLICATIVO
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInstallModalOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
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

            {/* Inner Content Card */}
            <div style={{ padding: '22px 20px' }}>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '20px',
                  padding: '22px 18px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: '20px',
                      fontWeight: '900',
                      color: '#0f172a',
                      margin: '0 0 6px',
                      lineHeight: '1.2',
                    }}
                  >
                    Atualizações e Instalação
                  </h2>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
                    Versão atual: <span style={{ color: '#0284c7', fontWeight: '800' }}>3.1.7 (Oficial)</span>
                  </div>
                </div>

                {/* Status Pill */}
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #bbf7d0',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    color: '#065f46',
                    fontSize: '14px',
                    fontWeight: '800',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>✓</span>
                  <span>{updateStatusText}</span>
                </div>

                {/* Button 1: Instalar Aplicativo no Celular */}
                <button
                  type="button"
                  onClick={handleInstallPWA}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '14px',
                    fontSize: '15px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 3px 10px rgba(2, 132, 199, 0.3)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>📲 Instalar Aplicativo no Celular</span>
                </button>

                {/* Button 2: Verificar Atualização */}
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={isCheckingUpdate}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #cbd5e1',
                    borderRadius: '14px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>{isCheckingUpdate ? '⏳ Verificando servidor...' : '🔄 Verificar atualização'}</span>
                </button>

                {/* Button 3: Abrir Página de Download */}
                <button
                  type="button"
                  onClick={handleOpenDownloadPage}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    background: '#f0f9ff',
                    color: '#0284c7',
                    border: '1.5px solid #bae6fd',
                    borderRadius: '14px',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>Abrir página oficial de instalação</span>
                  <span style={{ fontSize: '15px' }}>↗</span>
                </button>

                {/* Button 4: Compartilhar com colegas */}
                <button
                  type="button"
                  onClick={handleShareWithColleagues}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    background: '#ffffff',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>Compartilhar link do app</span>
                  <span style={{ fontSize: '15px' }}>📤</span>
                </button>
              </div>

              {/* Step info */}
              <div
                style={{
                  marginTop: '14px',
                  padding: '12px 14px',
                  background: '#f1f5f9',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#475569',
                  lineHeight: '1.4',
                }}
              >
                💡 <b>Dica rápida:</b> Toque nos <b>3 pontinhos (⋮)</b> do Chrome e escolha <b>"Instalar aplicativo"</b> ou <b>"Adicionar à tela inicial"</b> para fixar o Aula Clara no celular.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access Manager Panel (Master) */}
      {accessManagerOpen && (
        <div className="admin-backdrop access-page" onClick={() => setAccessManagerOpen(false)}>
          <div className="admin-panel access-manager" onClick={(e) => e.stopPropagation()}>
            <div className="access-manager-nav">
              <button type="button" onClick={() => setAccessManagerOpen(false)} aria-label="Voltar ao menu anterior">
                <span aria-hidden="true">←</span>
                Voltar
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
              <span className="eyebrow" style={{ margin: 0, color: '#0284c7', fontWeight: '800' }}>PAINEL MASTER CENTRAL</span>
              <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '3px 9px', borderRadius: '12px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }}></span>
                Nuvem Sincronizada ({syncLastTime || 'tempo real'})
              </span>
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: '4px 0 6px 0' }}>Gerenciar acessos</h2>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.45', marginBottom: '16px' }}>
              Área exclusiva da conta master. Adicione ou retire dias de qualquer usuário. Seu próprio acesso é vitalício.
            </p>

            {/* Card: Cadastrar novo usuário */}
            <div
              style={{
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: '16px',
                padding: '18px',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
                marginBottom: '18px',
              }}
            >
              <div style={{ marginBottom: '12px' }}>
                <b style={{ fontSize: '15px', color: '#0f172a', display: 'block' }}>Cadastrar novo usuário</b>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  O e-mail deve ser o mesmo que a pessoa usará para entrar com o Google.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <input
                    type="text"
                    placeholder="Nome do usuário (opcional)"
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '13.5px',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="E-mail Google"
                    value={newTeacherEmail}
                    onChange={(e) => setNewTeacherEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '13.5px',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>FUNÇÃO</label>
                  <select
                    value={newTeacherRole}
                    onChange={(e) => setNewTeacherRole(e.target.value as 'professor' | 'gestao')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '13px',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  >
                    <option value="professor">👨‍🏫 Professor(a)</option>
                    <option value="gestao">🏛️ Gestão Escolar</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>DIAS INICIAIS</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={newTeacherDays}
                    onChange={(e) => setNewTeacherDays(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '13px',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddTeacher}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>➕ Cadastrar e liberar acesso</span>
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', color: '#64748b' }}>
                🔍
              </span>
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={accessSearch}
                onChange={(e) => setAccessSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 36px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  color: '#0f172a',
                  outline: 'none',
                }}
              />
            </div>

            {/* Refresh Users Button */}
            <button
              type="button"
              onClick={syncWithServer}
              style={{
                width: '100%',
                padding: '11px 14px',
                background: '#f1f5f9',
                color: '#1e293b',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                fontSize: '13.5px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              <span>{isSyncing ? '⏳ Sincronizando usuários na nuvem...' : '🔄 Atualizar usuários'}</span>
            </button>

            {/* Info Summary Banner */}
            <div
              style={{
                fontSize: '13px',
                color: '#475569',
                lineHeight: '1.4',
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <b>{accessList.length} e-mails cadastrados.</b> Defina o prazo exato, adicione ou retire dias.
            </div>

            {/* Access Filters */}
            <div className="access-folder-tabs" style={{ marginBottom: '14px' }}>
              <button
                type="button"
                className={accessFilter === 'all' ? 'active' : ''}
                onClick={() => setAccessFilter('all')}
              >
                Todos ({accessList.length})
              </button>
              <button
                type="button"
                className={accessFilter === 'active' ? 'active' : ''}
                onClick={() => setAccessFilter('active')}
              >
                Ativos ({accessList.filter((u) => u.status === 'Ativo').length})
              </button>
              <button
                type="button"
                className={accessFilter === 'blocked' ? 'active' : ''}
                onClick={() => setAccessFilter('blocked')}
              >
                Bloqueados ({accessList.filter((u) => u.status === 'Bloqueado').length})
              </button>
            </div>

            {/* List of Users with Screenshot-2 Interactive Controls */}
            <div className="grant-list" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {filteredAccessList.map((teacher) => {
                const isUserMaster = teacher.email.toLowerCase().includes('ecomnixx') || teacher.role === 'master' || teacher.email.toLowerCase() === 'familiacardoso21@gmail.com';
                const isGestao = teacher.role === 'gestao';
                const isBlocked = teacher.status === 'Bloqueado';
                const expInfo = getExpirationInfo(teacher.daysRemaining);
                const adjustment = getUserAdjustment(teacher.id, teacher.daysRemaining);

                return (
                  <div
                    key={teacher.id}
                    style={{
                      background: '#ffffff',
                      border: isUserMaster ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '16px',
                      marginBottom: '14px',
                      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    {/* Header Info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <b style={{ fontSize: '16px', color: '#0f172a' }}>{teacher.name || 'Sem nome'}</b>
                          {isUserMaster && (
                            <span style={{ fontSize: '10px', background: '#0284c7', color: '#ffffff', padding: '1px 6px', borderRadius: '6px', fontWeight: '800' }}>
                              MASTER VITALÍCIO
                            </span>
                          )}
                          {isGestao && !isUserMaster && (
                            <span style={{ fontSize: '10px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', padding: '1px 6px', borderRadius: '6px', fontWeight: '700' }}>
                              GESTÃO ESCOLAR
                            </span>
                          )}
                          {!isGestao && !isUserMaster && (
                            <span style={{ fontSize: '10px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '6px', fontWeight: '700' }}>
                              PROFESSOR
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                          {teacher.email}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '3px 8px',
                            borderRadius: '8px',
                            background: isBlocked ? '#fee2e2' : '#ecfdf5',
                            color: isBlocked ? '#991b1b' : '#047857',
                          }}
                        >
                          {isBlocked ? '● Bloqueado' : '● Ativo'}
                        </span>
                      </div>
                    </div>

                    {/* Status & Expiration Line */}
                    <div style={{ fontSize: '12.5px', color: isBlocked ? '#991b1b' : '#059669', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {isBlocked ? (
                        <span>✕ Acesso pausado / expirado</span>
                      ) : isUserMaster ? (
                        <span>👑 Acesso Master Ilimitado</span>
                      ) : (
                        <span>✓ Teste / Acesso liberado - {teacher.daysRemaining} dias ativo até {expInfo}</span>
                      )}
                    </div>

                    {/* Interactive Days Box & Controls (for non-master) */}
                    {!isUserMaster && (
                      <div
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '12px',
                          marginBottom: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          {/* Current Remaining Days Tag/Input */}
                          <div
                            style={{
                              flex: 1,
                              padding: '10px 12px',
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '10px',
                              fontSize: '14px',
                              fontWeight: '700',
                              color: '#0f172a',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>Restam {teacher.daysRemaining} dias</span>
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>atual</span>
                          </div>

                          {/* Delta Input (e.g., 1, 5, 10, 30) */}
                          <input
                            type="number"
                            min="0"
                            max="999"
                            value={adjustment.delta}
                            onChange={(e) => setUserAdjustmentDelta(teacher.id, parseInt(e.target.value) || 0)}
                            style={{
                              width: '75px',
                              padding: '10px 8px',
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '10px',
                              fontSize: '14px',
                              fontWeight: '700',
                              color: '#0f172a',
                              textAlign: 'center',
                              outline: 'none',
                            }}
                            title="Quantidade de dias para adicionar ou retirar"
                          />
                        </div>

                        {/* Preview of calculation */}
                        <div style={{ fontSize: '12px', color: '#475569', fontWeight: '600', marginBottom: '10px' }}>
                          Após salvar: <span style={{ color: '#0284c7', fontWeight: '800' }}>{adjustment.afterDays} dias restantes</span>
                        </div>

                        {/* Mode Selection Buttons: Retirar vs Adicionar */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setUserAdjustmentMode(teacher.id, 'subtract')}
                            style={{
                              padding: '9px 12px',
                              background: adjustment.mode === 'subtract' ? '#fee2e2' : '#ffffff',
                              color: adjustment.mode === 'subtract' ? '#991b1b' : '#64748b',
                              border: adjustment.mode === 'subtract' ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span>– Retirar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setUserAdjustmentMode(teacher.id, 'add')}
                            style={{
                              padding: '9px 12px',
                              background: adjustment.mode === 'add' ? '#e0f2fe' : '#ffffff',
                              color: adjustment.mode === 'add' ? '#0369a1' : '#64748b',
                              border: adjustment.mode === 'add' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span>+ Adicionar</span>
                          </button>
                        </div>

                        {/* Salvar Novo Prazo Action Button */}
                        <button
                          type="button"
                          onClick={() => handleSaveUserDays(teacher)}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: '#0f172a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>💾 Salvar novo prazo</span>
                        </button>
                      </div>
                    )}

                    {/* Secondary Action Toolbar */}
                    {!isUserMaster && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                        {/* Toggle Role */}
                        <button
                          type="button"
                          onClick={() => handleToggleRole(teacher.id, isGestao ? 'professor' : 'gestao')}
                          style={{
                            fontSize: '11.5px',
                            padding: '5px 9px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: isGestao ? '#eff6ff' : '#f5f3ff',
                            color: isGestao ? '#1d4ed8' : '#7c3aed',
                            cursor: 'pointer',
                            fontWeight: '600',
                          }}
                        >
                          🔄 Tornar {isGestao ? 'Professor' : 'Gestão'}
                        </button>

                        {/* Block / Liberar */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(teacher.id)}
                          style={{
                            fontSize: '11.5px',
                            padding: '5px 9px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: teacher.status === 'Ativo' ? '#fff1f2' : '#f0fdf4',
                            color: teacher.status === 'Ativo' ? '#e11d48' : '#16a34a',
                            cursor: 'pointer',
                            fontWeight: '600',
                          }}
                        >
                          {teacher.status === 'Ativo' ? '⏸️ Bloquear' : '▶️ Liberar'}
                        </button>

                        {/* Delete User */}
                        <button
                          type="button"
                          onClick={() => {
                            if (pendingDeleteUserId === teacher.id) {
                              handleDeleteUser(teacher.id);
                            } else {
                              setPendingDeleteUserId(teacher.id);
                              showToast(`Toque em “Confirmar exclusão” para remover ${teacher.name}.`);
                            }
                          }}
                          disabled={deletingUserId === teacher.id}
                          style={{
                            fontSize: '11.5px',
                            padding: '5px 9px',
                            borderRadius: '8px',
                            border: 'none',
                            background: pendingDeleteUserId === teacher.id ? '#dc2626' : '#fee2e2',
                            color: pendingDeleteUserId === teacher.id ? '#ffffff' : '#991b1b',
                            cursor: 'pointer',
                            fontWeight: '600',
                            marginLeft: 'auto',
                          }}
                        >
                          {deletingUserId === teacher.id
                            ? 'Excluindo…'
                            : pendingDeleteUserId === teacher.id
                              ? 'Confirmar exclusão'
                              : '🗑️ Excluir'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button
          type="button"
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}
        >
          <span>⌂</span>
          Início
        </button>
        <button type="button" className={activeTab === 'sources' ? 'active' : ''} onClick={() => setActiveTab('sources')}>
          <span>＋</span>
          Fontes
        </button>
        <button
          type="button"
          className={activeTab === 'saved' ? 'active' : ''}
          onClick={() => setActiveTab('saved')}
        >
          <span>□</span>
          Pastas
        </button>
      </nav>

      {/* Account Status / Blocked Notification Modal */}
      {accountBlockedMessage && (
        <div className="admin-backdrop" style={{ zIndex: 9999 }}>
          <div className="admin-panel" style={{ maxWidth: '440px', textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ fontSize: '20px', color: '#991b1b', marginBottom: '8px' }}>Acesso Temporariamente Pausado</h2>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5', marginBottom: '20px' }}>
              {accountBlockedMessage}
            </p>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
              Usuário Atual: <b>{userEmail}</b><br />
              Administrador Master Responsável: <b>ecomnixx@gmail.com</b>
            </div>
            <button
              type="button"
              className="login-primary"
              onClick={() => syncWithServer()}
              style={{ width: '100%', padding: '12px', fontWeight: 'bold' }}
            >
              🔄 Verificar se o Master já liberou meu acesso
            </button>
          </div>
        </div>
      )}

      {/* Role & Login Switcher Modal */}
      <SimpleLoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        currentName={userName}
        currentEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* Floating Toast Notification */}
      {toastMessage && <div className="toast">✓ {toastMessage}</div>}

      {/* Guided PWA Install Toast / Banner (only shown if not installed) */}
      <InstallGuidedBanner
        deferredPrompt={deferredPrompt}
        isInstalled={isInstalled}
        onInstallAccepted={() => showToast('Instalando aplicativo Aula Clara...')}
      />

      {/* Official School PDF Export Modal */}
      {exportPdfData && (
        <ExportPdfModal
          isOpen={exportPdfData.isOpen}
          onClose={() => setExportPdfData(null)}
          title={exportPdfData.title}
          content={exportPdfData.content}
          materialType={exportPdfData.materialType}
          defaultSubject={exportPdfData.subject}
          defaultGrade={exportPdfData.grade}
          defaultClass={exportPdfData.className}
          defaultBimester={exportPdfData.bimester}
          teacherNameProp={userName}
          showToast={showToast}
        />
      )}
      {/* Offline Sync Center & IndexedDB Cache Modal */}
      <OfflineSyncCenterModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        syncState={syncState}
        materials={savedMaterials as any}
        onForceSync={async () => {
          await indexedDBStorage.syncPendingChanges();
        }}
        showToast={showToast}
      />
    </main>
  );
}
