import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  AIProviderFactory,
  BANNED_GENERICS_REGEX,
  MaterialAnalysisResult,
  ValidationResult,
  FinalReviewResult,
  stripTechnicalMarkers,
  isTechnicalMarker,
  cleanOcrText,
  cleanTechnicalMarkersArray,
  generateGeminiWithRetry,
  formatAiError,
  generateMaterialHash,
  deduplicateOcrText,
  materialCacheInstance,
  ProcessedMaterialCache,
} from './src/server/aiProvider';
import { correctExam } from './src/server/examCorrector';
import {
  generateDiagnosticoTurma,
  generatePlanoReensino,
  generateAdaptacaoInclusiva,
  generateParecerDescritivo,
} from './src/server/academicInnovations';
import {
  matchOfficialBnccSkill,
  getCandidateBnccSkills,
  resolveAnoSerieHonesto,
  getBnccKnowledgeArea,
  resolveEffectiveContext,
  getBnccSkills,
  validateBnccCode,
} from './src/server/bnccMatcher';
import { SlideDeck } from './src/types/slides';
import { normalizeLessonDuration, normalizeQuestionScores } from './src/server/pedagogicalValidation';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Middleware to handle body-parser and request entity errors gracefully as JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err) {
    console.error('[SERVER] Erro no parser da requisição:', err);
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({
        error: 'As imagens enviadas são muito grandes. Reduza a quantidade ou envie fotos com menor resolução.',
      });
    }
    return res.status(err.status || 400).json({
      error: err.message || 'Dados da requisição inválidos.',
    });
  }
  next();
});

// Initialize GoogleGenAI lazily (Server-Side only)
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('A chave GEMINI_API_KEY não foi configurada. Verifique as configurações.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check route
app.get('/api/health', (req, res) => {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    status: 'ok',
    engine: 'Gemini Multimodal (Exclusivo)',
    hasGemini,
    time: new Date().toISOString(),
  });
});

// ============================================================================
// REAL-TIME SYNC & MULTI-USER ACCESS MANAGEMENT (SUPABASE + RLS)
// ============================================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fdlpzljfgtpinmfczvjx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_H6bPqgxyGSNAVCi2geFOEQ__0W_NiTH';

function getBearerToken(req: express.Request): string {
  const header = String(req.headers.authorization || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

async function supabaseRequest(pathname: string, token: string, init: RequestInit = {}) {
  if (!token) {
    const err: any = new Error('Sessão inválida ou expirada. Entre novamente.');
    err.status = 401;
    throw err;
  }
  const headers = new Headers(init.headers || {});
  headers.set('apikey', SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${SUPABASE_URL}${pathname}`, { ...init, headers });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const err: any = new Error(data?.message || data?.error_description || data?.error || `Supabase HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function getAuthenticatedUser(token: string) {
  return supabaseRequest('/auth/v1/user', token, { method: 'GET' });
}

const SOURCE_BUCKET = 'material-sources';

function storageObjectPath(storagePath: string) {
  return storagePath.split('/').map(encodeURIComponent).join('/');
}

async function signedSourceUrl(storagePath: string, token: string): Promise<string | undefined> {
  try {
    const result = await supabaseRequest(`/storage/v1/object/sign/${SOURCE_BUCKET}/${storageObjectPath(storagePath)}`, token, {
      method: 'POST', body: JSON.stringify({ expiresIn: 3600 }),
    });
    const signed = result?.signedURL || result?.signedUrl;
    return signed ? `${SUPABASE_URL}/storage/v1${signed}` : undefined;
  } catch {
    return undefined;
  }
}

async function getSourcePages(materialId: string, token: string) {
  const rows = await supabaseRequest(
    `/rest/v1/material_source_pages?material_id=eq.${encodeURIComponent(materialId)}&select=*&order=page_number.asc`, token,
  );
  return Promise.all((rows || []).map(async (page: any) => ({
    ...page,
    preview_url: await signedSourceUrl(page.storage_path, token),
  })));
}

async function updateSourceSummary(materialId: string, token: string) {
  const pages = await supabaseRequest(
    `/rest/v1/material_source_pages?material_id=eq.${encodeURIComponent(materialId)}&select=id,processing_status`, token,
  );
  const statuses = (pages || []).map((page: any) => page.processing_status);
  const processingStatus = statuses.length > 0 && statuses.every((status: string) => status === 'ready')
    ? 'ready'
    : statuses.some((status: string) => status === 'error')
      ? 'partial_error'
      : statuses.some((status: string) => ['reading', 'processing'].includes(status)) ? 'processing' : 'review';
  await supabaseRequest(`/rest/v1/material_sources?id=eq.${encodeURIComponent(materialId)}`, token, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ total_pages: statuses.length, processing_status: processingStatus, updated_at: new Date().toISOString() }),
  });
}

async function requireMaster(token: string) {
  const authUser = await getAuthenticatedUser(token);
  const cleanEmail = String(authUser?.email || '').trim().toLowerCase();
  const grants = await supabaseRequest(
    `/rest/v1/access_grants?email=eq.${encodeURIComponent(cleanEmail)}&select=email,role,status,lifetime,expires_at`,
    token,
    { method: 'GET' },
  );
  const grant = Array.isArray(grants) ? grants[0] : null;
  const isAuthorizedMaster = cleanEmail === 'ecomnixx@gmail.com'
    && grant?.role === 'master'
    && grant?.status === 'active'
    && grant?.lifetime === true;
  if (!isAuthorizedMaster) {
    const err: any = new Error('Apenas a conta Master pode gerenciar acessos.');
    err.status = 403;
    throw err;
  }
  return authUser;
}

function grantToUser(grant: any) {
  const now = Date.now();
  const expiresAt = grant.expires_at ? new Date(grant.expires_at).getTime() : null;
  const daysRemaining = grant.lifetime ? 9999 : expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : 0;
  const normalizedRole = grant.role === 'master' ? 'master' : grant.role === 'gestao' ? 'gestao' : 'professor';
  return {
    id: grant.email,
    name: grant.display_name || grant.email,
    email: grant.email,
    role: normalizedRole,
    roleTitle: normalizedRole === 'gestao' ? 'Coordenação Pedagógica' : normalizedRole === 'master' ? 'Administrador Geral do Sistema' : 'Docente',
    daysRemaining,
    status: grant.status === 'active' && (grant.lifetime || daysRemaining > 0) ? 'Ativo' : 'Bloqueado',
    createdAt: grant.created_at ? new Date(grant.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
    updatedAt: grant.updated_at || grant.created_at || new Date().toISOString(),
    lastActive: grant.last_seen_at || undefined,
    notes: '',
  };
}

app.get('/api/sync/state', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const authUser = await getAuthenticatedUser(token);
    const requestedEmail = String(req.query.email || authUser.email || '').trim().toLowerCase();
    const grants = await supabaseRequest('/rest/v1/access_grants?select=*', token, { method: 'GET' });
    const users = Array.isArray(grants) ? grants.map(grantToUser) : [];
    const currentUser = users.find((u: any) => u.email.toLowerCase() === requestedEmail) || null;
    const announcements = await supabaseRequest('/rest/v1/announcements?select=*&order=created_at.desc', token, { method: 'GET' });
    const materials = await supabaseRequest('/rest/v1/materials?select=id', token, { method: 'GET' });
    res.json({
      success: true,
      serverTime: new Date().toISOString(),
      version: 2,
      isMaster: currentUser?.role === 'master',
      currentUser,
      users,
      materialsCount: Array.isArray(materials) ? materials.length : 0,
      announcements: (announcements || []).map((a: any) => ({
        id: String(a.id), title: a.title, message: a.body, date: new Date(a.created_at).toLocaleDateString('pt-BR'), author: a.created_by_email,
      })),
    });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao sincronizar dados.' });
  }
});

app.post('/api/sync/users', async (req, res) => {
  try {
    const token = getBearerToken(req);
    await requireMaster(token);
    const { name, email, role, daysRemaining, status } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios.' });
    const cleanEmail = String(email).trim().toLowerCase();
    if (cleanEmail === 'ecomnixx@gmail.com' && role !== 'master') return res.status(400).json({ error: 'O perfil Master não pode ser rebaixado.' });
    const lifetime = role === 'master' && cleanEmail === 'ecomnixx@gmail.com';
    const expiresAt = lifetime ? null : new Date(Date.now() + Math.max(0, Number(daysRemaining ?? 30)) * 86400000).toISOString();
    const payload = [{
      email: cleanEmail,
      display_name: String(name).trim(),
      role: lifetime ? 'master' : role === 'gestao' ? 'gestao' : 'client',
      status: status === 'Bloqueado' ? 'blocked' : 'active',
      lifetime,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }];
    await supabaseRequest(`/rest/v1/access_grants?on_conflict=email`, token, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    });
    const grants = await supabaseRequest('/rest/v1/access_grants?select=*', token, { method: 'GET' });
    res.json({ success: true, message: 'Usuário sincronizado com segurança.', users: (grants || []).map(grantToUser), version: 2 });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao sincronizar usuário.' });
  }
});

app.post('/api/sync/users/bulk', async (req, res) => {
  try {
    const token = getBearerToken(req);
    await requireMaster(token);
    const users = Array.isArray(req.body?.users) ? req.body.users : null;
    if (!users) return res.status(400).json({ error: 'Lista de usuários inválida.' });
    for (const u of users) {
      const cleanEmail = String(u.email || '').trim().toLowerCase();
      if (!cleanEmail) continue;
      const lifetime = cleanEmail === 'ecomnixx@gmail.com';
      const expiresAt = lifetime ? null : new Date(Date.now() + Math.max(0, Number(u.daysRemaining ?? 30)) * 86400000).toISOString();
      await supabaseRequest('/rest/v1/access_grants?on_conflict=email', token, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          email: cleanEmail,
          display_name: u.name || cleanEmail,
          role: lifetime ? 'master' : u.role === 'gestao' ? 'gestao' : 'client',
          status: u.status === 'Bloqueado' ? 'blocked' : 'active',
          lifetime,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }]),
      });
    }
    const grants = await supabaseRequest('/rest/v1/access_grants?select=*', token, { method: 'GET' });
    res.json({ success: true, message: 'Lista sincronizada.', users: (grants || []).map(grantToUser), version: 2 });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao sincronizar lista.' });
  }
});

