import { SlideDeck } from '../types/slides';

const palettes: Record<string, { background: string; primary: string; accent: string; text: string }> = {
  colorido: { background: 'FFF7ED', primary: '1E5B73', accent: 'F97316', text: '173342' },
  moderno: { background: 'F1F5F9', primary: '0F172A', accent: '38BDF8', text: '1E293B' },
  infantil: { background: 'FFF7D6', primary: '7C3AED', accent: 'F43F5E', text: '312E81' },
  fundamental: { background: 'ECFDF5', primary: '0F766E', accent: 'F59E0B', text: '164E63' },
  medio: { background: 'EFF6FF', primary: '1E3A8A', accent: '7C3AED', text: '172554' },
  minimalista: { background: 'FAFAF9', primary: '292524', accent: '78716C', text: '1C1917' },
  criativo: { background: 'FDF4FF', primary: '86198F', accent: '06B6D4', text: '3B0764' },
  automatico: { background: 'F4F7F6', primary: '1E5B73', accent: 'E8A23A', text: '173342' },
};

const clean = (value: string) => String(value || '').replace(/(?:Fonte\s*\d+|Screenshot[_\s-][^\n]+|[A-Za-z]:\\[^\n]+)/gi, 'material didático').trim();

export async function createEditablePptx(deck: SlideDeck): Promise<Buffer> {
  const pptxgen = (await import('pptxgenjs')).default;
  const pptx = new pptxgen();
  pptx.layout = deck.ratio === '4:3' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE';
  pptx.author = 'Aula Clara';
  pptx.subject = `${deck.disciplina} — ${deck.anoSerie}`;
  pptx.title = deck.title;
  pptx.company = 'Aula Clara';
  const palette = palettes[deck.style] || palettes.automatico;

  deck.slides.forEach((item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: palette.background };
    const hasGeneratedVisual = Boolean(item.assetDataUrl?.startsWith('data:image/'));
    if (hasGeneratedVisual) {
      if (index === 0 || item.layout === 'hero') {
        slide.addImage({ data: item.assetDataUrl!, x: 0, y: 0, w: 13.34, h: 7.5 });
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.34, h: 7.5, fill: { color: '071923', transparency: 32 }, line: { color: '071923', transparency: 100 } });
      } else {
        slide.addImage({ data: item.assetDataUrl!, x: 7.72, y: 1.38, w: 5, h: 4.85 });
        slide.addShape(pptx.ShapeType.roundRect, { x: 7.62, y: 1.28, w: 5.2, h: 5.05, rectRadius: 0.05, fill: { color: 'FFFFFF', transparency: 100 }, line: { color: palette.accent, transparency: 28, width: 1.2 } });
      }
    }
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.34, h: 0.24, fill: { color: palette.accent }, line: { color: palette.accent } });
    slide.addShape(pptx.ShapeType.ellipse, { x: 11.75, y: 0.48, w: 1.05, h: 1.05, fill: { color: palette.accent, transparency: 78 }, line: { color: palette.accent, transparency: 100 } });
    slide.addShape(pptx.ShapeType.ellipse, { x: 11.35, y: 0.8, w: 0.52, h: 0.52, fill: { color: palette.primary, transparency: 72 }, line: { color: palette.primary, transparency: 100 } });
    slide.addText(clean(item.title), { x: 0.7, y: 0.55, w: hasGeneratedVisual && index > 0 ? 6.7 : 11.9, h: index === 0 ? 1.05 : 0.75, fontFace: 'Aptos Display', fontSize: index === 0 ? 30 : 25, bold: true, color: hasGeneratedVisual && index === 0 ? 'FFFFFF' : palette.primary, margin: 0.05, breakLine: false, fit: 'shrink' });
    if (index === 0) {
      if (!hasGeneratedVisual) slide.addShape(pptx.ShapeType.roundRect, { x: 0.7, y: 1.65, w: 11.9, h: 3.9, rectRadius: 0.08, fill: { color: palette.primary, transparency: 4 }, line: { color: palette.primary } });
      slide.addText(`${clean(deck.tema)}\n${clean(deck.disciplina)} · ${clean(deck.anoSerie)}`, { x: 1.1, y: 2.25, w: 11.1, h: 2.2, fontFace: 'Aptos', fontSize: 23, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0.1 });
    } else {
      const columns = !hasGeneratedVisual && (item.layout === 'columns' || item.layout === 'comparison');
      const bullets = item.bullets.slice(0, 6);
      bullets.forEach((bullet, bulletIndex) => {
        const col = columns ? bulletIndex % 2 : 0;
        const row = columns ? Math.floor(bulletIndex / 2) : bulletIndex;
        const x = columns ? 0.75 + col * 6.15 : 0.85;
        const y = 1.55 + row * (columns ? 1.35 : 0.82);
        const w = columns ? 5.65 : hasGeneratedVisual ? 6.35 : 11.65;
        slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: columns ? 1.05 : 0.64, rectRadius: 0.04, fill: { color: 'FFFFFF', transparency: 2 }, line: { color: palette.accent, transparency: 25, width: 1.2 }, shadow: { type: 'outer', color: '000000', opacity: 0.10, blur: 1, angle: 45 } });
        slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.12, y: y + (columns ? 0.34 : 0.17), w: 0.28, h: 0.28, fill: { color: palette.accent }, line: { color: palette.accent } });
        slide.addText(String(bulletIndex + 1), { x: x + 0.12, y: y + (columns ? 0.36 : 0.19), w: 0.28, h: 0.16, fontSize: 8, bold: true, color: 'FFFFFF', align: 'center', margin: 0 });
        slide.addText(clean(bullet), { x: x + 0.5, y: y + 0.08, w: w - 0.68, h: columns ? 0.84 : 0.46, fontFace: 'Aptos', fontSize: columns ? 15 : 17, color: palette.text, margin: 0.02, valign: 'middle', breakLine: false, fit: 'shrink' });
      });
      if (item.visualHint) {
        slide.addShape(pptx.ShapeType.roundRect, { x: 0.85, y: 6.35, w: 10.9, h: 0.42, rectRadius: 0.04, fill: { color: palette.primary, transparency: 4 }, line: { color: palette.primary } });
        slide.addText(`✦ ${clean(item.visualHint)}`, { x: 1.05, y: 6.43, w: 10.5, h: 0.2, fontFace: 'Aptos', fontSize: 10, color: 'FFFFFF', margin: 0, fit: 'shrink' });
      }
    }
    slide.addText(`${index + 1}`, { x: 12.25, y: 7.05, w: 0.45, h: 0.2, fontSize: 9, color: palette.primary, align: 'right', margin: 0 });
    if (deck.includeNotes && deck.audience === 'professor' && item.speakerNotes) slide.addNotes(clean(item.speakerNotes));
  });

  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }) as ArrayBuffer);
}

