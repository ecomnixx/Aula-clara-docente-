import { BNCC_SKILLS_DATABASE } from '../data/bnccData';
import { BnccSkill } from '../types';

export type BnccArea =
  | 'Linguagens'
  | 'Matematica'
  | 'Ciencias_Natureza'
  | 'Ciencias_Humanas'
  | 'Educacao_Infantil'
  | 'Geral';

export interface MatchBnccResult {
  codigo: string;
  descricao: string;
  confianca: 'alta' | 'media' | 'aproximada';
  habilidades: Array<{ codigo: string; descricao: string; status?: string }>;
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export const BNCC_DATABASE_METADATA = Object.freeze({
  fonte: 'Base Nacional Comum Curricular — Ministério da Educação',
  versao: 'BNCC homologada (Educação Infantil, Ensino Fundamental e Ensino Médio)',
  status: 'ativa' as const,
});

export interface GetBnccSkillsParams {
  disciplina: string;
  etapa: string;
  anoSerie: string;
  objetivo?: string;
  limite?: number;
}

export interface BnccSkillRecord extends BnccSkill {
  areaConhecimento: BnccArea;
  fonte: string;
  versao: string;
  ativo: boolean;
}

const bnccQueryCache = new Map<string, BnccSkillRecord[]>();

export function getBnccSkills(params: GetBnccSkillsParams): BnccSkillRecord[] {
  const cacheKey = [params.disciplina, params.etapa, params.anoSerie, params.objetivo || '', params.limite || 12]
    .map((value) => norm(String(value)))
    .join('|');
  const cached = bnccQueryCache.get(cacheKey);
  if (cached) return cached.map((skill) => ({ ...skill }));

  const area = getBnccKnowledgeArea(params.disciplina);
  const gradeInfo = parseGradeInfo(params.anoSerie, params.etapa);
  const disciplinaNormalizada = norm(params.disciplina);
  const objectiveTerms = norm(params.objetivo || '').split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !STOP_WORDS.has(term));

  const records = BNCC_SKILLS_DATABASE
    .filter((skill) => isSkillMatchingGrade(skill, gradeInfo))
    .filter((skill) => {
      const skillDiscipline = norm(skill.disciplina);
      return skillDiscipline.includes(disciplinaNormalizada) || disciplinaNormalizada.includes(skillDiscipline);
    })
    .map((skill) => {
      const searchable = norm(`${skill.descricao} ${skill.unidadeTematica || ''} ${skill.objetoConhecimento || ''}`);
      const relevance = objectiveTerms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
      return {
        ...skill,
        areaConhecimento: area,
        fonte: skill.fonte || BNCC_DATABASE_METADATA.fonte,
        versao: skill.versao || BNCC_DATABASE_METADATA.versao,
        ativo: skill.ativo !== false,
        relevance,
      };
    })
    .filter((skill) => skill.ativo)
    .sort((a, b) => b.relevance - a.relevance || a.codigo.localeCompare(b.codigo))
    .slice(0, params.limite || 12)
    .map(({ relevance: _relevance, ...skill }) => skill);

  bnccQueryCache.set(cacheKey, records);
  return records.map((skill) => ({ ...skill }));
}

export function validateBnccCode(code: string, candidates?: Array<{ codigo: string }>): boolean {
  const normalizedCode = (code || '').trim().toUpperCase();
  if (!normalizedCode) return false;
  const pool = candidates || BNCC_SKILLS_DATABASE.filter((skill) => skill.ativo !== false);
  return pool.some((skill) => skill.codigo.toUpperCase() === normalizedCode);
}

export function clearBnccQueryCache(): void {
  bnccQueryCache.clear();
}

/**
 * Identifica a Grande Área de Conhecimento da BNCC a partir do nome da disciplina ou componente.
 */
