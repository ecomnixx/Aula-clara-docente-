import { BnccSkill } from '../types';
import { validateBnccCode } from './bnccMatcher';

export function normalizeQuestionScores<T extends { pontuacao?: number }>(questions: T[], target = 10): T[] {
  if (!questions.length) return questions;
  const quarterTarget = Math.round(target * 4);
  const base = Math.floor(quarterTarget / questions.length);
  let remainder = quarterTarget - base * questions.length;
  return questions.map((question) => {
    const units = base + (remainder-- > 0 ? 1 : 0);
    return { ...question, pontuacao: units / 4 };
  });
}

export function normalizeLessonDuration<T extends { duracao_min?: number }>(steps: T[], target: number): T[] {
  if (!steps.length) return steps;
  const normalized = steps.map((step) => ({ ...step, duracao_min: Math.max(1, Math.round(Number(step.duracao_min) || 1)) }));
  const last = normalized.length - 1;
  const beforeLast = normalized.reduce((sum, step, index) => index === last ? sum : sum + Number(step.duracao_min), 0);
  normalized[last].duracao_min = Math.max(1, target - beforeLast);
  return normalized;
}

export function containsTechnicalSourceReference(value: string): boolean {
  return /\bFonte\s*\d+|Screenshot[_\s-]|WhatsApp Image|(?:[A-Za-z]:\\|\/)(?:[^\n\\/]+[\\/])+[^\n\\/]+\.(?:jpe?g|png|webp|pdf)/i.test(value || '');
}

export function validateGeneratedBncc(code: string, candidates: BnccSkill[]): boolean {
  return validateBnccCode(code, candidates);
}

export function questionScoreTotal(questions: Array<{ pontuacao?: number }>): number {
  return questions.reduce((sum, question) => sum + (Number(question.pontuacao) || 0), 0);
}

export function lessonDurationTotal(steps: Array<{ duracao_min?: number }>): number {
  return steps.reduce((sum, step) => sum + (Number(step.duracao_min) || 0), 0);
}