app.delete('/api/sync/users/:id', async (req, res) => {
  try {
    const token = getBearerToken(req);
    await requireMaster(token);
    const email = decodeURIComponent(req.params.id).trim().toLowerCase();
    if (email === 'ecomnixx@gmail.com') return res.status(403).json({ error: 'O usuário Master não pode ser excluído.' });
    console.log('[ACCESS] Exclusão solicitada', { email });
    const deletedRows = await supabaseRequest(`/rest/v1/access_grants?email=eq.${encodeURIComponent(email)}&select=email`, token, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
      console.warn('[ACCESS] Cadastro não encontrado ou bloqueado pela política', { email });
      return res.status(404).json({ error: 'Cadastro não encontrado no servidor. Atualize a lista e tente novamente.' });
    }
    const grants = await supabaseRequest('/rest/v1/access_grants?select=*', token, { method: 'GET' });
    console.log('[ACCESS] Cadastro excluído com sucesso', { email });
    res.json({ success: true, message: 'Usuário removido.', users: (grants || []).map(grantToUser), version: 2 });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao excluir usuário.' });
  }
});

// ============================================================================
// PERSISTENT MATERIAL SOURCES (upload -> review -> per-page OCR -> reusable text)
// ============================================================================
app.get('/api/sources', async (req, res) => {
  try {
    const token = getBearerToken(req);
    await getAuthenticatedUser(token);
    const rows = await supabaseRequest('/rest/v1/material_sources?select=*&order=updated_at.desc', token);
    const sources = await Promise.all((rows || []).map(async (source: any) => ({
      ...source,
      pages: await getSourcePages(source.id, token),
    })));
    res.json({ success: true, sources });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao carregar as fontes.' });
  }
});

app.post('/api/sources', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const user = await getAuthenticatedUser(token);
    const title = String(req.body?.title || '').trim().slice(0, 160);
    if (!title) return res.status(400).json({ error: 'Informe o título do material.' });
    const row = {
      id: randomUUID(), user_id: user.id, title,
      source_type: ['images', 'pdf', 'mixed'].includes(req.body?.sourceType) ? req.body.sourceType : 'images',
      total_pages: 0, processing_status: 'review',
    };
    const result = await supabaseRequest('/rest/v1/material_sources', token, {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([row]),
    });
    res.status(201).json({ success: true, source: { ...(result?.[0] || row), pages: [] } });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao criar a fonte.' });
  }
});

app.post('/api/sources/:id/pages', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const user = await getAuthenticatedUser(token);
    const materialId = req.params.id;
    const base64 = String(req.body?.base64 || '').replace(/^data:[^;]+;base64,/, '');
    const mimeType = String(req.body?.mimeType || 'image/jpeg').toLowerCase();
    if (!base64) return res.status(400).json({ error: 'A página está vazia.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return res.status(415).json({ error: 'Formato de página não suportado.' });
    if (base64.length > 7_000_000) return res.status(413).json({ error: 'A página excede o limite seguro de upload.' });

    const existing = await getSourcePages(materialId, token);
    const pageNumber = existing.length + 1;
    const pageId = randomUUID();
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `users/${user.id}/materials/${materialId}/page-${String(pageNumber).padStart(4, '0')}-${pageId}.${extension}`;
    const bytes = Buffer.from(base64, 'base64');
    await supabaseRequest(`/storage/v1/object/${SOURCE_BUCKET}/${storageObjectPath(storagePath)}`, token, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, 'x-upsert': 'false' },
      body: bytes as any,
    });
    const pageRow = {
      id: pageId, material_id: materialId, user_id: user.id, page_number: pageNumber,
      storage_path: storagePath, original_filename: String(req.body?.filename || `Página ${pageNumber}`).slice(0, 255),
      mime_type: mimeType, file_size: bytes.byteLength, width: Number(req.body?.width) || null,
      height: Number(req.body?.height) || null, processing_status: 'stored',
    };
    try {
      const result = await supabaseRequest('/rest/v1/material_source_pages', token, {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([pageRow]),
      });
      await updateSourceSummary(materialId, token);
      res.status(201).json({ success: true, page: { ...(result?.[0] || pageRow), preview_url: await signedSourceUrl(storagePath, token) } });
    } catch (databaseError) {
      await supabaseRequest(`/storage/v1/object/${SOURCE_BUCKET}/${storageObjectPath(storagePath)}`, token, { method: 'DELETE' }).catch(() => undefined);
      throw databaseError;
    }
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao armazenar a página.' });
  }
});

app.patch('/api/sources/:id/pages/reorder', async (req, res) => {
  try {
    const token = getBearerToken(req); await getAuthenticatedUser(token);
    const pageIds = Array.isArray(req.body?.pageIds) ? req.body.pageIds.map(String) : [];
    for (let index = 0; index < pageIds.length; index += 1) {
      await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${encodeURIComponent(pageIds[index])}&material_id=eq.${encodeURIComponent(req.params.id)}`, token, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ page_number: index + 1 }),
      });
    }
    res.json({ success: true, pages: await getSourcePages(req.params.id, token) });
  } catch (error: any) { res.status(error.status || 500).json({ error: error.message || 'Erro ao reordenar páginas.' }); }
});

app.post('/api/sources/:id/pages/:pageId/process', async (req, res) => {
  const token = getBearerToken(req);
  try {
    await getAuthenticatedUser(token);
    const materialId = req.params.id;
    const rows = await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${encodeURIComponent(req.params.pageId)}&material_id=eq.${encodeURIComponent(materialId)}&select=*`, token);
    const page = rows?.[0];
    if (!page) return res.status(404).json({ error: 'Página não encontrada.' });
    await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${encodeURIComponent(page.id)}`, token, {
      method: 'PATCH', body: JSON.stringify({ processing_status: 'reading', processing_error: null }),
    });
    await updateSourceSummary(materialId, token);

    const imageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${SOURCE_BUCKET}/${storageObjectPath(page.storage_path)}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!imageResponse.ok) throw new Error('Não foi possível recuperar a imagem armazenada.');
    const imageBase64 = Buffer.from(await imageResponse.arrayBuffer()).toString('base64');
    const prompt = `Leia esta página de material pedagógico com máxima fidelidade. Não invente conteúdo. Retorne JSON válido, sem markdown, no formato:
{"text":"transcrição integral preservando títulos, parágrafos, listas, tabelas, perguntas e alternativas","structure":{"title":"título principal ou vazio","sections":[{"title":"","content":""}],"questions":[],"tables":[],"captions":[]}}`;
    const result = await generateGeminiWithRetry(getGenAI(), {
      contents: { parts: [{ inlineData: { data: imageBase64, mimeType: page.mime_type } }, { text: prompt }] },
      config: { temperature: 0.05, responseMimeType: 'application/json' },
    });
    let structured: any;
    try { structured = JSON.parse(String(result.text || '').replace(/^```json\s*|\s*```$/g, '')); }
    catch { structured = { text: cleanOcrText(result.text || ''), structure: {} }; }
    const extractedText = cleanOcrText(structured.text || '');
    if (!extractedText) throw new Error('A IA não encontrou texto legível nesta página.');
    const chunks = extractedText.split(/\n\s*\n/).map((content: string) => content.trim()).filter(Boolean);

    await supabaseRequest(`/rest/v1/material_source_chunks?material_id=eq.${encodeURIComponent(materialId)}&page_id=eq.${encodeURIComponent(page.id)}`, token, { method: 'DELETE' });
    if (chunks.length) await supabaseRequest('/rest/v1/material_source_chunks', token, {
      method: 'POST', body: JSON.stringify(chunks.map((content: string, index: number) => ({
        material_id: materialId, page_id: page.id, user_id: page.user_id, page_number: page.page_number,
        chunk_index: index, section: structured.structure?.sections?.[index]?.title || structured.structure?.title || null,
        title: structured.structure?.title || null, content,
      }))),
    });
    const updated = await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${encodeURIComponent(page.id)}`, token, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ processing_status: 'ready', extracted_text: extractedText, structured_content: structured.structure || {}, processing_error: null, processed_at: new Date().toISOString() }),
    });
    await updateSourceSummary(materialId, token);
    res.json({ success: true, page: { ...(updated?.[0] || page), processing_status: 'ready', extracted_text: extractedText } });
  } catch (error: any) {
    if (req.params.pageId && token) await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${encodeURIComponent(req.params.pageId)}`, token, {
      method: 'PATCH', body: JSON.stringify({ processing_status: 'error', processing_error: formatAiError(error).slice(0, 500) }),
    }).catch(() => undefined);
    if (req.params.id && token) await updateSourceSummary(req.params.id, token).catch(() => undefined);
    res.status(error.status || 500).json({ error: formatAiError(error) || 'Erro ao processar esta página.' });
  }
});

app.delete('/api/sources/:id/pages/:pageId', async (req, res) => {
  try {
    const token = getBearerToken(req); await getAuthenticatedUser(token);
    const rows = await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${encodeURIComponent(req.params.pageId)}&material_id=eq.${encodeURIComponent(req.params.id)}&select=*`, token);
    const page = rows?.[0]; if (!page) return res.status(404).json({ error: 'Página não encontrada.' });
    await supabaseRequest(`/storage/v1/object/${SOURCE_BUCKET}/${storageObjectPath(page.storage_path)}`, token, { method: 'DELETE' });
    await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${encodeURIComponent(page.id)}`, token, { method: 'DELETE' });
    const remaining = await getSourcePages(req.params.id, token);
    for (let index = 0; index < remaining.length; index += 1) await supabaseRequest(`/rest/v1/material_source_pages?id=eq.${remaining[index].id}`, token, {
      method: 'PATCH', body: JSON.stringify({ page_number: index + 1 }),
    });
    await updateSourceSummary(req.params.id, token); res.json({ success: true });
  } catch (error: any) { res.status(error.status || 500).json({ error: error.message || 'Erro ao excluir a página.' }); }
});

app.delete('/api/sources/:id', async (req, res) => {
  try {
    const token = getBearerToken(req); await getAuthenticatedUser(token);
    const pages = await getSourcePages(req.params.id, token);
    for (const page of pages) await supabaseRequest(`/storage/v1/object/${SOURCE_BUCKET}/${storageObjectPath(page.storage_path)}`, token, { method: 'DELETE' });
    await supabaseRequest(`/rest/v1/material_sources?id=eq.${encodeURIComponent(req.params.id)}`, token, { method: 'DELETE' });
    res.json({ success: true });
  } catch (error: any) { res.status(error.status || 500).json({ error: error.message || 'Erro ao excluir a fonte.' }); }
});

app.get('/api/sync/materials', async (req, res) => {
  try {
    const token = getBearerToken(req);
    await getAuthenticatedUser(token);
    const rows = await supabaseRequest('/rest/v1/materials?select=*&order=updated_at.desc', token, { method: 'GET' });
    const materials = (rows || []).map((m: any) => ({
      id: Number(m.id), type: m.type, title: m.title, subject: m.subject, grade: m.grade, className: m.class_name,
      bimester: m.bimester, content: m.content, createdAt: m.created_at, updatedAt: m.updated_at,
      authorEmail: m.owner_email, authorName: m.owner_name, isSharedSchoolWide: m.is_shared_school_wide,
    }));
    res.json({ success: true, materials, total: materials.length });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao buscar materiais.' });
  }
});

app.post('/api/sync/materials', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const authUser = await getAuthenticatedUser(token);
    const m = req.body || {};
    if (!m.title || !m.content) return res.status(400).json({ error: 'Dados do material incompletos.' });
    const row = [{
      id: Number(m.id || Date.now()), owner_id: authUser.id, owner_email: authUser.email,
      owner_name: m.authorName || authUser.user_metadata?.full_name || authUser.email,
      type: m.type || 'aula', title: m.title, subject: m.subject || '', grade: m.grade || '',
      class_name: m.className || '', bimester: Number(m.bimester || 1), content: m.content,
      is_shared_school_wide: Boolean(m.isSharedSchoolWide), created_at: m.createdAt || new Date().toISOString(), updated_at: new Date().toISOString(),
    }];
    await supabaseRequest('/rest/v1/materials?on_conflict=id', token, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row),
    });
    res.json({ success: true, message: 'Material salvo na nuvem.' });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao salvar material.' });
  }
});

app.post('/api/sync/materials/batch', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const authUser = await getAuthenticatedUser(token);
    const materials = Array.isArray(req.body?.materials) ? req.body.materials : null;
    if (!materials) return res.status(400).json({ error: 'Array de materiais inválido.' });
    const rows = materials.filter((m: any) => m?.title && m?.content).map((m: any) => ({
      id: Number(m.id || Date.now()), owner_id: authUser.id, owner_email: authUser.email,
      owner_name: m.authorName || authUser.user_metadata?.full_name || authUser.email,
      type: m.type || 'aula', title: m.title, subject: m.subject || '', grade: m.grade || '', class_name: m.className || '',
      bimester: Number(m.bimester || 1), content: m.content, is_shared_school_wide: Boolean(m.isSharedSchoolWide),
      created_at: m.createdAt || new Date().toISOString(), updated_at: new Date().toISOString(),
    }));
    if (rows.length) await supabaseRequest('/rest/v1/materials?on_conflict=id', token, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows),
    });
    res.json({ success: true, message: `${rows.length} materiais sincronizados.` });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro no envio em lote.' });
  }
});

app.delete('/api/sync/materials/:id', async (req, res) => {
  try {
    const token = getBearerToken(req);
    await getAuthenticatedUser(token);
    await supabaseRequest(`/rest/v1/materials?id=eq.${encodeURIComponent(req.params.id)}`, token, { method: 'DELETE' });
    res.json({ success: true, message: 'Material removido.' });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao remover material.' });
  }
});

app.post('/api/sync/announcements', async (req, res) => {
  try {
    const token = getBearerToken(req);
    const authUser = await requireMaster(token);
    const { title, message } = req.body || {};
    if (!title || !message) return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
    await supabaseRequest('/rest/v1/announcements', token, {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ title, body: message, active: true, created_by_email: authUser.email }]),
    });
    res.json({ success: true, message: 'Aviso transmitido.' });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao criar comunicado.' });
  }
});

// OCR Route: Digitalize and transcribe verbatim text from uploaded images using Gemini
app.post('/api/ocr', async (req, res) => {
  try {
    const { images, source } = req.body || {};

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma imagem foi fornecida para digitalização OCR.',
      });
    }

    if (images.length > 4) {
      return res.status(400).json({
        error: 'Envie no máximo 4 imagens por requisição. Cada fonte é processada separadamente para maior precisão.',
      });
    }

    const parts: any[] = [];
    const allowedMimeTypes = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/gif',
    ]);

    for (const img of images) {
      const base64Data = String(img.base64 || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
      const mimeType = String(img.type || img.mimeType || 'image/jpeg').toLowerCase();
      if (!allowedMimeTypes.has(mimeType)) {
        return res.status(415).json({ error: `Formato de imagem não suportado: ${mimeType}.` });
      }
      if (base64Data.length > 12_000_000) {
        return res.status(413).json({ error: 'Esta fonte ainda está muito grande após a compactação. Reduza a resolução e tente novamente.' });
      }
      if (base64Data) {
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType,
          },
        });
      }
    }

    if (parts.length === 0) {
      return res.status(400).json({ error: 'Nenhuma imagem válida recebida.' });
    }

    const ocrPrompt = `Sua ÚNICA e EXCLUSIVA tarefa é atuar como um Scanner e Leitor OCR de altíssima precisão.
