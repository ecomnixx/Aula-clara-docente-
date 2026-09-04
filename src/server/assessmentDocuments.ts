import JSZip from 'jszip';
import { AlignmentType, BorderStyle, Document, Footer, ImageRun, Packer, PageBreak, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface StoredSchoolTemplate {
  name: string;
  schoolName: string;
  headerLines: string[];
  fields: string[];
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  borderStyle: 'none' | 'simple' | 'boxed';
  margins: { top: number; right: number; bottom: number; left: number };
  instructions: string[];
  keepInstructions: boolean;
  questionStyle: { showScore: boolean; alternativesStyle: string };
  answerLineStyle: { short: number; medium: number; long: number };
  footer?: string;
  logoDataUrl?: string;
  sourceType: 'docx' | 'pdf' | 'image';
}

const xmlText = (xml: string) => xml
  .replace(/<w:tab\/?[^>]*>/g, '\t')
  .replace(/<w:br\/?[^>]*>/g, '\n')
  .replace(/<\/w:p>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();

const firstMatch = (value: string, regex: RegExp, fallback = '') => value.match(regex)?.[1]?.trim() || fallback;
const dedupe = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

/** Extracts layout and institutional identity only. Pedagogical content is never returned. */
export async function analyzeDocxTemplate(buffer: Buffer): Promise<StoredSchoolTemplate> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string') || '';
  const stylesXml = await zip.file('word/styles.xml')?.async('string') || '';
  const headerNames = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/i.test(name));
  const footerNames = Object.keys(zip.files).filter((name) => /^word\/footer\d+\.xml$/i.test(name));
  const headerXml = (await Promise.all(headerNames.map((name) => zip.file(name)!.async('string')))).join('\n');
  const footerXml = (await Promise.all(footerNames.map((name) => zip.file(name)!.async('string')))).join('\n');
  const allText = xmlText(`${headerXml}\n${documentXml}`);
  const lines = allText.split('\n').map((line) => line.trim()).filter(Boolean);
  const schoolName = lines.find((line) => /COL[ÉE]GIO|ESCOLA|INSTITUTO|CENTRO EDUCACIONAL/i.test(line))?.slice(0, 120) || 'Minha escola';
  const institutional = lines.filter((line) => /COL[ÉE]GIO|ESCOLA|AVALIA[ÇC][ÃA]O|PROFESSOR|ALUNO|NOTA|DATA|BIMESTRE/i.test(line)).slice(0, 8);
  const instructionsStart = lines.findIndex((line) => /ORIENTA[ÇC][ÕO]ES/i.test(line));
  const instructions = instructionsStart >= 0
    ? lines.slice(instructionsStart + 1, instructionsStart + 7).filter((line) => !/QUEST[ÃA]O|^[A-E][).]/i.test(line)).map((line) => line.slice(0, 240))
    : [];
  const marginTag = documentXml.match(/<w:pgMar[^>]*>/i)?.[0] || '';
  const twips = (name: string, fallback: number) => Number(firstMatch(marginTag, new RegExp(`w:${name}="(\\d+)"`, 'i'), String(fallback))) / 20;
  const fontFamily = firstMatch(stylesXml, /w:ascii="([^"]+)"/i, 'Arial');
  const fields = dedupe(['Aluno(a)', 'Nº', 'Turma', 'Professor(a)', 'Disciplina', 'Bimestre', 'Nota', 'Data'].filter((field) => new RegExp(field.replace(/[().]/g, ''), 'i').test(allText.replace(/[().]/g, ''))));
  let logoDataUrl: string | undefined;
  const imageName = Object.keys(zip.files).find((name) => /^word\/media\//i.test(name) && /\.(png|jpe?g)$/i.test(name));
  if (imageName) {
    const image = await zip.file(imageName)!.async('base64');
    const ext = imageName.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    logoDataUrl = `data:image/${ext};base64,${image}`;
  }
  return {
    name: 'Avaliação padrão', schoolName, headerLines: institutional.filter((line) => line !== schoolName).slice(0, 4),
    fields: fields.length ? fields : ['Aluno(a)', 'Nº', 'Turma', 'Data', 'Nota'], primaryColor: '#173342', accentColor: '#e8a23a',
    fontFamily, borderStyle: documentXml.includes('<w:tblBorders>') ? 'boxed' : 'simple',
    margins: { top: twips('top', 1080), right: twips('right', 1080), bottom: twips('bottom', 1080), left: twips('left', 1080) },
    instructions, keepInstructions: instructions.length > 0,
    questionStyle: { showScore: /\([\d,.]+\)/.test(allText), alternativesStyle: 'A)' },
    answerLineStyle: { short: 3, medium: 5, long: 7 }, footer: xmlText(footerXml).slice(0, 200) || undefined,
    logoDataUrl, sourceType: 'docx',
  };
}

function dataUrlBytes(value?: string) {
  if (!value?.startsWith('data:image/')) return null;
  const [meta, payload] = value.split(',', 2);
  return { data: Buffer.from(payload || '', 'base64'), type: meta.includes('png') ? 'png' as const : 'jpg' as const };
}

const cleanLines = (content: string) => content.replace(/\r/g, '').split('\n').map((line) => line.trimEnd());

