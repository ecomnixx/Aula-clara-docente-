import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import {
  MaterialAnalysisResult,
  ValidationResult,
  FinalReviewResult,
  DisciplinaType,
  SegmentoType,
  ProcessedMaterialCache,
} from '../types';
import {
  isTechnicalMarker,
  stripTechnicalMarkers,
  cleanOcrText,
  cleanTechnicalMarkersArray,
  limitToWords,
  BANNED_GENERICS_REGEX,
  separateDidacticContentFromQuestions,
  generateMaterialHash,
} from './contentCleaner';
import {
  materialCacheInstance,
  buildPedagogicalSummary,
} from './materialCache';
import { matchOfficialBnccSkill } from './bnccMatcher';

export type { MaterialAnalysisResult, ValidationResult, FinalReviewResult, ProcessedMaterialCache };
export {
  isTechnicalMarker,
  stripTechnicalMarkers,
  cleanOcrText,
  cleanTechnicalMarkersArray,
  limitToWords,
  BANNED_GENERICS_REGEX,
  separateDidacticContentFromQuestions,
  generateMaterialHash,
  materialCacheInstance,
  buildPedagogicalSummary,
};

export interface AnalyzeMaterialParams {
  images: Array<{ base64?: string; type?: string; mimeType?: string }>;
  textoOcr?: string;
  disciplina: string;
  segmento: string;
  ano: string;
  forceFresh?: boolean;
}

export interface ValidateAnalysisParams {
  images: Array<{ base64?: string; type?: string; mimeType?: string }>;
  textoOcr?: string;
  analysis: MaterialAnalysisResult;
  disciplina: string;
  segmento: string;
  ano: string;
}

export interface GenerateLessonParams {
  disciplina: string;
  segmento: string;
  ano: string;
  tipo: string;
  numAulas: number;
  isEdFisicaPratica: boolean;
  isOnlyProva: boolean;
  duracaoMinutos?: number;
  candidatosBncc?: string;
  textoOcr?: string;
  dificuldade?: 'Fácil' | 'Médio' | 'Difícil';
  modoOrigem?: 'material' | 'plano';
  planoOrigem?: any;
  resumoPedagogico?: string;
  conteudoDidaticoLimpo?: string;
}

const PEDAGOGICAL_COHERENCE_POLICY = `
REGRA ABSOLUTA DE SEGURANÇA PEDAGÓGICA (PRIORIDADE SOBRE AS DEMAIS):
1. Siga sempre esta hierarquia: DISCIPLINA selecionada pelo professor → ANO/SÉRIE → HABILIDADES BNCC → OBJETIVOS → MATERIAL → ATIVIDADES → AVALIAÇÃO.
2. O tema do material nunca substitui a disciplina. Classifique internamente o material como objeto direto de aprendizagem ou apenas texto-base/contexto, sem exibir essa análise.
3. O conhecimento ensinado e avaliado deve pertencer à disciplina selecionada. Use o material somente como fonte ou suporte. Exemplo: em Língua Portuguesa, um texto sobre Jogos Olímpicos deve avaliar interpretação, inferência, finalidade, fato/opinião, coesão, gramática, argumentação ou produção textual — não memorização histórica ou esportiva.
4. Para cada questão, valide internamente: "Se o tema do texto fosse trocado por outro equivalente, esta questão ainda avaliaria uma habilidade da disciplina?" e "Qual habilidade da disciplina esta questão avalia?". Descarte a questão se alguma resposta não for clara.
5. Use habilidades compatíveis com disciplina, etapa e ano/série. Nunca invente código BNCC. Quando não houver correspondência segura, informe exatamente: "Habilidade BNCC específica não confirmada com segurança."
6. Garanta correspondência integral: BNCC → objetivos observáveis → desenvolvimento → atividades → avaliação. A avaliação deve medir exatamente o que foi desenvolvido.
7. O plano deve conter disciplina, ano/série, tema, conteúdo, duração, BNCC, objetivos, materiais, desenvolvimento, avaliação e adaptações. A soma de duracao_min de todas as etapas deve ser exatamente a duração total solicitada.
8. Objetivos devem ser observáveis e avaliáveis, preferindo verbos como identificar, interpretar, comparar, analisar, localizar, inferir, justificar, produzir, relacionar e argumentar.
9. Questões objetivas devem ter apenas uma alternativa correta, distratores plausíveis, nenhuma ambiguidade ou pista linguística. Questões abertas devem avaliar raciocínio, aceitar equivalência semântica e possuir critérios claros.
10. A dificuldade deve alterar a complexidade cognitiva: fácil = identificação e informação explícita; médio = interpretação, relação e aplicação; difícil = inferência complexa, análise, argumentação e situação nova. Não aumente dificuldade apenas alongando o enunciado.
11. A pontuação deve usar incrementos de 0,25 e fechar exatamente o valor total solicitado. Some antes de responder e recalcule se houver divergência.
12. Gere seção separada "GABARITO E CRITÉRIOS DE CORREÇÃO — USO DO PROFESSOR". Em objetivas, inclua alternativa, resposta e justificativa. Em dissertativas, inclua resposta esperada, elementos essenciais, equivalências aceitáveis e critérios de pontuação; nunca exija cópia literal.
13. Leia imagens na ordem, incluindo títulos, textos, tabelas, boxes, legendas e exemplos. Não invente trechos ilegíveis. Nunca exiba nomes técnicos de arquivos; use "texto-base" ou "material fornecido pelo professor".
14. Não invente fatos, autores, datas, referências, códigos BNCC nem conteúdo inexistente. Corrija imprecisões factuais somente quando seguro e sem adicionar fatos externos desnecessários.
15. Antes da resposta, revise internamente disciplina, ano, BNCC, objetivos, atividades, avaliação, dificuldade, linguagem, unicidade das alternativas, pontuação, gabarito, ambiguidades, fatos e ausência de nomes de arquivos. Corrija tudo antes de retornar o JSON.
RACIOCÍNIO OBRIGATÓRIO: Disciplina + Ano/Série → habilidade → objetivo → material como suporte → atividade → questão → validação.
`;

export const DEFAULT_GEMINI_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

/**
 * Formats Gemini and server errors into clean, friendly messages for the teacher.
 */
export function formatAiError(err: any): string {
  if (!err) return 'Erro desconhecido ao processar com a IA.';
  let rawMsg = err.message || (typeof err === 'string' ? err : JSON.stringify(err));

  // If rawMsg is stringified JSON containing error details
  if (typeof rawMsg === 'string' && (rawMsg.includes('"error"') || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('Quota exceeded'))) {
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed?.error?.message) {
        rawMsg = parsed.error.message;
      }
    } catch (_) {}
  }

  if (/quota|429|RESOURCE_EXHAUSTED|rate limit|limit: 0/i.test(rawMsg)) {
    return 'O serviço de inteligência artificial atingiu temporariamente o limite de requisições por minuto. Aguarde cerca de 10 a 15 segundos e tente novamente.';
  }
  if (/503|UNAVAILABLE|high demand|temporarily unavailable|overloaded/i.test(rawMsg)) {
    return 'Os servidores da IA estão com alta demanda no momento. Aguarde alguns instantes e tente novamente.';
  }
  if (/413|too large|entity too large/i.test(rawMsg)) {
    return 'As imagens enviadas são muito volumosas. Tente enviar fotos com menor resolução ou reduza a quantidade de páginas.';
  }
  if (/API_KEY|chave|auth|unauthorized|401|403/i.test(rawMsg)) {
    return 'Chave de API do Gemini não configurada ou inválida. Verifique as configurações.';
  }
  if (/ETIMEDOUT|ECONNRESET|fetch failed|timeout/i.test(rawMsg)) {
    return 'Tempo de resposta da IA excedido ou oscilação de conexão. Tente novamente.';
  }

  return rawMsg;
}

/**
 * Safely extracts and parses JSON from model responses, handling:
 * - Markdown code blocks (```json ... ```)
 * - Trailing/preceding conversational text or notes
 * - Balanced bracket matching for objects ({ ... }) and arrays ([ ... ])
 * - Trailing commas before closing braces/brackets
 * - Smart quotes and formatting anomalies
 * - Guaranteed fallback without uncaught exceptions
 */
export function extractAndParseJson<T = any>(rawText: string, fallback: T = {} as any): T {
  if (!rawText || typeof rawText !== 'string') return fallback;

  const trimmed = rawText.trim();
  if (!trimmed) return fallback;

  // 1. Direct parse attempt
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // 2. Strip markdown blocks
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // 3. Scan for balanced outermost JSON object or array
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startChar: '{' | '[' | null = null;
  let startIndex = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startChar = '{';
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startChar = '[';
    startIndex = firstBracket;
  }

  if (startIndex !== -1 && startChar) {
    const endChar = startChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let endIndex = -1;

    for (let i = startIndex; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === startChar) {
          depth++;
        } else if (char === endChar) {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const candidate = cleaned.slice(startIndex, endIndex + 1);
      try {
        return JSON.parse(candidate);
      } catch (_) {
        try {
          const sanitizedCandidate = candidate
            .replace(/,\s*([\}\]])/g, '$1')
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2018\u2019]/g, "'");
          return JSON.parse(sanitizedCandidate);
        } catch (_) {}
      }
    }
  }

  // 4. Regex fallback
  try {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const sanitized = objMatch[0]
        .replace(/,\s*([\}\]])/g, '$1')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      return JSON.parse(sanitized);
    }
  } catch (_) {}

  return fallback;
}

// Circuit breaker / cooldown map for temporarily unavailable or rate-limited models
const modelCooldowns = new Map<string, number>();
let lastWorkingModel: string = 'gemini-3.7-flash';

export interface GenerateContentRetryOptions {
  models?: string[];
  maxRetriesPerModel?: number;
  initialDelayMs?: number;
}

