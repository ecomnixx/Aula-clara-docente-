/**
 * IndexedDB Robust Storage & Offline Sync Engine for Aula Clara
 * 
 * Features:
 * - Persistent local storage for Lesson Plans (Planos de Aula) & Assessments (Provas)
 * - Automatic Draft Auto-Save during live editing (offline resilience)
 * - Resilient Offline Queue with retry logic
 * - Automatic background synchronization upon reconnection
 * - Conflict resolution (local offline edits prioritized with timestamps)
 */

export interface CachedMaterial {
  id: number;
  type: 'aula' | 'prova' | 'slides' | 'correcao_prova' | 'diagnostico' | 'reensino' | 'adaptacao_inclusiva' | 'parecer' | 'chat';
  title: string;
  subject: string;
  grade: string;
  className: string;
  bimester: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorEmail?: string;
  authorName?: string;
  synced: boolean;
  syncStatus: 'synced' | 'pending' | 'syncing' | 'error';
  lastSyncAttempt?: string;
  syncError?: string;
}

export interface SyncQueueItem {
  id?: number;
  action: 'SAVE' | 'UPDATE' | 'DELETE';
  materialId: number;
  materialData?: CachedMaterial;
  timestamp: number;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string;
}

export interface EditorDraft {
  key: string; // e.g., 'active_generator_draft', 'edit_modal_draft_123'
  type: 'aula' | 'prova' | 'general';
  title?: string;
  content: string;
  subject?: string;
  grade?: string;
  className?: string;
  bimester?: number;
  ocrText?: string;
  updatedAt: string;
}

export interface SyncStateInfo {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  totalCached: number;
  lastError?: string | null;
}

const DB_NAME = 'AulaClara_OfflineDB_v2';
const DB_VERSION = 2;
const STORE_MATERIALS = 'materials';
const STORE_SYNC_QUEUE = 'syncQueue';
const STORE_DRAFTS = 'drafts';

