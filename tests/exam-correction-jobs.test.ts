import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionProgress,
  orderedTranscription,
  withDeadline,
} from '../src/server/examCorrectionJobs';

test('progresso reflete páginas realmente persistidas', () => {
  const pages = [
    { page_kind: 'exam' as const, page_number: 1, status: 'ready' as const },
    { page_kind: 'exam' as const, page_number: 2, status: 'reading' as const },
    { page_kind: 'answer_key' as const, page_number: 1, status: 'pending' as const },
  ];
  assert.deepEqual(correctionProgress(pages, 'reading'), { progress: 30, stage: 'reading_exam' });
  pages[1].status = 'ready';
  assert.deepEqual(correctionProgress(pages, 'reading'), { progress: 55, stage: 'reading_answer_key' });
  pages[2].status = 'ready';
  assert.deepEqual(correctionProgress(pages, 'reading'), { progress: 70, stage: 'grading' });
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
