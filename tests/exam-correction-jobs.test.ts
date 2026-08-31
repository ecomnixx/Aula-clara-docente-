import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consolidateCorrectionBlocks,
  correctionProgress,
  isTransientGradingError,
  orderedTranscription,
  splitExamIntoGradingBlocks,
  withDeadline,
} from '../src/server/examCorrectionJobs';

test('progresso reflete páginas realmente persistidas', () => {
  const pages = [
    { page_kind: 'exam' as const, page_number: 1, status: 'ready' as const },
    { page_kind: 'exam' as const, page_number: 2, status: 'reading' as const },
    { page_kind: 'answer_key' as const, page_number: 1, status: 'pending' as const },
  ];
  assert.deepEqual(correctionProgress(pages, 'ocr_processing'), { progress: 30, stage: 'reading_exam' });
  pages[1].status = 'ready';
  assert.deepEqual(correctionProgress(pages, 'ocr_processing'), { progress: 55, stage: 'reading_answer_key' });
  pages[2].status = 'ready';
  assert.deepEqual(correctionProgress(pages, 'grading_pending'), { progress: 75, stage: 'grading' });
});

test('prova grande é dividida sem perder questões e em blocos curtos', () => {
  const text = Array.from({ length: 12 }, (_, index) => `Questao ${index + 1}\nEnunciado ${'x'.repeat(220)}\nResposta do aluno`).join('\n\n');
  const blocks = splitExamIntoGradingBlocks(text, 700);
  assert.ok(blocks.length >= 4);
  assert.ok(blocks.every((block) => block.length <= 700));
  for (let question = 1; question <= 12; question += 1) {
    assert.equal(blocks.filter((block) => block.includes(`Questao ${question}\n`)).length, 1);
  }
});

test('alta demanda e timeout são classificados como transitórios', () => {
  assert.equal(isTransientGradingError({ status: 429, message: 'RESOURCE_EXHAUSTED' }), true);
  assert.equal(isTransientGradingError(new Error('A correção excedeu o tempo seguro.')), true);
  assert.equal(isTransientGradingError({ status: 422, message: 'OCR vazio' }), false);
});

test('resultados parciais são consolidados uma única vez e fecham a nota total', () => {
  const report = (numero: number, nota: number) => ({
    id: `partial-${numero}`, disciplina: 'Matemática', modoGabarito: 'sem_gabarito_ia' as const,
    questoes: [{ numero, tipo: 'Discursiva' as const, enunciado: `Q${numero}`, valorMaximo: 1,
      respostaAlunoTexto: 'resposta', gabaritoEsperado: 'esperado', gabaritoOrigem: 'inferido_ia' as const,
      notaAtribuida: nota, status: nota ? 'correta' as const : 'incorreta' as const,
      feedbackConciso: 'ok', confiancaLeitura: 'alta' as const, precisaRevisao: false }],
    notaFinal: nota, notaMaximaTotal: 1, totalQuestoes: 1, totalCorretas: nota ? 1 : 0,
    totalParciais: 0, totalIncorretas: nota ? 0 : 1, totalParaRevisao: 0, dataCorrecao: new Date().toISOString(),
  });
  const consolidated = consolidateCorrectionBlocks([report(1, 1), report(2, 0), report(1, 1)], 10, 'stable-job');
  assert.equal(consolidated.id, 'stable-job');
  assert.equal(consolidated.totalQuestoes, 2);
  assert.equal(consolidated.notaMaximaTotal, 10);
  assert.equal(consolidated.notaFinal, 5);
});

test('transcrição é remontada na ordem das páginas sem repetir falhas', () => {
  const text = orderedTranscription([
    { page_kind: 'exam', page_number: 2, status: 'ready', transcription: 'Questão 2' },
    { page_kind: 'exam', page_number: 1, status: 'ready', transcription: 'Questão 1' },
    { page_kind: 'exam', page_number: 3, status: 'failed', transcription: 'ignorar' },
    { page_kind: 'answer_key', page_number: 1, status: 'ready', transcription: 'Gabarito' },
  ], 'exam');
  assert.equal(text, 'Questão 1\n\nQuestão 2');
});

test('deadline encerra a espera antes do limite externo', async () => {
  const never = new Promise<string>(() => undefined);
  await assert.rejects(withDeadline(never, 10, 'tempo seguro excedido'), /tempo seguro excedido/);
});
