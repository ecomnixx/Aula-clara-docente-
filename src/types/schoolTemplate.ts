export interface SchoolTemplate {
  id: string;
  name: string;
  schoolName: string;
  headerLines: string[];
  fields: string[];
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  borderStyle: 'none' | 'simple' | 'boxed';
  logoDataUrl?: string;
  margins?: { top: number; right: number; bottom: number; left: number };
  instructions?: string[];
  keepInstructions?: boolean;
  questionStyle?: { showScore: boolean; alternativesStyle: string };
  answerLineStyle?: { short: number; medium: number; long: number };
  footer?: string;
  sourceType?: 'docx' | 'pdf' | 'image';
  isDefault?: boolean;
  createdAt: string;
}
