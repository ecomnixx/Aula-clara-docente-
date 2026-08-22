export type SlideStyle = 'automatico' | 'colorido' | 'moderno' | 'infantil' | 'fundamental' | 'medio' | 'minimalista' | 'criativo';
export type SlideRatio = '16:9' | '4:3' | 'A4';
export type SlideAudience = 'aluno' | 'professor';

export interface GeneratedSlide {
  id: string;
  title: string;
  bullets: string[];
  layout: 'cover' | 'cards' | 'columns' | 'timeline' | 'highlight' | 'comparison' | 'visual-list' | 'activity';
  visualHint?: string;
  speakerNotes?: string;
  answer?: string;
}

export interface SlideDeck {
  title: string;
  disciplina: string;
  anoSerie: string;
  tema: string;
  style: SlideStyle;
  ratio: SlideRatio;
  audience: SlideAudience;
  includeNotes: boolean;
  bncc: Array<{ codigo: string; descricao: string }>;
  slides: GeneratedSlide[];
}
