import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditablePptx, createSlidesDocx, createSlidesPdf } from '../src/server/slideExport';
import { SlideDeck } from '../src/types/slides';

const deck: SlideDeck = {
  title: 'Slides — Jogos Olímpicos — Língua Portuguesa — 6º Ano', disciplina: 'Língua Portuguesa', anoSerie: '6º Ano',
  tema: 'Jogos Olímpicos como texto-base', style: 'fundamental', ratio: '16:9', audience: 'professor', includeNotes: true,
  bncc: [{ codigo: 'EF67LP28', descricao: 'Leitura autônoma e compreensão.' }],
  slides: [
    { id: '1', title: 'Jogos Olímpicos', bullets: ['Leitura e interpretação'], layout: 'cover', speakerNotes: 'Apresente o tema.' },
    { id: '2', title: 'O que vamos aprender?', bullets: ['Localizar informações', 'Construir inferências'], layout: 'cards', speakerNotes: 'Pergunte à turma.' },
  ],
};

test('gera PowerPoint editável, Word e PDF válidos', async () => {
  const [pptx, docx, pdf] = await Promise.all([createEditablePptx(deck), createSlidesDocx(deck), createSlidesPdf(deck)]);
  assert.equal(pptx.subarray(0, 2).toString(), 'PK');
  assert.equal(docx.subarray(0, 2).toString(), 'PK');
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pptx.length > 10_000 && docx.length > 5_000 && pdf.length > 500);
});
