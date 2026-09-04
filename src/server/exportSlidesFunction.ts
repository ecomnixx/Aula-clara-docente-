import { createEditablePptx, createSlidesDocx, createSlidesPdf } from './slideExport';
import { SlideDeck } from '../types/slides';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fdlpzljfgtpinmfczvjx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_H6bPqgxyGSNAVCi2geFOEQ__0W_NiTH';

async function hasValidSession(req: any): Promise<boolean> {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.toLowerCase().startsWith('bearer ')) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization },
  });
  return response.ok;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    if (!(await hasValidSession(req))) {
      return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente para continuar.' });
    }
    const deck = req.body?.deck as SlideDeck;
    const format = String(req.body?.format || '').toLowerCase();
    if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) return res.status(400).json({ error: 'Apresentação inválida.' });
    const safeName = String(deck.title || 'Slides Aula Clara').replace(/[^a-z0-9áàâãéêíóôõúç\s-]/gi, '').trim().slice(0, 100) || 'Slides Aula Clara';
    let buffer: Buffer;
    let mime: string;
    if (format === 'pptx') { buffer = await createEditablePptx(deck); mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; }
    else if (format === 'docx') { buffer = await createSlidesDocx(deck); mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
    else if (format === 'pdf') { buffer = await createSlidesPdf(deck); mime = 'application/pdf'; }
    else return res.status(400).json({ error: 'Formato não suportado.' });
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
    return res.status(200).send(buffer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Falha ao preparar o arquivo.' });
  }
}
