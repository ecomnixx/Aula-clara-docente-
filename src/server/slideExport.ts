import { GeneratedSlide, SlideDeck } from '../types/slides';
import { validateSlideDeck } from './slidePlanner';

const palettes: Record<string, { background: string; primary: string; accent: string; text: string }> = {
  colorido: { background: 'FFF7ED', primary: '1E5B73', accent: 'F97316', text: '173342' }, moderno: { background: 'F1F5F9', primary: '0F172A', accent: '38BDF8', text: '1E293B' },
  infantil: { background: 'FFF7D6', primary: '7C3AED', accent: 'F43F5E', text: '312E81' }, fundamental: { background: 'ECFDF5', primary: '0F766E', accent: 'F59E0B', text: '164E63' },
  medio: { background: 'EFF6FF', primary: '1E3A8A', accent: '7C3AED', text: '172554' }, minimalista: { background: 'FAFAF9', primary: '292524', accent: '78716C', text: '1C1917' },
  criativo: { background: 'FDF4FF', primary: '86198F', accent: '06B6D4', text: '3B0764' }, automatico: { background: 'F4F7F6', primary: '1E5B73', accent: 'E8A23A', text: '173342' },
};

const clean = (value: string) => String(value || '').replace(/(?:Fonte\s*\d+|Screenshot[_\s-][^\n]+|[A-Za-z]:\\[^\n]+)/gi, 'material didático').trim();
const visualItems = (item: GeneratedSlide) => (item.bullets.length ? item.bullets : item.graphicElements || ['Ideia central']).slice(0, 5);

function assertVisualsReady(deck: SlideDeck) {
  const blocking = validateSlideDeck(deck).filter((issue) => issue.severity === 'error');
  if (blocking.length) throw new Error(`Exportação bloqueada: ${blocking.map((issue) => issue.message).join(' ')}`);
}

function addPptxProgrammatic(pptx: any, slide: any, item: GeneratedSlide, palette: any) {
  const values = visualItems(item); const type = item.visualType || 'CARDS';
  if (type === 'PYRAMID') {
    values.slice(0, 4).reverse().forEach((value, i, arr) => { const w = 4.2 + i * 1.65; const x = (13.34 - w) / 2; const y = 1.75 + i * 1.05; slide.addShape(pptx.ShapeType.chevron, { x, y, w, h: .84, fill: { color: i % 2 ? palette.primary : palette.accent, transparency: i * 4 }, line: { color: 'FFFFFF', transparency: 45 } }); slide.addText(clean(value), { x: x + .35, y: y + .2, w: w - .7, h: .3, align: 'center', fontFace: 'Aptos', fontSize: 15, bold: true, color: 'FFFFFF', margin: 0, fit: 'shrink' }); }); return;
  }
  if (type === 'CYCLE') {
    const points = [[5.5,1.5],[8.0,2.55],[7.05,4.8],[3.95,4.8],[3.0,2.55]]; values.forEach((value, i) => { const [x,y] = points[i]; slide.addShape(pptx.ShapeType.ellipse, { x, y, w: 2.25, h: 1.15, fill: { color: i % 2 ? palette.primary : palette.accent }, line: { color: 'FFFFFF', width: 1.5 } }); slide.addText(clean(value), { x: x + .18, y: y + .3, w: 1.89, h: .42, align: 'center', fontFace: 'Aptos', fontSize: 13, bold: true, color: 'FFFFFF', margin: 0, fit: 'shrink' }); }); return;
  }
  const horizontal = ['PROCESS','TIMELINE','CAUSE_EFFECT','CONCEPT_MAP'].includes(type);
  const columns = type === 'COMPARE' ? 2 : type === 'CARDS' || type === 'INFOGRAPHIC' || type === 'STATISTIC' ? Math.min(3, values.length) : values.length;
  if (horizontal) slide.addShape(pptx.ShapeType.line, { x: 1.4, y: 3.65, w: 10.5, h: 0, line: { color: palette.accent, width: 4, beginArrowType: 'none', endArrowType: type === 'TIMELINE' ? 'none' : 'triangle' } });
  values.forEach((value, i) => {
    const col = horizontal ? i : i % columns; const row = horizontal ? 0 : Math.floor(i / columns);
    const w = horizontal ? Math.min(2.05, 10.8 / values.length) : (11.2 - (columns - 1) * .35) / columns;
    const x = horizontal ? 1.0 + i * (11.25 / values.length) : 1.05 + col * (w + .35); const y = horizontal ? 2.65 + (i % 2) * 1.85 : 1.8 + row * 1.7;
    if (type === 'STATISTIC') slide.addShape(pptx.ShapeType.rect, { x: x + w * .25, y: y + (i % 3) * .22, w: w * .5, h: 2.5 - (i % 3) * .22, fill: { color: i % 2 ? palette.primary : palette.accent }, line: { color: palette.background, transparency: 100 } });
    else slide.addShape(type === 'CONCEPT_MAP' && i === 0 ? pptx.ShapeType.ellipse : pptx.ShapeType.roundRect, { x, y, w, h: 1.15, rectRadius: .05, fill: { color: i % 2 ? palette.primary : palette.accent, transparency: type === 'COMPARE' ? 5 : 0 }, line: { color: 'FFFFFF', transparency: 20 }, shadow: { type: 'outer', color: '000000', opacity: .12, blur: 1, angle: 45 } });
    slide.addText(clean(value), { x: x + .18, y: type === 'STATISTIC' ? 5.25 : y + .28, w: w - .36, h: .52, align: 'center', valign: 'middle', fontFace: 'Aptos', fontSize: 14, bold: true, color: type === 'STATISTIC' ? palette.text : 'FFFFFF', margin: .02, fit: 'shrink' });
  });
}

