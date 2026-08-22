import test from 'node:test';
import assert from 'node:assert/strict';
import { getBnccSkills, validateBnccCode } from '../src/server/bnccMatcher';
import { cleanOcrText, deduplicateOcrText, stripTechnicalMarkers } from '../src/server/contentCleaner';
import { containsTechnicalSourceReference, lessonDurationTotal, normalizeLessonDuration, normalizeQuestionScores, questionScoreTotal } from '../src/server/pedagogicalValidation';

test('Língua Portuguesa do 6º ano consulta apenas habilidades da disciplina para texto sobre Jogos Olímpicos', () => {
  const skills = getBnccSkills({ disciplina: 'Língua Portuguesa', etapa: 'Ensino Fundamental – Anos Finais', anoSerie: '6º Ano', objetivo: 'interpretação e inferência em texto sobre Jogos Olímpicos' });
  assert.ok(skills.length > 0);
  assert.ok(skills.every((skill) => skill.disciplina === 'Língua Portuguesa'));
  assert.ok(skills.every((skill) => /LP/.test(skill.codigo)));
});

test('Educação Física do Ensino Médio usa candidatos curriculares autorizados', () => {
  const skills = getBnccSkills({ disciplina: 'Educação Física', etapa: 'Ensino Médio', anoSerie: '1ª Série (Ensino Médio)', objetivo: 'Jogos Olímpicos, cultura corporal, inclusão e análise sociocultural' });
  assert.ok(skills.length > 0);
  assert.ok(skills.every((skill) => validateBnccCode(skill.codigo, skills)));
});

test('rejeita código BNCC inexistente ou fora da lista autorizada', () => {
  const skills = getBnccSkills({ disciplina: 'Matemática', etapa: 'Ensino Fundamental – Anos Finais', anoSerie: '6º Ano' });
  assert.equal(validateBnccCode('EF00XX999', skills), false);
});

test('recalcula prova para 10 pontos em incrementos de 0,25', () => {
  const normalized = normalizeQuestionScores(Array.from({ length: 7 }, () => ({ pontuacao: 9 })), 10);
  assert.equal(questionScoreTotal(normalized), 10);
  assert.ok(normalized.every((question) => Number(question.pontuacao) * 4 % 1 === 0));
});

test('corrige duração das etapas para o total exato', () => {
  const steps = normalizeLessonDuration([{ duracao_min: 10 }, { duracao_min: 20 }, { duracao_min: 20 }], 100);
  assert.equal(lessonDurationTotal(steps), 100);
});

test('remove duplicação, marcador técnico e nome de screenshot', () => {
  const duplicate = 'Um parágrafo pedagógico suficientemente longo para ser único.';
  assert.equal(deduplicateOcrText(`${duplicate}\n\n${duplicate}`).split(duplicate).length - 1, 1);
  const cleaned = stripTechnicalMarkers('Fonte 1: Screenshot_2026-08-22-14-24.png');
  assert.equal(containsTechnicalSourceReference(cleaned), false);
  assert.ok(cleanOcrText('PÁGINA 1\nConteúdo válido').includes('Conteúdo válido'));
});
