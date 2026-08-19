import crypto from 'crypto';

export const BANNED_GENERICS_REGEX =
  /(introdução|conceitos fundamentais|conteúdos estruturantes|práticas pedagógicas|compreensão analítica|aplicação prática|fundamentos do movimento|cultura corporal|estudo e práticas|habilidades gerais|metodologias ativas da disciplina|fundamentos da educação|noções básicas|aspectos gerais|atividades gerais)/i;

/**
 * Detects whether a string is purely an editorial banner, watermark, page indicator or scanner artifact.
 */
export function isTechnicalMarker(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Standalone numbers or page indicators
  if (/^\d{1,4}$/.test(trimmed)) return true;
  if (/^[-=—–_~*#\s]*\[?\s*p[aá]gina\s*(\d+|[a-z0-9]+)?(\s*(de|\/|of)\s*\d+)?\s*\]?[-=—–_~*#\s:]*$/i.test(trimmed)) return true;
  if (/^[-=—–_~*#\s]*\[?\s*p[aá]g\.?\s*(\d+|[a-z0-9]+)?(\s*(de|\/|of)\s*\d+)?\s*\]?[-=—–_~*#\s:]*$/i.test(trimmed)) return true;
  if (/^[-=—–_~*#\s]*\[?\s*page\s*(\d+|[a-z0-9]+)?(\s*(de|\/|of)\s*\d+)?\s*\]?[-=—–_~*#\s:]*$/i.test(trimmed)) return true;
  if (/^p[aá]gina\s*(\d+|[a-z0-9]+)?\s*[-=—–_~*#:]+/i.test(trimmed)) return true;
  if (/^[-=—–_~*#:]+\s*p[aá]gina\s*(\d+|[a-z0-9]+)?/i.test(trimmed)) return true;
  if (/^p[aá]gina\s*(\d+|[a-z0-9]+)?$/i.test(trimmed)) return true;
  if (/^p[aá]g\.?\s*\d+$/i.test(trimmed)) return true;
  if (/^p[aá]gina$/i.test(trimmed)) return true;
  if (/^p[aá]g\.?$/i.test(trimmed)) return true;

  // Editorial headers & banners like "2 LINGUAGENS", "3 CIÊNCIAS HUMANAS", "LINGUAGENS E SUAS TECNOLOGIAS"
  if (/^(\d+\s+)?(linguagens|matem[aá]tica|ci[eê]ncias da natureza|ci[eê]ncias humanas)(\s+e suas tecnologias|\s+e sociais aplicadas)?$/i.test(trimmed)) return true;
  if (/^(caderno do aluno|caderno do professor|manual do professor|livro do estudante|livro do professor|ensino m[eé]dio|ensino fundamental)$/i.test(trimmed)) return true;
  if (/^volume\s*\d+(\s*[-–—:]\s*cap[ií]tulo\s*\d+)?$/i.test(trimmed)) return true;
  if (/^cap[ií]tulo\s*\d+$/i.test(trimmed)) return true;
  if (/^unidade\s*\d+$/i.test(trimmed)) return true;

  // Scanner artifacts & watermarks
  if (/^(digitalizado\s+com\s+camscanner|camscanner|adobe\s+scan|scanned\s+by|vFlat|scanner)/i.test(trimmed)) return true;
  if (/^(rodap[eé]|cabe[cç]alho\s+do\s+sistema|marca\s+d['']?[aá]gua|todos os direitos reservados)/i.test(trimmed)) return true;
  if (/stock\.adobe\.com|shutterstock|gettyimages|freepik/i.test(trimmed)) return true;
  if (/^[-=—–_~*#\s]+p[aá]gina/i.test(trimmed)) return true;
  if (/p[aá]gina\s*[-=—–_~*#\s]+$/i.test(trimmed)) return true;

  return false;
}

/**
 * Strips editorial noise, technical page markers, and scanner watermarks from a string.
 */
export function stripTechnicalMarkers(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let cleaned = text
    // Replace markdown/decorative page markers: "--- PÁGINA 1 ---", "=== PÁGINA X ===", "--- PÁGINA N"
    .replace(/[-=—–_~*#]{1,}\s*p[aá]gina\s*(\d+|[a-z0-9]+)?(\s*(de|\/|of)\s*\d+)?\s*[-=—–_~*#:]*/gi, '')
    // Replace trailing decorative page markers: "PÁGINA 1 ---", "PÁGINA N ---"
    .replace(/p[aá]gina\s*(\d+|[a-z0-9]+)?(\s*(de|\/|of)\s*\d+)?\s*[-=—–_~*#:]+/gi, '')
    // Replace bracketed page markers: "[PÁGINA 1]", "[PÁG 2]"
    .replace(/\[\s*(?:p[aá]gina|p[aá]g\.?|page)\s*\d+(\s*(?:de|\/|of)\s*\d+)?\s*\]/gi, '')
    // Replace standalone "PÁGINA 1", "PÁGINA 01", "PAGINA 12", "PÁG. 12", "Page 1 of 5" at line/string boundaries
    .replace(/(?:^|\n)\s*(?:p[aá]gina|p[aá]g\.?|page)\s*\d+(\s*(?:de|\/|of)\s*\d+)?\s*[-=—–_~*#:]*/gi, '\n')
    // Remove standalone editorial labels like "2 LINGUAGENS", "LINGUAGENS E SUAS TECNOLOGIAS" at boundary
    .replace(/(?:^|\n)\s*\d*\s*(?:LINGUAGENS|CIÊNCIAS HUMANAS|CIÊNCIAS DA NATUREZA|MATEMÁTICA)(?:\s+E SUAS TECNOLOGIAS|\s+E SOCIAIS APLICADAS)?\s*(?:\n|$)/gi, '\n')
    // Replace inline scanner watermarks
    .replace(/\b(digitalizado com camscanner|camscanner|adobe scan|scanned by [a-z0-9]+)\b/gi, '')
    .replace(/[-=—–_~*#]{2,}\s*p[aá]gina\s*[-=—–_~*#]*/gi, '')
    // Remove leading/trailing symbols, dashes, hashes, colons
    .replace(/^[#\s\-=_~*—–:]+/, '')
    .replace(/[#\s\-=_~*—–:]+$/, '')
    .trim();

  if (isTechnicalMarker(cleaned)) {
    return '';
  }
  return cleaned;
}

/**
 * Cleans the full OCR text, removing page headers/footers, editorial banners, and repeated noise.
 */
export function cleanOcrText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .split('\n')
    .map(line => stripTechnicalMarkers(line))
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true; // preserve paragraph breaks
      if (isTechnicalMarker(trimmed)) return false;
      if (/^[-=—–_~*#\s]*p[aá]gina/i.test(trimmed)) return false;
      if (/p[aá]gina\s*(\d+|[a-z0-9]+)?\s*[-=—–_~*#]+/i.test(trimmed)) return false;
      if (/^[-=—–_~*#]+\s*p[aá]gina/i.test(trimmed)) return false;
      if (/^p[aá]gina\s*\d+(\s*(de|\/|of)\s*\d+)?$/i.test(trimmed)) return false;
      if (/^p[aá]g\.?\s*\d+(\s*(de|\/|of)\s*\d+)?$/i.test(trimmed)) return false;
      if (/^page\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanTechnicalMarkersArray(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(item => (typeof item === 'string' ? stripTechnicalMarkers(item) : ''))
    .filter(item => item.length > 1 && !isTechnicalMarker(item) && !/^\d+$/.test(item));
}

export function limitToWords(text: string, maxWords: number = 8): string {
  if (!text || typeof text !== 'string') return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ');
}

/**
 * Separates Didactic Explanatory Text from Textbook/ENEM Exercises and Questions.
 * Guarantees that an exercise printed in the book is NEVER treated as taught theoretical content.
 */
export function separateDidacticContentFromQuestions(fullText: string): {
  conteudoDidatico: string;
  questoesMaterial: string[];
} {
  if (!fullText || typeof fullText !== 'string') {
    return { conteudoDidatico: '', questoesMaterial: [] };
  }

  const cleaned = cleanOcrText(fullText);
  const paragraphs = cleaned.split(/\n\s*\n/);

  const didacticParagraphs: string[] = [];
  const questionBlocks: string[] = [];

  const questionStartRegex =
    /^(?:quest[ãa]o\s*\d+|exerc[ií]cio\s*\d+|atividade\s*\d+|\(\s*enem\s*\d{4}\s*\)|enem\s*\d{4}|vestibular|\b\d{1,2}\s*[\.\)]\s*(?:\([a-e]\)|[a-e]\b|\b[A-Z]))/i;
  const alternativesRegex = /(?:^|\n)\s*(?:[a-e]\)|\([a-e]\)|[a-e]\.\s+)/i;

  let currentQuestion = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const isQuestion = questionStartRegex.test(trimmed) || alternativesRegex.test(trimmed) || /gabarito|alternativa\s+[a-e]/i.test(trimmed);

    if (isQuestion) {
      if (currentQuestion) {
        questionBlocks.push(currentQuestion.trim());
      }
      currentQuestion = trimmed;
    } else {
      if (currentQuestion) {
        // If this paragraph continues the question (e.g. further alternatives)
        if (alternativesRegex.test(trimmed) || trimmed.length < 120) {
          currentQuestion += '\n\n' + trimmed;
        } else {
          questionBlocks.push(currentQuestion.trim());
          currentQuestion = '';
          didacticParagraphs.push(trimmed);
        }
      } else {
        didacticParagraphs.push(trimmed);
      }
    }
  }

  if (currentQuestion) {
    questionBlocks.push(currentQuestion.trim());
  }

  return {
    conteudoDidatico: didacticParagraphs.join('\n\n').trim(),
    questoesMaterial: questionBlocks,
  };
}

/**
 * Computes a deterministic MD5/SHA256 fingerprint hash of the material inputs.
 */
export function generateMaterialHash(
  ocrText: string = '',
  images: Array<{ base64?: string; type?: string; mimeType?: string }> = [],
  disciplina: string = '',
  segmento: string = '',
  ano: string = ''
): string {
  const hasher = crypto.createHash('sha256');
  
  // Normalize OCR text
  const normOcr = (ocrText || '').trim().replace(/\s+/g, ' ');
  hasher.update(`ocr:${normOcr}`);
  hasher.update(`disc:${disciplina.trim().toLowerCase()}`);
  hasher.update(`seg:${segmento.trim().toLowerCase()}`);
  hasher.update(`ano:${ano.trim().toLowerCase()}`);

  if (Array.isArray(images) && images.length > 0) {
    for (const img of images) {
      const b64 = (img.base64 || '').slice(0, 1024); // sample first 1KB of image data
      hasher.update(`img:${img.type || img.mimeType || ''}:${b64.length}:${b64}`);
    }
  }

  return hasher.digest('hex').slice(0, 32);
}