Você deve ler TODAS as imagens/páginas fornecidas e TRANSCREVER LITERALMENTE CADA PALAVRA, FRASE, TÍTULO, SUBTÍTULO, PARÁGRAFO, CAIXA DE TEXTO E QUESTÃO presente nas imagens da apostila/livro/documento.

REGRAS OBRIGATÓRIAS:
1. Digite a ÍNTEGRA LITERAL de todo o texto impresso nas páginas enviadas.
2. É ESTRITAMENTE PROIBIDO resumir, sintetizar, omitir trechos ou usar explicações genéricas como "Conteúdo sobre a disciplina de...".
3. Transcreva absolutamente tudo: títulos, parágrafos, caixas explicativas, questões de provas (com enunciado e alternativas A, B, C, D, E na íntegra), legendas, notas de rodapé e textos em destaque.
4. Se houver mais de uma página/imagem, separe o texto lido com uma linha em branco. É ESTRITAMENTE PROIBIDO incluir marcadores técnicos ou de digitalização como "--- PÁGINA 1 ---", "PÁGINA X ---", "Página 1", "PÁGINA N" ou qualquer carimbo de scanner. Transcreva exclusivamente o texto pedagógico do material didático.
5. Verifique a sequência visual das páginas, repetições, trechos cortados, fim abrupto, tabelas, boxes, legendas e conteúdo ilegível. Não complete nem adivinhe qualquer continuação. Omita somente o trecho ilegível e preserve as partes confiáveis.
6. Se duas imagens repetirem exatamente o mesmo conteúdo, transcreva-o uma única vez. Não misture trechos de páginas diferentes.

Retorne APENAS o texto lido/transcrito na íntegra.`;

    const ai = getGenAI();

    const sourceTitle = typeof source?.title === 'string' ? source.title.slice(0, 180) : 'Imagem sem título';
    const sourcePosition = Number(source?.index) > 0 && Number(source?.total) > 0
      ? `Fonte ${Number(source.index)} de ${Number(source.total)}`
      : 'Fonte única';
    parts.push({ text: `Metadados para rastreabilidade: ${sourcePosition}; arquivo: ${sourceTitle}. Não inclua estes metadados na transcrição.` });
    parts.push({ text: ocrPrompt });

    const result = await generateGeminiWithRetry(
      ai,
      {
        contents: { parts },
        config: {
          temperature: 0.1,
        },
      }
    );
    const rawTranscribedText = result.text || '';
    const transcribedText = deduplicateOcrText(rawTranscribedText);

    res.json({
      text: transcribedText,
      source: {
        id: typeof source?.id === 'string' ? source.id : undefined,
        title: sourceTitle,
        index: Number(source?.index) || 1,
        total: Number(source?.total) || 1,
        characterCount: transcribedText.length,
      },
      model: result.modelUsed,
    });
  } catch (error: any) {
    console.error('[SERVER] Erro no OCR Gemini:', error);
    res.status(500).json({
      error: formatAiError(error) || 'Falha ao digitalizar imagens com o Gemini.',
    });
  }
});

app.post('/api/analyze-school-template', async (req, res) => {
  try {
    const image = req.body?.image;
    const base64 = String(image?.base64 || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
    const mimeType = String(image?.mimeType || 'image/jpeg').toLowerCase();
    if (!base64) return res.status(400).json({ error: 'Envie uma imagem da avaliação antiga.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return res.status(415).json({ error: 'Use uma imagem JPG, PNG ou WebP.' });
    const prompt = `Analise esta avaliação SOMENTE como modelo gráfico institucional. Ignore e descarte integralmente questões, respostas, gabarito, nomes, matrícula, nota, CPF e demais dados pessoais.
Extraia apenas: nome da escola, textos institucionais fixos do cabeçalho, campos editáveis existentes, cores, fonte aproximada, estilo de borda e a caixa ocupada pelo logotipo.
A caixa do logo deve usar coordenadas normalizadas de 0 a 1 relativas à imagem inteira. Se não houver logo, use largura e altura zero.
Não reproduza qualquer conteúdo pedagógico antigo.
Retorne exclusivamente JSON: {"name":"Avaliação padrão","schoolName":"...","headerLines":["..."],"fields":["Estudante","Professor(a)","Turma","Data","Disciplina","Nota","Valor"],"primaryColor":"#173342","accentColor":"#e8a23a","fontFamily":"Arial","borderStyle":"boxed","logoBox":{"x":0.02,"y":0.02,"width":0.18,"height":0.12}}.`;
    const result = await generateGeminiWithRetry(getGenAI(), {
      contents: { parts: [{ inlineData: { data: base64, mimeType } }, { text: prompt }] },
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });
    const parsed = JSON.parse(String(result.text || '{}').replace(/^```json\s*|\s*```$/g, ''));
    const safeText = (value: unknown) => stripTechnicalMarkers(String(value || '')).slice(0, 120);
    res.json({ template: {
      name: safeText(parsed.name) || 'Avaliação padrão', schoolName: safeText(parsed.schoolName) || 'Minha escola',
      headerLines: cleanTechnicalMarkersArray(Array.isArray(parsed.headerLines) ? parsed.headerLines : []).slice(0, 4),
      fields: cleanTechnicalMarkersArray(Array.isArray(parsed.fields) ? parsed.fields : []).slice(0, 10),
      primaryColor: /^#[0-9a-f]{6}$/i.test(parsed.primaryColor) ? parsed.primaryColor : '#173342',
      accentColor: /^#[0-9a-f]{6}$/i.test(parsed.accentColor) ? parsed.accentColor : '#e8a23a',
      fontFamily: ['Arial', 'Calibri', 'Times New Roman', 'Verdana', 'Aptos'].includes(parsed.fontFamily) ? parsed.fontFamily : 'Arial',
      borderStyle: ['none', 'simple', 'boxed'].includes(parsed.borderStyle) ? parsed.borderStyle : 'boxed',
      logoBox: parsed.logoBox,
    } });
  } catch (error: any) {
    res.status(500).json({ error: formatAiError(error) || 'Não foi possível analisar o modelo da escola.' });
  }
});

app.post('/api/generate-slides', async (req, res) => {
  try {
    const {
      disciplina, segmento, ano, materialText, quantidade = 8, estilo = 'automatico',
      proporcao = '16:9', incluirNotas = true, versao = 'professor',
    } = req.body || {};
    if (!disciplina || !segmento || !ano || !String(materialText || '').trim()) {
      return res.status(400).json({ error: 'Disciplina, etapa, ano/série e material lido são obrigatórios.' });
    }

    const cleanMaterial = cleanOcrText(String(materialText)).slice(0, 80_000);
    const requestedCount = Math.max(3, Math.min(20, Number(quantidade) || 8));
    const candidates = getBnccSkills({
      disciplina: String(disciplina), etapa: String(segmento), anoSerie: String(ano),
      objetivo: cleanMaterial.slice(0, 4_000), limite: 10,
    });
    const authorizedSkills = candidates.map((skill) => `${skill.codigo}: ${skill.descricao}`).join('\n');
    const prompt = `Você é o designer pedagógico do Aula Clara. Gere um roteiro de apresentação didática em JSON.
