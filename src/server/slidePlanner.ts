import { randomUUID } from 'crypto';
import { GeneratedSlide, SlideDeck, SlideLayoutType, SlideVisualType } from '../types/slides';

export const VISUAL_TYPES: SlideVisualType[] = ['HERO','COMPARE','PROCESS','CYCLE','TIMELINE','INFOGRAPHIC','STATISTIC','ANATOMY','CARDS','PYRAMID','QUESTION','SUMMARY','CONCEPT_MAP','CAUSE_EFFECT'];
export const LAYOUT_TYPES: SlideLayoutType[] = ['cover','cards','columns','timeline','highlight','comparison','visual-list','activity','hero','process','cycle','statistic','anatomy','pyramid','concept-map','cause-effect'];

const visualLayout: Record<SlideVisualType, SlideLayoutType> = {
  HERO: 'hero', COMPARE: 'comparison', PROCESS: 'process', CYCLE: 'cycle', TIMELINE: 'timeline',
  INFOGRAPHIC: 'visual-list', STATISTIC: 'statistic', ANATOMY: 'anatomy', CARDS: 'cards',
  PYRAMID: 'pyramid', QUESTION: 'activity', SUMMARY: 'highlight', CONCEPT_MAP: 'concept-map', CAUSE_EFFECT: 'cause-effect',
};

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
  const needsImage = Boolean(raw?.needsImage) && ['HERO','COMPARE','INFOGRAPHIC','STATISTIC','ANATOMY','PYRAMID'].includes(visualType);
  return {
    id: randomUUID(), title: String(raw?.title || `Slide ${index + 1}`).trim(), subtitle: String(raw?.subtitle || '').trim(),
    learningObjective: String(raw?.learningObjective || '').trim(), keyMessage: String(raw?.keyMessage || '').trim(),
    content: bullets, bullets, visualType, layoutType: LAYOUT_TYPES.includes(raw?.layoutType) ? raw.layoutType : visualLayout[visualType],
    layout: LAYOUT_TYPES.includes(raw?.layoutType) ? raw.layoutType : visualLayout[visualType], imagePrompt: String(raw?.imagePrompt || '').trim(),
    needsImage, graphicElements: (Array.isArray(raw?.graphicElements) ? raw.graphicElements : []).map(String).slice(0, 8),
    visualHint: String(raw?.visualHint || '').trim(), speakerNotes: audience === 'professor' && includeNotes ? String(raw?.speakerNotes || '').trim() : '',
    answer: audience === 'professor' ? String(raw?.answer || '').trim() : '', bnccSkills: (Array.isArray(raw?.bnccSkills) ? raw.bnccSkills : []).map(String).slice(0, 8),
    sourceReferences: (Array.isArray(raw?.sourceReferences) ? raw.sourceReferences : []).map(String).slice(0, 12), assetStatus: needsImage ? 'pending' : 'not_required',
  };
}

export function presentationProgress(deck: SlideDeck | null, stage: string): number {
  if (!deck) return stage === 'planning' ? 15 : 5;
  const required = deck.slides.filter((slide) => slide.needsImage);
  const ready = required.filter((slide) => ['ready','fallback'].includes(slide.assetStatus || '')).length;
  if (stage === 'completed') return 100;
  if (stage === 'reviewing') return 95;
  return required.length ? 40 + Math.round((ready / required.length) * 50) : 90;
}
