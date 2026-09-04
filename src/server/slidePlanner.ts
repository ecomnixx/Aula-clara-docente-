import { randomUUID } from 'crypto';
import { GeneratedSlide, SlideDeck, SlideLayoutType, SlideValidationIssue, SlideVisualKind, SlideVisualType } from '../types/slides';

export const VISUAL_TYPES: SlideVisualType[] = ['HERO','COMPARE','PROCESS','CYCLE','TIMELINE','INFOGRAPHIC','STATISTIC','ANATOMY','CARDS','PYRAMID','QUESTION','SUMMARY','CONCEPT_MAP','CAUSE_EFFECT'];
export const LAYOUT_TYPES: SlideLayoutType[] = ['cover','cards','columns','timeline','highlight','comparison','visual-list','activity','hero','process','cycle','statistic','anatomy','pyramid','concept-map','cause-effect'];

const visualLayout: Record<SlideVisualType, SlideLayoutType> = {
  HERO: 'hero', COMPARE: 'comparison', PROCESS: 'process', CYCLE: 'cycle', TIMELINE: 'timeline',
  INFOGRAPHIC: 'visual-list', STATISTIC: 'statistic', ANATOMY: 'anatomy', CARDS: 'cards',
  PYRAMID: 'pyramid', QUESTION: 'activity', SUMMARY: 'highlight', CONCEPT_MAP: 'concept-map', CAUSE_EFFECT: 'cause-effect',
};

const GENERATED_IMAGE_TYPES = new Set<SlideVisualType>(['HERO', 'ANATOMY']);
const PROGRAMMATIC_VISUAL_TYPES = new Set<SlideVisualType>(['COMPARE', 'PROCESS', 'CYCLE', 'TIMELINE', 'INFOGRAPHIC', 'STATISTIC', 'CARDS', 'PYRAMID', 'CONCEPT_MAP', 'CAUSE_EFFECT']);

export function visualPolicy(visualType: SlideVisualType, aiRequestedImage = false): { visualRequired: boolean; visualKind: SlideVisualKind; needsImage: boolean } {
  if (GENERATED_IMAGE_TYPES.has(visualType)) return { visualRequired: true, visualKind: 'generated_image', needsImage: true };
  if (PROGRAMMATIC_VISUAL_TYPES.has(visualType)) return { visualRequired: true, visualKind: 'programmatic', needsImage: false };
  if (aiRequestedImage) return { visualRequired: false, visualKind: 'generated_image', needsImage: true };
  return { visualRequired: false, visualKind: 'none', needsImage: false };
}

export function unresolvedRequiredVisuals(deck: SlideDeck): GeneratedSlide[] {
  return deck.slides.filter((slide) => slide.visualRequired && !['ready', 'fallback'].includes(slide.assetStatus || ''));
}

export function validateSlideDeck(deck: SlideDeck): SlideValidationIssue[] {
  const issues: SlideValidationIssue[] = [];
  if (!['16:9', '4:3', 'A4'].includes(deck.ratio)) issues.push({ code: 'INVALID_RATIO', severity: 'error', message: 'Proporção de apresentação inválida.' });
  for (const slide of deck.slides) {
    const words = [slide.title, slide.subtitle, ...slide.bullets].filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;
    if (!slide.title.trim() && slide.bullets.length === 0) issues.push({ slideId: slide.id, code: 'EMPTY_SLIDE', severity: 'error', message: 'O slide está vazio.' });
    if (words > 85 || slide.bullets.length > 6) issues.push({ slideId: slide.id, code: 'TOO_MUCH_TEXT', severity: 'warning', message: 'Reduza o texto para melhorar a leitura.' });
    if (slide.bullets.some((line) => line.length > 180)) issues.push({ slideId: slide.id, code: 'LONG_LINE', severity: 'warning', message: 'Há uma linha longa demais para o layout.' });
    if (slide.visualRequired && !['ready', 'fallback'].includes(slide.assetStatus || '')) issues.push({ slideId: slide.id, code: 'VISUAL_PENDING', severity: 'error', message: 'O recurso visual obrigatório ainda não está pronto.' });
    if (slide.assetStatus === 'ready' && slide.visualKind === 'generated_image' && !/^data:image\/(png|jpeg|webp);base64,/i.test(slide.assetDataUrl || '')) issues.push({ slideId: slide.id, code: 'INVALID_IMAGE', severity: 'error', message: 'A imagem gerada não pôde ser validada.' });
  }
  return issues;
}