HIERARQUIA ABSOLUTA: disciplina (${disciplina}) → ano/série (${ano}) → BNCC autorizada → objetivos → material como suporte.
O tema do material não pode substituir a disciplina. Resuma e reorganize; não copie parágrafos. Um slide = uma ideia principal, com 3 a 6 tópicos curtos.
Use no máximo ${requestedCount} slides e gere menos se o material confiável for insuficiente. Nunca invente conteúdo para completar quantidade.
Adapte linguagem e design a ${segmento}, ${ano}, disciplina ${disciplina}, estilo ${estilo}. Varie layouts entre cover, cards, columns, timeline, highlight, comparison, visual-list e activity.
Primeiro slide: capa. Segundo: objetivos. Último: resumo. Inclua atividade/reflexão somente quando útil.
Não mostre Fonte 1, Screenshot, arquivos, caminhos, IDs, cabeçalhos, rodapés ou números de página.
Não complete trechos truncados/ilegíveis nem invente fatos. Cada afirmação deve ter evidência no material.
BNCC: escolha SOMENTE entre estas habilidades autorizadas pelo banco interno; se a lista estiver vazia, retorne bncc vazia:
${authorizedSkills || '(nenhuma habilidade aplicável localizada)'}
Versão: ${versao}. ${versao === 'aluno' ? 'Não inclua respostas, gabaritos ou notas.' : 'Inclua notas didáticas e respostas somente quando apropriado.'}
Retorne exclusivamente JSON: {"title":"...","tema":"...","bncc":[{"codigo":"...","descricao":"..."}],"slides":[{"title":"...","bullets":["..."],"layout":"cards","visualHint":"...","speakerNotes":"...","answer":"..."}]}.
MATERIAL CONFIÁVEL:\n${cleanMaterial}`;

    const result = await generateGeminiWithRetry(getGenAI(), {
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    const parsed = JSON.parse(String(result.text || '{}').replace(/^```json\s*|\s*```$/g, ''));
    const authorizedBncc = Array.isArray(parsed.bncc)
      ? parsed.bncc.filter((item: any) => validateBnccCode(item?.codigo, candidates)).map((item: any) => {
          const official = candidates.find((skill) => skill.codigo === item.codigo);
          return { codigo: official!.codigo, descricao: official!.descricao };
        })
      : [];
    const slides = (Array.isArray(parsed.slides) ? parsed.slides : []).slice(0, requestedCount).map((slide: any, index: number) => ({
      id: randomUUID(),
      title: stripTechnicalMarkers(String(slide.title || `Slide ${index + 1}`)),
      bullets: cleanTechnicalMarkersArray(Array.isArray(slide.bullets) ? slide.bullets : []).slice(0, 6),
      layout: ['cover', 'cards', 'columns', 'timeline', 'highlight', 'comparison', 'visual-list', 'activity'].includes(slide.layout) ? slide.layout : 'cards',
      visualHint: stripTechnicalMarkers(String(slide.visualHint || '')),
      speakerNotes: versao === 'professor' && incluirNotas ? stripTechnicalMarkers(String(slide.speakerNotes || '')) : '',
      answer: versao === 'professor' ? stripTechnicalMarkers(String(slide.answer || '')) : '',
    })).filter((slide: any) => slide.title || slide.bullets.length > 0);
    if (slides.length === 0) return res.status(422).json({ error: 'O material não possui conteúdo legível suficiente para criar slides.' });
    const deck: SlideDeck = {
      title: stripTechnicalMarkers(String(parsed.title || `Slides — ${parsed.tema || 'Material didático'} — ${disciplina} — ${ano}`)),
      disciplina: String(disciplina), anoSerie: String(ano), tema: stripTechnicalMarkers(String(parsed.tema || 'Material didático')),
      style: estilo, ratio: proporcao, audience: versao, includeNotes: Boolean(incluirNotas), bncc: authorizedBncc, slides,
    };
    res.json({ deck, model: result.modelUsed, stages: { received: 10, analyzed: 25, structured: 40, bncc: 55, generated: 70, reviewed: 85, ready: 100 } });
  } catch (error: any) {
    res.status(500).json({ error: formatAiError(error) || 'Não foi possível gerar a apresentação.' });
  }
});

app.post('/api/export-slides', async (req, res) => {
  try {
    const deck = req.body?.deck as SlideDeck;
    const format = String(req.body?.format || '').toLowerCase();
    if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) return res.status(400).json({ error: 'Apresentação inválida.' });
    const safeName = String(deck.title || 'Slides Aula Clara').replace(/[^a-z0-9áàâãéêíóôõúç\s-]/gi, '').trim().slice(0, 100) || 'Slides Aula Clara';
    let buffer: Buffer;
    let mime: string;
    const { createEditablePptx, createSlidesDocx, createSlidesPdf } = await import('./src/server/slideExport');
    if (format === 'pptx') { buffer = await createEditablePptx(deck); mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; }
    else if (format === 'docx') { buffer = await createSlidesDocx(deck); mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
    else if (format === 'pdf') { buffer = await createSlidesPdf(deck); mime = 'application/pdf'; }
    else return res.status(400).json({ error: 'Formato não suportado.' });
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Falha ao preparar o arquivo.' });
  }
});

// Trava Final: Enforce strict theme alignment, BNCC official verification & active inclusion
function travaFinalEValidacao(
  data: any,
  analysis: MaterialAnalysisResult,
  validation: ValidationResult,
  params: {
    disciplina: string;
    segmento: string;
    ano: string;
    numAulas: number;
    isEdFisicaPratica: boolean;
    isOnlyProva: boolean;
    dificuldade?: 'Fácil' | 'Médio' | 'Difícil';
    habilidadesFixadas?: string[];
  }
): any {
  const { disciplina, segmento, ano, numAulas, isEdFisicaPratica, isOnlyProva, dificuldade, habilidadesFixadas } = params;
  data = (data && typeof data === 'object') ? data : {};

  // 1. TEMA DEFINITIVO (SANITIZADO E SEM MARCADORES DE DIGITALIZAÇÃO)
  let rawTema = validation.aprovado ? analysis.tema_principal : (validation.tema_corrigido || analysis.tema_principal);
  if (isTechnicalMarker(rawTema)) {
    rawTema = analysis.titulo_exato && !isTechnicalMarker(analysis.titulo_exato)
      ? analysis.titulo_exato
      : (analysis.conteudos_identificados?.[0] || 'Conteúdo do Material Didático');
  }
  const finalTema = stripTechnicalMarkers(
    (rawTema || '')
      .replace(/^[#\s\-_*]+/, '')
      .replace(/^TEMA:\s*/i, '')
  );

  const cleanConteudos = cleanTechnicalMarkersArray(analysis.conteudos_identificados);
  const cleanConceitos = cleanTechnicalMarkersArray(analysis.conceitos_chave);
  const cleanResumo = stripTechnicalMarkers(analysis.resumo || '');
  const cleanTitulo = stripTechnicalMarkers(analysis.titulo_exato || analysis.titulo || finalTema);

  data.tema = finalTema || 'Conteúdo Programático';
  data.tema_principal_material = finalTema;
  data.titulo_identificado = cleanTitulo || finalTema;
  data.conteudos_identificados = cleanConteudos;
  data.conceitos_chave = cleanConceitos;
  data.subtemas = cleanConteudos;
  data.resumo_material = cleanResumo;
  data.conteudo_identificado = cleanResumo || cleanConteudos.join(', ');
  data.dificuldade = data.dificuldade || dificuldade || 'Médio';

  // 2. INCLUSÃO ATIVA & SANITIZAÇÃO DE MARCADORES TÉCNICOS
  const sanitizeText = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    let cleaned = stripTechnicalMarkers(text);
    return cleaned
      .replace(/pode (atuar|ficar|trabalhar) como (árbitro|juiz|mesário|anotador|auxiliar)/gi, 'participa ativamente da atividade com regras e distâncias adaptadas')
      .replace(/pode (marcar|anotar) (os )?pontos/gi, 'executa os movimentos e ações com apoio de colegas')
      .replace(/pode (apenas )?observar (os colegas|a atividade)/gi, 'participa da dinâmica com espaço e ritmo personalizados')
      .replace(/como juiz auxiliar/gi, 'com regras flexibilizadas e apoio entre pares')
      .replace(/materiais esportivos acessíveis com opções de baixo custo/gi, 'Nenhum material obrigatório (uso do próprio corpo) e itens simples para demarcação')
      .replace(/materiais esportivos acessíveis/gi, 'Nenhum material obrigatório (uso do próprio corpo)');
  };

  if (typeof data.adaptacoes === 'string') {
    data.adaptacoes = sanitizeText(data.adaptacoes);
  }
  if (typeof data.avaliacao === 'string') {
    data.avaliacao = sanitizeText(data.avaliacao);
  }
  if (Array.isArray(data.materiais)) {
    data.materiais = cleanTechnicalMarkersArray(data.materiais.map((m: string) => sanitizeText(m)));
  }
  if (Array.isArray(data.objetivos)) {
    data.objetivos = cleanTechnicalMarkersArray(data.objetivos.map((o: string) => sanitizeText(o)));
  }

  // 3. PRESERVAÇÃO DO ESQUEMA JSON (ETAPA 1, 2 E 3)
  const effectiveCtx = resolveEffectiveContext(disciplina, segmento, ano, analysis);
  data.disciplina = effectiveCtx.disciplina;

  data.volume_capitulo = data.volume_capitulo ||
    ((analysis.volume_lido && analysis.volume_lido !== 'não identificado na imagem' ? analysis.volume_lido : '') +
     (analysis.capitulo_lido && analysis.capitulo_lido !== 'não identificado na imagem' ? ' | ' + analysis.capitulo_lido : '')) ||
    'não identificado na imagem';
  data.duracao_min = data.duracao_min || (numAulas || 1) * 50;
  data.conteudo_extraido = cleanConteudos.length > 0 ? cleanConteudos : (Array.isArray(data.conteudo_extraido) ? cleanTechnicalMarkersArray(data.conteudo_extraido) : [cleanResumo]);

  // Se o modelo retornou o array 'desenvolvimento' padrão da Etapa 3
  if (Array.isArray(data.desenvolvimento) && data.desenvolvimento.length > 0) {
    data.desenvolvimento = data.desenvolvimento.map((item: any) => ({
      etapa: stripTechnicalMarkers(item.etapa || ''),
      duracao_min: typeof item.duracao_min === 'number' ? item.duracao_min : 10,
      descricao: sanitizeText(item.descricao || ''),
    }));
    data.desenvolvimento = normalizeLessonDuration(data.desenvolvimento, (numAulas || 1) * 50);

    if (!Array.isArray(data.aulas) || data.aulas.length === 0) {
      const etapas = data.desenvolvimento;
      data.aulas = [
        {
          numero: 1,
          titulo: `Aula 1 — ${finalTema}`,
          objetivo: Array.isArray(data.objetivos) && data.objetivos[0] ? data.objetivos[0] : `Aprender e vivenciar os conteúdos de ${finalTema}`,
          materiais: Array.isArray(data.materiais) ? data.materiais : [],
          aquecimento: etapas[0]?.descricao || '',
          atividade1: etapas[1]?.descricao || '',
          atividade_principal: etapas[2]?.descricao || '',
          desafio: etapas[3]?.descricao || '',
          fechamento: etapas[4]?.descricao || '',
          avaliacao: sanitizeText(data.avaliacao || 'Observação formativa da compreensão e participação ativa.'),
          adaptacoes: sanitizeText(data.adaptacoes || 'Adaptações inclusivas ativas de regras, espaço e apoio mútuo.'),
        }
      ];
    }
  }

  // 4. BNCC OFICIAL (ETAPA 2) — Garantir código oficial compatível rigorosamente na mesma Área de Conhecimento e Etapa
  let officialBncc: {
    codigo: string;
    descricao: string;
    confianca: string;
    habilidades?: Array<{ codigo: string; descricao: string; status?: string }>;
  };
  
  const authorizedCandidates = getBnccSkills({
    disciplina: effectiveCtx.disciplina,
    etapa: effectiveCtx.segmento,
    anoSerie: effectiveCtx.ano,
    objetivo: `${finalTema} ${cleanConteudos.join(' ')}`,
    limite: 20,
  });
  const validatedFixedSkills = Array.isArray(habilidadesFixadas)
    ? habilidadesFixadas.filter((entry) => validateBnccCode(entry.split(/:\s*|\s*-\s*/)[0]?.trim(), authorizedCandidates))
    : [];

  if (validatedFixedSkills.length > 0) {
    const firstFixed = validatedFixedSkills[0];
    const parts = firstFixed.split(/:\s*|\s*-\s*/);
    const code = parts[0]?.trim() || firstFixed;
    const desc = parts.slice(1).join(': ').trim() || firstFixed;
    officialBncc = {
      codigo: code,
      descricao: desc,
      confianca: 'alta (selecionada pelo professor no Passo 1)',
      habilidades: validatedFixedSkills.map((h: string) => {
        const p = h.split(/:\s*|\s*-\s*/);
        return {
          codigo: p[0]?.trim() || h,
          descricao: p.slice(1).join(': ').trim() || h,
          status: 'fixada_pelo_professor',
        };
      }),
    };
  } else {
    const searchTerms = [
      ...(analysis.conteudos_identificados || []),
      ...(analysis.dados_concretos || []),
      ...(analysis.conceitos_chave || []),
    ];

    officialBncc = matchOfficialBnccSkill(
      effectiveCtx.disciplina,
      effectiveCtx.segmento,
      effectiveCtx.ano,
      finalTema,
      searchTerms
    );
  }

  // Resolução 100% honesta do Ano/Série (sem inventar '1º Ano (1ª Série)', preservando a etapa e código BNCC)
  data.ano_serie = resolveAnoSerieHonesto(
    analysis.ano_serie_lido,
    effectiveCtx.segmento,
    officialBncc.codigo,
    effectiveCtx.ano
  );

  data.bncc = {
    codigo: officialBncc.codigo,
    descricao: officialBncc.descricao,
    confianca: officialBncc.confianca,
  };
  data.habilidadesBNCC = officialBncc.habilidades || [officialBncc.codigo];

  // 5. GARANTIR OBJETIVOS E MATERIAIS CONCRETOS
  if (!Array.isArray(data.objetivos) || data.objetivos.length === 0) {
    const defaultObjetivos = cleanConteudos.length > 0
      ? [
          `Experimentar e vivenciar os conteúdos de ${cleanConteudos.slice(0, 2).join(' e ')}.`,
          `Reconhecer e aplicar as noções práticas de ${finalTema} com autonomia.`,
          `Realizar as atividades com segurança, cooperação e respeito aos colegas.`,
        ]
      : [
          `Vivenciar as ações e conteúdos práticos de ${finalTema}.`,
          `Desenvolver a compreensão aplicada do tema ${finalTema}.`,
          `Participar de forma colaborativa e segura.`,
        ];
    data.objetivos = defaultObjetivos;
  }

  if (!Array.isArray(data.materiais) || data.materiais.length === 0) {
    data.materiais = [
      'Nenhum material obrigatório (uso exclusivo do próprio corpo)',
      'Opcional: materiais e recursos disponíveis na escola',
    ];
  }

  // Sanitizar questões se existirem
  if (Array.isArray(data.questoes)) {
    data.questoes = data.questoes.map((q: any, idx: number) => ({
      ...q,
      numero: q.numero || idx + 1,
      tipo: q.tipo || (idx < 5 ? 'multipla_escolha' : 'dissertativa'),
      pontuacao: q.pontuacao || 1.0,
      enunciado: stripTechnicalMarkers(q.enunciado || ''),
      alternativas: Array.isArray(q.alternativas)
        ? q.alternativas.map((alt: string) => stripTechnicalMarkers(alt))
        : q.alternativas,
      resposta_correta: q.resposta_correta || q.respostaGabarito || '',
      justificativa: stripTechnicalMarkers(q.justificativa || q.explicacao || ''),
      expectativa_resposta: stripTechnicalMarkers(q.expectativa_resposta || q.respostaGabarito || ''),
      criterios_correcao: stripTechnicalMarkers(q.criterios_correcao || ''),
    }));
    data.questoes = normalizeQuestionScores(data.questoes, 10);
  }

  // 6. MONTAGEM DO MARKDOWN FORMATADO
  let bnccText = '';
  if (data.bncc?.codigo) {
    if (data.bncc.codigo.includes('não determinada com segurança') || data.bncc.codigo.includes('a confirmar')) {
      bnccText = data.bncc.codigo;
    } else {
      bnccText = `${data.bncc.codigo} — ${data.bncc.descricao || ''}`.trim();
    }
  } else {
    bnccText = 'Habilidade BNCC específica não determinada com segurança para o conteúdo informado.';
  }

  let markdownOutput = '';

  // SE FOR GERAÇÃO DE PROVA
  if (isOnlyProva || data.tipo_material === 'prova' || (Array.isArray(data.questoes) && data.questoes.length > 0)) {
    const questoes = Array.isArray(data.questoes) ? data.questoes : [];
    const dificuldadeTexto = data.dificuldade || params.dificuldade || 'Médio';

    markdownOutput = `AVALIAÇÃO DE ${((data.disciplina || disciplina) as string).toUpperCase()}\n\n` +
      `Escola: ____________________________________________________________________\n` +
      `Professor(a): __________________________________ Data: ____/____/________\n` +
      `Estudante: _____________________________________ Turma: ${data.ano_serie || ano}\n` +
      `Conteúdo/Tema: ${data.tema}\n` +
      `Nível de Dificuldade: ${dificuldadeTexto} | Valor Total: 10,0 pontos\n` +
      `BNCC: ${bnccText}\n\n` +
      `INSTRUÇÕES:\n` +
      `• Leia atentamente cada questão antes de responder.\n` +
      `• As questões de 1 a 5 são de múltipla escolha (apenas uma alternativa correta por questão).\n` +
      `• As questões de 6 a 10 são dissertativas (responda nas linhas indicadas com clareza).\n` +
      `• Cada questão vale 1,0 ponto.\n\n` +
      `================================================================================\n\n` +
      `PARTE 1 — QUESTÕES DE MÚLTIPLA ESCOLHA (1,0 ponto cada)\n\n`;

    const objQuestoes = questoes.filter((q: any) => q.tipo === 'multipla_escolha' || q.numero <= 5);
    objQuestoes.forEach((q: any, idx: number) => {
      const num = q.numero || idx + 1;
      markdownOutput += `${num}. ${q.enunciado} ____________________________________(1,0)\n\n`;
      if (Array.isArray(q.alternativas)) {
        q.alternativas.forEach((alt: string) => {
          markdownOutput += `   ${alt}\n`;
        });
      }
      markdownOutput += `\n`;
    });

    markdownOutput += `PARTE 2 — QUESTÕES DISSERTATIVAS (1,0 ponto cada)\n\n`;

    const disQuestoes = questoes.filter((q: any) => q.tipo === 'dissertativa' || q.numero > 5);
    disQuestoes.forEach((q: any, idx: number) => {
      const num = q.numero || (idx + objQuestoes.length + 1);
      markdownOutput += `${num}. ${q.enunciado} (1,0)\n\n`;
      markdownOutput += `   __________________________________________________________________________________\n`;
      markdownOutput += `   __________________________________________________________________________________\n`;
      markdownOutput += `   __________________________________________________________________________________\n`;
      markdownOutput += `   __________________________________________________________________________________\n`;
      markdownOutput += `   __________________________________________________________________________________\n\n`;
    });

    markdownOutput += `\n================================================================================\n`;
    markdownOutput += `GABARITO E CRITÉRIOS DE CORREÇÃO (USO DO PROFESSOR)\n`;
    markdownOutput += `================================================================================\n\n`;

    markdownOutput += `GABARITO DAS QUESTÕES OBJETIVAS (1 a 5):\n\n`;
    objQuestoes.forEach((q: any, idx: number) => {
      const num = q.numero || idx + 1;
      const corretaLetra = (q.resposta_correta || q.respostaGabarito || 'A').toString().trim().toUpperCase().replace(/[^A-E]/g, '') || 'A';
      
      let textoAlternativa = '';
      if (Array.isArray(q.alternativas)) {
        const found = q.alternativas.find((a: string) => {
          const t = a.trim().toUpperCase();
          return t.startsWith(`${corretaLetra})`) || t.startsWith(`${corretaLetra} -`) || t.startsWith(`${corretaLetra}.`) || t.startsWith(corretaLetra);
        });
        if (found) {
          textoAlternativa = ` — ${found.trim()}`;
        }
      }

      const just = q.justificativa || q.explicacao || '';
      markdownOutput += `• Questão ${num}: Alternativa correta [${corretaLetra}]${textoAlternativa}\n`;
      if (just) {
        const cleanJust = just.replace(/^justificativa\s*:\s*/i, '').trim();
        markdownOutput += `  Justificativa: ${cleanJust}\n`;
      }
      markdownOutput += `\n`;
    });

    markdownOutput += `GABARITO E CRITÉRIOS DE CORREÇÃO DAS QUESTÕES DISSERTATIVAS (6 a 10):\n\n`;
    disQuestoes.forEach((q: any, idx: number) => {
      const num = q.numero || (idx + objQuestoes.length + 1);
      const exp = q.expectativa_resposta || q.respostaGabarito || 'Elementos essenciais compatíveis com o material didático.';
      const cleanExp = exp.replace(/^(resposta esperada|resposta literal esperada|elementos essenciais esperados)\s*:\s*/i, '').trim();
      const crit = q.criterios_correcao ? `\n  Critérios de Correção: ${q.criterios_correcao}` : '';
      markdownOutput += `• Questão ${num} (Dissertativa):\n  Elementos essenciais esperados: ${cleanExp}${crit}\n\n`;
    });
  } else {
    // PLANO DE AULA
    const objetivosList = Array.isArray(data.objetivos) && data.objetivos.length > 0
      ? data.objetivos.map((o: string) => `• ${o.replace(/^[•\-\*]\s*/, '')}`).join('\n')
      : `• Aprender e vivenciar os conteúdos de ${finalTema}`;

    const materiaisList = Array.isArray(data.materiais) && data.materiais.length > 0
      ? data.materiais.map((m: string) => `• ${m.replace(/^[•\-\*]\s*/, '')}`).join('\n')
      : '• Nenhum material obrigatório (uso do próprio corpo)\n• Opcional: recursos escolares disponíveis';

    markdownOutput = `PLANO DE AULA\n\n` +
      `Disciplina: ${data.disciplina || disciplina}\n` +
      `Ano/Série: ${data.ano_serie || ano}\n` +
      `Tema: ${data.tema}\n` +
      `Conteúdo: ${data.conteudos_identificados.join(', ')}\n` +
      `Duração: ${numAulas} aula(s) de 50 min\n` +
      `BNCC: ${bnccText}\n\n` +
      `Objetivos:\n${objetivosList}\n\n` +
      `Materiais:\n${materiaisList}\n\n` +
      `DESENVOLVIMENTO DA AULA\n\n`;

    if (Array.isArray(data.desenvolvimento) && data.desenvolvimento.length > 0) {
      data.desenvolvimento.forEach((item: any, idx: number) => {
        const etName = item.etapa || `Etapa ${idx + 1}`;
        const minText = item.duracao_min ? ` — ${item.duracao_min} min` : '';
        markdownOutput += `${idx + 1}. ${etName}${minText}\n${item.descricao}\n\n`;
      });
      markdownOutput += `Avaliação:\n${data.avaliacao || 'Observação formativa da participação ativa, compreensão prática e atitude colaborativa.'}\n\n`;
      markdownOutput += `Adaptações:\n${data.adaptacoes || 'Adaptações ativas de regras, espaço, materiais e distâncias para garantir a participação plena de todos.'}\n`;
    } else if (Array.isArray(data.aulas) && data.aulas.length > 0) {
      data.aulas.forEach((aula: any, idx: number) => {
        const num = aula.numero || idx + 1;
        const cleanTitle = aula.titulo
          ? aula.titulo.replace(/^Aula \d+\s*[—\-:]\s*/i, '').trim()
          : `${finalTema}`;

        markdownOutput += `Aula ${num} — ${cleanTitle}\n\n`;
        if (aula.objetivo) {
          markdownOutput += `Objetivo: ${aula.objetivo}\n\n`;
        }
        if (aula.aquecimento) markdownOutput += `1. Aquecimento / Ativação Inicial:\n${aula.aquecimento}\n\n`;
        if (aula.atividade1) markdownOutput += `2. Exploração Prática / Apresentação do Conceito:\n${aula.atividade1}\n\n`;
        if (aula.atividade_principal) markdownOutput += `3. Atividade Principal:\n${aula.atividade_principal}\n\n`;
        if (aula.desafio) markdownOutput += `4. Desafio / Variação:\n${aula.desafio}\n\n`;
        if (aula.fechamento) markdownOutput += `5. Volta à Calma / Fechamento:\n${aula.fechamento}\n\n`;
        markdownOutput += `Avaliação:\n${aula.avaliacao || data.avaliacao || 'Observação formativa da participação ativa.'}\n\n`;
        markdownOutput += `Adaptações:\n${aula.adaptacoes || data.adaptacoes || 'Adaptações ativas de regras e apoios mútuos.'}\n\n---\n\n`;
      });
    }
  }

  data.markdownCompleto = cleanOcrText(stripTechnicalMarkers(markdownOutput));
  return data;
}

// Endpoint: Etapa 1 e 2 - Processamento, Estruturação e Cache do Material Didático
app.post('/api/process-material', async (req, res) => {
  try {
    const { texto_ocr, images, disciplina, segmento, ano, forceFresh } = req.body;
    const provider = AIProviderFactory.getProvider();
    const cleanOcr = cleanOcrText(texto_ocr || '');

    console.log('[API /process-material] Processando e estruturando material...');
    const structured = await provider.processAndStructureMaterial({
      images: images || [],
      textoOcr: cleanOcr,
      disciplina: disciplina || 'Educação Física',
      segmento: segmento || 'Ensino Fundamental',
      ano: ano || '6º Ano',
      forceFresh: Boolean(forceFresh),
    });

    const finalConfianca = structured.validacao?.confianca ?? structured.analise?.confianca ?? 85;
    const interpretacaoFormat = {
      titulo_identificado: structured.analise?.titulo_exato || structured.analise?.titulo || structured.titulo_exato,
      titulo_exato: structured.analise?.titulo_exato || structured.titulo_exato,
      componente_curricular_lido: structured.analise?.componente_curricular_lido || 'não identificado na imagem',
      ano_serie_lido: structured.analise?.ano_serie_lido || 'não identificado na imagem',
      volume_lido: structured.analise?.volume_lido || 'não identificado na imagem',
      capitulo_lido: structured.analise?.capitulo_lido || 'não identificado na imagem',
      tema_principal: structured.validacao?.aprovado ? structured.analise?.tema_principal : (structured.validacao?.tema_corrigido || structured.analise?.tema_principal),
      subtemas: structured.subtemas || [],
      dados_concretos: structured.dados_concretos || [],
      perguntas_atividades_texto: structured.perguntas_atividades_texto || [],
      pessoas_eventos_conceitos_importantes: structured.conceitos_principais || [],
      resumo_fiel: structured.analise?.resumo || '',
      confianca_interpretacao: (finalConfianca >= 80 ? 'alta' : (finalConfianca >= 40 ? 'media' : 'baixa')) as 'alta' | 'media' | 'baixa',
      confianca_score: finalConfianca,
    };

    res.json({
      success: true,
      data: structured,
      interpretacao: interpretacaoFormat,
      hash_material: structured.hash_material,
      material_id: structured.material_id,
    });
  } catch (err: any) {
    console.error('[API /process-material] Erro:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha ao processar e estruturar material.' });
  }
});

// Endpoint: Consulta ao Cache de Material
app.get('/api/material-cache/:hash', (req, res) => {
  const { hash } = req.params;
  const cached = materialCacheInstance.get(hash);
  if (!cached) {
    return res.status(404).json({ found: false, message: 'Material não encontrado no cache.' });
  }
  res.json({ found: true, data: cached });
});

// Endpoint: Nova Função - Correção de Prova
app.post('/api/correct-exam', async (req, res) => {
  try {
    const {
      images,
      texto_ocr,
      gabarito_texto,
      gabarito_images,
      disciplina,
      segmento,
      ano,
      valor_total,
    } = req.body;

    console.log('[API /correct-exam] Recebida solicitação de correção de prova...');
    const relatorio = await correctExam({
      images: images || [],
      textoOcr: texto_ocr || '',
      gabaritoTexto: gabarito_texto || '',
      gabaritoImages: gabarito_images || [],
      disciplina: disciplina || undefined,
      segmento: segmento || undefined,
      ano: ano || undefined,
      valorTotalDesejado: typeof valor_total === 'number' ? valor_total : 10.0,
    });

    res.json({
      success: true,
      data: relatorio,
    });
  } catch (err: any) {
    console.error('[API /correct-exam] Erro ao corrigir prova:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha ao corrigir a prova com IA.' });
  }
});

// Endpoint: 1. Mapa de Calor & Diagnóstico da Turma
app.post('/api/diagnostico-turma', async (req, res) => {
  try {
    const { turma, disciplina, ano_serie, bimestre, dados_provas, habilidades } = req.body;
    console.log('[API /diagnostico-turma] Gerando diagnóstico da turma...');
    const result = await generateDiagnosticoTurma({
      turma: turma || 'Turma A',
      disciplina: disciplina || 'Educação Física',
      ano_serie: ano_serie || '6º Ano',
      bimestre: bimestre || '1º Bimestre',
      dadosProvasOuNotas: dados_provas || '',
      habilidadesOuTopicos: habilidades || '',
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[API /diagnostico-turma] Erro:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha ao gerar diagnóstico da turma.' });
  }
});

// Endpoint: 2. Plano de Reensino & Recuperação Paralela
app.post('/api/plano-reensino', async (req, res) => {
  try {
    const { disciplina, ano_serie, defasagens, habilidade_bncc } = req.body;
    console.log('[API /plano-reensino] Gerando plano de reensino...');
    const result = await generatePlanoReensino({
      disciplina: disciplina || 'Educação Física',
      ano_serie: ano_serie || '6º Ano',
      defasagensOuQuestoesErradas: defasagens || '',
      habilidadeBncc: habilidade_bncc || '',
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[API /plano-reensino] Erro:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha ao gerar plano de reensino.' });
  }
});

// Endpoint: 3. Adaptação Curricular Inclusiva / PEI / AEE
app.post('/api/adaptacao-inclusiva', async (req, res) => {
  try {
    const { conteudo, tipo_material, tipo_necessidade, disciplina, ano_serie, perfil_aluno } = req.body;
    console.log('[API /adaptacao-inclusiva] Gerando adaptação inclusiva / PEI...');
    const result = await generateAdaptacaoInclusiva({
      conteudoOriginal: conteudo || '',
      tipoMaterial: tipo_material || 'plano_aula',
      tipoNecessidade: tipo_necessidade || 'TEA (Espectro Autista)',
      disciplina: disciplina || 'Educação Física',
      ano_serie: ano_serie || '6º Ano',
      perfilAlunoObservacoes: perfil_aluno || '',
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[API /adaptacao-inclusiva] Erro:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha ao gerar adaptação inclusiva.' });
  }
});

// Endpoint: 4. Parecer Descritivo do Bimestre
app.post('/api/parecer-descritivo', async (req, res) => {
  try {
    const { nome_aluno, turma, disciplina, bimestre, ano_serie, rendimento, observacoes } = req.body;
    console.log('[API /parecer-descritivo] Gerando parecer descritivo...');
    const result = await generateParecerDescritivo({
      nomeAluno: nome_aluno || 'Estudante',
      turma: turma || 'Turma A',
      disciplina: disciplina || 'Educação Física',
      bimestre: bimestre || '1º Bimestre',
      ano_serie: ano_serie || '6º Ano',
      rendimentoGeral: rendimento || 'Bom',
      pontosObservadosNotas: observacoes || '',
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[API /parecer-descritivo] Erro:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha ao gerar parecer descritivo.' });
  }
});

// Endpoint: Etapa 1 isolada - Interpretação e Validação do Material
app.post('/api/interpret', async (req, res) => {
  try {
    const { texto_ocr, images, disciplina, segmento, ano } = req.body;
    const provider = AIProviderFactory.getProvider();
    const cleanOcr = cleanOcrText(texto_ocr || '');

    console.log('[API /interpret] Executando Análise Multimodal...');
    const analysis = await provider.analyzeMaterial({
      images: images || [],
      textoOcr: cleanOcr,
      disciplina: disciplina || 'Educação Física',
      segmento: segmento || 'Ensino Fundamental',
      ano: ano || '6º Ano',
    });

    console.log('[API /interpret] Executando Validação por IA...');
    const validation = await provider.validateAnalysis({
      images: images || [],
      textoOcr: cleanOcr,
      analysis,
      disciplina: disciplina || 'Educação Física',
      segmento: segmento || 'Ensino Fundamental',
      ano: ano || '6º Ano',
    });

    res.json({
      success: true,
      data: {
        titulo_identificado: analysis.titulo_exato || analysis.titulo,
        titulo_exato: analysis.titulo_exato || analysis.titulo,
        componente_curricular_lido: analysis.componente_curricular_lido || 'não identificado na imagem',
        ano_serie_lido: analysis.ano_serie_lido || 'não identificado na imagem',
        volume_lido: analysis.volume_lido || 'não identificado na imagem',
        capitulo_lido: analysis.capitulo_lido || 'não identificado na imagem',
        tema_principal: validation.aprovado ? analysis.tema_principal : validation.tema_corrigido,
        subtemas: analysis.conteudos_identificados,
        dados_concretos: analysis.dados_concretos || [],
        perguntas_atividades_texto: analysis.perguntas_atividades_texto || [],
        pessoas_eventos_conceitos_importantes: analysis.conceitos_chave,
        resumo_fiel: analysis.resumo,
        confianca_interpretacao: validation.confianca >= 80 ? 'alta' : (validation.confianca >= 40 ? 'media' : 'baixa'),
        confianca_score: validation.confianca,
      },
      analysis,
      validation,
    });
  } catch (err: any) {
    console.error('[API /interpret] Erro:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha ao interpretar o material.' });
  }
});

// Endpoint: Validação por IA isolada
app.post('/api/validate', async (req, res) => {
  try {
    const { texto_ocr, images, analysis, disciplina, segmento, ano } = req.body;
    const provider = AIProviderFactory.getProvider();
    const cleanOcr = cleanOcrText(texto_ocr || '');

    const validation = await provider.validateAnalysis({
      images: images || [],
      textoOcr: cleanOcr,
      analysis,
      disciplina: disciplina || 'Educação Física',
      segmento: segmento || 'Ensino Fundamental',
      ano: ano || '6º Ano',
    });

    res.json({ success: true, validation });
  } catch (err: any) {
    console.error('[API /validate] Erro:', err);
    res.status(500).json({ error: formatAiError(err) || 'Falha na validação do tema.' });
  }
});

// Endpoint principal: Pipeline Completo de IA (com reaproveitamento de cache)
app.post('/api/generate', async (req, res) => {
  try {
    const {
      disciplina,
      segmento,
      ano,
      tipo,
      texto_ocr,
      images,
      tipoAulaEdFisica,
      quantidadeAulas,
      dificuldade,
      dificuldadeProva,
      hash_material,
      modoOrigem,
      planoOrigem,
      habilidadesFixadas,
    } = req.body;

    const cleanOcr = cleanOcrText(texto_ocr || '');
    const nivelDificuldade = (dificuldade || dificuldadeProva || 'Médio') as 'Fácil' | 'Médio' | 'Difícil';
    const numAulas = Math.max(1, Math.min(50, Number(quantidadeAulas) || 1));

    if (!disciplina || !tipo) {
      return res.status(400).json({
        error: 'É necessário fornecer Disciplina e Tipo de material.',
      });
    }

    const isOnlyProva = tipo === 'Gerar Prova' || tipo === 'Prova' || tipo === 'prova';
    const isEdFisicaPratica =
      disciplina === 'Educação Física' &&
      (tipoAulaEdFisica === 'Prática' || tipo === 'Atividade Prática' || !tipoAulaEdFisica);

    const provider = AIProviderFactory.getProvider();

    // ==============================================================
    // 1. OBTENÇÃO DO MATERIAL ESTRUTURADO (CACHE OU EXTRAÇÃO ÚNICA)
    // ==============================================================
    let structured: ProcessedMaterialCache;
    const computedHash = hash_material || generateMaterialHash(cleanOcr, images, disciplina, segmento, ano);

    const cached = materialCacheInstance.get(computedHash);
    if (cached) {
      console.log(`[PIPELINE] Usando material estruturado do CACHE (Hash: ${computedHash})`);
      structured = cached;
    } else {
      console.log(`[PIPELINE] Executando leitura e estruturação única do material (Hash: ${computedHash})...`);
      structured = await provider.processAndStructureMaterial({
        images: images || [],
        textoOcr: cleanOcr,
        disciplina,
        segmento,
        ano,
      });
    }

    const analysis = structured.analise;
    const validation = structured.validacao;

    // Se a confiança for criticamente baixa e não houver conteúdo
    const finalConfianca = validation.confianca;
    const isUncertain = finalConfianca < 35 || analysis.tema_principal.includes('não identificado com segurança');

    if (isUncertain && (!images || images.length === 0) && (!cleanOcr || cleanOcr.trim().length < 15)) {
      return res.status(200).json({
        success: true,
        uncertain: true,
        message: 'Não consegui identificar este conteúdo com segurança. Tente fotografar novamente a página com boa iluminação e foco.',
        analise: analysis,
        validacao: validation,
        data: {
          tema: 'Conteúdo não identificado com segurança',
          conteudos_identificados: [],
          markdownCompleto: '# Aviso\n\nNão foi possível identificar o conteúdo desta página com segurança. Por favor, envie uma foto mais nítida ou digite o texto da apostila.',
        },
        content: '# Aviso\n\nNão foi possível identificar o conteúdo desta página com segurança. Por favor, envie uma foto mais nítida ou digite o texto da apostila.',
      });
    }

    // ==============================================================
    // 2. GERAÇÃO DO PLANO PEDAGÓGICO OU PROVA
    // ==============================================================
    console.log(`[PIPELINE] Gerando ${isOnlyProva ? 'Avaliação' : 'Plano de Aula'} a partir do material estruturado...`);
    const effectiveCtx = resolveEffectiveContext(disciplina, segmento, ano, analysis);
    let candidatosBncc = getCandidateBnccSkills(
      effectiveCtx.disciplina,
      effectiveCtx.segmento,
      effectiveCtx.ano,
      8
    );

    // If teacher pinned specific BNCC skills, prepend them with high priority
    if (Array.isArray(habilidadesFixadas) && habilidadesFixadas.length > 0) {
      const fixedHeader = `HABILIDADES BNCC FIXADAS PELO PROFESSOR NO PASSO 1 (PRIORIDADE MÁXIMA):\n` +
        habilidadesFixadas.map((h: string) => `- ${h}`).join('\n') + '\n\nOutras habilidades da disciplina:\n';
      candidatosBncc = fixedHeader + candidatosBncc;
    }

    const duracaoTotalMinutos = (numAulas || 1) * 50;

    const { parsed, rawText } = await provider.generateLesson(
      {
        disciplina: effectiveCtx.disciplina,
        segmento: effectiveCtx.segmento,
        ano: effectiveCtx.ano,
        tipo,
        numAulas,
        isEdFisicaPratica,
        isOnlyProva,
        dificuldade: nivelDificuldade,
        duracaoMinutos: duracaoTotalMinutos,
        candidatosBncc,
        textoOcr: cleanOcr || structured.conteudo_didatico_limpo,
        modoOrigem: modoOrigem || 'material',
        planoOrigem: planoOrigem || undefined,
        resumoPedagogico: structured.resumo_pedagogico,
        conteudoDidaticoLimpo: structured.conteudo_didatico_limpo,
      },
      analysis,
      validation
    );

    // ==============================================================
    // 3. TRAVA FINAL, BNCC OFICIAL E REVISÃO DE QUALIDADE
    // ==============================================================
    console.log('[PIPELINE] Aplicando Trava Final e Verificação BNCC...');
    const finalData = travaFinalEValidacao(parsed, analysis, validation, {
      disciplina,
      segmento,
      ano,
      numAulas,
      isEdFisicaPratica,
      isOnlyProva,
      dificuldade: nivelDificuldade,
      habilidadesFixadas: Array.isArray(habilidadesFixadas) ? habilidadesFixadas : undefined,
    });

    const finalReview = await provider.reviewLesson(finalData, analysis, {
      disciplina,
      segmento,
      ano,
      tipo,
      numAulas,
      isEdFisicaPratica,
      isOnlyProva,
    });

    finalData.analise = analysis;
    finalData.validacao = validation;
    finalData.validacaoFinal = finalReview;

    const interpretacaoFormat = {
      titulo_identificado: analysis.titulo_exato || analysis.titulo,
      titulo_exato: analysis.titulo_exato || analysis.titulo,
      componente_curricular_lido: analysis.componente_curricular_lido || 'não identificado na imagem',
      ano_serie_lido: analysis.ano_serie_lido || 'não identificado na imagem',
      volume_lido: analysis.volume_lido || 'não identificado na imagem',
      capitulo_lido: analysis.capitulo_lido || 'não identificado na imagem',
      tema_principal: validation.aprovado ? analysis.tema_principal : (validation.tema_corrigido || analysis.tema_principal),
      subtemas: analysis.conteudos_identificados,
      dados_concretos: analysis.dados_concretos || [],
      perguntas_atividades_texto: analysis.perguntas_atividades_texto || [],
      pessoas_eventos_conceitos_importantes: analysis.conceitos_chave,
      resumo_fiel: analysis.resumo,
      confianca_interpretacao: (finalConfianca >= 80 ? 'alta' : (finalConfianca >= 40 ? 'media' : 'baixa')) as 'alta' | 'media' | 'baixa',
      confianca_score: finalConfianca,
    };

    res.json({
      success: true,
      data: finalData,
      content: finalData.markdownCompleto,
      rawText,
      interpretacao: interpretacaoFormat,
      analise: analysis,
      validacao: validation,
      validacaoFinal: finalReview,
      hash_material: structured.hash_material,
      material_id: structured.material_id,
    });
  } catch (error: any) {
    console.error('[SERVER] Erro no pipeline de IA:', error);
    res.status(500).json({
      error: formatAiError(error) || 'Falha ao processar solicitação no pipeline pedagógico.',
    });
  }
});

// Endpoint: Gerador de Parecer Pedagógico Descritivo do Aluno
app.post('/api/generate-report', async (req, res) => {
  try {
    const {
      nomeAluno,
      turma,
      disciplina,
      periodo,
      nivelDesempenho,
      aspectosComportamentais,
      observacaoProf,
    } = req.body;

    if (!nomeAluno || !disciplina) {
      return res.status(400).json({
        error: 'Por favor, informe ao menos o Nome do Aluno e a Disciplina.',
      });
    }

    let rawText = '';
    const ai = getGenAI();

    const reportPrompt = `
