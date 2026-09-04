import test from 'node:test';
import assert from 'node:assert/strict';
import { getBnccSkills, matchOfficialBnccSkill, validateBnccCode } from '../src/server/bnccMatcher';
import { classifyGeneratedLesson, decideLessonType } from '../src/server/lessonType';
import { lessonDurationTotal, normalizeLessonDuration, normalizeQuestionScores, validateAssessmentStructure, validateLessonStructure } from '../src/server/pedagogicalValidation';
import { validateSlideDeck } from '../src/server/slidePlanner';

const scenarios = [
  { name: 'Língua Portuguesa — 6º ano', disciplina: 'Língua Portuguesa', etapa: 'Ensino Fundamental – Anos Finais', ano: '6º Ano', tema: 'posicionamentos em texto jornalístico', terms: ['texto jornalístico', 'posicionamentos explícitos e implícitos'], type: 'teórica' as const },
  { name: 'Matemática — 8º ano', disciplina: 'Matemática', etapa: 'Ensino Fundamental – Anos Finais', ano: '8º Ano', tema: 'grandezas proporcionais', terms: ['grandezas diretamente proporcionais', 'sentença algébrica'], type: 'teórico-prática' as const },
  { name: 'Ciências — 7º ano', disciplina: 'Ciências', etapa: 'Ensino Fundamental – Anos Finais', ano: '7º Ano', tema: 'máquinas térmicas e combustíveis', terms: ['máquinas térmicas', 'tipos de combustível'], type: 'teórico-prática' as const },
  { name: 'História — 9º ano', disciplina: 'História', etapa: 'Ensino Fundamental – Anos Finais', ano: '9º Ano', tema: 'Proclamação da República', terms: ['governos republicanos', 'Proclamação da República'], type: 'teórica' as const },
  { name: 'Educação Física — 1ª Série EM — teórica', disciplina: 'Educação Física', etapa: 'Ensino Médio', ano: '1ª Série (Ensino Médio)', tema: 'práticas corporais e diversidade', terms: ['práticas corporais', 'diversidade'], type: 'teórica' as const },
  { name: 'Educação Física — 1ª Série EM — prática', disciplina: 'Educação Física', etapa: 'Ensino Médio', ano: '1ª Série (Ensino Médio)', tema: 'práticas corporais e autonomia', terms: ['experimentar práticas corporais', 'autonomia'], type: 'prática' as const },
  { name: 'Educação Física — 1ª Série EM — teórico-prática', disciplina: 'Educação Física', etapa: 'Ensino Médio', ano: '1ª Série (Ensino Médio)', tema: 'práticas corporais como fenômeno cultural', terms: ['práticas corporais', 'fenômeno cultural'], type: 'teórico-prática' as const },
];

function assessmentFixture() {
  const objective = Array.from({ length: 5 }, (_, index) => ({
    numero: index + 1, tipo: 'multipla_escolha', pontuacao: 9,
    enunciado: `Questão objetiva ${index + 1} sobre o conteúdo estudado`,
    alternativas: ['A) resposta correta', 'B) distrator plausível um', 'C) distrator plausível dois', 'D) distrator plausível três', 'E) distrator plausível quatro'],
    resposta_correta: 'A', justificativa: 'A alternativa A corresponde ao conteúdo estudado.',
  }));
  const open = Array.from({ length: 5 }, (_, index) => ({
    numero: index + 6, tipo: 'dissertativa', pontuacao: 9,
    enunciado: `Questão aberta ${index + 6} sobre o conteúdo estudado`,
    expectativa_resposta: 'Apresentar o conceito e justificá-lo com um elemento do conteúdo estudado.',
    criterios_correcao: 'Conceito correto: 0,5 ponto; justificativa coerente: 0,5 ponto.',
  }));
  return normalizeQuestionScores([...objective, ...open], 10);
}