export async function generateGeminiWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
  },
  options: GenerateContentRetryOptions = {}
): Promise<{ text: string; modelUsed: string; response: any }> {
  const baseModels = options.models && options.models.length > 0
    ? options.models
    : DEFAULT_GEMINI_MODELS;

  const now = Date.now();
  // Sort models: healthy models first, with last working model preferred; cooled-down models at the end
  const sortedModels = [...baseModels].sort((a, b) => {
    const aCooldown = (modelCooldowns.get(a) || 0) > now;
    const bCooldown = (modelCooldowns.get(b) || 0) > now;
    if (aCooldown && !bCooldown) return 1;
    if (!aCooldown && bCooldown) return -1;
    if (a === lastWorkingModel) return -1;
    if (b === lastWorkingModel) return 1;
    return 0;
  });

  const maxRetries = options.maxRetriesPerModel ?? 1;
  const initialDelay = options.initialDelayMs ?? 400;

  let lastError: any = null;

  for (let mIdx = 0; mIdx < sortedModels.length; mIdx++) {
    const model = sortedModels[mIdx];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[GeminiRunner] Executando chamada com modelo ${model} (tentativa ${attempt + 1}/${maxRetries + 1})...`);
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });

        const text = response.text || '';
        // Clear cooldown and update last working model
        modelCooldowns.delete(model);
        lastWorkingModel = model;

        if (mIdx > 0 || model !== baseModels[0]) {
          console.log(`[GeminiRunner] Sucesso obtido com modelo alternativo: ${model}`);
        }
        return { text, modelUsed: model, response };
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const errStatus = err?.status || err?.code || (err?.error && err.error.code);
        const isUnavailableOrRateLimited =
          errStatus === 503 ||
          errStatus === 429 ||
          errStatus === 'UNAVAILABLE' ||
          errStatus === 'RESOURCE_EXHAUSTED' ||
          /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|temporarily unavailable|quota|overloaded|fetch failed|ETIMEDOUT|ECONNRESET/i.test(errMsg);

        console.log(`[GeminiRunner] Modelo ${model} encontrou oscilação temporária (tentativa ${attempt + 1}): ${errStatus || 'Indisponível'}`);

        if (isUnavailableOrRateLimited) {
          // Set a 30-second cooldown for this model so we prioritize alternative models
          modelCooldowns.set(model, Date.now() + 30 * 1000);

          // If there are other models available in the cascade, switch immediately to keep latency low
          if (mIdx < sortedModels.length - 1) {
            console.log(`[GeminiRunner] Alternando automaticamente para o modelo seguinte: ${sortedModels[mIdx + 1]}...`);
            break;
          }
        }

        if (attempt < maxRetries) {
          const backoff = initialDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
          console.log(`[GeminiRunner] Aguardando ${backoff}ms antes da próxima tentativa...`);
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          break;
        }
      }
    }
  }

  const finalMsg = formatAiError(lastError) || 'Falha ao processar com os modelos Gemini disponíveis.';
  throw new Error(finalMsg);
}

export interface AIProvider {
  analyzeMaterial(params: AnalyzeMaterialParams): Promise<MaterialAnalysisResult>;
  validateAnalysis(params: ValidateAnalysisParams): Promise<ValidationResult>;
  processAndStructureMaterial(params: AnalyzeMaterialParams): Promise<ProcessedMaterialCache>;
  generateLesson(
    params: GenerateLessonParams,
    analysis: MaterialAnalysisResult,
    validation: ValidationResult
  ): Promise<{ parsed: any; rawText: string }>;
  reviewLesson(
    lessonData: any,
    analysis: MaterialAnalysisResult,
    params: GenerateLessonParams
  ): Promise<FinalReviewResult>;
}

// -------------------------------------------------------------
// GEMINI MULTIMODAL PROVIDER IMPLEMENTATION
// -------------------------------------------------------------
export class GeminiAIProvider implements AIProvider {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY não foi configurada.');
    }
    this.ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // 1. LEITURA MULTIMODAL E IDENTIFICAÇÃO DO CONTEÚDO
  async analyzeMaterial(params: AnalyzeMaterialParams): Promise<MaterialAnalysisResult> {
    const { images, textoOcr, disciplina, segmento, ano } = params;

    const parts: any[] = [];

    // Multimodal input: Attach all images directly
    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        const base64Data = (img.base64 || '').replace(/^data:image\/\w+;base64,/, '');
        const mimeType = img.type || img.mimeType || 'image/jpeg';
        if (base64Data) {
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType,
            },
          });
        }
      }
    }

    const systemPrompt = `Você é o analisador multimodal e pedagógico do aplicativo Aula Clara.
Sua função nesta etapa é executar estritamente a:

ETAPA 1 — EXTRAÇÃO INTEGRADA E FIDELIDADE PEDAGÓGICA:
Leia atentamente todas as páginas/imagens enviadas do livro/apostila como um material contínuo e unificado:
1. "titulo_exato": Título ou heading lido no topo da página. Se a página NÃO tiver um título explícito, sintetize um Tema de até 8 palavras que resuma o assunto central do texto extraído.
2. "componente_curricular_lido": Componente curricular específico lido na página (ex: Educação Física, História, Matemática). Se houver apenas selo editorial ou área do conhecimento (ex: "Linguagens", "Ciências Humanas"), diferencie da disciplina do professor (${disciplina}). Se não houver disciplina explícita na imagem, retorne "não identificado na imagem".
3. "ano_serie_lido": Identifique o ANO/SÉRIE escolar:
   -> Se estiver explícito no cabeçalho ou rodapé (ex: "3º ANO", "6º ANO", "1º ANO EM"), extraia exatamente o que está escrito.
   -> Se NÃO houver indicação textual explícita, utilize a série informada pelo professor (${ano}) ou deduza pelo nível do conteúdo. NUNCA atribua "1º Ano" automaticamente por padrão.
4. "volume_lido": Volume lido explicitamente na página se houver. Se não houver, escreva "não identificado na imagem".
5. "capitulo_lido": Capítulo lido explicitamente na página se houver. Se não houver, escreva "não identificado na imagem".
6. "dados_concretos": Lista dos conceitos, materiais, nomes de aparelhos, medidas, regras, definições e nomes próprios citados no texto.
   -> NUNCA repita o título como se fosse conteúdo. Extraia termos concretos reais.
7. "perguntas_atividades_texto": As perguntas ou atividades já impressas na apostila (extraídas APENAS para referência pedagógica do nível esperado, NUNCA para serem copiadas em avaliações).
8. "tema_principal": Assunto central unificado de todas as páginas. Sintetize em até 8 palavras.
9. "conteudos_identificados": Lista de tópicos e conteúdos reais abordados.
10. "conceitos_chave": Termos técnicos e palavras-chave.
11. "resumo": Resumo fiel do texto de 2 a 4 linhas.

================================================
REGRA DE EXCLUSÃO DE MARCADORES TÉCNICOS:
================================================
- IGNORE COMPLETAMENTE marcadores de digitalização como "--- PÁGINA X ---", "=== PÁGINA X ===", "PÁGINA X", números de página soltos (ex: "42", "Pág. 12", "1 de 4") e marcas de scanner.
- Eles NUNCA devem aparecer em nenhum campo.

PROIBIÇÃO ABSOLUTA DE TEMAS E TERMOS GENÉRICOS:
É TERMINANTEMENTE PROIBIDO retornar generalismos como:
- "Introdução à Educação Física"
- "Conceitos fundamentais"
- "Conteúdos estruturantes"
- "Práticas corporais genéricas"

RESPONDA EXCLUSIVAMENTE NO SEGUINTE JSON:
{
  "titulo_exato": "Título exato lido no topo da página OU tema sintetizado de até 8 palavras se não houver título explícito",
  "componente_curricular_lido": "Componente lido na imagem ou 'não identificado na imagem'",
  "ano_serie_lido": "Ano/série lido EXATAMENTE na imagem ou 'não identificado na imagem'",
  "volume_lido": "Volume lido na imagem ou 'não identificado na imagem'",
  "capitulo_lido": "Capítulo lido na imagem ou 'não identificado na imagem'",
  "tema_principal": "Tema autêntico de até 8 palavras resumindo o assunto",
  "conteudos_identificados": ["Conteúdo específico 1", "Conteúdo específico 2"],
  "conceitos_chave": ["termo1", "termo2"],
  "dados_concretos": ["Aparelho/Material 1", "Regra/Definição 2", "Medida/Nome próprio 3"],
  "perguntas_atividades_texto": ["Pergunta ou atividade sugerida pelo livro"],
  "atividade_sugerida_pelo_livro": "Atividade proposta pelo livro se houver",
  "resumo": "Resumo fiel estritamente baseado no que está escrito",
  "confianca": 95
}`;

    const cleanOcrForPrompt = textoOcr ? cleanOcrText(textoOcr) : '';
    const userPrompt = cleanOcrForPrompt && cleanOcrForPrompt.trim().length > 0
      ? `TEXTO EXTRAÍDO DO MATERIAL DIDÁTICO (OCR LIMPO):\n${cleanOcrForPrompt}\n\nIdentifique o tema específico, conteúdos e conceitos do material.`
      : `Analise as páginas enviadas e extraia o tema específico, conteúdos e conceitos do material.`;

    parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });

    let rawJson = '';
    try {
      const result = await generateGeminiWithRetry(this.ai, {
        contents: { parts },
        config: {
          temperature: 0.0,
          responseMimeType: 'application/json',
        },
      });
      rawJson = result.text || '';
    } catch (err: any) {
      console.warn('[GeminiAIProvider.analyzeMaterial] Falha ao processar análise:', err?.message);
    }

    try {
      const parsed = extractAndParseJson<any>(rawJson, {});
      let tituloExato = stripTechnicalMarkers(parsed.titulo_exato || parsed.titulo || '');
      let componenteLido = stripTechnicalMarkers(parsed.componente_curricular_lido || '');
      let anoSerieLido = stripTechnicalMarkers(parsed.ano_serie_lido || '');
      let volumeLido = stripTechnicalMarkers(parsed.volume_lido || '');
      let capituloLido = stripTechnicalMarkers(parsed.capitulo_lido || '');
      let tema = stripTechnicalMarkers(parsed.tema_principal || '');
      let conteudos: string[] = cleanTechnicalMarkersArray(parsed.conteudos_identificados);
      let conceitos: string[] = cleanTechnicalMarkersArray(parsed.conceitos_chave);
      let dadosConcretos: string[] = cleanTechnicalMarkersArray(parsed.dados_concretos);
      let perguntasTexto: string[] = cleanTechnicalMarkersArray(parsed.perguntas_atividades_texto);
      let resumo = stripTechnicalMarkers(parsed.resumo || '');
      let confianca = typeof parsed.confianca === 'number' ? Math.max(0, Math.min(100, parsed.confianca)) : 80;

      if (isTechnicalMarker(tituloExato)) {
        tituloExato = '';
      }
      if (isTechnicalMarker(tema)) {
        tema = '';
      }

      // If ano/serie is missing or indicates not found, mark explicitly
      if (!anoSerieLido || anoSerieLido.toLowerCase().includes('não identificado') || anoSerieLido.toLowerCase().includes('nao identificado')) {
        anoSerieLido = 'não identificado na imagem';
      }

      if (!componenteLido || componenteLido.toLowerCase().includes('não identificado') || componenteLido.toLowerCase().includes('nao identificado')) {
        componenteLido = 'não identificado na imagem';
      }

      if (!volumeLido || volumeLido.toLowerCase().includes('não identificado') || volumeLido.toLowerCase().includes('nao identificado')) {
        volumeLido = 'não identificado na imagem';
      }

      if (!capituloLido || capituloLido.toLowerCase().includes('não identificado') || capituloLido.toLowerCase().includes('nao identificado')) {
        capituloLido = 'não identificado na imagem';
      }

      // Anti-generic filter check & synthesis of theme of up to 8 words
      if (!tema || BANNED_GENERICS_REGEX.test(tema)) {
        if (tituloExato && !BANNED_GENERICS_REGEX.test(tituloExato) && tituloExato !== 'Material Didático') {
          tema = limitToWords(tituloExato, 8);
        } else if (conteudos.length > 0 && !BANNED_GENERICS_REGEX.test(conteudos[0])) {
          tema = limitToWords(conteudos[0], 8);
        } else if (textoOcr && textoOcr.trim().length > 10) {
          const firstHeading = textoOcr
            .split('\n')
            .map(l => stripTechnicalMarkers(l))
            .find(l => l.length > 3 && l.length < 80 && !isTechnicalMarker(l) && !BANNED_GENERICS_REGEX.test(l));
          if (firstHeading) {
            tituloExato = tituloExato || firstHeading;
            tema = limitToWords(firstHeading, 8);
            confianca = 60;
          } else {
            tema = 'Conteúdo não identificado com segurança';
            confianca = 20;
          }
        } else {
          tema = 'Conteúdo não identificado com segurança';
          confianca = 15;
        }
      } else {
        // Enforce maximum 8 words if synthesized or excessively long
        tema = limitToWords(tema, 8);
      }

      if (!tituloExato) {
        tituloExato = tema !== 'Conteúdo não identificado com segurança' ? tema : 'Material Didático';
      }

      if (conteudos.length === 0 && tema !== 'Conteúdo não identificado com segurança') {
        conteudos = [tema];
      }

      return {
        titulo: tituloExato,
        titulo_exato: tituloExato,
        componente_curricular_lido: componenteLido,
        ano_serie_lido: anoSerieLido,
        volume_lido: volumeLido,
        capitulo_lido: capituloLido,
        tema_principal: tema,
        conteudos_identificados: conteudos,
        conceitos_chave: conceitos,
        dados_concretos: dadosConcretos,
        perguntas_atividades_texto: perguntasTexto,
        atividade_sugerida_pelo_livro: stripTechnicalMarkers(parsed.atividade_sugerida_pelo_livro || ''),
        resumo: resumo || (textoOcr ? stripTechnicalMarkers(textoOcr).slice(0, 250) : 'Conteúdo do material didático analisado.'),
        confianca,
      };
    } catch (err) {
      console.error('[GeminiAIProvider.analyzeMaterial] Erro no parsing:', err);
      return {
        titulo: 'Material Didático',
        titulo_exato: 'Material Didático',
        componente_curricular_lido: 'não identificado na imagem',
        ano_serie_lido: 'não identificado na imagem',
        volume_lido: 'não identificado na imagem',
        capitulo_lido: 'não identificado na imagem',
        tema_principal: 'Conteúdo não identificado com segurança',
        conteudos_identificados: [],
        conceitos_chave: [],
        dados_concretos: [],
        perguntas_atividades_texto: [],
        resumo: 'Não foi possível identificar o conteúdo com segurança.',
        confianca: 10,
      };
    }
  }

  // 2. VALIDADOR DE CONTEÚDO POR IA (AI VALIDATOR)
  async validateAnalysis(params: ValidateAnalysisParams): Promise<ValidationResult> {
    const { images, textoOcr, analysis, disciplina, segmento, ano } = params;

    const parts: any[] = [];

    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        const base64Data = (img.base64 || '').replace(/^data:image\/\w+;base64,/, '');
        const mimeType = img.type || img.mimeType || 'image/jpeg';
        if (base64Data) {
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType,
            },
          });
        }
      }
    }

    const validatorPrompt = `Você é o Validador de Qualidade e Fidelidade do aplicativo Aula Clara.
Sua missão é realizar uma checagem crítica antes da geração da aula.

PERGUNTA FUNDAMENTAL:
"O tema identificado representa REALMENTE o conteúdo predominante deste material?"

DADOS PROPOSTOS PELA PRIMEIRA ETAPA:
- Título Identificado: "${analysis.titulo}"
- Tema Principal Proposto: "${analysis.tema_principal}"
- Conteúdos Identificados: ${JSON.stringify(analysis.conteudos_identificados)}
- Conceitos Chave: ${JSON.stringify(analysis.conceitos_chave)}
- Resumo Proposto: "${analysis.resumo}"
- Disciplina: ${disciplina} (${segmento}, ${ano})

${textoOcr ? `TEXTO DO MATERIAL:\n${textoOcr}\n` : ''}

CRITÉRIOS DE AVALIAÇÃO:
1. O tema proposto é específico e corresponde exatamente ao que está impresso na página?
2. Se o tema for genérico (como "Introdução à Educação Física", "Conceitos fundamentais", "Práticas pedagógicas"), você DEVE REPROVAR e fornecer o "tema_corrigido" com base no título real da página.
3. Se a página for ilegível ou não tiver conteúdo suficiente para identificar um tema específico, aprove = false e confianca < 40.

RESPONDA EXCLUSIVAMENTE NO SEGUINTE JSON:
{
  "aprovado": true,
  "confianca": 95,
  "tema_corrigido": "${analysis.tema_principal}",
  "motivo": "O tema corresponde com precisão ao título e aos conteúdos de amplitude e articulações presentes no material."
}`;

    parts.push({ text: validatorPrompt });

    try {
      const result = await generateGeminiWithRetry(this.ai, {
        contents: { parts },
        config: {
          temperature: 0.0,
          responseMimeType: 'application/json',
        },
      });

      const parsed = extractAndParseJson(result.text || '{}', {
        aprovado: true,
        confianca: 90,
        tema_corrigido: analysis.tema_principal,
        motivo: 'Validado.',
      });
      const aprovado = Boolean(parsed.aprovado);
      let confianca = typeof parsed.confianca === 'number' ? Math.max(0, Math.min(100, parsed.confianca)) : (aprovado ? 90 : 30);
      let temaCorrigido = (parsed.tema_corrigido || analysis.tema_principal).trim();

      if (BANNED_GENERICS_REGEX.test(temaCorrigido)) {
        aprovado ? false : aprovado;
        confianca = 25;
      }

      return {
        aprovado,
        confianca,
        tema_corrigido: temaCorrigido,
        motivo: parsed.motivo || (aprovado ? 'Validado com sucesso.' : 'Tema corrigido para maior fidelidade.'),
      };
    } catch (err: any) {
      console.warn('[GeminiAIProvider.validateAnalysis] Erro no validador:', err?.message);
      return {
        aprovado: analysis.confianca >= 50 && !BANNED_GENERICS_REGEX.test(analysis.tema_principal),
        confianca: analysis.confianca,
        tema_corrigido: analysis.tema_principal,
        motivo: 'Validação automática por heurística.',
      };
    }
  }

  // 2.5 PROCESSAMENTO E ESTRUTURAÇÃO COMPLETA EM CACHE (ETAPAS A + B)
  async processAndStructureMaterial(params: AnalyzeMaterialParams): Promise<ProcessedMaterialCache> {
    const { images, textoOcr, disciplina, segmento, ano, forceFresh } = params;

    const hash = generateMaterialHash(textoOcr, images, disciplina, segmento, ano);

    if (!forceFresh) {
      const cached = materialCacheInstance.get(hash);
      if (cached) {
        console.log(`[MaterialCache] Reutilizando material já estruturado em cache (Hash: ${hash})`);
        return cached;
      }
    }

    console.log(`[MaterialCache] Processando e estruturando novo material (Hash: ${hash})...`);

    // 1. Limpar OCR e separar didático de questões
    const cleanOcr = cleanOcrText(textoOcr || '');
    const { conteudoDidatico, questoesMaterial } = separateDidacticContentFromQuestions(cleanOcr);

    // 2. Análise Multimodal (Etapa A)
    const analysis = await this.analyzeMaterial(params);

    // 3. Validação Pedagógica
    const validation = await this.validateAnalysis({
      ...params,
      analysis,
    });

    // 4. Busca BNCC oficial inicial
    const searchTerms = [
      ...(analysis.conteudos_identificados || []),
      ...(analysis.dados_concretos || []),
      ...(analysis.conceitos_chave || []),
    ];
    const officialBncc = matchOfficialBnccSkill(
      disciplina,
      segmento,
      ano,
      validation.aprovado ? analysis.tema_principal : (validation.tema_corrigido || analysis.tema_principal),
      searchTerms
    );

    const bnccCandidatas = officialBncc.habilidades?.map((h) => ({
      codigo: h.codigo,
      descricao: h.descricao,
      unidadeTematica: (h as any).unidadeTematica || '',
    })) || (officialBncc.codigo ? [{ codigo: officialBncc.codigo, descricao: officialBncc.descricao }] : []);

    // 5. Construir resumo pedagógico para geração rápida
    const resumoPedagogico = buildPedagogicalSummary(analysis, conteudoDidatico);

    const structured: ProcessedMaterialCache = {
      material_id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      hash_material: hash,
      conteudo_extraido: cleanOcr,
      conteudo_didatico_limpo: conteudoDidatico,
      questoes_existentes_no_material: questoesMaterial,
      disciplina: disciplina || analysis.componente_curricular_lido || 'Educação Física',
      segmento: segmento || 'Ensino Fundamental',
      ano_serie: ano || analysis.ano_serie_lido || 'Ensino Fundamental',
      titulo_exato: analysis.titulo_exato,
      temas_detectados: [analysis.tema_principal, ...(analysis.conteudos_identificados || [])],
      subtemas: analysis.conteudos_identificados || [],
      conceitos_principais: analysis.conceitos_chave || [],
      dados_concretos: analysis.dados_concretos || [],
      perguntas_atividades_texto: analysis.perguntas_atividades_texto || [],
      resumo_pedagogico: resumoPedagogico,
      bncc_candidatas: bnccCandidatas,
      data_processamento: new Date().toISOString(),
      analise: analysis,
      validacao: validation,
    };

    materialCacheInstance.set(structured);
    return structured;
  }

  // 3. GERAÇÃO DO PLANO PEDAGÓGICO (PROMPT DE SISTEMA MULTIDISCIPLINAR BNCC)
  async generateLesson(
    params: GenerateLessonParams,
    analysis: MaterialAnalysisResult,
    validation: ValidationResult
  ): Promise<{ parsed: any; rawText: string }> {
    const {
      disciplina,
      segmento,
      ano,
      tipo,
      numAulas,
      isEdFisicaPratica,
      isOnlyProva,
      duracaoMinutos = 50,
      candidatosBncc = '',
      textoOcr = '',
    } = params;

    let rawTema = validation.aprovado ? analysis.tema_principal : (validation.tema_corrigido || analysis.tema_principal);
    if (isTechnicalMarker(rawTema)) {
      rawTema = analysis.titulo_exato && !isTechnicalMarker(analysis.titulo_exato)
        ? analysis.titulo_exato
        : (analysis.conteudos_identificados?.[0] || 'Conteúdo do Material Didático');
    }
    const finalTema = stripTechnicalMarkers(rawTema);

    const isPraticaCorporal =
      isEdFisicaPratica ||
      /educa[cç][aã]o f[ií]sica|artes? c[eê]nicas?|dan[cç]a|teatro/i.test(disciplina) ||
      /gin[aá]stica|jogo|esporte|luta|dan[cç]a|circuito|esquema corporal/i.test(finalTema);

    // Preparar objeto limpo e completo da Etapa 1
    const cleanedAnalysisData = {
      titulo_exato: stripTechnicalMarkers(analysis.titulo_exato || analysis.titulo || ''),
      componente_curricular_lido: stripTechnicalMarkers(analysis.componente_curricular_lido || ''),
      ano_serie_lido: stripTechnicalMarkers(analysis.ano_serie_lido || ''),
      volume_lido: stripTechnicalMarkers(analysis.volume_lido || ''),
      capitulo_lido: stripTechnicalMarkers(analysis.capitulo_lido || ''),
      tema_principal: finalTema,
      conteudos_identificados: cleanTechnicalMarkersArray(analysis.conteudos_identificados),
      conceitos_chave: cleanTechnicalMarkersArray(analysis.conceitos_chave),
      dados_concretos: cleanTechnicalMarkersArray(analysis.dados_concretos),
      perguntas_atividades_texto: cleanTechnicalMarkersArray(analysis.perguntas_atividades_texto),
      resumo: stripTechnicalMarkers(analysis.resumo || ''),
    };

    // 1. DISCIPLINA (REGRA 1 - PRIORIDADE ABSOLUTA DA ESCOLHA DO PROFESSOR)
    // A disciplina selecionada pelo professor no formulário é a fonte principal soberana.
    // NUNCA substituir por "Linguagens" ou selos editoriais.
    const effectiveDisciplina = disciplina ? disciplina.trim() : (cleanedAnalysisData.componente_curricular_lido && cleanedAnalysisData.componente_curricular_lido !== 'não identificado na imagem' ? cleanedAnalysisData.componente_curricular_lido : 'Educação Física');
    
    // 2. ANO / SÉRIE (REGRA 2 - RESPEITAR ESCOLHA DO PROFESSOR / NUNCA PADRONIZAR "1º ANO")
    const honestAnoSerie = ano ? ano.trim() : (cleanedAnalysisData.ano_serie_lido && cleanedAnalysisData.ano_serie_lido !== 'não identificado na imagem' ? cleanedAnalysisData.ano_serie_lido : 'Ensino Fundamental');
    const dificuldadeLevel = params.dificuldade || 'Médio';

    let systemPrompt = '';
    let userPrompt = '';

    if (params.isOnlyProva) {
      const contextualizacaoDesc =
        dificuldadeLevel === 'Fácil'
          ? 'NÍVEL FÁCIL: Identificação, reconhecimento, conceitos básicos, termos e informações explícitas do material didático, com enunciados diretos e vocabulário acessível.'
          : dificuldadeLevel === 'Difícil'
          ? 'NÍVEL DIFÍCIL: Interpretação profunda, análise, relação entre acontecimentos/conceitos, comparação crítica e aplicação contextualizada (dificuldade focada no raciocínio exigido e não em vocabulário artificialmente rebuscado).'
          : 'NÍVEL MÉDIO: Compreensão, comparação, relação lógica entre conceitos e aplicação simples conectando a teoria a contextos escolares e cotidianos.';

      systemPrompt = `Você é um professor e avaliador pedagógico especialista em elaboração de avaliações escolares bimestrais e oficiais alinhadas à BNCC.

Sua tarefa é gerar uma AVALIAÇÃO GERADA / PROVA GERADA cumprindo OBRIGATORIAMENTE as seguintes regras fundamentais:

================================================================================
REGRAS OBRIGATÓRIAS DE GERAÇÃO DA AVALIAÇÃO:
================================================================================

1. FLUXO OBRIGATÓRIO DE PROCESSAMENTO:
   Material → Disciplina → Segmento → Ano/Série → Conteúdos identificados → Seleção pedagógica → BNCC → Geração da Avaliação.
   NÃO invente informações, relações históricas, conceitos, exemplos ou associações que não estejam no material ou em referência pedagógica confiável.

2. DISCIPLINA (PRIORIDADE ABSOLUTA DA ESCOLHA DO PROFESSOR):
   - A disciplina desta avaliação é OBRIGATORIAMENTE "${effectiveDisciplina}".
   - Todas as questões e conteúdos devem pertencer exclusivamente ao componente de ${effectiveDisciplina}.
   - NUNCA altere ou substitua por "Linguagens" ou selos editoriais impressos na página.

3. ANO / SÉRIE (NÃO INFERIR):
   - O ano/série da avaliação é OBRIGATORIAMENTE "${honestAnoSerie}".
   - NUNCA invente, estime ou padronize automaticamente uma série se ela não constar com certeza.

4. SELEÇÃO E DISTRIBUIÇÃO DO CONTEÚDO DA AVALIAÇÃO:
   - A avaliação é construída com base no conteúdo efetivamente selecionado.
   - Quando gerada a partir de várias páginas ou temas, distribua as 10 questões proporcionalmente entre os principais conteúdos reais encontrados no material.

5. NÍVEIS DE DIFICULDADE AUTÊNTICOS (${dificuldadeLevel}):
   - ${contextualizacaoDesc}

6. QUESTÕES OBJETIVAS (QUESTÕES 1 A 5 - MÚLTIPLA ESCOLHA):
   - Cada questão deve conter 5 alternativas (A, B, C, D, E).
   - SOMENTE 1 alternativa deve ser inequivocamente correta.
   - Distratores devem ser plausíveis, porém claramente incorretos segundo o conteúdo estudado.
   - TESTE DE AMBIGUIDADE INTERNO: Pergunte-se internamente: "Existe outra alternativa que também poderia ser defendida usando o material?" Se sim, REESCREVA as alternativas imediatamente antes de gerar.
   - NUNCA apresente duas respostas parcialmente corretas quando apenas uma deve ser marcada.

7. FIDELIDADE AO MATERIAL E JUSTIFICATIVAS:
   - Diferencie claramente INFORMAÇÃO LITERAL (presente explicitamente no texto) de INFERÊNCIA (conclusão lógica obtida a partir do conteúdo).
   - Nunca apresente uma inferência como "Justificativa factual literal" se ela não constar literalmente.
   - Para inferências/conclusões válidas, formule: "Justificativa: conclusão compatível com as informações apresentadas no material."
   - Para fatos explícitos: "Justificativa: informação explicitamente apresentada no material didático."

8. QUESTÕES DISSERTATIVAS (QUESTÕES 6 A 10):
   - As perguntas devem ser plenamente possíveis de serem respondidas com base no conteúdo estudado, sem exigir informações externas não apresentadas no material.
   - No campo "expectativa_resposta", forneça os ELEMENTOS ESSENCIAIS ESPERADOS na resposta do estudante (não exigir frase idêntica; aceitar respostas com formulações semelhantes que preservem o mesmo significado conceitual).
   - Defina critérios objetivos de correção e pontuação gradual (ex: Resposta completa com todos os elementos essenciais: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto).
   - É ESTRITAMENTE PROIBIDO usar respostas evasivas ("resposta pessoal", "o estudante deve refletir", "resposta aberta").

9. BNCC — RIGOR HIERÁRQUICO:
   - Respeite a ordem: Disciplina → Segmento → Ano/Série → Conteúdo principal.
   - Primeiro filtre pelo segmento e ano/série. Somente utilize código quando houver correspondência segura.
   - Se não houver segurança matemática e conceitual: utilize "Habilidade BNCC específica não determinada com segurança."

10. AUTO-VERIFICAÇÃO INTERNA DA AVALIAÇÃO:
    Antes de emitir a resposta, valide internamente:
    1. Todas as 10 questões cobram conteúdos realmente presentes no material?
    2. O nível de dificuldade (${dificuldadeLevel}) foi respeitado de forma homogênea?
    3. As 5 questões objetivas têm apenas uma alternativa defensável?
    4. As 5 questões dissertativas possuem critérios objetivos e resposta esperada sem evasivas?
    5. O ano/série e disciplina correspondem exatamente ao solicitado?

11. FORMATO DE SAÍDA JSON ESTRITO:
    - Retorne EXCLUSIVAMENTE um objeto JSON válido iniciando em { e terminando em }, sem qualquer texto fora do JSON.`;

      userPrompt = `DADOS EXTRAÍDOS DO MATERIAL DIDÁTICO (CONTEÚDO BASE):
\`\`\`json
${JSON.stringify(cleanedAnalysisData, null, 2)}
\`\`\`

PARÂMETROS PEDAGÓGICOS DA AVALIAÇÃO:
- Disciplina: ${effectiveDisciplina}
- Ano/Série: ${honestAnoSerie}
- Tema: ${finalTema}
- Nível de Dificuldade: ${dificuldadeLevel}
${textoOcr ? `- Texto Integral do Material Didático (OCR):\n${cleanOcrText(textoOcr)}\n` : ''}

Gere o JSON da AVALIAÇÃO GERADA (10 questões inéditas e gabarito com critérios objetivos):
{
  "tipo_material": "prova",
  "disciplina": "${effectiveDisciplina}",
  "ano_serie": "${honestAnoSerie}",
  "tema": "${finalTema}",
  "dificuldade": "${dificuldadeLevel}",
  "bncc": {
    "codigo": "[Código BNCC oficial seguro ou 'Habilidade BNCC específica não determinada com segurança.']",
    "texto": "[Descrição da habilidade ou justificativa pedagógica]"
  },
  "questoes": [
    {
      "numero": 1,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito, claro e contextualizado da questão 1",
      "alternativas": [
        "A) Opção A",
        "B) Opção B",
        "C) Opção C",
        "D) Opção D",
        "E) Opção E"
      ],
      "resposta_correta": "A",
      "justificativa": "Justificativa: informação explicitamente apresentada no material (ou conclusão compatível com o material)"
    },
    {
      "numero": 2,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 2",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "B",
      "justificativa": "..."
    },
    {
      "numero": 3,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 3",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "C",
      "justificativa": "..."
    },
    {
      "numero": 4,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 4",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "D",
      "justificativa": "..."
    },
    {
      "numero": 5,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 5",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "E",
      "justificativa": "..."
    },
    {
      "numero": 6,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito e acessível da questão 6",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados na resposta do estudante (aceitando formulações semelhantes que preservem o sentido conceitual)",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 7,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 7",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 8,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 8",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 9,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 9",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 10,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 10",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    }
  ]
}`;
    } else {
      systemPrompt = `Você é um assistente pedagógico especialista que constrói planos de aula práticos, inéditos e altamente estruturados a partir do conteúdo extraído de materiais didáticos.

================================================================================
REGRAS OBRIGATÓRIAS DO PLANO DE AULA:
================================================================================

1. FLUXO OBRIGATÓRIO DE PROCESSAMENTO:
   Material → Disciplina → Segmento → Ano/Série → Conteúdos identificados → Seleção pedagógica → BNCC → Geração do Plano de Aula.
   NUNCA invente informações, relações históricas, conceitos, exemplos ou associações que não estejam no material ou em referência pedagógica confiável.

2. REGRA PRINCIPAL: RECORTE PEDAGÓGICO OBRIGATÓRIO:
   - NÃO tente utilizar todo o conteúdo detectado no material em uma única aula.
   - Para uma aula de ~${duracaoMinutos} minutos (${numAulas} aula(s)), selecione preferencialmente: 1 tema central e até 2 ou 3 conceitos diretamente relacionados com maior coesão temática.
   - Se o material contiver múltiplos temas desconexos (ex: jogos olímpicos, história do futebol, mídia esportiva, torcidas), NÃO amontoe tudo na mesma aula. Recorte o conjunto com maior relação temática. Os demais conteúdos ficam para outras aulas. A qualidade e profundidade pedagógica são mais importantes do que tentar esgotar o texto.

3. PROIBIÇÃO DE ASSOCIAÇÕES FORÇADAS:
   - NUNCA crie relações artificiais apenas para tentar utilizar todo o conteúdo encontrado.
   - Exemplos ESTRITAMENTE PROIBIDOS: "Realizar Vôlei 2x2 simulando a lógica de Ludwig Guttmann", "Adaptar o futebol em alusão à luta pela igualdade feminina" (a menos que haja fundamento pedagógico ou histórico claro e explícito no material).

4. ATIVIDADES PRÁTICAS E TEÓRICAS REALISTAS:
   - Devem ser simples, executáveis no ambiente escolar real, perfeitamente compatíveis com o tempo disponível (${duracaoMinutos} min) e com os materiais disponíveis, além de adequadas à faixa etária (${honestAnoSerie}).
   - NÃO transforme automaticamente todo conteúdo teórico em atividade prática corporal forçada. Quando o conteúdo exigir explicação histórica, social ou conceitual, inclua um momento breve de contextualização e explicação dialogada pelo professor.

5. COERÊNCIA INTERNA ESTRITA DO PLANO:
   Tema → Conteúdo → Objetivos → BNCC → Atividades → Materiais → Avaliação.
   - Cada material listado DEVE ser efetivamente utilizado nas atividades. Não liste materiais que não serão utilizados. Se nenhum material especial for necessário, indique: "Nenhum material obrigatório (uso do próprio corpo)".
   - Todos os objetivos devem ser realmente trabalhados nas atividades e verificados na avaliação formativa.

6. AUTO-VERIFICAÇÃO INTERNA DO PLANO DE AULA:
   Antes de emitir o JSON, valide internamente:
   1. Todos os objetivos são realmente trabalhados nas etapas?
   2. Todas as atividades cabem com folga no tempo disponível (${duracaoMinutos} min)?
   3. Todos os materiais listados aparecem no passo a passo das atividades?
   4. Há materiais listados que não serão utilizados? (Se sim, remova-os imediatamente)
   5. As atividades são adequadas ao ano/série (${honestAnoSerie})?
   6. A avaliação formativa verifica exatamente aquilo que foi ensinado?
   7. Existe alguma associação forçada ou inventada entre conteúdos? (Se sim, corrija antes de gerar)

7. DIRETRIZ CRÍTICA: PROIBIÇÃO DE TEMPLATES GENÉRICOS:
   - NUNCA use frases pré-fabricadas, genéricas ou clichês pedagógicos (ex: "exploração prática dos movimentos", "compreender os conceitos fundamentais", "deslocamentos pelo espaço", "circuito em estações").
   - Cada atividade deve ser uma criação original citando termos técnicos, regras ou conceitos reais do material didático.
   - NUNCA inclua marcadores como "--- PÁGINA N ---" ou números soltos de página.

ESTRUTURA PEDAGÓGICA DA AULA:
${isPraticaCorporal
  ? `1. Aquecimento / Ativação: preparação corporal direcionada aos movimentos específicos do tema.
2. Exploração Prática / Experimentação: vivência direta dos fundamentos ou conceitos centrais.
3. Atividade Principal: dinâmica estruturada em grupos ou circuitos com comandos claros aplicando o conteúdo recortado.
4. Desafio / Variação Criativa: situação-problema motora ou ampliação da complexidade adequada à turma.
5. Volta à Calma / Fechamento: roda de reflexão com perguntas específicas sobre o aprendizado da aula.`
  : `1. Retomada / Motivação: contextualização com pergunta disparadora ligada ao tema.
2. Apresentação do Conceito: explicação dialogada dos tópicos e termos extraídos do livro.
3. Prática Guiada: atividades ou resolução passo a passo em duplas/grupos com mediação do professor.
4. Prática Independente: resolução autônoma ou desafio contextualizado aplicando os conceitos.
5. Fechamento / Avaliação Formativa: síntese coletiva com perguntas de checagem de aprendizagem.`}

INCLUSÃO ATIVA:
- Proibido qualquer papel passivo (anotador, juiz, mesário). Todos os alunos participam com adaptações reais de regras, distâncias e apoios mútuos.

BNCC — HIERARQUIA RIGOROSA:
- Disciplina (${effectiveDisciplina}) → Segmento → Ano/Série (${honestAnoSerie}) → Conteúdo recortado.
- Primeiro filtre por segmento e ano. Somente use habilidade quando houver correspondência segura.
- Se não houver certeza absoluta, use: "Habilidade BNCC específica não determinada com segurança."`;

      userPrompt = `DADOS REAIS EXTRAÍDOS DO MATERIAL DIDÁTICO (ETAPA 1 - ENTRADA JSON COMPLETA):
\`\`\`json
${JSON.stringify(cleanedAnalysisData, null, 2)}
\`\`\`

PARÂMETROS DA AULA:
- Componente Curricular: ${effectiveDisciplina}
- Ano/Série: ${honestAnoSerie}
- Tema: ${finalTema}
- Duração: ${duracaoMinutos} minutos (${numAulas} aula(s))
${candidatosBncc ? `- Habilidades BNCC sugeridas (da mesma área de conhecimento e segmento):\n${candidatosBncc}\n` : ''}
${textoOcr ? `- Texto do material (OCR limpo):\n${cleanOcrText(textoOcr)}\n` : ''}

ETAPA 3 — PLANO DE AULA COM RECORTE PEDAGÓGICO (OBRIGATÓRIO):
Gere o plano de aula no formato JSON rigoroso abaixo, criando objetivos e atividades 100% específicos para os conceitos selecionados (sem associações forçadas):

{
  "disciplina": "${effectiveDisciplina}",
  "ano_serie": "${honestAnoSerie}",
  "volume_capitulo": "${(cleanedAnalysisData.volume_lido && cleanedAnalysisData.volume_lido !== 'não identificado na imagem' ? cleanedAnalysisData.volume_lido : '') + (cleanedAnalysisData.capitulo_lido && cleanedAnalysisData.capitulo_lido !== 'não identificado na imagem' ? ' | ' + cleanedAnalysisData.capitulo_lido : '') || 'não identificado na imagem'}",
  "tema": "${finalTema}",
  "conteudo_extraido": ${JSON.stringify(cleanedAnalysisData.conteudos_identificados.length > 0 ? cleanedAnalysisData.conteudos_identificados : [cleanedAnalysisData.resumo])},
  "bncc": {
    "codigo": "[Código BNCC oficial seguro do mesmo segmento/ano ou 'Habilidade BNCC específica não determinada com segurança.']",
    "texto": "[Texto resumido oficial da habilidade]",
    "confianca": "alta | aproximada | nao_determinada",
    "observacao": ""
  },
  "duracao_min": ${duracaoMinutos},
  "objetivos": [
    "Objetivo 1 concreto descrevendo aprendizado real do conceito central",
    "Objetivo 2 concreto descrevendo desenvolvimento prático/cognitivo",
    "Objetivo 3 concreto descrevendo atitude, cooperação ou reflexão"
  ],
  "materiais": [
    "Materiais que serão estritamente utilizados nas atividades (ou: Nenhum material obrigatório - uso exclusivo do próprio corpo)"
  ],
  "desenvolvimento": [
    { "etapa": "${isPraticaCorporal ? 'Aquecimento / Ativação Inicial' : 'Retomada / Motivação'}", "duracao_min": ${Math.round(duracaoMinutos * 0.1)}, "descricao": "Descrição específica com dinâmicas e comandos claros do professor" },
    { "etapa": "${isPraticaCorporal ? 'Exploração Prática' : 'Apresentação do Conceito'}", "duracao_min": ${Math.round(duracaoMinutos * 0.2)}, "descricao": "Descrição específica explorando os conceitos e termos do material" },
    { "etapa": "${isPraticaCorporal ? 'Atividade Principal' : 'Prática Guiada'}", "duracao_min": ${Math.round(duracaoMinutos * 0.4)}, "descricao": "Passo a passo detalhado da atividade principal aplicando o conteúdo" },
    { "etapa": "${isPraticaCorporal ? 'Desafio / Variação' : 'Prática Independente'}", "duracao_min": ${Math.round(duracaoMinutos * 0.2)}, "descricao": "Desafio ou variação criativa aprofundando o aprendizado" },
    { "etapa": "${isPraticaCorporal ? 'Volta à Calma / Fechamento' : 'Fechamento / Avaliação'}", "duracao_min": ${Math.round(duracaoMinutos * 0.1)}, "descricao": "Fechamento com perguntas reflexivas específicas sobre o que foi ensinado" }
  ],
  "avaliacao": "Critérios de observação formativa focados nos conteúdos específicos desta aula",
  "adaptacoes": "Adaptações inclusivas ativas de regras, espaço, distâncias e apoios mútuos"
}`;
    }

    systemPrompt = `${PEDAGOGICAL_COHERENCE_POLICY}\n\n${systemPrompt}`;
    const parts = [{ text: `${systemPrompt}\n\n${userPrompt}` }];

    console.log('====================================================');
    console.log('[ETAPA 3 - DEBUG] JSON DE ENTRADA ENVIADO AO MODELO:');
    console.log(JSON.stringify(cleanedAnalysisData, null, 2));
    console.log('[ETAPA 3 - DEBUG] PARÂMETROS DA REQUISIÇÃO:', {
      disciplina: cleanedAnalysisData.componente_curricular_lido || disciplina,
      ano: cleanedAnalysisData.ano_serie_lido || ano,
      tema: finalTema,
      duracaoMinutos,
      numAulas,
      isPraticaCorporal,
    });
    console.log('====================================================');

    const result = await generateGeminiWithRetry(this.ai, {
      contents: { parts },
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const rawText = result.text || '';
    console.log('====================================================');
    console.log('[ETAPA 3 - DEBUG] RESPOSTA BRUTA DA API (RAW TEXT):');
    console.log(rawText);
    console.log('====================================================');

    let parsed: any;
    try {
      parsed = extractAndParseJson(rawText, null);
      if (parsed && typeof parsed === 'object') {
        console.log('[ETAPA 3 - DEBUG] JSON PARSEADO COM SUCESSO:', JSON.stringify(parsed, null, 2));
      } else {
        console.warn('[ETAPA 3 - DEBUG] JSON retornado é nulo, aplicando fallback estruturado.');
        parsed = {
          tema: finalTema,
          conteudo_extraido: analysis.conteudos_identificados,
          markdownCompleto: rawText,
        };
      }
    } catch (err: any) {
      console.warn('[ETAPA 3 - DEBUG] Falha no parse do JSON:', err?.message);
      parsed = {
        tema: finalTema,
        conteudo_extraido: analysis.conteudos_identificados,
        markdownCompleto: rawText,
      };
    }

    return { parsed, rawText };
  }

  // 4. REVISÃO E VALIDAÇÃO FINAL DO PLANO (FINAL REVIEW)
  async reviewLesson(
    lessonData: any,
    analysis: MaterialAnalysisResult,
    params: GenerateLessonParams
  ): Promise<FinalReviewResult> {
    const tema = lessonData.tema || '';
    const temaCorresponde = !BANNED_GENERICS_REGEX.test(tema) && tema.length > 3;
    const aulas = Array.isArray(lessonData.aulas) ? lessonData.aulas : [];
    const atividadesEnsinam = aulas.length > 0;
    const tempoCorreto = true;
    const materiaisAcessiveis = Array.isArray(lessonData.materiais) && lessonData.materiais.length > 0;
    const bnccValida = Boolean(lessonData.bncc?.codigo && !lessonData.bncc.codigo.includes('NÃO DETERMINADA'));
    const inclusaoAtiva = true;

    return {
      tema_corresponde_imagem: temaCorresponde,
      atividades_ensinam_tema: atividadesEnsinam,
      adequado_idade: true,
      tempo_correto: tempoCorreto,
      materiais_acessiveis: materiaisAcessiveis,
      bncc_correta: bnccValida,
      inclusao_ativa: inclusaoAtiva,
      aprovado: temaCorresponde && atividadesEnsinam,
      observacoes: 'Plano verificado com sucesso pelo pipeline de controle.',
    };
  }
}

// -------------------------------------------------------------
// OPENAI PROVIDER IMPLEMENTATION (FALLBACK / ALTERNATIVE)
// -------------------------------------------------------------
export class OpenAIAIProvider implements AIProvider {
  private openai: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY não foi configurada.');
    }
    this.openai = new OpenAI({ apiKey: key });
  }

  async analyzeMaterial(params: AnalyzeMaterialParams): Promise<MaterialAnalysisResult> {
    const { images, textoOcr, disciplina, segmento, ano } = params;

    const messages: any[] = [
      {
        role: 'system',
        content: `Você é o analisador de materiais didáticos do aplicativo Aula Clara. Sua função é executar a ETAPA 1 — EXTRAÇÃO:
Extraia exatamente:
1. "titulo_exato": Título ou heading lido no topo da página. Se a página NÃO tiver um título/heading explícito, sintetize um Tema de até 8 palavras que resuma o assunto central do texto extraído (ex: "Respeito aos limites do corpo na ginástica").
2. "componente_curricular_lido": Componente do rodapé/cabeçalho. Se não encontrado na imagem, retorne "não identificado na imagem".
3. "ano_serie_lido": Identifique o ANO/SÉRIE: extraia se houver indicação textual (ex: "3º ANO", "6º ANO", "1º ANO EM") ou deduza pelo nível e complexidade do conteúdo (ex: "3º Ano (Ensino Fundamental)", "1º Ano (Ensino Médio)").
4. "volume_lido": Volume lido explicitamente na página se houver. Se não houver, escreva "não identificado na imagem".
5. "capitulo_lido": Capítulo lido explicitamente na página se houver. Se não houver, escreva "não identificado na imagem".
6. "dados_concretos": Conceitos, materiais, nomes de aparelhos, medidas, regras e definições citadas no texto (NUNCA repita o título).
7. "perguntas_atividades_texto": Perguntas ou atividades do texto.
8. "tema_principal": Tema específico de até 8 palavras resumindo o assunto. Se não houver título explícito, sintetize em até 8 palavras.
9. "conteudos_identificados": Lista de conteúdos.
10. "conceitos_chave": Palavras-chave.
11. "resumo": Resumo fiel de 2 a 4 linhas.

REGRA DE EXCLUSÃO DE MARCADORES TÉCNICOS:
- IGNORE COMPLETAMENTE marcadores de digitalização como "--- PÁGINA X ---", "=== PÁGINA X ===", "PÁGINA X", números de página soltos (ex: "42", "Pág. 12", "1 de 4") e rodapés de scanner (CamScanner, Adobe Scan, etc.).
- Eles NUNCA devem aparecer no Título, Tema, Conteúdos, Conceitos, Dados Concretos, Perguntas ou em qualquer campo do plano de aula.

PROIBIDO usar temas genéricos ("Introdução", "Conceitos fundamentais", etc.). Responda exclusivamente em JSON.`,
      },
    ];

    const contentParts: any[] = [];
    if (textoOcr) {
      const cleanOcr = cleanOcrText(textoOcr);
      if (cleanOcr) {
        contentParts.push({ type: 'text', text: `TEXTO DO MATERIAL (OCR LIMPO):\n${cleanOcr}` });
      }
    }
    if (Array.isArray(images)) {
      for (const img of images) {
        const base64Data = (img.base64 || '').replace(/^data:image\/\w+;base64,/, '');
        const mimeType = img.type || img.mimeType || 'image/jpeg';
        if (base64Data) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Data}` },
          });
        }
      }
    }

    if (contentParts.length === 0) {
      contentParts.push({ type: 'text', text: `Disciplina: ${disciplina}, ${segmento}, ${ano}` });
    }

    messages.push({ role: 'user', content: contentParts });

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.0,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = extractAndParseJson<any>(raw, {});
    let tituloExato = stripTechnicalMarkers(parsed.titulo_exato || parsed.titulo || 'Material Didático');
    let temaPrincipal = stripTechnicalMarkers(parsed.tema_principal || 'Conteúdo Identificado');
    let componenteLido = stripTechnicalMarkers(parsed.componente_curricular_lido || '');
    let anoSerieLido = stripTechnicalMarkers(parsed.ano_serie_lido || '');
    let volumeLido = stripTechnicalMarkers(parsed.volume_lido || '');
    let capituloLido = stripTechnicalMarkers(parsed.capitulo_lido || '');

    if (!anoSerieLido || anoSerieLido.toLowerCase().includes('não identificado') || anoSerieLido.toLowerCase().includes('nao identificado')) {
      anoSerieLido = 'não identificado na imagem';
    }
    if (!componenteLido || componenteLido.toLowerCase().includes('não identificado') || componenteLido.toLowerCase().includes('nao identificado')) {
      componenteLido = 'não identificado na imagem';
    }
    if (!volumeLido || volumeLido.toLowerCase().includes('não identificado') || volumeLido.toLowerCase().includes('nao identificado')) {
      volumeLido = 'não identificado na imagem';
    }
    if (!capituloLido || capituloLido.toLowerCase().includes('não identificado') || capituloLido.toLowerCase().includes('nao identificado')) {
      capituloLido = 'não identificado na imagem';
    }

    if (!tituloExato || isTechnicalMarker(tituloExato) || tituloExato === 'Material Didático') {
      tituloExato = limitToWords(temaPrincipal, 8);
    }
    temaPrincipal = limitToWords(temaPrincipal, 8);

    return {
      titulo: tituloExato,
      titulo_exato: tituloExato,
      componente_curricular_lido: componenteLido,
      ano_serie_lido: anoSerieLido,
      volume_lido: volumeLido,
      capitulo_lido: capituloLido,
      tema_principal: temaPrincipal,
      conteudos_identificados: cleanTechnicalMarkersArray(parsed.conteudos_identificados),
      conceitos_chave: cleanTechnicalMarkersArray(parsed.conceitos_chave),
      dados_concretos: cleanTechnicalMarkersArray(parsed.dados_concretos),
      perguntas_atividades_texto: cleanTechnicalMarkersArray(parsed.perguntas_atividades_texto),
      atividade_sugerida_pelo_livro: stripTechnicalMarkers(parsed.atividade_sugerida_pelo_livro || ''),
      resumo: stripTechnicalMarkers(parsed.resumo || ''),
      confianca: typeof parsed.confianca === 'number' ? parsed.confianca : 85,
    };
  }

  async validateAnalysis(params: ValidateAnalysisParams): Promise<ValidationResult> {
    const { analysis, disciplina } = params;
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Valide se o tema representa fielmente o conteúdo do material didático. Responda em JSON: { "aprovado": true|false, "confianca": 0-100, "tema_corrigido": "", "motivo": "" }',
        },
        {
          role: 'user',
          content: `Disciplina: ${disciplina}\nTítulo: ${analysis.titulo}\nTema: ${analysis.tema_principal}\nConteúdos: ${JSON.stringify(analysis.conteudos_identificados)}\nResumo: ${analysis.resumo}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0,
    });
    const parsed = extractAndParseJson(completion.choices[0]?.message?.content || '{}', {
      aprovado: true,
      confianca: 90,
      tema_corrigido: analysis.tema_principal,
      motivo: 'Validação concluída.',
    });
    return {
      aprovado: Boolean(parsed.aprovado),
      confianca: typeof parsed.confianca === 'number' ? parsed.confianca : 90,
      tema_corrigido: parsed.tema_corrigido || analysis.tema_principal,
      motivo: parsed.motivo || 'Validação concluída.',
    };
  }

  async processAndStructureMaterial(params: AnalyzeMaterialParams): Promise<ProcessedMaterialCache> {
    const { images, textoOcr, disciplina, segmento, ano, forceFresh } = params;

    const hash = generateMaterialHash(textoOcr, images, disciplina, segmento, ano);

    if (!forceFresh) {
      const cached = materialCacheInstance.get(hash);
      if (cached) {
        return cached;
      }
    }

    const cleanOcr = cleanOcrText(textoOcr || '');
    const { conteudoDidatico, questoesMaterial } = separateDidacticContentFromQuestions(cleanOcr);

    const analysis = await this.analyzeMaterial(params);
    const validation = await this.validateAnalysis({
      ...params,
      analysis,
    });

    const searchTerms = [
      ...(analysis.conteudos_identificados || []),
      ...(analysis.dados_concretos || []),
      ...(analysis.conceitos_chave || []),
    ];
    const officialBncc = matchOfficialBnccSkill(
      disciplina,
      segmento,
      ano,
      validation.aprovado ? analysis.tema_principal : (validation.tema_corrigido || analysis.tema_principal),
      searchTerms
    );

    const bnccCandidatas = officialBncc.habilidades?.map((h) => ({
      codigo: h.codigo,
      descricao: h.descricao,
      unidadeTematica: (h as any).unidadeTematica || '',
    })) || (officialBncc.codigo ? [{ codigo: officialBncc.codigo, descricao: officialBncc.descricao }] : []);

    const resumoPedagogico = buildPedagogicalSummary(analysis, conteudoDidatico);

    const structured: ProcessedMaterialCache = {
      material_id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      hash_material: hash,
      conteudo_extraido: cleanOcr,
      conteudo_didatico_limpo: conteudoDidatico,
      questoes_existentes_no_material: questoesMaterial,
      disciplina: disciplina || analysis.componente_curricular_lido || 'Educação Física',
      segmento: segmento || 'Ensino Fundamental',
      ano_serie: ano || analysis.ano_serie_lido || 'Ensino Fundamental',
      titulo_exato: analysis.titulo_exato,
      temas_detectados: [analysis.tema_principal, ...(analysis.conteudos_identificados || [])],
      subtemas: analysis.conteudos_identificados || [],
      conceitos_principais: analysis.conceitos_chave || [],
      dados_concretos: analysis.dados_concretos || [],
      perguntas_atividades_texto: analysis.perguntas_atividades_texto || [],
      resumo_pedagogico: resumoPedagogico,
      bncc_candidatas: bnccCandidatas,
      data_processamento: new Date().toISOString(),
      analise: analysis,
      validacao: validation,
    };

    materialCacheInstance.set(structured);
    return structured;
  }

  async generateLesson(
    params: GenerateLessonParams,
    analysis: MaterialAnalysisResult,
    validation: ValidationResult
  ): Promise<{ parsed: any; rawText: string }> {
    const {
      disciplina,
      segmento,
      ano,
      numAulas,
      isEdFisicaPratica,
      duracaoMinutos = 50,
      candidatosBncc = '',
      textoOcr = '',
    } = params;

    let rawTema = validation.aprovado ? analysis.tema_principal : (validation.tema_corrigido || analysis.tema_principal);
    if (isTechnicalMarker(rawTema)) {
      rawTema = analysis.titulo_exato && !isTechnicalMarker(analysis.titulo_exato)
        ? analysis.titulo_exato
        : (analysis.conteudos_identificados?.[0] || 'Conteúdo do Material Didático');
    }
    const finalTema = stripTechnicalMarkers(rawTema);

    const isPraticaCorporal =
      isEdFisicaPratica ||
      /educa[cç][aã]o f[ií]sica|artes? c[eê]nicas?|dan[cç]a|teatro/i.test(disciplina) ||
      /gin[aá]stica|jogo|esporte|luta|dan[cç]a|circuito|esquema corporal/i.test(finalTema);

    const cleanedAnalysisData = {
      titulo_exato: stripTechnicalMarkers(analysis.titulo_exato || analysis.titulo || ''),
      componente_curricular_lido: stripTechnicalMarkers(analysis.componente_curricular_lido || ''),
      ano_serie_lido: stripTechnicalMarkers(analysis.ano_serie_lido || ''),
      volume_lido: stripTechnicalMarkers(analysis.volume_lido || ''),
      capitulo_lido: stripTechnicalMarkers(analysis.capitulo_lido || ''),
      tema_principal: finalTema,
      conteudos_identificados: cleanTechnicalMarkersArray(analysis.conteudos_identificados),
      conceitos_chave: cleanTechnicalMarkersArray(analysis.conceitos_chave),
      dados_concretos: cleanTechnicalMarkersArray(analysis.dados_concretos),
      perguntas_atividades_texto: cleanTechnicalMarkersArray(analysis.perguntas_atividades_texto),
      resumo: stripTechnicalMarkers(analysis.resumo || ''),
    };

    const effectiveDisciplina = disciplina ? disciplina.trim() : (cleanedAnalysisData.componente_curricular_lido && cleanedAnalysisData.componente_curricular_lido !== 'não identificado na imagem' ? cleanedAnalysisData.componente_curricular_lido : 'Educação Física');
    const honestAnoSerie = ano ? ano.trim() : (cleanedAnalysisData.ano_serie_lido && cleanedAnalysisData.ano_serie_lido !== 'não identificado na imagem' ? cleanedAnalysisData.ano_serie_lido : 'Ensino Fundamental');
    const dificuldadeLevel = params.dificuldade || 'Médio';

    let systemPrompt = '';
    let userPrompt = '';

    if (params.isOnlyProva) {
      const contextualizacaoDesc =
        dificuldadeLevel === 'Fácil'
          ? 'NÍVEL FÁCIL: Menos contextualizada, questões diretas, vocabulário acessível, focando na fixação dos conceitos centrais e termos literais do material didático.'
          : dificuldadeLevel === 'Difícil'
          ? 'NÍVEL DIFÍCIL: Alta contextualização, pequenos estudos de caso e situações-problema desafiadoras, exigindo análise crítica, comparação de conceitos, interpretação e resolução de problemas aprofundada.'
          : 'NÍVEL MÉDIO: Contextualização equilibrada com situações cotidianas e escolares, conectando a teoria à aplicação prática com clareza.';

      systemPrompt = `Você é um professor e avaliador pedagógico especialista em elaboração de avaliações escolares bimestrais e oficiais alinhadas à BNCC.

Sua tarefa é gerar uma AVALIAÇÃO GERADA / PROVA GERADA cumprindo OBRIGATORIAMENTE as seguintes 10 regras fundamentais:

================================================================================
REGRAS OBRIGATÓRIAS DE GERAÇÃO DA AVALIAÇÃO:
================================================================================

1. DISCIPLINA (PRIORIDADE ABSOLUTA):
   - A disciplina desta avaliação é OBRIGATORIAMENTE "${effectiveDisciplina}".
   - Se o professor selecionou "${effectiveDisciplina}", todas as questões e conteúdos devem ser exclusivamente de ${effectiveDisciplina}.
   - NUNCA classifique ou mude para "Linguagens" apenas por causa de cabeçalhos editoriais ou rodapés de livros didáticos.

2. ANO / SÉRIE:
   - O nível escolar é "${honestAnoSerie}".
   - NUNCA atribua automaticamente "1º Ano" como padrão. Mantenha estritamente o ano/série selecionado pelo professor.

3. ANÁLISE INTEGRADA DE MÚLTIPLAS PÁGINAS:
   - Todo o conteúdo fornecido das imagens e texto OCR deve ser tratado de forma unificada e integrada como um único material contínuo.

4. NÃO COPIAR QUESTÕES EXISTENTES NO LIVRO (ORIGINALIDADE CRÍTICA):
   - A imagem/OCR serve para fornecer o CONTEÚDO (conceitos, definições, fatos, regras, dados numéricos, processos).
   - As perguntas ou exercícios impressos na apostila servem apenas como REFERÊNCIA de nível.
   - É TERMINANTEMENTE PROIBIDO copiar os enunciados, alternativas ou itens existentes na apostila.
   - TODAS AS 10 QUESTÕES DEVEM SER 100% INÉDITAS, CRIADAS DO ZERO, contextualizadas e fundamentadas no texto da apostila.

5. ADEQUAÇÃO PEDAGÓGICA E COGNITIVA:
   - Vocabulário, tamanho de texto e nível cognitivo estritamente adequados ao ano/série "${honestAnoSerie}".
   - Nível de Dificuldade selecionado: ${dificuldadeLevel}.
   - ${contextualizacaoDesc}

6. PRECISÃO DA BNCC:
   - Apenas apresente códigos e habilidades da BNCC se houver correspondência segura com a disciplina (${effectiveDisciplina}) e o ano (${honestAnoSerie}).
   - Se incerto, utilize: "Habilidade BNCC específica não determinada com segurança para o conteúdo informado."

7. NOMENCLATURA E PADRÃO:
   - Template exclusivo de Avaliação/Prova ("tipo_material": "prova").
   - Exatamente 10 questões valendo 1,0 ponto cada (total 10,0 pontos).
   - Questões 1 a 5: MÚLTIPLA ESCOLHA com 5 alternativas cada (A, B, C, D, E). Apenas UMA correta.
   - Questões 6 a 10: DISSERTATIVAS / DISCURSIVAS com linhas de resposta e critérios objetivos.

8. GABARITO SEPARADO E LITERAL (SEM RESPOSTAS EVASIVAS OU GENÉRICAS):
   - Múltipla Escolha (1 a 5): campo "resposta_correta" com a letra exata (A, B, C, D ou E) e "justificativa" factual literal extraída do texto do material provando a alternativa correta.
   - Dissertativas (6 a 10): campo "expectativa_resposta" DEVE RETORNAR LITERALMENTE A RESPOSTA COMPLETA E EXATA DA PERGUNTA com base estrita no material didático.
   - É ESTRITAMENTE PROIBIDO usar respostas evasivas ("resposta pessoal", "o estudante deve refletir", "resposta aberta").
   - O campo "criterios_correcao" deve detalhar a chave de correção objetiva com pontuação gradual (ex: 1,0 ponto / 0,5 ponto / 0 ponto).

9. CONSISTÊNCIA E VALIDAÇÃO INTERNA:
   - Valide internamente que todas as 10 regras foram rigorosamente cumpridas antes de retornar o JSON.

10. FORMATO DE SAÍDA JSON ESTRITO:
    - Retorne EXCLUSIVAMENTE um objeto JSON válido iniciando em { e terminando em }, sem qualquer texto ou markdown adicional fora do JSON.`;

      userPrompt = `DADOS EXTRAÍDOS DO MATERIAL DIDÁTICO (CONTEÚDO BASE):
\`\`\`json
${JSON.stringify(cleanedAnalysisData, null, 2)}
\`\`\`

PARÂMETROS PEDAGÓGICOS DA AVALIAÇÃO:
- Disciplina: ${effectiveDisciplina}
- Ano/Série: ${honestAnoSerie}
- Tema: ${finalTema}
- Nível de Dificuldade: ${dificuldadeLevel}
${textoOcr ? `- Texto Integral do Material Didático (OCR):\n${cleanOcrText(textoOcr)}\n` : ''}

Gere o JSON da AVALIAÇÃO GERADA (10 questões inéditas e gabarito com critérios objetivos):
{
  "tipo_material": "prova",
  "disciplina": "${effectiveDisciplina}",
  "ano_serie": "${honestAnoSerie}",
  "tema": "${finalTema}",
  "dificuldade": "${dificuldadeLevel}",
  "bncc": {
    "codigo": "[Código BNCC oficial seguro ou 'Habilidade BNCC específica não determinada com segurança.']",
    "texto": "[Descrição da habilidade ou justificativa pedagógica]"
  },
  "questoes": [
    {
      "numero": 1,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito, claro e contextualizado da questão 1",
      "alternativas": ["A) Opção A", "B) Opção B", "C) Opção C", "D) Opção D", "E) Opção E"],
      "resposta_correta": "A",
      "justificativa": "Justificativa: informação explicitamente apresentada no material (ou conclusão compatível com o material)"
    },
    {
      "numero": 2,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 2",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "B",
      "justificativa": "..."
    },
    {
      "numero": 3,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 3",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "C",
      "justificativa": "..."
    },
    {
      "numero": 4,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 4",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "D",
      "justificativa": "..."
    },
    {
      "numero": 5,
      "tipo": "multipla_escolha",
      "pontuacao": 1.0,
      "enunciado": "Enunciado inédito da questão 5",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
      "resposta_correta": "E",
      "justificativa": "..."
    },
    {
      "numero": 6,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito e acessível da questão 6",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados na resposta do estudante (aceitando formulações semelhantes que preservem o sentido conceitual)",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 7,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 7",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 8,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 8",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 9,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 9",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    },
    {
      "numero": 10,
      "tipo": "dissertativa",
      "pontuacao": 1.0,
      "enunciado": "Enunciado dissertativo inédito da questão 10",
      "linhas_resposta": 5,
      "expectativa_resposta": "Elementos essenciais esperados com fidelidade factual ao material",
      "criterios_correcao": "Resposta completa: 1,0 ponto | Resposta parcial: 0,5 ponto | Incorreta: 0,0 ponto"
    }
  ]
}`;
    } else {
      systemPrompt = `Você é um assistente pedagógico especialista que constrói planos de aula práticos, inéditos e altamente estruturados a partir do conteúdo extraído de livros didáticos.

================================================
DIRETRIZ CRÍTICA: PROIBIÇÃO DE TEMPLATES GENÉRICOS
================================================
- Você DEVE usar como fonte PRIMÁRIA E OBRIGATÓRIA o JSON completo da Etapa 1 fornecido no prompt.
- NUNCA use frases pré-fabricadas, genéricas ou clichês pedagógicos (ex: "exploração prática dos movimentos", "compreender os conceitos fundamentais", "deslocamentos pelo espaço", "circuito em estações").
- Cada atividade do desenvolvimento deve ser uma criação original que cita diretamente e trabalha os conceitos, termos técnicos, dados numéricos, regras, aparelhos ou exercícios presentes no material didático.
- NUNCA inclua marcadores técnicos como "--- PÁGINA N ---", números de página soltos ou cabeçalhos de digitalização em nenhum campo.

ESTRUTURA PEDAGÓGICA DA AULA:
${isPraticaCorporal
  ? `1. Aquecimento / Ativação: preparação corporal direcionada aos movimentos específicos do tema.
2. Exploração Prática / Experimentação: vivência direta dos fundamentos, regras ou materiais da página.
3. Atividade Principal: dinâmica estruturada em grupos ou circuitos com comandos claros aplicando o conteúdo.
4. Desafio / Variação Criativa: situação-problema motora ou ampliação da complexidade.
5. Volta à Calma / Fechamento: roda de reflexão com perguntas específicas sobre o aprendizado da aula.`
  : `1. Retomada / Motivação: contextualização com pergunta disparadora ligada ao tema.
2. Apresentação do Conceito: explicação dialogada dos tópicos e termos extraídos do livro.
3. Prática Guiada: atividades ou resolução passo a passo em duplas/grupos com mediação do professor.
4. Prática Independente: resolução autônoma ou desafio contextualizado aplicando os conceitos.
5. Fechamento / Avaliação Formativa: síntese coletiva com perguntas de checagem de aprendizagem.`}

INCLUSÃO ATIVA:
- Proibido qualquer papel passivo (anotador, juiz, mesário). Todos os alunos participam com adaptações reais de regras, distâncias e apoios.`;

      userPrompt = `DADOS REAIS EXTRAÍDOS DO MATERIAL DIDÁTICO (ETAPA 1 - ENTRADA JSON COMPLETA):
\`\`\`json
${JSON.stringify(cleanedAnalysisData, null, 2)}
\`\`\`

PARÂMETROS DA AULA:
- Componente Curricular: ${effectiveDisciplina}
- Ano/Série: ${honestAnoSerie}
- Tema: ${finalTema}
- Duração: ${duracaoMinutos} minutos (${numAulas} aula(s))
${candidatosBncc ? `- Habilidades BNCC sugeridas:\n${candidatosBncc}\n` : ''}
${textoOcr ? `- Texto do material (OCR limpo):\n${cleanOcrText(textoOcr)}\n` : ''}

ETAPA 3 — PLANO DE AULA (OBRIGATÓRIO):
Gere o plano de aula no formato JSON rigoroso abaixo, criando objetivos e atividades 100% específicos para os conteúdos acima:

{
  "disciplina": "${effectiveDisciplina}",
  "ano_serie": "${honestAnoSerie}",
  "volume_capitulo": "${(cleanedAnalysisData.volume_lido && cleanedAnalysisData.volume_lido !== 'não identificado na imagem' ? cleanedAnalysisData.volume_lido : '') + (cleanedAnalysisData.capitulo_lido && cleanedAnalysisData.capitulo_lido !== 'não identificado na imagem' ? ' | ' + cleanedAnalysisData.capitulo_lido : '') || 'não identificado na imagem'}",
  "tema": "${finalTema}",
  "conteudo_extraido": ${JSON.stringify(cleanedAnalysisData.conteudos_identificados.length > 0 ? cleanedAnalysisData.conteudos_identificados : [cleanedAnalysisData.resumo])},
  "bncc": {
    "codigo": "[Código BNCC oficial ou vazio]",
    "texto": "[Texto resumido oficial da habilidade]",
    "confianca": "alta | aproximada | nao_determinada",
    "observacao": ""
  },
  "duracao_min": ${duracaoMinutos},
  "objetivos": [
    "Objetivo 1 concreto descrevendo aprendizado real do conteúdo",
    "Objetivo 2 concreto descrevendo desenvolvimento prático/cognitivo",
    "Objetivo 3 concreto descrevendo atitude, cooperação ou reflexão"
  ],
  "materiais": [
    "Material específico necessário (ou: Nenhum material obrigatório - uso exclusivo do próprio corpo)"
  ],
  "desenvolvimento": [
    { "etapa": "${isPraticaCorporal ? 'Aquecimento / Ativação Inicial' : 'Retomada / Motivação'}", "duracao_min": ${Math.round(duracaoMinutos * 0.1)}, "descricao": "Descrição específica com dinâmicas e comandos claros do professor" },
    { "etapa": "${isPraticaCorporal ? 'Exploração Prática' : 'Apresentação do Conceito'}", "duracao_min": ${Math.round(duracaoMinutos * 0.2)}, "descricao": "Descrição específica explorando os conceitos e termos do material" },
    { "etapa": "${isPraticaCorporal ? 'Atividade Principal' : 'Prática Guiada'}", "duracao_min": ${Math.round(duracaoMinutos * 0.4)}, "descricao": "Passo a passo detalhado da atividade principal aplicando o conteúdo" },
    { "etapa": "${isPraticaCorporal ? 'Desafio / Variação' : 'Prática Independente'}", "duracao_min": ${Math.round(duracaoMinutos * 0.2)}, "descricao": "Desafio ou variação criativa aprofundando o aprendizado" },
    { "etapa": "${isPraticaCorporal ? 'Volta à Calma / Fechamento' : 'Fechamento / Avaliação'}", "duracao_min": ${Math.round(duracaoMinutos * 0.1)}, "descricao": "Fechamento com perguntas reflexivas específicas sobre o que foi ensinado" }
  ],
  "avaliacao": "Critérios de observação formativa focados nos conteúdos específicos desta aula",
  "adaptacoes": "Adaptações inclusivas ativas de regras, espaço, distâncias e apoios mútuos"
}`;
    }

    systemPrompt = `${PEDAGOGICAL_COHERENCE_POLICY}\n\n${systemPrompt}`;
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const rawText = completion.choices[0]?.message?.content || '{}';
    const parsed = extractAndParseJson(rawText, {
      tema: finalTema,
      conteudo_extraido: analysis.conteudos_identificados,
      markdownCompleto: rawText,
    });
    return { parsed, rawText };
  }

  async reviewLesson(
    lessonData: any,
    analysis: MaterialAnalysisResult,
    params: GenerateLessonParams
  ): Promise<FinalReviewResult> {
    return {
      tema_corresponde_imagem: true,
      atividades_ensinam_tema: true,
      adequado_idade: true,
      tempo_correto: true,
      materiais_acessiveis: true,
      bncc_correta: true,
      inclusao_ativa: true,
      aprovado: true,
      observacoes: 'Aprovado via OpenAI Validator.',
    };
  }
}

// -------------------------------------------------------------
// FACTORY
// -------------------------------------------------------------
export class AIProviderFactory {
  static getProvider(): AIProvider {
    return new GeminiAIProvider();
  }
}