Você é uma inteligência especialista em Pedagogia, Psicopedagogia e Avaliação Qualitativa alinhada à BNCC (Base Nacional Comum Curricular).
Sua tarefa é redigir um **PARECER PEDAGÓGICO DESCRITIVO INDIVIDUAL** acolhedor, profissional e construtivo para ser entregue à coordenação escolar ou aos pais e responsáveis no boletim/ficha de avaliação.

DADOS DO ALUNO:
- Nome do Aluno: ${nomeAluno}
- Turma/Ano: ${turma || 'Ensino Fundamental'}
- Componente Curricular: ${disciplina}
- Período Avaliado: ${periodo || '1º Bimestre'}
- Nível de Desempenho Acadêmico: ${nivelDesempenho || 'Atingiu os Objetivos'}
- Aspectos Comportamentais e Socioemocionais observados pelo professor: ${
      Array.isArray(aspectosComportamentais) && aspectosComportamentais.length > 0
        ? aspectosComportamentais.join(', ')
        : 'Participação regular nas atividades'
    }
${observacaoProf ? `- Observações específicas do professor: ${observacaoProf}` : ''}

ESTRUTURA OBRIGATÓRIA DO PARECER (Dividido em 3 parágrafos fluídos e bem pontuados):

1. **Parágrafo 1 – Desempenho Cognitivo e Acadêmico na Disciplina**: Descreva o progresso do estudante na aprendizagem dos conceitos de ${disciplina}, destacando conquistas e habilidades BNCC desenvolvidas.
2. **Parágrafo 2 – Aspectos Socioemocionais, Atitude e Convivência em Sala**: Aborde a postura do estudante em sala de aula, relacionamento com colegas, nível de foco, colaboração, engajamento e participação nas atividades.
3. **Parágrafo 3 – Recomendações Pedagógicas e Próximos Passos**: Finalize com incentivo construtivo, direcionando ações para a família e coordenação ajudarem o estudante a continuar evoluindo no próximo período.

