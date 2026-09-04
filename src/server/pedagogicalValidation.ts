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
  const safeTarget = Math.max(steps.length, Math.round(Number(target) || steps.length));
  const weights = steps.map((step) => Math.max(1, Number(step.duracao_min) || 1));
  const distributable = safeTarget - steps.length;
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const rawShares = weights.map((weight) => (weight / weightTotal) * distributable);
  const minutes = rawShares.map((share) => 1 + Math.floor(share));
  let remainder = safeTarget - minutes.reduce((sum, value) => sum + value, 0);
  rawShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (remainder > 0) {
        minutes[index] += 1;
        remainder -= 1;
      }
    });
  return steps.map((step, index) => ({ ...step, duracao_min: minutes[index] }));
}

export interface PedagogicalIssue {
  field: string;
  message: string;
}

const answerLetter = (value: unknown) => String(value || '').trim().toUpperCase().match(/[A-E]/)?.[0] || '';

export function validateAssessmentStructure(questions: any[], targetScore = 10): PedagogicalIssue[] {
  const issues: PedagogicalIssue[] = [];
  if (!Array.isArray(questions) || questions.length !== 10) {
    issues.push({ field: 'questoes', message: 'A avaliação deve conter exatamente 10 questões.' });
    return issues;
  }
  const objective = questions.filter((question) => question?.tipo === 'multipla_escolha');
  const open = questions.filter((question) => question?.tipo === 'dissertativa');
  if (objective.length !== 5) issues.push({ field: 'questoes.objetivas', message: 'A avaliação deve conter exatamente 5 questões objetivas.' });
  if (open.length !== 5) issues.push({ field: 'questoes.dissertativas', message: 'A avaliação deve conter exatamente 5 questões dissertativas.' });
  objective.forEach((question, index) => {
    const alternatives = Array.isArray(question.alternativas) ? question.alternativas.map((item: unknown) => String(item).trim()) : [];
    if (alternatives.length !== 5) issues.push({ field: `questoes.objetivas.${index}.alternativas`, message: 'A questão objetiva deve ter exatamente cinco alternativas.' });
    const labels = alternatives.map((item: string) => item.match(/^\s*([A-E])[).\-:]\s*/i)?.[1]?.toUpperCase() || '');
    if (labels.join('') !== 'ABCDE') issues.push({ field: `questoes.objetivas.${index}.alternativas`, message: 'As alternativas devem estar identificadas uma vez, de A a E.' });
    const texts = alternatives.map((item: string) => item.replace(/^\s*[A-E][).\-:]\s*/i, '').toLocaleLowerCase('pt-BR'));
    if (new Set(texts).size !== texts.length) issues.push({ field: `questoes.objetivas.${index}.alternativas`, message: 'A questão objetiva contém alternativas duplicadas.' });
    const correct = answerLetter(question.resposta_correta || question.respostaGabarito);
    if (!correct || !labels.includes(correct)) issues.push({ field: `questoes.objetivas.${index}.resposta_correta`, message: 'A questão objetiva precisa de uma única letra de resposta válida entre A e E.' });
    if (!String(question.justificativa || question.explicacao || '').trim()) issues.push({ field: `questoes.objetivas.${index}.justificativa`, message: 'A resposta objetiva precisa de justificativa.' });
  });
  open.forEach((question, index) => {
    if (!String(question.expectativa_resposta || question.respostaGabarito || '').trim()) issues.push({ field: `questoes.dissertativas.${index}.expectativa_resposta`, message: 'A questão aberta precisa de resposta esperada.' });
    if (!String(question.criterios_correcao || '').trim()) issues.push({ field: `questoes.dissertativas.${index}.criterios_correcao`, message: 'A questão aberta precisa de critérios de correção.' });
  });
  if (Math.abs(questionScoreTotal(questions) - targetScore) > 0.001) issues.push({ field: 'questoes.pontuacao', message: `A pontuação deve totalizar exatamente ${targetScore} pontos.` });
  return issues;
}

export function validateLessonStructure(plan: any, expectedDuration: number): PedagogicalIssue[] {
  const issues: PedagogicalIssue[] = [];
  for (const field of ['disciplina', 'ano_serie', 'tema', 'avaliacao']) {
    if (!String(plan?.[field] || '').trim()) issues.push({ field, message: `O campo ${field} é obrigatório.` });
  }
  if (!Array.isArray(plan?.objetivos) || plan.objetivos.length === 0) issues.push({ field: 'objetivos', message: 'O plano precisa de objetivos observáveis.' });
  if (!Array.isArray(plan?.desenvolvimento) || plan.desenvolvimento.length === 0) issues.push({ field: 'desenvolvimento', message: 'O plano precisa de etapas de desenvolvimento.' });
  else if (lessonDurationTotal(plan.desenvolvimento) !== expectedDuration) issues.push({ field: 'desenvolvimento.duracao_min', message: `As etapas devem totalizar exatamente ${expectedDuration} minutos.` });
  return issues;
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