export function getBnccKnowledgeArea(disciplina: string): BnccArea {
  const d = norm(disciplina);

  if (
    d.includes('lingua portuguesa') ||
    d.includes('portugues') ||
    d.includes('literatura') ||
    d.includes('redacao') ||
    d.includes('alfabetizacao') ||
    d.includes('letramento') ||
    d.includes('linguagen') ||
    d.includes('linguagem') ||
    d.includes('arte') ||
    d.includes('artes') ||
    d.includes('musica') ||
    d.includes('teatro') ||
    d.includes('danca') ||
    d.includes('educacao fisica') ||
    d.includes('ed fisica') ||
    d.includes('ed. fisica') ||
    d.includes('educ. fisica') ||
    d.includes('cultura corporal') ||
    d.includes('ingles') ||
    d.includes('english') ||
    d.includes('espanhol') ||
    d.includes('spanish')
  ) {
    return 'Linguagens';
  }

  if (
    d.includes('matematica') ||
    d.includes('math') ||
    d.includes('algebra') ||
    d.includes('geometria') ||
    d.includes('estatistica') ||
    d.includes('financeira') ||
    d.includes('raciocinio') ||
    d.includes('calculo')
  ) {
    return 'Matematica';
  }

  if (
    d.includes('ciencia') ||
    d.includes('natureza') ||
    d.includes('fisica') ||
    d.includes('quimica') ||
    d.includes('biologia') ||
    d.includes('astronomia') ||
    d.includes('ecologia') ||
    d.includes('geociencias')
  ) {
    return 'Ciencias_Natureza';
  }

  if (
    d.includes('historia') ||
    d.includes('geografia') ||
    d.includes('filosofia') ||
    d.includes('sociologia') ||
    d.includes('humana') ||
    d.includes('religioso') ||
    d.includes('social') ||
    d.includes('sociais') ||
    d.includes('cidadania')
  ) {
    return 'Ciencias_Humanas';
  }

  if (d.includes('infantil')) {
    return 'Educacao_Infantil';
  }

  return 'Geral';
}

/**
 * Verifica se a habilidade da BNCC pertence à Área de Conhecimento esperada.
 */
export function isSkillInArea(skill: BnccSkill, area: BnccArea): boolean {
  if (area === 'Geral') return true;

  const code = (skill.codigo || '').toUpperCase();
  const disc = norm(skill.disciplina);
  const ut = norm(skill.unidadeTematica || '');

  switch (area) {
    case 'Linguagens':
      return (
        code.startsWith('EM13LGG') ||
        code.startsWith('EM13LP') ||
        code.includes('LP') ||
        code.includes('AR') ||
        code.includes('EF') ||
        code.includes('LI') ||
        disc.includes('portuguesa') ||
        disc.includes('arte') ||
        disc.includes('fisica') ||
        disc.includes('ingles') ||
        disc.includes('espanhol') ||
        disc.includes('linguagens') ||
        ut.includes('linguagens')
      );
    case 'Matematica':
      return (
        code.startsWith('EM13MAT') ||
        code.includes('MA') ||
        disc.includes('matematica') ||
        disc.includes('financeira') ||
        ut.includes('matematica')
      );
    case 'Ciencias_Natureza':
      return (
        code.startsWith('EM13CNT') ||
        code.includes('CI') ||
        disc.includes('ciencias') ||
        disc.includes('fisica') ||
        disc.includes('quimica') ||
        disc.includes('biologia') ||
        ut.includes('natureza')
      );
    case 'Ciencias_Humanas':
      return (
        code.startsWith('EM13CHS') ||
        code.includes('HI') ||
        code.includes('GE') ||
        code.includes('ER') ||
        disc.includes('historia') ||
        disc.includes('geografia') ||
        disc.includes('filosofia') ||
        disc.includes('sociologia') ||
        disc.includes('religioso') ||
        ut.includes('humanas')
      );
    case 'Educacao_Infantil':
      return code.startsWith('EI') || norm(skill.segmento).includes('infantil');
    default:
      return true;
  }
}

/**
 * Resolve o contexto educacional efetivo (Disciplina, Segmento, Ano) cruzando
 * os dados fornecidos pelo formulário e os dados reais lidos da imagem.
 */
export interface EffectiveContext {
  disciplina: string;
  segmento: string;
  ano: string;
  anoSerieDisplay: string;
}