Tom de voz: Respeitoso, construtivo, encorajador, ético e focado no potencial de desenvolvimento do aluno. Sem rótulos pejorativos. Use linguagem formal e pedagógica impecável.

Retorne APENAS um JSON no formato:
{
  "titulo": "Parecer Pedagógico Descritivo Individual - ${nomeAluno}",
  "relatorioMarkdown": "[Texto em Markdown formatado com os 3 parágrafos bem estruturados]",
  "pontosFortes": ["Ponto 1", "Ponto 2", "Ponto 3"],
  "pontosAtencao": ["Orientação 1", "Orientação 2"]
}
`;

    try {
      const result = await generateGeminiWithRetry(ai, {
        contents: [
          {
            role: 'user',
            parts: [{ text: reportPrompt }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });
      rawText = result.text || '';
    } catch (err: any) {
      console.warn('[SERVER] Erro na geração de parecer com Gemini:', err?.message);
    }

    let parsedResult: any;
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsedResult = JSON.parse(cleaned);
    } catch {
      parsedResult = {
        titulo: `Parecer Pedagógico - ${nomeAluno}`,
        relatorioMarkdown: rawText,
        pontosFortes: [],
        pontosAtencao: [],
      };
    }

    res.json({
      success: true,
      data: parsedResult,
      content: parsedResult.relatorioMarkdown || rawText,
    });
  } catch (error: any) {
    console.error('[SERVER] Erro ao gerar parecer pedagógico:', error);
    res.status(500).json({
      error: formatAiError(error) || 'Falha ao processar o parecer pedagógico.',
    });
  }
});

// Endpoint: Assistente Pedagógico Multi-turn Chatbot com Gemini
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, systemInstruction, rolePreset, modelPreference } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Nenhuma mensagem enviada para o chat.' });
    }

    const ai = getGenAI();

    // Select models based on preference or task
    let candidateModels: string[] = ['gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    if (modelPreference === 'fast') {
      candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-flash-latest'];
    } else if (modelPreference === 'pro') {
      candidateModels = ['gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];
    } else {
      candidateModels = ['gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    }

    // Role-specific default system instruction
    const defaultInstruction = `Você é o Assistente Pedagógico Inteligente do Aula Clara, um consultor docente de excelência especializado na Educação Básica brasileira (Educação Infantil, Ensino Fundamental Anos Iniciais e Finais, Ensino Médio, EJA e Educação Especial/AEE).

