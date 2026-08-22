import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PreparedSourcePage {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  originalFilename: string;
}

async function canvasToFile(canvas: HTMLCanvasElement, filename: string, quality = 0.88): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao preparar a página.')), 'image/jpeg', quality)
  );
  return new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() });
}

export async function prepareImage(file: File): Promise<PreparedSourcePage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maxSide = 2400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('O navegador não conseguiu preparar esta imagem.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.9;
  let normalized = await canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '') + '.jpg', quality);
  while (normalized.size > 4_500_000 && quality > 0.56) {
    quality -= 0.08;
    normalized = await canvasToFile(canvas, normalized.name, quality);
  }
  return { file: normalized, previewUrl: URL.createObjectURL(normalized), width, height, originalFilename: file.name };
}

export async function preparePdf(file: File): Promise<PreparedSourcePage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: PreparedSourcePage[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const initial = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, 2200 / Math.max(initial.width, initial.height));
    const viewport = page.getViewport({ scale: Math.max(1.4, scale) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`Não foi possível preparar a página ${pageNumber} do PDF.`);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const pageFile = await canvasToFile(canvas, `${file.name.replace(/\.pdf$/i, '')}-pagina-${String(pageNumber).padStart(3, '0')}.jpg`);
    pages.push({
      file: pageFile,
      previewUrl: URL.createObjectURL(pageFile),
      width: canvas.width,
      height: canvas.height,
      originalFilename: `${file.name} · página ${pageNumber}`,
    });
  }
  return pages;
}

export async function prepareSourceFiles(files: File[]): Promise<PreparedSourcePage[]> {
  const result: PreparedSourcePage[] = [];
  for (const file of files) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      result.push(...await preparePdf(file));
    } else if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) {
      result.push(await prepareImage(file));
    } else {
      throw new Error(`Formato não suportado: ${file.name}. Use JPG, PNG, WEBP ou PDF.`);
    }
  }
  return result;
}

export function fileToPureBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