export async function createEditablePptx(deck: SlideDeck): Promise<Buffer> {
  assertVisualsReady(deck); const pptxgen = (await import('pptxgenjs')).default; const pptx = new pptxgen();
  pptx.layout = deck.ratio === '4:3' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE'; pptx.author = 'Aula Clara'; pptx.subject = `${deck.disciplina} — ${deck.anoSerie}`; pptx.title = deck.title; pptx.company = 'Aula Clara';
  const palette = palettes[deck.style] || palettes.automatico;
  deck.slides.forEach((item, index) => {
    const slide = pptx.addSlide(); slide.background = { color: palette.background }; const hasImage = Boolean(item.assetDataUrl?.startsWith('data:image/'));
    if (hasImage) { slide.addImage({ data: item.assetDataUrl!, x: index === 0 ? 0 : 7.55, y: index === 0 ? 0 : 1.25, w: index === 0 ? 13.34 : 5.15, h: index === 0 ? 7.5 : 5.15 }); slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.34, h: 7.5, fill: { color: '071923', transparency: index === 0 ? 36 : 100 }, line: { color: '071923', transparency: 100 } }); }
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.34, h: .22, fill: { color: palette.accent }, line: { color: palette.accent } });
    slide.addText(clean(item.title), { x: .72, y: .52, w: hasImage && index > 0 ? 6.4 : 11.8, h: index === 0 ? 1.05 : .72, fontFace: 'Aptos Display', fontSize: index === 0 ? 31 : 25, bold: true, color: hasImage && index === 0 ? 'FFFFFF' : palette.primary, margin: .04, fit: 'shrink' });
    if (index === 0 && hasImage) slide.addText(`${clean(deck.tema)}\n${clean(deck.disciplina)} · ${clean(deck.anoSerie)}`, { x: .9, y: 2.2, w: 6.4, h: 2, fontFace: 'Aptos', fontSize: 22, bold: true, color: 'FFFFFF', margin: .05, valign: 'middle', fit: 'shrink' });
    else if (item.visualKind === 'programmatic' || item.assetStatus === 'fallback') addPptxProgrammatic(pptx, slide, item, palette);
    else item.bullets.slice(0, 6).forEach((bullet, i) => { const x=.85, y=1.55+i*.82, w=hasImage?6.25:11.55; slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h:.64,rectRadius:.04,fill:{color:'FFFFFF'},line:{color:palette.accent,transparency:25}}); slide.addText(clean(bullet),{x:x+.25,y:y+.13,w:w-.5,h:.36,fontFace:'Aptos',fontSize:17,color:palette.text,margin:0,fit:'shrink'}); });
    slide.addText(`${index + 1}`, { x: 12.25, y: 7.05, w: .45, h: .2, fontSize: 9, color: palette.primary, align: 'right', margin: 0 }); if (deck.includeNotes && deck.audience === 'professor' && item.speakerNotes) slide.addNotes(clean(item.speakerNotes));
  });
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }) as ArrayBuffer);
}