export function resolveEffectiveContext(
  disciplinaForm: string,
  segmentoForm: string,
  anoForm: string,
  analysis?: {
    componente_curricular_lido?: string;
    ano_serie_lido?: string;
    tema_principal?: string;
    conteudos_identificados?: string[];
  }
): EffectiveContext {
  const normFormSeg = norm(segmentoForm);
  const normFormAno = norm(anoForm);

  // 1. DISCIPLINA (REGRA 1 - PRIORIDADE ABSOLUTA DA ESCOLHA DO PROFESSOR)
  // A disciplina selecionada pelo professor no aplicativo é a fonte principal e tem prioridade absoluta.
  // NUNCA substituir por áreas de conhecimento editoriais ("Linguagens", "Ciências da Natureza", "Ciências Humanas"),
  // cabeçalhos de coleções ou selos de apostila.
  let effectiveDisciplina = disciplinaForm ? disciplinaForm.trim() : 'Educação Física';

  // 2. Extrair informações de Ano/Série da imagem se presentes
  const anoLido = analysis?.ano_serie_lido;
  let detectedGradeNum: number | null = null;
  let isMedioDetected = false;
  let isInfantilDetected = false;
  let isFundamentalDetected = false;

  if (anoLido) {
    const n = norm(anoLido);
    const isNegative =
      n.includes('nao identificado') ||
      n.includes('nao determinado') ||
      n.includes('nao informado') ||
      n.includes('desconhecido') ||
      n.includes('indeterminado') ||
      n === 'nao' ||
      n === '';

    if (!isNegative) {
      if (n.includes('medio') || n.includes('em') || n.includes('serie')) {
        isMedioDetected = true;
      }
      if (n.includes('infantil') || n.includes('creche') || n.includes('pre')) {
        isInfantilDetected = true;
      }
      if (n.includes('fundamental')) {
        isFundamentalDetected = true;
      }

      // Procurar dígito (1 a 9)
      const digitMatch = n.match(/([1-9])\s*(?:º|°|o|a)?\s*(?:ano|serie)?/i);
      if (digitMatch && digitMatch[1]) {
        detectedGradeNum = parseInt(digitMatch[1], 10);
      }
    }
  }

  // Se não encontrou número explícito na imagem, respeitar estritamente a seleção do professor (REGRA 2)
  if (detectedGradeNum === null && anoForm) {
    const digitMatch = normFormAno.match(/([1-9])\s*(?:º|°|o|a)?\s*(?:ano|serie)?/i);
    if (digitMatch && digitMatch[1]) {
      detectedGradeNum = parseInt(digitMatch[1], 10);
    }
  }

  // 3. Determinar Segmento Efetivo
  let effectiveSegmento = segmentoForm || 'Ensino Fundamental – Anos Finais';

  if (isInfantilDetected) {
    effectiveSegmento = 'Educação Infantil';
  } else if (isMedioDetected) {
    effectiveSegmento = 'Ensino Médio';
  } else if (isFundamentalDetected) {
    if (detectedGradeNum && detectedGradeNum >= 6) {
      effectiveSegmento = 'Ensino Fundamental – Anos Finais';
    } else if (detectedGradeNum && detectedGradeNum <= 5) {
      effectiveSegmento = 'Ensino Fundamental – Anos Iniciais';
    }
  }

  // 4. Determinar Ano Efetivo e Formatação Display (NUNCA INFERIR OU PADRONIZAR "1º ANO")
  let effectiveAno = anoForm || '6º Ano';
  let anoSerieDisplay = '';

  // Se o professor já selecionou um Ano/Série no formulário, utilize exatamente essa seleção
  if (anoForm && !norm(anoForm).includes('nao identificado') && anoForm.trim().length > 0) {
    effectiveAno = anoForm.trim();
    anoSerieDisplay = anoForm.trim();
  } else if (detectedGradeNum !== null) {
    // Se o ano foi identificado explicitamente na imagem
    if (effectiveSegmento === 'Ensino Médio') {
      const g = Math.min(3, Math.max(1, detectedGradeNum));
      effectiveAno = `${g}ª Série (Ensino Médio)`;
      anoSerieDisplay = `${g}ª Série (Ensino Médio)`;
    } else if (effectiveSegmento.includes('Iniciais') || effectiveSegmento.includes('iniciais')) {
      const g = Math.min(5, Math.max(1, detectedGradeNum));
      effectiveAno = `${g}º Ano`;
      anoSerieDisplay = `${g}º Ano (Ensino Fundamental – Anos Iniciais)`;
    } else if (effectiveSegmento.includes('Finais') || effectiveSegmento.includes('finais')) {
      const g = Math.min(9, Math.max(6, detectedGradeNum));
      effectiveAno = `${g}º Ano`;
      anoSerieDisplay = `${g}º Ano (Ensino Fundamental – Anos Finais)`;
    } else {
      effectiveAno = `${detectedGradeNum}º Ano`;
      anoSerieDisplay = `${detectedGradeNum}º Ano`;
    }
  } else if (anoLido && !norm(anoLido).includes('nao identificado')) {
    effectiveAno = anoLido.trim();
    anoSerieDisplay = anoLido.trim();
  } else {
    effectiveAno = 'não identificado na imagem';
    anoSerieDisplay = 'não identificado na imagem';
  }

  return {
    disciplina: effectiveDisciplina,
    segmento: effectiveSegmento,
    ano: effectiveAno,
    anoSerieDisplay,
  };
}