for (const scenario of scenarios) {
  test(`${scenario.name} — Plano de Aula`, () => {
    const bncc = matchOfficialBnccSkill(scenario.disciplina, scenario.etapa, scenario.ano, scenario.tema, scenario.terms);
    const candidates = getBnccSkills({ disciplina: scenario.disciplina, etapa: scenario.etapa, anoSerie: scenario.ano });
    assert.ok(validateBnccCode(bncc.codigo, candidates), `BNCC sem correspondência segura: ${bncc.codigo}`);
    const descriptions = scenario.type === 'teórica'
      ? ['Contextualização e leitura do conteúdo.', 'Exposição dialogada do conceito.', 'Análise orientada de exemplos.', 'Atividade escrita de aplicação.', 'Síntese e avaliação formativa.']
      : scenario.type === 'prática'
        ? ['Aquecimento corporal.', 'Vivência prática do movimento.', 'Jogo com aplicação das regras.', 'Desafio motor em grupos.', 'Volta à calma e reflexão.']
        : ['Contextualização conceitual.', 'Explicação e demonstração.', scenario.disciplina === 'Educação Física' ? 'Vivência corporal para aplicar o conceito.' : 'Resolução concreta para aplicar o conceito.', 'Análise do resultado da aplicação.', 'Síntese e avaliação formativa.'];
    const desenvolvimento = normalizeLessonDuration(descriptions.map((descricao, index) => ({ etapa: `Etapa ${index + 1}`, descricao, duracao_min: [40, 30, 25, 20, 15][index] })), 50);
    const plan = { disciplina: scenario.disciplina, ano_serie: scenario.ano, tema: scenario.tema, objetivos: ['Identificar o conceito.', 'Aplicar o conhecimento.', 'Justificar a conclusão.'], desenvolvimento, avaliacao: 'Verificar identificação, aplicação e justificativa.' };
    assert.equal(lessonDurationTotal(desenvolvimento), 50);
    assert.deepEqual(validateLessonStructure(plan, 50), []);
    assert.equal(classifyGeneratedLesson(plan, scenario.type).aligned, true);
  });

  test(`${scenario.name} — Avaliação`, () => {
    assert.deepEqual(validateAssessmentStructure(assessmentFixture(), 10), []);
  });

  test(`${scenario.name} — Atividade`, () => {
    const instruction = scenario.type === 'teórica' ? 'Aula teórica em sala, com leitura, análise e atividade escrita, sem prática corporal.' : scenario.type === 'prática' ? (scenario.disciplina === 'Educação Física' ? 'Prática corporal em quadra com jogo e vivência.' : 'Aplicação prática com resolução de problema e materiais concretos.') : (scenario.disciplina === 'Educação Física' ? 'Primeiro explicação em sala e depois prática corporal em quadra.' : 'Primeiro explicar o conceito e depois fazer uma aplicação prática do conhecimento.');
    const decision = decideLessonType(scenario.type, instruction);
    assert.equal(decision.resolvedType, scenario.type);
    if (scenario.disciplina !== 'Educação Física' && scenario.type !== 'teórica') assert.doesNotMatch(instruction, /prática corporal|quadra|aquecimento corporal/i);
    if (scenario.disciplina === 'Educação Física' && scenario.type === 'prática') assert.match(instruction, /prática corporal.*quadra/i);
  });

  test(`${scenario.name} — Slides`, () => {
    const bncc = matchOfficialBnccSkill(scenario.disciplina, scenario.etapa, scenario.ano, scenario.tema, scenario.terms);
    const deck: any = { title: scenario.tema, disciplina: scenario.disciplina, anoSerie: scenario.ano, tema: scenario.tema, style: 'didático', ratio: '16:9', audience: 'aluno', includeNotes: false, bncc: [{ codigo: bncc.codigo, descricao: bncc.descricao }], slides: [
      { id: '1', title: scenario.tema, bullets: ['Questão norteadora do conteúdo'], layout: 'cover', visualType: 'HERO', visualKind: 'generated-image', needsImage: true, assetStatus: 'ready', assetDataUrl: 'data:image/png;base64,AA==' },
      { id: '2', title: 'Objetivos', bullets: ['Identificar', 'Aplicar', 'Justificar'], layout: 'cards', visualType: 'OBJECTIVES', visualKind: 'programmatic', needsImage: false, assetStatus: 'not-needed' },
      { id: '3', title: 'Síntese', bullets: ['Conceito central', 'Aplicação', 'Verificação'], layout: 'visual-list', visualType: 'SUMMARY', visualKind: 'programmatic', needsImage: false, assetStatus: 'not-needed' },
    ] };
    assert.equal(validateSlideDeck(deck).filter((issue) => issue.severity === 'error').length, 0);
  });
}

test('BNCC não usa candidato apenas por coincidir disciplina e série', () => {
  const result = matchOfficialBnccSkill('Ciências', 'Ensino Fundamental – Anos Finais', '7º Ano', 'poesia lírica', ['eu lírico', 'rimas']);
  assert.equal(result.codigo, 'Habilidade BNCC específica não determinada com segurança.');
});

test('validador rejeita avaliação estruturalmente ambígua ou incompleta', () => {
  const questions: any[] = assessmentFixture();
  questions[0].alternativas[1] = questions[0].alternativas[0];
  questions[1].resposta_correta = 'Z';
  questions[5].criterios_correcao = '';
  assert.ok(validateAssessmentStructure(questions).length >= 3);
});

test('normalização de duração reduz etapas que excedem o total sem perder minutos', () => {
  const result = normalizeLessonDuration([{ duracao_min: 80 }, { duracao_min: 50 }, { duracao_min: 30 }], 50);
  assert.equal(lessonDurationTotal(result), 50);
  assert.ok(result.every((stage) => stage.duracao_min >= 1));
});
