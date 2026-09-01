import { LessonType, LessonTypeDecision, LessonTypeValidation, ResolvedLessonType } from '../types/lesson';

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const practical = ['pratica','praticar','jogo','circuito','vivencia','experimento','oficina','treino','laboratorio','materiais concretos','manipulaveis','producao','construcao','atividade corporal'];
const theoretical = ['teorica','explicar','explicacao','conceito','exposicao','aula dialogada','leitura','debate','analise','revisao','sala de aula','atividade escrita'];
const noPractice = ['sem pratica','sem atividade pratica','sem pratica corporal','somente teorica','apenas teorica'];
const countSignals = (text: string, signals: string[]) => signals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0);

export function decideLessonType(selected: LessonType | undefined, teacherDescription = ''): LessonTypeDecision {
  const requestedType: LessonType = selected || 'automática'; const text = normalize(teacherDescription);
  const theoryScore = countSignals(text, theoretical) + countSignals(text, noPractice) * 4; const practiceScore = countSignals(text, practical);
  const sequential = /(depois|seguida|seguido|e depois|primeiro).*(pratic|jogo|exper|atividade|exerc)|(?:explic|conceit|teoric).{0,80}(?:pratic|jogo|exper|atividade|exerc)/.test(text);
  let descriptionType: ResolvedLessonType | null = null;
  if (countSignals(text, noPractice)) descriptionType = 'teórica';
  else if (sequential || (theoryScore > 0 && practiceScore > 0)) descriptionType = 'teórico-prática';
  else if (practiceScore > theoryScore && practiceScore > 0) descriptionType = 'prática';
  else if (theoryScore > 0) descriptionType = 'teórica';
  if (descriptionType) return { requestedType, resolvedType: descriptionType, reason: `A orientação do professor indica uma aula ${descriptionType}.`, descriptionOverridesSelection: requestedType !== 'automática' && requestedType !== descriptionType };
  if (requestedType !== 'automática') return { requestedType, resolvedType: requestedType, reason: `Tipo escolhido pelo professor: ${requestedType}.`, descriptionOverridesSelection: false };
  return { requestedType, resolvedType: 'teórica', reason: 'Sem indicação explícita, foi adotada uma estrutura conceitual segura.', descriptionOverridesSelection: false };
}

export function classifyGeneratedLesson(plan: any, expected: ResolvedLessonType): LessonTypeValidation {
  const stages = Array.isArray(plan?.desenvolvimento) ? plan.desenvolvimento : [];
  const text = normalize(stages.map((stage: any) => `${stage?.etapa || ''} ${stage?.descricao || ''}`).join(' '));
  const practicalScore = countSignals(text, practical) + countSignals(text, ['aquecimento','atividade principal','volta a calma']);
  const theoryScore = countSignals(text, theoretical) + countSignals(text, ['contextualizacao','sintese','perguntas','reflexao']);
  let detectedGeneratedType: ResolvedLessonType = theoryScore > 0 && practicalScore > 0 ? 'teórico-prática' : practicalScore > theoryScore ? 'prática' : 'teórica';
  if (expected === 'teórica' && countSignals(text, noPractice)) detectedGeneratedType = 'teórica';
  const aligned = expected === detectedGeneratedType || (expected === 'teórico-prática' && theoryScore > 0 && practicalScore > 0);
  return { requestedType: expected, detectedGeneratedType, aligned, reason: aligned ? 'O desenvolvimento corresponde ao tipo solicitado.' : `O plano foi detectado como ${detectedGeneratedType}, mas deveria ser ${expected}.` };
}