/**
 * Resolve o campo Ano/Série de forma 100% fiel e sem inferências forçadas:
 * - Se o professor já tiver selecionado um Ano/Série no aplicativo, utilize exatamente essa seleção.
 * - Se estiver claramente escrito no material (ex: "3º ANO", "7º ANO"), utiliza essa extração.
 * - NUNCA invente, estime ou escolha automaticamente uma série.
 * - NUNCA utilize 'Ensino Médio (1º ao 3º Ano)' como uma única série.
 */
export function resolveAnoSerieHonesto(
  anoLido: string | undefined | null,
  segmento: string,
  bnccCodigo?: string,
  anoFormulario?: string
): string {
  // 1. PRIORIDADE ABSOLUTA: Seleção explícita do professor
  if (anoFormulario && !norm(anoFormulario).includes('nao identificado') && anoFormulario.trim().length > 0) {
    return anoFormulario.trim();
  }

  // 2. Leitura explícita da imagem / material didático
  if (anoLido) {
    const n = norm(anoLido);
    const isNegative =
      n.includes('nao identificado') ||
      n.includes('nao determinado') ||
      n.includes('nao informado') ||
      n.includes('desconhecido') ||
      n.includes('indeterminado') ||
      n === 'nao' ||
      n === '' ||
      n === 'null' ||
      n === 'undefined';

    if (!isNegative) {
      const digitMatch = n.match(/([1-9])\s*(?:º|°|o|a)?\s*(?:ano|serie)?/i);
      if (digitMatch && digitMatch[1]) {
        const num = parseInt(digitMatch[1], 10);
        const normSeg = norm(segmento);
        if (normSeg.includes('medio') && num <= 3) {
          return `${num}ª Série (Ensino Médio)`;
        }
        if (num <= 5) {
          return `${num}º Ano (Ensino Fundamental – Anos Iniciais)`;
        }
        if (num <= 9) {
          return `${num}º Ano (Ensino Fundamental – Anos Finais)`;
        }
        return `${num}º Ano`;
      }
      return anoLido.trim();
    }
  }

  // Se não foi identificado e não foi informado pelo professor:
  return 'não identificado na imagem';
}

export interface ParsedGradeInfo {
  gradeNum: number | null;
  segment: 'infantil' | 'iniciais' | 'finais' | 'medio' | 'geral';
  isSpecificGrade: boolean;
}

const STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'sem', 'sob', 'sobre', 'uma', 'um', 'umas', 'uns', 'que', 'se',
  'ou', 'e', 'ao', 'aos', 'pelo', 'pela', 'pelos', 'pelas', 'como', 'sua', 'seu', 'suas',
  'seus', 'este', 'esta', 'isto', 'esse', 'essa', 'isso', 'aquele', 'aquela', 'aquilo',
  'aula', 'aulas', 'plano', 'ensino', 'aluno', 'alunos', 'professor', 'professora',
  'livro', 'apostila', 'pagina', 'paginas', 'capitulo', 'volume', 'texto', 'leitura',
  'estudo', 'conteudo', 'conteudos', 'tema', 'geral', 'identificado', 'exercicio',
  'exercicios', 'atividade', 'atividades', 'identificar', 'reconhecer', 'compreender',
  'analisar', 'descrever', 'aplicar', 'desenvolver', 'utilizar', 'diferentes', 'formas',
  'processos', 'significados', 'aspectos', 'atraves', 'segundo', 'durante', 'fazer'
]);