Suas diretrizes fundamentais:
1. **Alinhamento Rigoroso à BNCC**: Conheça códigos de habilidades (ex: EF06EF01, EM13LGG101, etc.), competências gerais, unidades temáticas e objetos de conhecimento.
2. **Pragmatismo Docente**: Forneça respostas práticas, estruturadas, sem floreios desnecessários, com passos executáveis para a sala de aula real.
3. **Inclusão & AEE**: Ao ser consultado sobre alunos neurodivergentes (TEA, TDAH, dislexia, deficiência visual/auditiva/motora), proponha estratégias baseadas no Desenho Universal para a Aprendizagem (DUA) e adaptações curriculares acessíveis.
4. **Metodologias Ativas**: Sugira sala de aula invertida, gamificação, aprendizagem baseada em problemas (PBL), rotação por estações e dinâmicas colaborativas.
5. **Avaliação Formativa**: Ajude a formular rubricas, critérios de correção claros, questões contextualizadas e feedbacks construtivos.
6. **Formatação Impecável**: Use Markdown bem organizado com tópicos em negrito, listas e exemplos claros.`;

    const effectiveInstruction = systemInstruction || defaultInstruction;

    // Convert messages into Gemini contents format
    const formattedContents = messages.map((m: any) => {
      const role = m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
      const parts: any[] = [];

      // Add attached images if present in message
      if (Array.isArray(m.images) && m.images.length > 0) {
        m.images.forEach((img: any) => {
          if (img.base64) {
            parts.push({
              inlineData: {
                data: img.base64.replace(/^data:image\/[a-z]+;base64,/, ''),
                mimeType: img.mimeType || 'image/jpeg',
              },
            });
          }
        });
      }

      if (m.content && typeof m.content === 'string') {
        parts.push({ text: m.content });
      }

      return {
        role,
        parts: parts.length > 0 ? parts : [{ text: ' ' }],
      };
    });

    const result = await generateGeminiWithRetry(
      ai,
      {
        contents: formattedContents,
        config: {
          systemInstruction: effectiveInstruction,
          temperature: 0.7,
        },
      },
      {
        models: candidateModels,
      }
    );

    res.json({
      success: true,
      message: result.text || 'Não foi possível gerar uma resposta no momento.',
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('[API /chat] Erro ao processar mensagem do chatbot:', error);
    res.status(500).json({
      error: formatAiError(error) || 'Falha ao processar mensagem com a IA.',
    });
  }
});

// Endpoint: Análise Avançada de Imagens e Documentos com Gemini
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { image, prompt, taskType } = req.body;

    if (!image || !image.base64) {
      return res.status(400).json({ error: 'Nenhuma imagem foi fornecida para análise.' });
    }

    const ai = getGenAI();
    const cleanBase64 = image.base64.replace(/^data:image\/[a-z]+;base64,/, '');
    const mimeType = image.mimeType || 'image/jpeg';

    const defaultPrompt = prompt || `Analise detalhadamente esta imagem/página de material didático:
