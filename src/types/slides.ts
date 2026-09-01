export type SlideStyle = 'automatico' | 'colorido' | 'moderno' | 'infantil' | 'fundamental' | 'medio' | 'minimalista' | 'criativo';
export type SlideRatio = '16:9' | '4:3' | 'A4';
export type SlideAudience = 'aluno' | 'professor';
export type SlideMode = 'material' | 'tema';
export type SlideVisualType = 'HERO' | 'COMPARE' | 'PROCESS' | 'CYCLE' | 'TIMELINE' | 'INFOGRAPHIC' | 'STATISTIC' | 'ANATOMY' | 'CARDS' | 'PYRAMID' | 'QUESTION' | 'SUMMARY' | 'CONCEPT_MAP' | 'CAUSE_EFFECT';
export type SlideLayoutType = 'cover' | 'cards' | 'columns' | 'timeline' | 'highlight' | 'comparison' | 'visual-list' | 'activity' | 'hero' | 'process' | 'cycle' | 'statistic' | 'anatomy' | 'pyramid' | 'concept-map' | 'cause-effect';
export type SlideAssetStatus = 'not_required' | 'pending' | 'generating' | 'ready' | 'fallback' | 'failed';

export interface GeneratedSlide {
  id: string;
  title: string;
  subtitle?: string;
  learningObjective?: string;
  keyMessage?: string;
  content?: string[];
  bullets: string[];
  visualType?: SlideVisualType;
  layoutType?: SlideLayoutType;
  layout: SlideLayoutType;
  imagePrompt?: string;
  needsImage?: boolean;
  graphicElements?: string[];
  visualHint?: string;
  speakerNotes?: string;
  answer?: string;
  bnccSkills?: string[];
  sourceReferences?: string[];
  assetStatus?: SlideAssetStatus;
  assetDataUrl?: string;
  assetModel?: string;
  assetError?: string;
}

export interface SlideDeck {
  title: string;
  disciplina: string;
  segmento?: string;
  anoSerie: string;
  tema: string;
  mode?: SlideMode;
  style: SlideStyle;
  ratio: SlideRatio;
  audience: SlideAudience;
  includeNotes: boolean;
  bncc: Array<{ codigo: string; descricao: string }>;
  slides: GeneratedSlide[];
}

export type PresentationJobStage = 'preparing' | 'planning' | 'generating_assets' | 'assembling' | 'reviewing' | 'completed' | 'failed';

export interface PresentationJobSnapshot {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage: PresentationJobStage;
  progress: number;
  deck?: SlideDeck;
  error?: string;
  retryable?: boolean;
}