export function parseGradeInfo(anoStr: string, segmentoStr: string): ParsedGradeInfo {
  const normAno = norm(anoStr);
  const normSeg = norm(segmentoStr);

  if (
    normSeg.includes('infantil') ||
    normAno.includes('infantil') ||
    normAno.includes('creche') ||
    normAno.includes('pre')
  ) {
    return { gradeNum: null, segment: 'infantil', isSpecificGrade: false };
  }

  if (
    normSeg.includes('medio') ||
    normAno.includes('medio') ||
    normAno.includes('em') ||
    normAno.includes('serie')
  ) {
    const digitMatch = normAno.match(/([1-3])\s*(?:º|°|o|a)?\s*(?:ano|serie)?/i);
    return {
      gradeNum: digitMatch ? parseInt(digitMatch[1], 10) : null,
      segment: 'medio',
      isSpecificGrade: Boolean(digitMatch),
    };
  }

  // Ensino Fundamental: 1 a 9
  const digitMatch = normAno.match(/([1-9])\s*(?:º|°|o|a)?\s*(?:ano|serie)?/i);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    if (num >= 1 && num <= 5) {
      return { gradeNum: num, segment: 'iniciais', isSpecificGrade: true };
    }
    if (num >= 6 && num <= 9) {
      return { gradeNum: num, segment: 'finais', isSpecificGrade: true };
    }
  }

  if (normSeg.includes('iniciais')) {
    return { gradeNum: null, segment: 'iniciais', isSpecificGrade: false };
  }
  if (normSeg.includes('finais')) {
    return { gradeNum: null, segment: 'finais', isSpecificGrade: false };
  }

  return { gradeNum: null, segment: 'geral', isSpecificGrade: false };
}

export function isSkillMatchingGrade(skill: BnccSkill, gradeInfo: ParsedGradeInfo): boolean {
  const code = (skill.codigo || '').toUpperCase().trim();
  const sAno = norm(skill.ano || '');
  const sSeg = norm(skill.segmento || '');

  // 1. Ensino Médio
  if (gradeInfo.segment === 'medio') {
    return code.startsWith('EM') || sSeg.includes('medio');
  }

  // 2. Educação Infantil
  if (gradeInfo.segment === 'infantil') {
    return code.startsWith('EI') || sSeg.includes('infantil');
  }

  // 3. Ensino Fundamental com ano específico (CRITÉRIO 1 ESTRITO)
  if (gradeInfo.isSpecificGrade && gradeInfo.gradeNum !== null) {
    const g = gradeInfo.gradeNum;

    // Proibir qualquer código de Ensino Médio ou Educação Infantil
    if (code.startsWith('EM') || code.startsWith('EI')) return false;

    // Prefixo específico do ano (ex: EF07 para 7º ano, EF08 para 8º ano)
    const targetCodePrefix = `EF0${g}`;
    if (code.startsWith(targetCodePrefix)) return true;

    // Habilidades multi-ano oficiais da BNCC
    if (g === 1 || g === 2) {
      if (code.startsWith('EF12') || code.startsWith('EF15')) return true;
    }
    if (g >= 3 && g <= 5) {
      if (code.startsWith('EF35') || code.startsWith('EF15')) return true;
    }
    if (g === 6 || g === 7) {
      if (code.startsWith('EF67') || code.startsWith('EF69')) return true;
    }
    if (g === 8 || g === 9) {
      if (code.startsWith('EF89') || code.startsWith('EF69')) return true;
    }

    if (sAno.includes(`${g}º`) || sAno.includes(`${g}o`) || sAno.includes(`${g}ª`)) {
      return true;
    }

    // Se o código é de OUTRO ano (ex: EF08 para turma de 7º ano), REJEITAR TERMINANTEMENTE!
    return false;
  }

  // 4. Se não tem ano específico mas sabemos o segmento
  if (gradeInfo.segment === 'iniciais') {
    if (code.startsWith('EM') || code.startsWith('EI')) return false;
    return (
      code.startsWith('EF01') ||
      code.startsWith('EF02') ||
      code.startsWith('EF03') ||
      code.startsWith('EF04') ||
      code.startsWith('EF05') ||
      code.startsWith('EF12') ||
      code.startsWith('EF15') ||
      code.startsWith('EF35') ||
      sSeg.includes('iniciais')
    );
  }

  if (gradeInfo.segment === 'finais') {
    if (code.startsWith('EM') || code.startsWith('EI')) return false;
    return (
      code.startsWith('EF06') ||
      code.startsWith('EF07') ||
      code.startsWith('EF08') ||
      code.startsWith('EF09') ||
      code.startsWith('EF67') ||
      code.startsWith('EF69') ||
      code.startsWith('EF89') ||
      sSeg.includes('finais')
    );
  }

  return true;
}

