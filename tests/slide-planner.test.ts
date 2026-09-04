import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualPrompt, normalizeSlide, presentationProgress, resolveSlideCount } from '../src/server/slidePlanner';
import { SlideDeck } from '../src/types/slides';

test('tema-only supports requested and automatic slide counts', () => {
  assert.equal(resolveSlideCount(12), 12);
  assert.equal(resolveSlideCount(200), 20);
  assert.equal(resolveSlideCount('automatico', 22_000), 10);
});

test('visual prompt forbids generated typography and reserves editable text area', () => {
  const prompt = buildVisualPrompt({ title: 'Metabolismo', keyMessage: 'Energia sustenta a vida', visualType: 'INFOGRAPHIC', graphicElements: ['fluxo de energia'] }, { disciplina: 'Educação Física', segmento: 'Ensino Médio', ano: '1º ano', tema: 'Corpo e biologia', style: 'moderno' });
  assert.match(prompt, /NO TEXT, NO LETTERS/);
  assert.match(prompt, /negative space for editable title/);
  assert.doesNotMatch(prompt, /watermark allowed/i);
});

test('normalization converts diagram slides into required editable visuals', () => {
  const slide = normalizeSlide({ title: 'Ciclo', content: ['Etapa 1', 'Etapa 2'], visualType: 'CYCLE', needsImage: true, graphicElements: ['setas'] }, 1, true, 'professor');
  assert.equal(slide.needsImage, false);
  assert.equal(slide.visualKind, 'programmatic');
  assert.equal(slide.visualRequired, true);
  assert.equal(slide.assetStatus, 'ready');
  assert.deepEqual(slide.bullets, ['Etapa 1', 'Etapa 2']);
});

test('progress reflects persisted assets rather than a timer', () => {
  const deck = { slides: [{ needsImage: true, assetStatus: 'ready' }, { needsImage: true, assetStatus: 'pending' }] } as unknown as SlideDeck;
  assert.equal(presentationProgress(deck, 'generating_assets'), 65);
  assert.equal(presentationProgress(deck, 'completed'), 100);
});
