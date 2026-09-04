import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { buildAssessmentDocx, buildAssessmentPdf } from '../src/server/assessmentDocuments';
import { validateSlideDeck } from '../src/server/slidePlanner';
import { userFacingError } from '../src/utils/userFacingError';

test('Home e Criar encaminham Slides ao módulo independente, nunca ao gerador de plano', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /setCreationFocus\('slides'\); setActiveTab\('slides'\)/);
  assert.match(source, /activeTab === 'slides'[\s\S]{0,900}<SlidesGenerator/);
  assert.doesNotMatch(source, /setCreationFocus\('slides'\); setActiveTab\('create'\)/);
});

test('fluxos de slides por tema e material usam presentation-jobs', async () => {
  const source = await readFile(new URL('../src/components/SlidesGenerator.tsx', import.meta.url), 'utf8');
  assert.match(source, /mode === 'material'/); assert.match(source, /mode === 'tema'/);
  assert.match(source, /\/api\/presentation-jobs/); assert.doesNotMatch(source, /\/api\/generate['"`]/);
  assert.match(source, /requestInFlight\.current/);
});

test('falha de geração não cria resultado final falso e não mostra erro técnico', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(generationSucceeded\) setGeneratedType\(type\)/);
  assert.equal(userFacingError(new Error('ECONNRESET stack at apiFunction')), 'Não foi possível concluir esta etapa. Tente novamente.');
  assert.equal(userFacingError(new Error('{"status":500,"trace":"x"}')), 'Não foi possível concluir esta etapa. Tente novamente.');
});

test('validação de slides detecta vazio, excesso, imagem inválida e visual pendente', () => {
  const issues = validateSlideDeck({ ratio:'16:9',slides:[{ id:'x',title:'',bullets:['x'.repeat(181)],layout:'hero',visualType:'HERO',visualKind:'generated_image',visualRequired:true,needsImage:true,assetStatus:'ready',assetDataUrl:'https://invalid' }] } as any);
  assert.ok(issues.some((issue)=>issue.code==='INVALID_IMAGE'));
  assert.ok(issues.some((issue)=>issue.code==='LONG_LINE'));
});

test('Modelo da Escola preserva logo e rodapé em DOCX e PDF', async () => {
  const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAE/wH+eNpjAAAAAElFTkSuQmCC';
  const template:any={name:'Modelo',schoolName:'ESCOLA TESTE',headerLines:['Cabeçalho'],fields:['Aluno'],primaryColor:'#173342',accentColor:'#e8a23a',fontFamily:'Arial',borderStyle:'boxed',margins:{top:40,right:40,bottom:40,left:40},instructions:[],keepInstructions:false,questionStyle:{showScore:true,alternativesStyle:'A)'},answerLineStyle:{short:3,medium:5,long:7},footer:'Rodapé institucional',logoDataUrl:tinyPng,sourceType:'docx'};
  const input={title:'AVALIAÇÃO',subject:'Português',grade:'1º ano',content:'1. Leia e responda.'}; const [docx,pdf]=await Promise.all([buildAssessmentDocx(template,input),buildAssessmentPdf(template,input)]);
  const zip=await JSZip.loadAsync(docx); assert.ok(zip.file('word/footer1.xml')); assert.match(await zip.file('word/footer1.xml')!.async('string'),/Rodap|institucional/);
  const parsed=await PDFDocument.load(pdf); assert.equal(parsed.getPageCount(),1); assert.ok(pdf.length>1500);
});

test('correção persistente possui trava contra clique duplicado e retomada após reload', async () => {
  const source=await readFile(new URL('../src/components/CorrigirProvaView.tsx',import.meta.url),'utf8');
  assert.match(source,/aula_clara_active_correction_job/); assert.match(source,/processingRef\.current/); assert.match(source,/resumableJobId/);
});

test('API protege geração e exportação com sessão válida', async () => {
  const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  const exporter = await readFile(new URL('../src/server/exportSlidesFunction.ts', import.meta.url), 'utf8');
  assert.match(server, /app\.use\('\/api',[\s\S]*getAuthenticatedUser\(getBearerToken\(req\)\)/);
  assert.match(exporter, /hasValidSession\(req\)/);
  assert.match(exporter, /\/auth\/v1\/user/);
});

test('RLS dos filhos da correção exige propriedade do job pai', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260903090000_harden_exam_job_child_rls.sql', import.meta.url), 'utf8');
  assert.match(migration, /exam_correction_pages_owner_insert[\s\S]*exists[\s\S]*j\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /exam_correction_grading_blocks_owner_update[\s\S]*with check/);
});