export function matchOfficialBnccSkill(
  disciplina: string,
  segmento: string,
  ano: string,
  tema: string,
  conteudos: string[] = []
): MatchBnccResult {
  const normDisciplina = norm(disciplina);
  const gradeInfo = parseGradeInfo(ano, segmento);

  // 1. HIERARQUIA PASSO 1: Disciplina e Área de Conhecimento
  const area = getBnccKnowledgeArea(disciplina);

  // Filtrar habilidades ESTRITAMENTE dentro da mesma Área de Conhecimento
  let areaSkills = BNCC_SKILLS_DATABASE.filter((skill) => isSkillInArea(skill, area));
  if (areaSkills.length === 0) {
    areaSkills = BNCC_SKILLS_DATABASE;
  }

  // 2. HIERARQUIA PASSO 2: Segmento e Ano/Série
  // (REGRA OBRIGATÓRIA: Primeiro filtrar pelo segmento e ano/série. NUNCA selecionar habilidade de outro segmento por semelhança de palavras)
  let eligibleByGrade = areaSkills.filter((skill) => isSkillMatchingGrade(skill, gradeInfo));

  // Refinar por componente curricular / disciplina específica
  const isEdFisica =
    normDisciplina.includes('educacao fisica') ||
    normDisciplina.includes('ed fisica') ||
    normDisciplina.includes('ed. fisica') ||
    normDisciplina.includes('educ. fisica') ||
    normDisciplina.includes('cultura corporal');

  const discSpecific = eligibleByGrade.filter((skill) => {
    const sDisc = norm(skill.disciplina);
    const code = (skill.codigo || '').toUpperCase();

    if (isEdFisica) {
      return (
        sDisc.includes('educacao fisica') ||
        code.includes('EF') ||
        code.startsWith('EM13LGG2') ||
        code.startsWith('EM13LGG3') ||
        code.startsWith('EM13LGG5')
      );
    }

    return (
      sDisc.includes(normDisciplina) ||
      normDisciplina.includes(sDisc) ||
      (normDisciplina.includes('ingles') && sDisc.includes('ingles')) ||
      (normDisciplina.includes('espanhol') && sDisc.includes('espanhol')) ||
      (normDisciplina.includes('redacao') && (sDisc.includes('portuguesa') || sDisc.includes('redacao'))) ||
      (normDisciplina.includes('alfabetizacao') && sDisc.includes('portuguesa')) ||
      (normDisciplina.includes('financeira') && (sDisc.includes('matematica') || sDisc.includes('financeira'))) ||
      (normDisciplina.includes('linguagen') && (sDisc.includes('linguagen') || sDisc.includes('portuguesa') || skill.codigo.startsWith('EM13LGG')))
    );
  });

  const candidatesPool = discSpecific.length > 0 ? discSpecific : eligibleByGrade;

  // Se não há habilidades cadastradas para este segmento e ano específico:
  if (candidatesPool.length === 0) {
    return {
      codigo: 'Habilidade BNCC específica não determinada com segurança.',
      descricao: `Conteúdo de ${disciplina} (${ano || segmento}) — Habilidade BNCC específica não determinada com segurança.`,
      confianca: 'aproximada',
      habilidades: [
        {
          codigo: 'Habilidade BNCC específica não determinada com segurança.',
          descricao: `Conteúdo de ${disciplina} (${ano || segmento}) — Habilidade BNCC específica não determinada com segurança.`,
          status: 'a_confirmar',
        },
      ],
    };
  }

  // 3. HIERARQUIA PASSO 3 & 4: Unidade Temática e Conteúdo Principal
  // Extrair termos significativos de busca (excluindo stop words)
  const rawTerms = [
    ...norm(tema).split(/[\s,;:\-_/()]+/),
    ...conteudos.flatMap((c) => norm(c).split(/[\s,;:\-_/()]+/)),
  ].map((t) => t.trim()).filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

  const uniqueSearchTerms = Array.from(new Set(rawTerms));

  // Extrair bigramas (frases de 2 palavras do tema e conteúdos)
  const searchPhrases: string[] = [];
  const allTexts = [tema, ...conteudos];
  for (const text of allTexts) {
    const words = norm(text).split(/[\s,;:\-_/()]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      searchPhrases.push(`${words[i]} ${words[i + 1]}`);
    }
  }

  // Identificar potenciais Unidades Temáticas a partir do texto
  const textJoined = norm(`${tema} ${conteudos.join(' ')}`);
  const possibleThematicUnits = new Set<string>();
  if (textJoined.includes('numero') || textJoined.includes('fracao') || textJoined.includes('decimal') || textJoined.includes('potencia') || textJoined.includes('raiz') || textJoined.includes('primo') || textJoined.includes('divis') || textJoined.includes('multipl') || textJoined.includes('inteiro') || textJoined.includes('racional') || textJoined.includes('real') || textJoined.includes('irracional') || textJoined.includes('porcentagem') || textJoined.includes('juros')) {
    possibleThematicUnits.add('numeros');
  }
  if (textJoined.includes('algebra') || textJoined.includes('equacao') || textJoined.includes('incognita') || textJoined.includes('variavel') || textJoined.includes('funcao') || textJoined.includes('sistema') || textJoined.includes('fatoracao') || textJoined.includes('expressao') || textJoined.includes('proporcionalidade') || textJoined.includes('sequencia')) {
    possibleThematicUnits.add('algebra');
  }
  if (textJoined.includes('geometria') || textJoined.includes('triangulo') || textJoined.includes('quadrilatero') || textJoined.includes('poligono') || textJoined.includes('angulo') || textJoined.includes('plano cartesiano') || textJoined.includes('circunferencia') || textJoined.includes('circulo') || textJoined.includes('prisma') || textJoined.includes('piramide') || textJoined.includes('pitagoras') || textJoined.includes('tales') || textJoined.includes('simetria') || textJoined.includes('translacao') || textJoined.includes('rotacao') || textJoined.includes('reflexao') || textJoined.includes('perspectiva') || textJoined.includes('vistas')) {
    possibleThematicUnits.add('geometria');
  }
  if (textJoined.includes('grandeza') || textJoined.includes('medida') || textJoined.includes('comprimento') || textJoined.includes('massa') || textJoined.includes('tempo') || textJoined.includes('temperatura') || textJoined.includes('area') || textJoined.includes('perimetro') || textJoined.includes('volume') || textJoined.includes('capacidade') || textJoined.includes('litro') || textJoined.includes('metro')) {
    possibleThematicUnits.add('grandezas e medidas');
  }
  if (textJoined.includes('probabilidade') || textJoined.includes('estatistica') || textJoined.includes('amostra') || textJoined.includes('grafico') || textJoined.includes('tabela') || textJoined.includes('pesquisa') || textJoined.includes('media') || textJoined.includes('moda') || textJoined.includes('mediana') || textJoined.includes('amplitude') || textJoined.includes('fluxograma') || textJoined.includes('evento')) {
    possibleThematicUnits.add('probabilidade e estatistica');
  }

  let bestMatch: BnccSkill | null = null;
  let highestScore = 0;
  let maxMatchedTokens = 0;

  for (const skill of candidatesPool) {
    let score = 0;
    let matchedTokensCount = 0;

    const skillText = norm(
      `${skill.descricao} ${skill.unidadeTematica || ''} ${skill.objetoConhecimento || ''}`
    );
    const objText = norm(`${skill.objetoConhecimento || ''}`);
    const utText = norm(`${skill.unidadeTematica || ''}`);

    // Bonus por correspondência da Unidade Temática (Passo 3)
    for (const unit of possibleThematicUnits) {
      if (utText.includes(unit)) {
        score += 6;
      }
    }

    // Match de frases / bigramas no Objeto de Conhecimento e Descrição (Passo 4 e 5)
    for (const phrase of searchPhrases) {
      if (objText.includes(phrase)) {
        score += 15;
      } else if (skillText.includes(phrase)) {
        score += 10;
      }
    }

    // Match de palavras-chave individuais
    for (const term of uniqueSearchTerms) {
      if (objText.includes(term)) {
        score += 4;
        matchedTokensCount++;
      } else if (skillText.includes(term)) {
        score += 2;
        matchedTokensCount++;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      maxMatchedTokens = matchedTokensCount;
      bestMatch = skill;
    }
  }

  // 5. HIERARQUIA PASSO 5: Validação Rigorosa da Habilidade BNCC Específica
  // Usar a habilidade somente quando houver correspondência suficientemente segura entre segmento + disciplina + conteúdo + objetivo.
  const hasDirectTopicMatch =
    (highestScore >= 10 && maxMatchedTokens >= 2) ||
    (highestScore >= 8 && searchPhrases.some((p) => norm(bestMatch?.descricao || '').includes(p) || norm(bestMatch?.objetoConhecimento || '').includes(p)));

  if (bestMatch && hasDirectTopicMatch) {
    return {
      codigo: bestMatch.codigo,
      descricao: bestMatch.descricao,
      confianca: highestScore >= 14 ? 'alta' : 'media',
      habilidades: [{ codigo: bestMatch.codigo, descricao: bestMatch.descricao }],
    };
  }

  // Havendo registros compatíveis com disciplina, etapa e ano, use o melhor
  // candidato autorizado em vez de tornar a mensagem de fallback o padrão.
  if (bestMatch || candidatesPool[0]) {
    const authorizedMatch = bestMatch || candidatesPool[0];
    return {
      codigo: authorizedMatch.codigo,
      descricao: authorizedMatch.descricao,
      confianca: 'aproximada',
      habilidades: [{ codigo: authorizedMatch.codigo, descricao: authorizedMatch.descricao, status: 'banco_bncc' }],
    };
  }

  // Fallback somente quando a base realmente não possuir candidato aplicável.
  return {
    codigo: 'Habilidade BNCC específica não determinada com segurança.',
    descricao: `Conteúdo de ${disciplina} (${ano || segmento}) — Habilidade BNCC específica não determinada com segurança.`,
    confianca: 'aproximada',
    habilidades: [
      {
        codigo: 'Habilidade BNCC específica não determinada com segurança.',
        descricao: `Conteúdo de ${disciplina} (${ano || segmento}) — Habilidade BNCC específica não determinada com segurança.`,
        status: 'a_confirmar',
      },
    ],
  };
}

export function getCandidateBnccSkills(
  disciplina: string,
  segmento: string,
  ano: string,
  maxCandidates: number = 8
): string {
  const normDisciplina = norm(disciplina);
  const gradeInfo = parseGradeInfo(ano, segmento);
  const area = getBnccKnowledgeArea(disciplina);

  // 1. Filtrar rigorosamente pela área de conhecimento
  let areaSkills = BNCC_SKILLS_DATABASE.filter((skill) => isSkillInArea(skill, area));
  if (areaSkills.length === 0) {
    areaSkills = BNCC_SKILLS_DATABASE;
  }

  // 2. CRITÉRIO 1: Filtrar estritamente pelo mesmo ano/etapa
  let eligible = areaSkills.filter((skill) => isSkillMatchingGrade(skill, gradeInfo));

  // 3. Refinar por disciplina específica
  const isEdFisica =
    normDisciplina.includes('educacao fisica') ||
    normDisciplina.includes('ed fisica') ||
    normDisciplina.includes('ed. fisica') ||
    normDisciplina.includes('educ. fisica') ||
    normDisciplina.includes('cultura corporal');

  const discMatch = eligible.filter((skill) => {
    const sDisc = norm(skill.disciplina);
    const code = (skill.codigo || '').toUpperCase();

    if (isEdFisica) {
      return (
        sDisc.includes('educacao fisica') ||
        code.includes('EF') ||
        code.startsWith('EM13LGG2') ||
        code.startsWith('EM13LGG3') ||
        code.startsWith('EM13LGG5')
      );
    }

    return sDisc.includes(normDisciplina) || normDisciplina.includes(sDisc);
  });

  if (discMatch.length > 0) {
    eligible = discMatch;
  }

  if (eligible.length === 0) {
    return '(Nenhuma habilidade cadastrada para este ano específico; retorne "Habilidade BNCC específica não determinada com segurança para o conteúdo informado." no código BNCC se não houver correspondência exata)';
  }

  const selected = eligible.slice(0, maxCandidates);

  return selected
    .map((s) => `- ${s.codigo}: ${s.descricao} (${s.disciplina} - ${s.ano || s.segmento})`)
    .join('\n');
}