export function resolveSlideCount(value: unknown, materialLength = 0): number {
  if (value === 'automatico') return Math.max(5, Math.min(15, Math.round(materialLength / 2200) || 8));
  return Math.max(3, Math.min(20, Number(value) || 8));
}

export function buildVisualPrompt(slide: Pick<GeneratedSlide, 'title' | 'keyMessage' | 'visualType' | 'graphicElements'>, context: { disciplina: string; segmento: string; ano: string; tema: string; style: string }): string {
  const age = `${context.segmento}, ${context.ano}`;
  return [
    `Create a premium educational presentation visual in 16:9 landscape for ${age}.`,
    `Subject: ${context.disciplina}. Theme: ${context.tema}. Slide concept: ${slide.title}.`,
    `Communicate visually: ${slide.keyMessage || slide.title}. Visual grammar: ${slide.visualType || 'INFOGRAPHIC'}.`,
    `Suggested elements: ${(slide.graphicElements || []).join(', ') || 'clear symbolic educational illustration'}.`,
    `Art direction: ${context.style}, editorial infographic quality, strong hierarchy, balanced negative space, coherent palette, scientifically accurate, age appropriate, no logos, no watermark.`,
    'Reserve clean negative space for editable title and explanatory text added later by the application.',
    'NO TEXT, NO LETTERS, NO WORDS, NO NUMBERS, NO LABELS, NO TYPOGRAPHY.',
  ].join(' ');
}

export function normalizeSlide(raw: any, index: number, includeNotes: boolean, audience: string): GeneratedSlide {
  const visualType = VISUAL_TYPES.includes(raw?.visualType) ? raw.visualType : (index === 0 ? 'HERO' : 'CARDS');
  const bullets = (Array.isArray(raw?.content) ? raw.content : Array.isArray(raw?.bullets) ? raw.bullets : [])
    .map((item: unknown) => String(item || '').trim()).filter(Boolean).slice(0, 6);
  const policy = visualPolicy(visualType, Boolean(raw?.needsImage));
  return {
    id: randomUUID(), title: String(raw?.title || `Slide ${index + 1}`).trim(), subtitle: String(raw?.subtitle || '').trim(),
    learningObjective: String(raw?.learningObjective || '').trim(), keyMessage: String(raw?.keyMessage || '').trim(),
    content: bullets, bullets, visualType, layoutType: LAYOUT_TYPES.includes(raw?.layoutType) ? raw.layoutType : visualLayout[visualType],
    layout: LAYOUT_TYPES.includes(raw?.layoutType) ? raw.layoutType : visualLayout[visualType], imagePrompt: String(raw?.imagePrompt || '').trim(),
    ...policy, graphicElements: (Array.isArray(raw?.graphicElements) ? raw.graphicElements : []).map(String).slice(0, 8),
    visualHint: String(raw?.visualHint || '').trim(), speakerNotes: audience === 'professor' && includeNotes ? String(raw?.speakerNotes || '').trim() : '',
    answer: audience === 'professor' ? String(raw?.answer || '').trim() : '', bnccSkills: (Array.isArray(raw?.bnccSkills) ? raw.bnccSkills : []).map(String).slice(0, 8),
    sourceReferences: (Array.isArray(raw?.sourceReferences) ? raw.sourceReferences : []).map(String).slice(0, 12),
    assetStatus: policy.visualKind === 'generated_image' ? 'pending' : policy.visualKind === 'programmatic' ? 'ready' : 'not_required',
  };
}

export function presentationProgress(deck: SlideDeck | null, stage: string): number {
  if (!deck) return stage === 'planning' ? 15 : 5;
  const required = deck.slides.filter((slide) => slide.visualRequired || slide.needsImage);
  const ready = required.filter((slide) => ['ready','fallback'].includes(slide.assetStatus || '')).length;
  if (stage === 'completed') return 100;
  if (stage === 'reviewing') return 95;
  return required.length ? 40 + Math.round((ready / required.length) * 50) : 90;
}