export async function createSlidesDocx(deck: SlideDeck): Promise<Buffer> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: deck.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `${deck.disciplina} · ${deck.anoSerie}`, bold: true })] }),
  ];
  deck.slides.forEach((slide, index) => {
    children.push(new Paragraph({ text: `Slide ${index + 1} — ${clean(slide.title)}`, heading: HeadingLevel.HEADING_1 }));
    slide.bullets.forEach((bullet) => children.push(new Paragraph({ text: clean(bullet), bullet: { level: 0 } })));
    if (deck.includeNotes && deck.audience === 'professor' && slide.speakerNotes) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Notas do professor: ${clean(slide.speakerNotes)}`, italics: true })] }));
    }
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

export async function createSlidesPdf(deck: SlideDeck): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size: [number, number] = deck.ratio === '4:3' ? [720, 540] : deck.ratio === 'A4' ? [842, 595] : [960, 540];
  deck.slides.forEach((slide, index) => {
    const page = pdf.addPage(size);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.95, 0.97, 0.97) });
    page.drawRectangle({ x: 0, y: height - 16, width, height: 16, color: rgb(0.12, 0.36, 0.45) });
    page.drawText(clean(slide.title).slice(0, 70), { x: 48, y: height - 70, size: 25, font: bold, color: rgb(0.09, 0.2, 0.26) });
    slide.bullets.slice(0, 6).forEach((bullet, bulletIndex) => {
      const y = height - 125 - bulletIndex * 62;
      page.drawRectangle({ x: 50, y: y - 26, width: width - 100, height: 44, color: rgb(1, 1, 1), borderColor: rgb(0.75, 0.83, 0.85), borderWidth: 1 });
      page.drawText(`• ${clean(bullet).slice(0, 115)}`, { x: 65, y: y - 9, size: 14, font, color: rgb(0.1, 0.22, 0.28) });
    });
    page.drawText(`${index + 1}`, { x: width - 38, y: 20, size: 9, font, color: rgb(0.25, 0.38, 0.43) });
  });
  return Buffer.from(await pdf.save());
}
