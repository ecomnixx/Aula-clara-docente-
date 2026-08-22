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
  createdAt: string;
}