1. **Identificação do Material**: Título, componente curricular, ano/série e tema principal.
2. **Transcrição e Conteúdos Didáticos**: Resumo dos conceitos fundamentais apresentados.
3. **Análise Pedagógica**: Avalie a clareza, alinhamento curricular (BNCC) e adequação para a faixa etária.
4. **Sugestões para a Aula**: 2 ideias práticas de como o professor pode trabalhar este conteúdo em sala (ex: dinâmica, pergunta norteadora ou atividade prática).`;

    const parts: any[] = [
      {
        inlineData: {
          data: cleanBase64,
          mimeType,
        },
      },
      {
        text: defaultPrompt,
      },
    ];

    const result = await generateGeminiWithRetry(
      ai,
      {
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        config: {
          systemInstruction: 'Você é um especialista em análise pedagógica multimodal e leitura de materiais didáticos da BNCC.',
          temperature: 0.4,
        },
      },
      {
        models: ['gemini-3.7-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'],
      }
    );

    res.json({
      success: true,
      analysis: result.text || 'Análise concluída sem retorno de texto.',
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('[API /analyze-image] Erro ao analisar imagem:', error);
    res.status(500).json({
      error: formatAiError(error) || 'Falha ao analisar a imagem com IA.',
    });
  }
});

// Download routes for Android APK & Mobile Installation
app.get('/api/version', (req, res) => {
  res.json({
    version: '3.1.9',
    name: 'Aula Clara',
    platform: 'Android & iOS (PWA/APK)',
    apkUrl: '/aula-clara-android.apk',
    sha256: '3120BC7FDE918C27D7CAC3BB28AF7204F3804B5B2FFE83971C55590215417A39',
    updatedAt: new Date().toISOString(),
    status: 'updated',
  });
});

app.get(['/baixar.html', '/baixar', '/download'], (req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'baixar.html');
  res.sendFile(filePath);
});

app.get(['/aula-clara-android.apk', '/api/download/apk', '/app.apk'], (req, res) => {
  const apkPath = path.join(process.cwd(), 'public', 'aula-clara-android.apk');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Aula-Clara-3.1.9.apk"');
  res.sendFile(apkPath);
});

// Local development/standalone production bootstrap.
// On Vercel the Express app is exported as a serverless function and MUST NOT listen.
export { app };
export default app;

async function startServer() {
  if (process.env.VERCEL) return;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aula Clara Server rodando em http://localhost:${PORT}`);
  });
}

startServer();