export async function createSlidesDocx(deck: SlideDeck): Promise<Buffer> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx'); const children: InstanceType<typeof Paragraph>[] = [new Paragraph({ text: deck.title, heading: HeadingLevel.TITLE }), new Paragraph({ children: [new TextRun({ text: `${deck.disciplina} · ${deck.anoSerie}`, bold: true })] })];
  deck.slides.forEach((slide, index) => { children.push(new Paragraph({ text: `Slide ${index + 1} — ${clean(slide.title)}`, heading: HeadingLevel.HEADING_1 })); slide.bullets.forEach((bullet) => children.push(new Paragraph({ text: clean(bullet), bullet: { level: 0 } }))); }); return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

export async function createSlidesPdf(deck: SlideDeck): Promise<Buffer> {
  assertVisualsReady(deck); const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib'); const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const size: [number, number] = deck.ratio === '4:3' ? [720,540] : deck.ratio === 'A4' ? [842,595] : [960,540];
  for (const [index, slide] of deck.slides.entries()) { const page = pdf.addPage(size); const { width,height }=page.getSize(); page.drawRectangle({x:0,y:0,width,height,color:rgb(.95,.97,.97)}); page.drawRectangle({x:0,y:height-16,width,height:16,color:rgb(.12,.36,.45)});
    if (slide.assetDataUrl?.startsWith('data:image/')) { const [,mime,b64]=slide.assetDataUrl.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/s)||[]; if (b64) { const image=mime==='image/png'?await pdf.embedPng(Buffer.from(b64,'base64')):await pdf.embedJpg(Buffer.from(b64,'base64')); const scale=Math.min((width*.46)/image.width,(height*.68)/image.height); page.drawImage(image,{x:width*.51,y:height*.15,width:image.width*scale,height:image.height*scale}); } }
    page.drawText(clean(slide.title).slice(0,70),{x:48,y:height-70,size:25,font:bold,color:rgb(.09,.2,.26)}); const values=visualItems(slide);
    if (slide.visualKind==='programmatic'||slide.assetStatus==='fallback') values.forEach((value,i)=>{const cols=slide.visualType==='COMPARE'?2:Math.min(3,values.length);const w=(width-120-(cols-1)*16)/cols;const x=50+(i%cols)*(w+16);const y=height-150-Math.floor(i/cols)*105;page.drawRectangle({x,y:y-62,width:w,height:70,color:i%2?rgb(.12,.36,.45):rgb(.91,.64,.23),borderColor:rgb(1,1,1),borderWidth:1});page.drawText(clean(value).slice(0,42),{x:x+12,y:y-29,size:12,font:bold,color:rgb(1,1,1),maxWidth:w-24});});
    else slide.bullets.slice(0,6).forEach((bullet,i)=>page.drawText(`• ${clean(bullet).slice(0,75)}`,{x:55,y:height-125-i*48,size:14,font,color:rgb(.1,.22,.28),maxWidth:slide.assetDataUrl?width*.43:width-110})); page.drawText(`${index+1}`,{x:width-38,y:20,size:9,font,color:rgb(.25,.38,.43)});
  } return Buffer.from(await pdf.save());
}
