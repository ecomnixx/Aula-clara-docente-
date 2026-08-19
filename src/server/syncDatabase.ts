import fs from 'fs';
import path from 'path';

export interface UserAccessRecord {
  id: string;
  name: string;
  email: string;
  role: 'professor' | 'gestao' | 'master';
  roleTitle?: string;
  daysRemaining: number;
  status: 'Ativo' | 'Bloqueado';
  createdAt: string;
  updatedAt: string;
  lastActive?: string;
  notes?: string;
}

export interface SharedMaterialRecord {
  id: number;
  type: 'aula' | 'prova' | 'correcao_prova' | 'plano_reensino' | 'adaptacao_inclusiva' | 'parecer_descritivo';
  title: string;
  subject: string;
  grade: string;
  className: string;
  bimester: number;
  content: string;
  createdAt: string;
  authorEmail: string;
  authorName: string;
  isSharedSchoolWide?: boolean;
}

export interface SyncDatabaseState {
  version: number;
  lastUpdated: string;
  users: UserAccessRecord[];
  materials: SharedMaterialRecord[];
  announcements: Array<{
    id: string;
    title: string;
    message: string;
    date: string;
    author: string;
  }>;
}

const DB_FILE_PATH = path.join(process.cwd(), 'data', 'sync_db.json');

// Default initial state with ecomnixx@gmail.com as Master
const DEFAULT_STATE: SyncDatabaseState = {
  version: 1,
  lastUpdated: new Date().toISOString(),
  users: [
    {
      id: 'master-1',
      name: 'Administrador Master',
      email: 'ecomnixx@gmail.com',
      role: 'master',
      roleTitle: 'Administrador Geral do Sistema',
      daysRemaining: 9999,
      status: 'Ativo',
      createdAt: '19/08/2026',
      updatedAt: new Date().toISOString(),
      notes: 'Superusuário com controle total de professores e gestão',
    },
    {
      id: 'user-1',
      name: 'Prof. Lucas Ribeiro',
      email: 'lucas.ribeiro@escola.com',
      role: 'professor',
      roleTitle: 'Docente Língua Portuguesa',
      daysRemaining: 30,
      status: 'Ativo',
      createdAt: '10/08/2026',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'user-2',
      name: 'Profª. Carla Menezes',
      email: 'carla.menezes@escola.com',
      role: 'professor',
      roleTitle: 'Docente Matemática',
      daysRemaining: 25,
      status: 'Ativo',
      createdAt: '02/08/2026',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'user-3',
      name: 'Coord. Helena Souza',
      email: 'helena.coordenacao@escola.com',
      role: 'gestao',
      roleTitle: 'Coordenação Pedagógica',
      daysRemaining: 30,
      status: 'Ativo',
      createdAt: '15/08/2026',
      updatedAt: new Date().toISOString(),
    },
  ],
  materials: [],
  announcements: [
    {
      id: 'ann-1',
      title: 'Boas-vindas à Plataforma Aula Clara!',
      message: 'Sistema conectado e sincronizado em tempo real para todos os professores e coordenação.',
      date: new Date().toLocaleDateString('pt-BR'),
      author: 'Administrador Master',
    },
  ],
};

// Ensure database directory and file exist
function initDb(): SyncDatabaseState {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE_PATH)) {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(DEFAULT_STATE, null, 2), 'utf-8');
      return DEFAULT_STATE;
    }

    const content = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(content);

    // Guarantee ecomnixx@gmail.com is always present as Master
    const hasMaster = parsed.users && parsed.users.some((u: UserAccessRecord) => u.email.toLowerCase() === 'ecomnixx@gmail.com');
    if (!hasMaster) {
      parsed.users = [DEFAULT_STATE.users[0], ...(parsed.users || [])];
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
    }

    return parsed;
  } catch (error) {
    console.error('[SYNC_DB] Erro ao inicializar banco de dados:', error);
    return DEFAULT_STATE;
  }
}

// Read database
export function getSyncDatabase(): SyncDatabaseState {
  return initDb();
}

// Write database
export function saveSyncDatabase(state: SyncDatabaseState): void {
  try {
    state.lastUpdated = new Date().toISOString();
    state.version = (state.version || 0) + 1;
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('[SYNC_DB] Erro ao salvar banco de dados:', error);
  }
}

// Master email checker
export function isMasterEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean === 'ecomnixx@gmail.com' || clean.startsWith('ecomnixx') || clean === 'familiacardoso21@gmail.com';
}