class IndexedDBManager {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private syncListeners: Set<(state: SyncStateInfo) => void> = new Set();
  private isSyncing = false;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private syncIntervalId: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initEventListeners();
    }
  }

  /**
   * Initializes and returns the IndexedDB database instance
   */
  public async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB não suportado neste navegador.'));
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Materials Store
        if (!db.objectStoreNames.contains(STORE_MATERIALS)) {
          const matStore = db.createObjectStore(STORE_MATERIALS, { keyPath: 'id' });
          matStore.createIndex('by_type', 'type', { unique: false });
          matStore.createIndex('by_bimester', 'bimester', { unique: false });
          matStore.createIndex('by_synced', 'synced', { unique: false });
          matStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }

        // 2. Sync Queue Store
        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_SYNC_QUEUE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          queueStore.createIndex('by_status', 'status', { unique: false });
          queueStore.createIndex('by_timestamp', 'timestamp', { unique: false });
        }

        // 3. Drafts Store (live editing cache)
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          db.createObjectStore(STORE_DRAFTS, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Erro ao abrir banco:', request.error);
        this.dbPromise = null;
        reject(request.error || new Error('Falha ao abrir IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  /**
   * Set up network online/offline listeners
   */
  private initEventListeners() {
    window.addEventListener('online', () => {
      console.log('[IndexedDB Sync] Conexão restabelecida! Iniciando sincronização automática...');
      this.notifyListeners();
      // Delay slightly to ensure network stack is ready
      setTimeout(() => {
        this.syncPendingChanges();
      }, 800);
    });

    window.addEventListener('offline', () => {
      console.log('[IndexedDB Sync] Modo Offline ativado. As edições serão guardadas localmente.');
      this.notifyListeners();
    });

    // Periodic sync check every 45 seconds when online
    this.syncIntervalId = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncPendingChanges(true);
      }
    }, 45000);
  }

  /**
   * Subscribe to sync state changes
   */
  public subscribe(listener: (state: SyncStateInfo) => void): () => void {
    this.syncListeners.add(listener);
    this.getSyncState().then(listener);
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  private async notifyListeners() {
    const state = await this.getSyncState();
    this.syncListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.warn('[IndexedDB] Listener error:', err);
      }
    });
  }

  /**
   * Get current sync status snapshot
   */
  public async getSyncState(): Promise<SyncStateInfo> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let pendingCount = 0;
    let totalCached = 0;

    try {
      const db = await this.getDB();
      const tx = db.transaction([STORE_SYNC_QUEUE, STORE_MATERIALS], 'readonly');
      const queueStore = tx.objectStore(STORE_SYNC_QUEUE);
      const matStore = tx.objectStore(STORE_MATERIALS);

      pendingCount = await new Promise<number>((res) => {
        const req = queueStore.count();
        req.onsuccess = () => res(req.result || 0);
        req.onerror = () => res(0);
      });

      totalCached = await new Promise<number>((res) => {
        const req = matStore.count();
        req.onsuccess = () => res(req.result || 0);
        req.onerror = () => res(0);
      });
    } catch {
      // Fallback
    }

    return {
      isOnline,
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncTime: this.lastSyncTime,
      totalCached,
      lastError: this.lastError,
    };
  }

  // ==========================================================================
  // MATERIALS CRUD WITH OFFLINE SUPPORT
  // ==========================================================================

  /**
   * Get all materials from IndexedDB
   */
  public async getAllMaterials(): Promise<CachedMaterial[]> {
    try {
      const db = await this.getDB();
      return new Promise<CachedMaterial[]>((resolve, reject) => {
        const tx = db.transaction(STORE_MATERIALS, 'readonly');
        const store = tx.objectStore(STORE_MATERIALS);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = req.result as CachedMaterial[];
          // Sort newest updated first
          list.sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAt).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt).getTime();
            return timeB - timeA;
          });
          resolve(list);
        };

        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[IndexedDB] Erro ao recuperar materiais, usando fallback do localStorage:', err);
      try {
        const raw = localStorage.getItem('aula-clara-saved');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  }

  /**
   * Save or update a material (Lesson Plan or Exam) in IndexedDB.
   * If online, immediately attempts background sync; if offline, enqueues.
   */
  public async saveMaterial(
    material: Omit<CachedMaterial, 'synced' | 'syncStatus' | 'updatedAt'> & {
      updatedAt?: string;
      synced?: boolean;
      syncStatus?: 'synced' | 'pending' | 'syncing' | 'error';
    }
  ): Promise<CachedMaterial> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : false;
    const nowIso = new Date().toISOString();

    const completeMaterial: CachedMaterial = {
      ...material,
      updatedAt: material.updatedAt || nowIso,
      synced: isOnline ? (material.synced ?? false) : false,
      syncStatus: isOnline ? (material.syncStatus ?? 'pending') : 'pending',
    };

    const db = await this.getDB();

    // 1. Put into materials store
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MATERIALS, 'readwrite');
      const store = tx.objectStore(STORE_MATERIALS);
      const req = store.put(completeMaterial);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // 2. Add to Sync Queue
    await this.enqueueSyncAction({
      action: 'SAVE',
      materialId: completeMaterial.id,
      materialData: completeMaterial,
      timestamp: Date.now(),
      attempts: 0,
      status: 'pending',
    });

    // 3. Mirror into localStorage for backup compatibility
    try {
      const all = await this.getAllMaterials();
      localStorage.setItem('aula-clara-saved', JSON.stringify(all));
    } catch (e) {
      console.warn('[IndexedDB] Fallback localStorage update failed:', e);
    }

    this.notifyListeners();

    // 4. If online, trigger sync immediately in background
    if (isOnline) {
      this.syncPendingChanges();
    }

    return completeMaterial;
  }

  /**
   * Delete a material from IndexedDB and queue deletion sync
   */
  public async deleteMaterial(id: number): Promise<void> {
    const db = await this.getDB();

    // 1. Delete from materials store
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MATERIALS, 'readwrite');
      const store = tx.objectStore(STORE_MATERIALS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // 2. Add delete action to sync queue
    await this.enqueueSyncAction({
      action: 'DELETE',
      materialId: id,
      timestamp: Date.now(),
      attempts: 0,
      status: 'pending',
    });

    // 3. Mirror to localStorage
    try {
      const all = await this.getAllMaterials();
      localStorage.setItem('aula-clara-saved', JSON.stringify(all));
    } catch (e) {
      console.warn('[IndexedDB] Fallback localStorage update failed:', e);
    }

    this.notifyListeners();

    if (navigator.onLine) {
      this.syncPendingChanges();
    }
  }

  // ==========================================================================
  // SYNC QUEUE MANAGEMENT
  // ==========================================================================

  private async enqueueSyncAction(item: SyncQueueItem): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      
      // Look for existing pending action for the same material
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result as SyncQueueItem[];
        const existing = items.find((q) => q.materialId === item.materialId);

        if (existing && existing.id !== undefined) {
          // Update the existing queue entry
          const updated: SyncQueueItem = {
            ...existing,
            action: item.action,
            materialData: item.materialData || existing.materialData,
            timestamp: Date.now(),
            status: 'pending',
          };
          store.put(updated);
        } else {
          store.add(item);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Process all pending offline modifications with the server
   */
  public async syncPendingChanges(silent = false): Promise<{ syncedCount: number; failedCount: number }> {
    if (this.isSyncing || !navigator.onLine) {
      return { syncedCount: 0, failedCount: 0 };
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notifyListeners();

    let syncedCount = 0;
    let failedCount = 0;

    try {
      const db = await this.getDB();
      
      // Get all queued items
      const queueItems = await new Promise<SyncQueueItem[]>((resolve, reject) => {
        const tx = db.transaction(STORE_SYNC_QUEUE, 'readonly');
        const store = tx.objectStore(STORE_SYNC_QUEUE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      if (queueItems.length > 0) {
        console.log(`[IndexedDB Sync] Sincronizando ${queueItems.length} ação(ões) pendente(s)...`);
      }

      for (const item of queueItems) {
        try {
          if (item.action === 'SAVE' || item.action === 'UPDATE') {
            if (!item.materialData) continue;

            const res = await fetch('/api/sync/materials', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('aula_clara_access_token') || ''}`,
              },
              body: JSON.stringify({
                ...item.materialData,
                syncedAt: new Date().toISOString(),
              }),
            });

            if (!res.ok) {
              throw new Error(`Servidor retornou status ${res.status}`);
            }

            // Mark material as synced in IndexedDB
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction([STORE_MATERIALS, STORE_SYNC_QUEUE], 'readwrite');
              const matStore = tx.objectStore(STORE_MATERIALS);
              const qStore = tx.objectStore(STORE_SYNC_QUEUE);

              if (item.materialData) {
                const updatedMat: CachedMaterial = {
                  ...item.materialData,
                  synced: true,
                  syncStatus: 'synced',
                  lastSyncAttempt: new Date().toISOString(),
                  syncError: undefined,
                };
                matStore.put(updatedMat);
              }

              if (item.id !== undefined) {
                qStore.delete(item.id);
              }

              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });

            syncedCount++;
          } else if (item.action === 'DELETE') {
            const res = await fetch(`/api/sync/materials/${item.materialId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${localStorage.getItem('aula_clara_access_token') || ''}` },
            });

            if (!res.ok && res.status !== 404) {
              throw new Error(`Erro ao deletar material no servidor: ${res.status}`);
            }

            // Remove from queue
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
              const qStore = tx.objectStore(STORE_SYNC_QUEUE);
              if (item.id !== undefined) {
                qStore.delete(item.id);
              }
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });

            syncedCount++;
          }
        } catch (err: any) {
          console.warn(`[IndexedDB Sync] Falha ao sincronizar item ${item.materialId}:`, err);
          failedCount++;

          // Update attempt count in queue
          await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
            const qStore = tx.objectStore(STORE_SYNC_QUEUE);
            qStore.put({
              ...item,
              attempts: (item.attempts || 0) + 1,
              status: 'failed',
              lastError: err.message || 'Erro de rede',
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          });
        }
      }

      // Fetch server materials to merge server-side additions if needed
      await this.pullServerMaterials();

      this.lastSyncTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (err: any) {
      console.error('[IndexedDB Sync] Erro geral na sincronização:', err);
      this.lastError = err.message || 'Erro durante a sincronização.';
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }

    return { syncedCount, failedCount };
  }

  /**
   * Pulls any materials stored on the server and merges with local IndexedDB cache
   */
  private async pullServerMaterials(): Promise<void> {
    try {
      const email = localStorage.getItem('aula_clara_user_email') || '';
      const res = await fetch(`/api/sync/materials?email=${encodeURIComponent(email)}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('aula_clara_access_token') || ''}` } });
      if (!res.ok) return;

      const data = await res.json();
      if (!data.materials || !Array.isArray(data.materials)) return;

      const db = await this.getDB();
      const localMaterials = await this.getAllMaterials();
      const localMap = new Map(localMaterials.map((m) => [m.id, m]));

      const tx = db.transaction(STORE_MATERIALS, 'readwrite');
      const store = tx.objectStore(STORE_MATERIALS);

      for (const serverMat of data.materials) {
        const local = localMap.get(serverMat.id);
        // Only insert if not exists or if local is marked as synced (so we don't overwrite pending offline local edits)
        if (!local) {
          store.put({
            ...serverMat,
            synced: true,
            syncStatus: 'synced',
            updatedAt: serverMat.updatedAt || new Date().toISOString(),
          });
        } else if (local.synced && local.syncStatus === 'synced') {
          store.put({
            ...serverMat,
            synced: true,
            syncStatus: 'synced',
          });
        }
      }

      await new Promise<void>((res) => {
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      });

      // Update localStorage mirror
      const updatedAll = await this.getAllMaterials();
      localStorage.setItem('aula-clara-saved', JSON.stringify(updatedAll));
    } catch (e) {
      console.warn('[IndexedDB Sync] Could not pull server materials:', e);
    }
  }

  // ==========================================================================
  // LIVE DRAFT AUTO-SAVE (OFFLINE RESILIENCE DURING TYPING)
  // ==========================================================================

  /**
   * Auto-save working draft during live editing so the teacher never loses work
   */
  public async saveDraft(draft: EditorDraft): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      store.put({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[IndexedDB Draft] Erro ao salvar rascunho:', err);
    }
  }

  /**
   * Get working draft
   */
  public async getDraft(key: string): Promise<EditorDraft | null> {
    try {
      const db = await this.getDB();
      return new Promise<EditorDraft | null>((resolve) => {
        const tx = db.transaction(STORE_DRAFTS, 'readonly');
        const store = tx.objectStore(STORE_DRAFTS);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Clear working draft after saving
   */
  public async clearDraft(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      store.delete(key);
    } catch (err) {
      console.warn('[IndexedDB Draft] Erro ao limpar rascunho:', err);
    }
  }

  /**
   * Import / Seed materials from localStorage on first run
   */
  public async seedFromLocalStorage(): Promise<void> {
    try {
      const existing = await this.getAllMaterials();
      if (existing.length === 0) {
        const raw = localStorage.getItem('aula-clara-saved');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const db = await this.getDB();
            const tx = db.transaction(STORE_MATERIALS, 'readwrite');
            const store = tx.objectStore(STORE_MATERIALS);
            for (const item of parsed) {
              store.put({
                ...item,
                synced: true,
                syncStatus: 'synced',
                updatedAt: item.createdAt || new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[IndexedDB Seed] Erro ao importar do localStorage:', err);
    }
  }
}

// Export singleton instance
export const indexedDBStorage = new IndexedDBManager();
