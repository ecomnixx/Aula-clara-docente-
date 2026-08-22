export type SourceStatus = 'uploading' | 'review' | 'processing' | 'ready' | 'partial_error' | 'error';
export type SourcePageStatus = 'uploading' | 'stored' | 'preparing' | 'queued' | 'reading' | 'processing' | 'ready' | 'error';

export interface MaterialSourcePage {
  id: string;
  material_id: string;
  page_number: number;
  storage_path: string;
  preview_url?: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  width?: number;
  height?: number;
  processing_status: SourcePageStatus;
  extracted_text?: string;
  structured_content?: Record<string, unknown> | null;
  processing_error?: string | null;
}

export interface MaterialSource {
  id: string;
  user_id: string;
  title: string;
  source_type: 'images' | 'pdf' | 'mixed';
  total_pages: number;
  processing_status: SourceStatus;
  created_at: string;
  updated_at: string;
  pages: MaterialSourcePage[];
}
