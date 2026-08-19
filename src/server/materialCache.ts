import { MaterialAnalysisResult, ValidationResult } from '../types';

export interface ProcessedMaterialCache {
  material_id: string;
  hash_material: string;
  conteudo_extraido: string;
  conteudo_didatico_limpo: string;
  questoes_existentes_no_material: string[];
  disciplina: string;
  segmento: string;
  ano_serie: string;
  titulo_exato?: string;
  temas_detectados: string[];
  subtemas: string[];
  conceitos_principais: string[];
  dados_concretos?: string[];
  perguntas_atividades_texto?: string[];
  tipo_de_conteudo?: string;
  resumo_pedagogico: string;
  bncc_candidatas: Array<{ codigo: string; descricao: string; unidadeTematica?: string }>;
  data_processamento: string;
  analise: MaterialAnalysisResult;
  validacao: ValidationResult;
}

// In-memory LRU cache storing up to 100 recent materials
class MaterialMemoryCache {
  private cache = new Map<string, ProcessedMaterialCache>();
  private readonly maxSize = 100;

  get(hash: string): ProcessedMaterialCache | null {
    if (!hash) return null;
    const item = this.cache.get(hash);
    if (!item) return null;
    // Refresh position for LRU
    this.cache.delete(hash);
    this.cache.set(hash, item);
    return item;
  }

  getById(id: string): ProcessedMaterialCache | null {
    if (!id) return null;
    for (const item of this.cache.values()) {
      if (item.material_id === id) {
        return item;
      }
    }
    return null;
  }

  set(item: ProcessedMaterialCache): void {
    if (!item || !item.hash_material) return;
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(item.hash_material, item);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const materialCacheInstance = new MaterialMemoryCache();

/**
 * Creates a concise pedagogical summary (500-1500 words) from the analysis and cleaned content.
 * This is used for lightning-fast Etapa C generation without re-sending images or massive raw OCR texts.
 */
export function buildPedagogicalSummary(
  analysis: MaterialAnalysisResult,
  conteudoDidaticoLimpo: string
): string {
  const parts: string[] = [];

  const tema = analysis.tema_principal || analysis.titulo_exato || analysis.titulo || 'Conteúdo do Material Didático';
  parts.push(`TEMA CENTRAL IDENTIFICADO: ${tema}`);

  if (analysis.titulo_exato && analysis.titulo_exato !== tema) {
    parts.push(`TÍTULO DO MATERIAL: ${analysis.titulo_exato}`);
  }

  if (analysis.conteudos_identificados && analysis.conteudos_identificados.length > 0) {
    parts.push(`CONTEÚDOS E TÓPICOS IDENTIFICADOS:\n- ${analysis.conteudos_identificados.join('\n- ')}`);
  }

  if (analysis.conceitos_chave && analysis.conceitos_chave.length > 0) {
    parts.push(`CONCEITOS-CHAVE:\n- ${analysis.conceitos_chave.join('\n- ')}`);
  }

  if (analysis.dados_concretos && analysis.dados_concretos.length > 0) {
    parts.push(`ELEMENTOS E REGRAS CITADOS:\n- ${analysis.dados_concretos.join('\n- ')}`);
  }

  if (analysis.resumo) {
    parts.push(`RESUMO PEDAGÓGICO:\n${analysis.resumo}`);
  }

  if (conteudoDidaticoLimpo) {
    // Truncate to maximum ~1200 words (~5000 characters) to ensure low token footprint and fast inference
    const maxChars = 5000;
    const cleanExcerpt =
      conteudoDidaticoLimpo.length > maxChars
        ? conteudoDidaticoLimpo.slice(0, maxChars) + '... [conteúdo sintetizado]'
        : conteudoDidaticoLimpo;
    parts.push(`TRECHO DIDÁTICO PRINCIPAL:\n${cleanExcerpt}`);
  }

  return parts.join('\n\n');
}