export async function buildAssessmentDocx(template: StoredSchoolTemplate, input: any): Promise<Buffer> {
  const border = template.borderStyle === 'none' ? BorderStyle.NONE : BorderStyle.SINGLE;
  const logo = dataUrlBytes(template.logoDataUrl);
  const headerChildren: Paragraph[] = [];
  if (logo) headerChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logo.data, type: logo.type, transformation: { width: 72, height: 72 } })] }));
  headerChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: template.schoolName, bold: true, size: 26, font: template.fontFamily })] }));
  for (const line of template.headerLines || []) headerChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: line, size: 18, font: template.fontFamily })] }));
  headerChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${input.title || 'AVALIAÇÃO'} DE ${(input.subject || '').toUpperCase()} — ${input.bimester || ''}º BIMESTRE`, bold: true, size: 22, font: template.fontFamily })] }));
  const cellBorders = { top: { style: border, size: 6, color: '173342' }, bottom: { style: border, size: 6, color: '173342' }, left: { style: border, size: 6, color: '173342' }, right: { style: border, size: 6, color: '173342' } };
  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: [new TableCell({ borders: cellBorders, children: headerChildren }), new TableCell({ borders: cellBorders, width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'NOTA: ______', bold: true })] }), new Paragraph({ children: [new TextRun({ text: 'DATA: ___/___/___', bold: true })] })] })] }),
    new TableRow({ children: [new TableCell({ borders: cellBorders, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: `ALUNO(A): ____________________________________  Nº: ____  ${input.grade || ''}  ${input.className || ''}`, bold: true })] }), new Paragraph({ children: [new TextRun({ text: `PROFESSOR(A): ${input.teacher || '________________'}   DISCIPLINA: ${input.subject || ''}` })] })] })] }),
  ] });
  const children: Array<Paragraph | Table> = [table];
  if (template.keepInstructions && template.instructions?.length) {
    children.push(new Paragraph({ spacing: { before: 180, after: 80 }, children: [new TextRun({ text: 'ORIENTAÇÕES', bold: true, size: 22 })] }));
    for (const item of template.instructions) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(item)] }));
  }
  for (const line of cleanLines(String(input.content || ''))) {
    if (/^GABARITO|RESPOSTAS? CORRETAS?/i.test(line)) break;
    if (!line) { children.push(new Paragraph('')); continue; }
    const isQuestion = /^(QUEST[ÃA]O\s*)?\d+[).:-]/i.test(line);
    children.push(new Paragraph({ keepNext: isQuestion, pageBreakBefore: /^---\s*P[ÁA]GINA/i.test(line), spacing: { before: isQuestion ? 180 : 30, after: 60 }, children: [new TextRun({ text: line, bold: isQuestion, font: template.fontFamily, size: isQuestion ? 22 : 20 })] }));
  }
  if (input.answerKey) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'GABARITO — USO DO PROFESSOR', bold: true, size: 26 })] }));
    for (const line of cleanLines(String(input.answerKey))) children.push(new Paragraph(line));
  }
  const footerText = template.footer || template.schoolName;
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: Math.round(template.margins.top * 20), right: Math.round(template.margins.right * 20), bottom: Math.round(template.margins.bottom * 20), left: Math.round(template.margins.left * 20) } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${footerText} · Página `, size: 16, font: template.fontFamily }), new TextRun({ children: [PageNumber.CURRENT], size: 16, font: template.fontFamily })] })] }) }, children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function buildAssessmentPdf(template: StoredSchoolTemplate, input: any): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = Math.max(34, Math.min(100, template.margins.left));
  let page = pdf.addPage([595.28, 841.89]); let y = 805;
  const addLine = (text: string, size = 10, isBold = false, indent = 0) => {
    const maxWidth = 595.28 - margin * 2 - indent; const words = text.split(/\s+/); let row = '';
    const rows: string[] = [];
    for (const word of words) { const next = row ? `${row} ${word}` : word; if ((isBold ? bold : font).widthOfTextAtSize(next, size) > maxWidth && row) { rows.push(row); row = word; } else row = next; }
    if (row) rows.push(row);
    for (const current of rows.length ? rows : ['']) { if (y < 48) { page = pdf.addPage([595.28, 841.89]); y = 805; } page.drawText(current, { x: margin + indent, y, size, font: isBold ? bold : font, color: rgb(0, 0, 0) }); y -= size * 1.45; }
  };
  const logo = dataUrlBytes(template.logoDataUrl);
  if (logo) { const embedded = logo.type === 'png' ? await pdf.embedPng(logo.data) : await pdf.embedJpg(logo.data); const scale = Math.min(62 / embedded.width, 62 / embedded.height); page.drawImage(embedded, { x: 595.28 - margin - embedded.width * scale, y: 770, width: embedded.width * scale, height: embedded.height * scale }); }
  addLine(template.schoolName.toUpperCase(), 14, true); for (const line of template.headerLines || []) addLine(line, 9);
  addLine(`${input.title || 'AVALIAÇÃO'} DE ${(input.subject || '').toUpperCase()} — ${input.bimester || ''}º BIMESTRE`, 12, true);
  addLine(`ALUNO(A): ____________________________________  Nº: ____  ${input.grade || ''}  ${input.className || ''}`, 9, true);
  addLine(`PROFESSOR(A): ${input.teacher || '________________'}   NOTA: ______   DATA: ___/___/___`, 9); y -= 8;
  if (template.keepInstructions && template.instructions?.length) { addLine('ORIENTAÇÕES', 11, true); for (const item of template.instructions) addLine(`• ${item}`, 9, false, 8); y -= 5; }
  for (const line of cleanLines(String(input.content || ''))) { if (/^GABARITO|RESPOSTAS? CORRETAS?/i.test(line)) break; addLine(line, 9.5, /^(QUEST[ÃA]O\s*)?\d+[).:-]/i.test(line)); }
  pdf.getPages().forEach((current, index) => { current.drawLine({ start: { x: margin, y: 31 }, end: { x: 595.28 - margin, y: 31 }, thickness: .7, color: rgb(.3,.4,.44) }); current.drawText(`${template.footer || template.schoolName} · Página ${index + 1}`, { x: margin, y: 17, size: 7.5, font, color: rgb(.25,.32,.36) }); });
  return Buffer.from(await pdf.save());
}
