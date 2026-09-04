import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeSlide, unresolvedRequiredVisuals, visualPolicy } from '../src/server/slidePlanner';
import { generateRequiredSlideAsset } from '../src/server/slideAssetPipeline';
import { createEditablePptx, createSlidesPdf } from '../src/server/slideExport';
import { SlideVisualPreview } from '../src/components/SlideVisualPreview';
import { SlideDeck, SlideVisualType } from '../src/types/slides';

test('política visual é determinística e não delega obrigatoriedade à IA', () => {
  for (const type of ['HERO','ANATOMY'] as SlideVisualType[]) assert.deepEqual(visualPolicy(type, false), { visualRequired: true, visualKind: 'generated_image', needsImage: true });
  for (const type of ['INFOGRAPHIC','TIMELINE','PROCESS','CYCLE','COMPARE','STATISTIC','PYRAMID','CARDS','CONCEPT_MAP','CAUSE_EFFECT'] as SlideVisualType[]) assert.deepEqual(visualPolicy(type, false), { visualRequired: true, visualKind: 'programmatic', needsImage: false });
  assert.deepEqual(visualPolicy('QUESTION', false), { visualRequired: false, visualKind: 'none', needsImage: false });
  assert.deepEqual(visualPolicy('SUMMARY', false), { visualRequired: false, visualKind: 'none', needsImage: false });
});

test('normalização mantém conteúdo editável e prepara visual obrigatório', () => {
  const hero = normalizeSlide({ title: 'Capa', content: ['Mensagem'], visualType: 'HERO', needsImage: false }, 0, false, 'aluno');
  const process = normalizeSlide({ title: 'Processo', content: ['A','B'], visualType: 'PROCESS', needsImage: false }, 1, false, 'aluno');
  assert.equal(hero.assetStatus, 'pending'); assert.equal(hero.needsImage, true);
  assert.equal(process.assetStatus, 'ready'); assert.equal(process.visualKind, 'programmatic'); assert.deepEqual(process.bullets, ['A','B']);
});

test('falha do provider permanece bloqueada e não simula imagem concluída', async () => {
  const slide = normalizeSlide({ title: 'Anatomia', content: ['Corpo'], visualType: 'ANATOMY' }, 1, false, 'aluno');
  const result = await generateRequiredSlideAsset(slide, { generate: async () => { throw new Error('provider indisponível'); } }, { info() {}, error() {} });
  assert.equal(result.assetStatus, 'failed'); assert.match(result.assetError || '', /provider indisponível/);
  const deck = { slides: [result] } as unknown as SlideDeck; assert.equal(unresolvedRequiredVisuals(deck).length, 1);
});

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAE/wH+eNpjAAAAAElFTkSuQmCC';
const deck: SlideDeck = { title:'Teste visual',disciplina:'Educação Física',anoSerie:'1ª Série',tema:'Corpo e mídia',style:'moderno',ratio:'16:9',audience:'aluno',includeNotes:false,bncc:[],slides:[
  {id:'hero',title:'Corpo e mídia',bullets:['Realidade biológica'],layout:'hero',visualType:'HERO',visualRequired:true,visualKind:'generated_image',needsImage:true,assetStatus:'ready',assetDataUrl:tinyPng},
  {id:'process',title:'Processo',bullets:['Observar','Comparar','Refletir'],layout:'process',visualType:'PROCESS',visualRequired:true,visualKind:'programmatic',needsImage:false,assetStatus:'ready'},
]};

test('preview recebe imagem e composição programática', () => {
  const imageMarkup = renderToStaticMarkup(React.createElement(SlideVisualPreview, { slide: deck.slides[0] }));
  const processMarkup = renderToStaticMarkup(React.createElement(SlideVisualPreview, { slide: deck.slides[1] }));
  assert.match(imageMarkup, /Imagem gerada/); assert.match(processMarkup, /programmatic-visual/); assert.match(processMarkup, /Observar/);
});

test('PPTX recebe imagem e mantém texto editável; PDF recebe imagem', async () => {
  const [pptx,pdf] = await Promise.all([createEditablePptx(deck),createSlidesPdf(deck)]); const zip=await JSZip.loadAsync(pptx);
  assert.ok(Object.keys(zip.files).some((name)=>name.startsWith('ppt/media/image'))); const xml=await zip.file('ppt/slides/slide2.xml')!.async('string'); assert.match(xml,/Processo|Observar/);
  assert.equal(pdf.subarray(0,4).toString(),'%PDF'); assert.ok(pdf.length>1500);
});

test('exportação não aceita visual obrigatório pending', async () => {
  const pending={...deck,slides:[{...deck.slides[0],assetStatus:'pending' as const,assetDataUrl:undefined}]};
  await assert.rejects(createEditablePptx(pending),/Exportação bloqueada/); await assert.rejects(createSlidesPdf(pending),/Exportação bloqueada/);
});
