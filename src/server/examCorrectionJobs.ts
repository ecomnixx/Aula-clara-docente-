import { RelatorioCorrecaoProva, QuestaoCorrigida } from '../types';

export type ExamCorrectionJobStage =
  | 'preparing'
  | 'reading_exam'
  | 'reading_answer_key'
  | 'grading'
  | 'finalizing'
  | 'completed'
  | 'failed';

export type ExamCorrectionJobStatus =
  | 'ocr_pending'
  | 'ocr_processing'
  | 'ocr_complete'
  | 'grading_pending'
  | 'grading_processing'
  | 'grading_retry'
  | 'completed'
  | 'failed';

export interface ExamCorrectionPageState {
  page_kind: 'exam' | 'answer_key';
  page_number: number;
  status: 'pending' | 'reading' | 'ready' | 'failed';
  transcription?: string;
  error_message?: string | null;
}

export function correctionProgress(
  pages: ExamCorrectionPageState[],
  status: string,
): { progress: number; stage: ExamCorrectionJobStage } {
  if (status === 'completed') return { progress: 100, stage: 'completed' };
  if (status === 'failed') return { progress: Math.max(1, readingProgress(pages)), stage: 'failed' };
  const examPages = pages.filter((page) => page.page_kind === 'exam');
  const answerKeyPages = pages.filter((page) => page.page_kind === 'answer_key');
  const readyExam = examPages.filter((page) => page.status === 'ready').length;
  const readyAnswerKey = answerKeyPages.filter((page) => page.status === 'ready').length;

  if (readyExam < examPages.length) {
    const ratio = examPages.length ? readyExam / examPages.length : 1;
    return { progress: Math.round(5 + ratio * 50), stage: 'reading_exam' };
  }
  if (readyAnswerKey < answerKeyPages.length) {
    const ratio = answerKeyPages.length ? readyAnswerKey / answerKeyPages.length : 1;
    return { progress: Math.round(55 + ratio * 15), stage: 'reading_answer_key' };
  }
  if (status === 'grading_processing') return { progress: 82, stage: 'grading' };
  if (status === 'grading_retry' || status === 'grading_pending' || status === 'ocr_complete') {
    return { progress: 75, stage: 'grading' };
  }
  return { progress: 70, stage: 'grading' };
}

export function splitExamIntoGradingBlocks(text: string, maxCharacters = 7_000): string[] {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const questionStarts = [...clean.matchAll(/(?:^|\n)\s*(?=(?:quest(?:ã|a)o|q\.)\s*\d+\b)/g)].map((match) => match.index || 0);
  const units: string[] = [];
  if (questionStarts.length > 1) {
    const header = clean.slice(0, questionStarts[0]).trim();
    for (let index = 0; index < questionStarts.length; index += 1) {
      const start = questionStarts[index];
      const end = questionStarts[index + 1] ?? clean.length;
      const unit = `${index === 0 && header ? `${header}\n\n` : ''}${clean.slice(start, end)}`.trim();
      if (unit) units.push(unit);
    }
  } else {
    units.push(...clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean));
  }

  const blocks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > maxCharacters) {
      blocks.push(current);
      current = '';
    }
    if (unit.length > maxCharacters && !current) {
      for (let offset = 0; offset < unit.length; offset += maxCharacters) {
        blocks.push(unit.slice(offset, offset + maxCharacters));
      }
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

export function isTransientGradingError(error: any): boolean {
  const status = error?.providerStatus || error?.status || error?.code || error?.error?.code;
  const message = String(error?.message || error || '');
  return Boolean(error?.transient) || status === 429 || status === 503 ||
    status === 'RESOURCE_EXHAUSTED' || status === 'UNAVAILABLE' ||
    /timeout|tempo seguro|high demand|alta demanda|overloaded|temporarily unavailable|RESOURCE_EXHAUSTED|UNAVAILABLE|ETIMEDOUT|ECONNRESET/i.test(message);
}

export function consolidateCorrectionBlocks(
  reports: RelatorioCorrecaoProva[],
  targetTotal: number,
  stableId: string,
): RelatorioCorrecaoProva {
  if (!reports.length) throw new Error('Nenhum bloco corrigido foi encontrado.');
  const byQuestion = new Map<number, QuestaoCorrigida>();
  for (const report of reports) {
    for (const question of report.questoes || []) {
      if (!byQuestion.has(question.numero)) byQuestion.set(question.numero, { ...question });
    }
  }
  const questions = [...byQuestion.values()].sort((a, b) => a.numero - b.numero);
  if (!questions.length) throw new Error('A correção não retornou questões válidas.');

  const requestedQuarters = Math.max(1, Math.round((targetTotal || 10) * 4));
  const rawWeights = questions.map((question) => Math.max(1, Math.round((question.valorMaximo || 1) * 4)));
  const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
  const allocated = rawWeights.map((weight) => Math.floor((weight / weightTotal) * requestedQuarters));
  let missing = requestedQuarters - allocated.reduce((sum, value) => sum + value, 0);
  const remainders = rawWeights.map((weight, index) => ({
    index,
    value: (weight / weightTotal) * requestedQuarters - allocated[index],
  })).sort((a, b) => b.value - a.value);
  for (let cursor = 0; missing > 0; cursor = (cursor + 1) % remainders.length, missing -= 1) {
    allocated[remainders[cursor].index] += 1;
  }

  const normalized = questions.map((question, index) => {
    const oldMaximum = Math.max(0.25, Number(question.valorMaximo) || 0.25);
    const newMaximum = Math.max(0.25, allocated[index] / 4);
    const ratio = Math.max(0, Math.min(1, Number(question.notaAtribuida || 0) / oldMaximum));
    const grade = Math.min(newMaximum, Math.round(ratio * newMaximum * 4) / 4);
    return { ...question, valorMaximo: newMaximum, notaAtribuida: grade };
  });

  const first = reports[0];
  return {
    ...first,
    id: stableId,
    questoes: normalized,
    notaFinal: Math.round(normalized.reduce((sum, question) => sum + question.notaAtribuida, 0) * 100) / 100,
    notaMaximaTotal: Math.round(normalized.reduce((sum, question) => sum + question.valorMaximo, 0) * 100) / 100,
    totalQuestoes: normalized.length,
    totalCorretas: normalized.filter((question) => question.notaAtribuida === question.valorMaximo && !question.precisaRevisao).length,
    totalParciais: normalized.filter((question) => question.notaAtribuida > 0 && question.notaAtribuida < question.valorMaximo).length,
    totalIncorretas: normalized.filter((question) => question.notaAtribuida === 0 && !question.precisaRevisao).length,
    totalParaRevisao: normalized.filter((question) => question.precisaRevisao).length,
    observacoesGerais: reports.map((report) => report.observacoesGerais).filter(Boolean).join(' '),
    dataCorrecao: new Date().toISOString(),
  };
}

function readingProgress(pages: ExamCorrectionPageState[]): number {
  if (!pages.length) return 5;
  return Math.round(5 + (pages.filter((page) => page.status === 'ready').length / pages.length) * 65);
}

export function orderedTranscription(
  pages: ExamCorrectionPageState[],
  kind: 'exam' | 'answer_key',
): string {
  return pages
    .filter((page) => page.page_kind === kind && page.status === 'ready')
    .sort((a, b) => a.page_number - b.page_number)
    .map((page) => String(page.transcription || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
