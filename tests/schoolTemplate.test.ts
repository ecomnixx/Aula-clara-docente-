import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { analyzeDocxTemplate, buildAssessmentDocx, buildAssessmentPdf } from '../src/server/assessmentDocuments';

test('extrai identidade do DOCX sem reaproveitar conteúdo pedagógico antigo', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>COLÉGIO ALMANAC</w:t></w:r></w:p><w:p><w:r><w:t>ORIENTAÇÕES</w:t></w:r></w:p><w:p><w:r><w:t>Use caneta azul.</w:t></w:r></w:p><w:p><w:r><w:t>QUESTÃO ANTIGA SECRETA</w:t></w:r></w:p><w:sectPr><w:pgMar w:top="567" w:right="707" w:bottom="709" w:left="567"/></w:sectPr></w:body></w:document>`);
  zip.file('word/styles.xml', '<w:styles xmlns:w="x"><w:rFonts w:ascii="Arial"/></w:styles>');
  const template = await analyzeDocxTemplate(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(template.schoolName, 'COLÉGIO ALMANAC'); assert.equal(template.fontFamily, 'Arial'); assert.equal(template.margins.left, 28.35);
  assert.doesNotMatch(JSON.stringify(template), /QUESTÃO ANTIGA SECRETA/);
});

test('gera DOCX editável e PDF válidos com conteúdo novo', async () => {
  const template: any = { name: 'Bimestral', schoolName: 'COLÉGIO ALMANAC', headerLines: [], fields: [], primaryColor: '#173342', accentColor: '#e8a23a', fontFamily: 'Arial', borderStyle: 'boxed', margins: { top: 28.35, right: 35.35, bottom: 35.45, left: 28.35 }, instructions: ['Leia com atenção.'], keepInstructions: true, questionStyle: { showScore: true, alternativesStyle: 'A)' }, answerLineStyle: { short: 3, medium: 5, long: 7 }, sourceType: 'docx' };
  const input = { title: 'AVALIAÇÃO BIMESTRAL', subject: 'Ciências', grade: '6º ano', bimester: 1, content: 'QUESTÃO 1 (10,0)\nExplique o sistema respiratório.' };
  const docx = await buildAssessmentDocx(template, input); const pdf = await buildAssessmentPdf(template, input);
  const outputZip = await JSZip.loadAsync(docx); const xml = await outputZip.file('word/document.xml')!.async('string');
  assert.match(xml, /Ciências|CIÊNCIAS/); assert.match(xml, /sistema respiratório/); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
