export type SlideStyle = 'automatico' | 'colorido' | 'moderno' | 'academico' | 'jovem' | 'infantil' | 'fundamental' | 'medio' | 'minimalista' | 'criativo';
export type SlideRatio = '16:9' | '4:3' | 'A4';
export type SlideAudience = 'aluno' | 'professor';
export type SlideMode = 'material' | 'tema';
export type SlideVisualType = 'HERO' | 'COMPARE' | 'PROCESS' | 'CYCLE' | 'TIMELINE' | 'INFOGRAPHIC' | 'STATISTIC' | 'ANATOMY' | 'CARDS' | 'PYRAMID' | 'QUESTION' | 'SUMMARY' | 'CONCEPT_MAP' | 'CAUSE_EFFECT';
export type SlideLayoutType = 'cover' | 'cards' | 'columns' | 'timeline' | 'highlight' | 'comparison' | 'visual-list' | 'activity' | 'hero' | 'process' | 'cycle' | 'statistic' | 'anatomy' | 'pyramid' | 'concept-map' | 'cause-effect';
export type SlideAssetStatus = 'not_required' | 'pending' | 'generating' | 'ready' | 'fallback' | 'failed';
export type SlideVisualKind = 'generated_image' | 'programmatic' | 'none';

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
  visualRequired?: boolean;
  visualKind?: SlideVisualKind;
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
  validation?: SlideValidationIssue[];
}

export interface SlideValidationIssue { slideId?: string; code: 'EMPTY_SLIDE' | 'TOO_MUCH_TEXT' | 'LONG_LINE' | 'VISUAL_PENDING' | 'INVALID_IMAGE' | 'INVALID_RATIO'; severity: 'error' | 'warning'; message: string; }
