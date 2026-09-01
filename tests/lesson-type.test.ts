import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeneratedLesson, decideLessonType } from '../src/server/lessonType';

const cases = [
  ['Educação Física teórica', 'teórica', 'Quero uma aula teórica, em sala, com explicação, análise de imagens e debate. Sem prática corporal.', 'teórica'],
  ['Educação Física prática', 'prática', '', 'prática'],
  ['Ciências mista', 'teórico-prática', 'Explique o sistema respiratório e depois faça uma experiência simples.', 'teórico-prática'],
  ['História teórica', 'teórica', 'Exposição dialogada, análise e atividade reflexiva.', 'teórica'],
  ['Matemática prática', 'prática', 'Usar materiais concretos.', 'prática'],
  ['Automático obedece descrição', 'automática', 'Quero somente uma aula teórica.', 'teórica'],
  ['Descrição específica supera seletor', 'teórica', 'Explique as regras do voleibol, depois faça um pequeno jogo para aplicar.', 'teórico-prática'],
] as const;

for (const [name, selected, description, expected] of cases) {
  test(name, () => assert.equal(decideLessonType(selected, description).resolvedType, expected));
}

test('classificador rejeita plano teórico dominado por circuito e jogo', () => {
  const validation = classifyGeneratedLesson({ desenvolvimento: [{ etapa: 'Circuito', descricao: 'Jogo, corrida e atividade corporal em estações.' }] }, 'teórica');
  assert.equal(validation.aligned, false);
  assert.equal(validation.detectedGeneratedType, 'prática');
});

test('classificador aceita integração entre explicação e aplicação', () => {
  const validation = classifyGeneratedLesson({ desenvolvimento: [
    { etapa: 'Exposição dialogada', descricao: 'Explicação do conceito e perguntas.' },
    { etapa: 'Aplicação prática', descricao: 'Experimento seguido de reflexão.' },
  ] }, 'teórico-prática');
  assert.equal(validation.aligned, true);
});
