import { GoogleGenAI, Type } from '@google/genai';
import {
  DiagnosticoTurmaResult,
  PlanoReensinoResult,
  AdaptacaoInclusivaResult,
  ParecerDescritivoResult,
  CumprimentoBimestreResult,
  TipoNecessidadeEspecial,
} from '../types';
import { generateGeminiWithRetry, formatAiError } from './aiProvider';

// -------------------------------------------------------------------------
// 1. MAPA DE CALOR & DIAGNÓSTICO DA TURMA
// -------------------------------------------------------------------------
const DIAGNOSTICO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mediaGeralTurma: { type: Type.NUMBER },
    taxaAprovacaoPorcentagem: { type: Type.NUMBER },
    distribuicaoNotas: {
      type: Type.OBJECT,
      properties: {
        abaixo_5: { type: Type.INTEGER },
        entre_5_e_7: { type: Type.INTEGER },
        entre_7_e_9: { type: Type.INTEGER },
        acima_9: { type: Type.INTEGER },
      },
      required: ['abaixo_5', 'entre_5_e_7', 'entre_7_e_9', 'acima_9'],
    },
    habilidadesDiagnostico: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          codigoBncc: { type: Type.STRING },
          habilidadeDescricao: { type: Type.STRING },
          taxaAcertoPorcentagem: { type: Type.NUMBER },
          status: { type: Type.STRING }, // "dominado" | "em_desenvolvimento" | "defasagem_critica"
          questoesRelacionadas: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
          recomendacaoPedagogica: { type: Type.STRING },
        },
        required: [
          'habilidadeDescricao',
          'taxaAcertoPorcentagem',
          'status',
          'questoesRelacionadas',
          'recomendacaoPedagogica',
        ],
      },
    },
    pontosFortesTurma: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    principaisDefasagensColetivas: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    resumoExecutivoDirecao: { type: Type.STRING },
    acoesRecomendadasCoordencao: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'mediaGeralTurma',
    'taxaAprovacaoPorcentagem',
    'distribuicaoNotas',
    'habilidadesDiagnostico',
    'pontosFortesTurma',
    'principaisDefasagensColetivas',
    'resumoExecutivoDirecao',
    'acoesRecomendadasCoordencao',
  ],
};

export async function generateDiagnosticoTurma(params: {
  turma: string;
  disciplina: string;
  ano_serie: string;
  bimestre: string;
  dadosProvasOuNotas: string;
  habilidadesOuTopicos?: string;
}): Promise<DiagnosticoTurmaResult> {
  const { turma, disciplina, ano_serie, bimestre, dadosProvasOuNotas, habilidadesOuTopicos } = params;

  const prompt = `
VOCÊ É UM COORDENADOR PEDAGÓGICO E ANALISTA DE DADOS EDUCACIONAIS DE ELITE (SISTEMA AULA CLARA).

SUA MISSÃO: Analisar os resultados de avaliações/notas da turma, diagnosticar o domínio das habilidades da BNCC, identificar as defasagens críticas coletivas e gerar um relatório executivo para a Direção e Coordenação Escolar.

DADOS DA TURMA:
- Turma: ${turma || 'Turma A'}
- Disciplina: ${disciplina}
- Ano/Série: ${ano_serie}
- Bimestre: ${bimestre}
${habilidadesOuTopicos ? `- Tópicos/Habilidades Previstos: ${habilidadesOuTopicos}` : ''}

RESULTADOS / NOTAS / RESPOSTAS DA TURMA:
${dadosProvasOuNotas}

DIRETRIZES DE ANÁLISE:
1. Calcule e estime com precisão estatística a média da turma, distribuição das notas e taxa de aprovação.
2. Analise cada habilidade/conteúdo trabalhado e classifique o status:
   - "dominado" (acerto >= 75%)
   - "em_desenvolvimento" (acerto entre 50% e 74%)
   - "defasagem_critica" (acerto < 50%)
3. Elenque os pontos fortes consolidados e as defasagens conceituais mais urgentes.
4. Escreva um 'resumoExecutivoDirecao' formal, claro e construtivo, ideal para Conselho de Classe e Reunião de Gestão.
5. Forneça ações práticas e recomendadas para a Coordenação Pedagógica.

RETORNE EXCLUSIVAMENTE O JSON SEGUINDO O SCHEMA.
`;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await generateGeminiWithRetry(ai, {
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: DIAGNOSTICO_SCHEMA as any,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text || '{}');

  return {
    id: `diag_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    turma: turma || 'Turma A',
    disciplina,
    ano_serie,
    bimestre,
    totalAlunosAvaliados: (parsed.distribuicaoNotas.abaixo_5 + parsed.distribuicaoNotas.entre_5_e_7 + parsed.distribuicaoNotas.entre_7_e_9 + parsed.distribuicaoNotas.acima_9) || 25,
    mediaGeralTurma: Math.round(Number(parsed.mediaGeralTurma || 6.5) * 100) / 100,
    notaMaxima: 10.0,
    taxaAprovacaoPorcentagem: Math.round(Number(parsed.taxaAprovacaoPorcentagem || 70)),
    distribuicaoNotas: parsed.distribuicaoNotas,
    habilidadesDiagnostico: parsed.habilidadesDiagnostico || [],
    pontosFortesTurma: parsed.pontosFortesTurma || [],
    principaisDefasagensColetivas: parsed.principaisDefasagensColetivas || [],
    resumoExecutivoDirecao: parsed.resumoExecutivoDirecao || '',
    acoesRecomendadasCoordencao: parsed.acoesRecomendadasCoordencao || [],
    dataCriacao: new Date().toLocaleDateString('pt-BR'),
  };
}

// -------------------------------------------------------------------------
// 2. PLANO DE REENSINO & RECUPERAÇÃO PARALELA
// -------------------------------------------------------------------------
const REENSINO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    topicoPrincipal: { type: Type.STRING },
    lacunasFocadas: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    objetivosAprendizagem: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    planoAulaReensino: {
      type: Type.OBJECT,
      properties: {
        tempoTotalMinutos: { type: Type.INTEGER },
        etapaDiagnostica: { type: Type.STRING },
        etapaMetodologiaAtiva: { type: Type.STRING },
        praticaGuiada: { type: Type.STRING },
        fechamentoConsolidacao: { type: Type.STRING },
      },
      required: [
        'tempoTotalMinutos',
        'etapaDiagnostica',
        'etapaMetodologiaAtiva',
        'praticaGuiada',
        'fechamentoConsolidacao',
      ],
    },
    atividadeRecuperacaoParalela: {
      type: Type.OBJECT,
      properties: {
        instrucoesAluno: { type: Type.STRING },
        questoes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              numero: { type: Type.INTEGER },
              enunciado: { type: Type.STRING },
              dicaAndaime: { type: Type.STRING },
              gabaritoComentado: { type: Type.STRING },
            },
            required: ['numero', 'enunciado', 'dicaAndaime', 'gabaritoComentado'],
          },
        },
      },
      required: ['instrucoesAluno', 'questoes'],
    },
    criteriosAvaliacaoRecuperacao: { type: Type.STRING },
  },
  required: [
    'topicoPrincipal',
    'lacunasFocadas',
    'objetivosAprendizagem',
    'planoAulaReensino',
    'atividadeRecuperacaoParalela',
    'criteriosAvaliacaoRecuperacao',
  ],
};

export async function generatePlanoReensino(params: {
  disciplina: string;
  ano_serie: string;
  defasagensOuQuestoesErradas: string;
  habilidadeBncc?: string;
}): Promise<PlanoReensinoResult> {
  const { disciplina, ano_serie, defasagensOuQuestoesErradas, habilidadeBncc } = params;

  const prompt = `
VOCÊ É UM ESPECIALISTA EM INTERVENÇÃO PEDAGÓGICA IMEDIATA E RECUPERAÇÃO PARALELA (SISTEMA AULA CLARA).

SUA MISSÃO: Criar um Plano de Reensino dinâmico e uma Avaliação/Atividade de Recuperação Paralela estruturada, atacando exatamente as defasagens conceituais detectadas.

CONTEXTO:
- Disciplina: ${disciplina}
- Ano/Série: ${ano_serie}
${habilidadeBncc ? `- Habilidade BNCC: ${habilidadeBncc}` : ''}
- Defasagens / Erros mais cometidos pelos alunos:
${defasagensOuQuestoesErradas}

DIRETRIZES FUNDAMENTAIS DE REENSINO:
1. NÃO repita a mesma explicação tradicional que não funcionou. Use metodologias ativas, analogias concretas, exemplos visuais ou abordagem prática investigativa.
2. Divida a aula de reensino em 4 etapas claras:
   - Etapa Diagnóstica (5-10 min): Ativação de conhecimentos prévios e desmistificação do erro comum.
   - Metodologia Ativa / Nova Abordagem (15-20 min): Construção colaborativa do conceito central.
   - Prática Guiada com Andaime Pedagógico (15 min): Resolução assistida em duplas/grupos.
   - Fechamento & Checagem de Compreensão (10 min): Síntese rápida individual.
3. Atividade de Recuperação Paralela: Crie de 4 a 6 questões progressivas contendo 'dicaAndaime' (apoio cognitivo) e 'gabaritoComentado' explicativo.

RETORNE EXCLUSIVAMENTE O JSON SEGUINDO O SCHEMA.
`;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await generateGeminiWithRetry(ai, {
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: REENSINO_SCHEMA as any,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text || '{}');

  return {
    id: `reensino_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    disciplina,
    ano_serie,
    topicoPrincipal: parsed.topicoPrincipal || 'Reensino de Habilidades',
    lacunasFocadas: parsed.lacunasFocadas || [],
    objetivosAprendizagem: parsed.objetivosAprendizagem || [],
    planoAulaReensino: parsed.planoAulaReensino,
    atividadeRecuperacaoParalela: parsed.atividadeRecuperacaoParalela,
    criteriosAvaliacaoRecuperacao: parsed.criteriosAvaliacaoRecuperacao || '',
    dataCriacao: new Date().toLocaleDateString('pt-BR'),
  };
}

// -------------------------------------------------------------------------
// 3. ADAPTAÇÃO CURRICULAR INCLUSIVA / PEI / AEE
// -------------------------------------------------------------------------
const ADAPTACAO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    principaisAjustesAplicados: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    recursosAcessibilidadeSugeridos: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    tempoSugeridoFlexibilizacao: { type: Type.STRING },
    conteudoAdaptadoFormatado: { type: Type.STRING },
    registroPeiAee: {
      type: Type.OBJECT,
      properties: {
        objetivoIndividualizado: { type: Type.STRING },
        barreirasIdentificadas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        estrategiasDiferenciadas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        criteriosAvaliativosFlexibilizados: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        observacoesParaProntuario: { type: Type.STRING },
      },
      required: [
        'objetivoIndividualizado',
        'barreirasIdentificadas',
        'estrategiasDiferenciadas',
        'criteriosAvaliativosFlexibilizados',
        'observacoesParaProntuario',
      ],
    },
  },
  required: [
    'principaisAjustesAplicados',
    'recursosAcessibilidadeSugeridos',
    'tempoSugeridoFlexibilizacao',
    'conteudoAdaptadoFormatado',
    'registroPeiAee',
  ],
};

export async function generateAdaptacaoInclusiva(params: {
  conteudoOriginal: string;
  tipoMaterial: 'plano_aula' | 'prova' | 'atividade';
  tipoNecessidade: TipoNecessidadeEspecial;
  disciplina: string;
  ano_serie: string;
  perfilAlunoObservacoes?: string;
}): Promise<AdaptacaoInclusivaResult> {
  const { conteudoOriginal, tipoMaterial, tipoNecessidade, disciplina, ano_serie, perfilAlunoObservacoes } = params;

  const prompt = `
VOCÊ É UM ESPECIALISTA EM EDUCAÇÃO ESPECIAL, ATENDIMENTO EDUCACIONAL ESPECIALIZADO (AEE) E DESENHO UNIVERSAL PARA A APRENDIZAGEM (DUA).

SUA MISSÃO: Adaptar o material escolar original (${tipoMaterial}) para um estudante com necessidade específica: ${tipoNecessidade}, e gerar a Ficha Oficial de Registro de PEI (Plano de Ensino Individualizado) para a Pasta Escolar / Coordenação de AEE.

CONTEXTO:
- Disciplina: ${disciplina}
- Ano/Série: ${ano_serie}
- Necessidade / Especificidade: ${tipoNecessidade}
${perfilAlunoObservacoes ? `- Perfil e Observações do Estudante: ${perfilAlunoObservacoes}` : ''}

MATERIAL ORIGINAL A SER ADAPTADO:
${conteudoOriginal}

DIRETRIZES POR NECESSIDADE ESPECÍFICA:
- TEA (Espectro Autista): Enunciados objetivos e literais, estruturação em passos numerados, apoio visual, redução de ambiguidades e metáforas, previsibilidade nas instruções.
- TDAH: Fragmentação de enunciados longos (chunks), destaques em negrito nas palavras-chave, redução de distratores, alternativas mais espaçadas e tempo estendido sugerido.
- Dislexia / Leitura: Vocabulário claro, frases na ordem direta (sujeito-verbo-objeto), fonte sem serifa, espaçamento ampliado e permissão de leitura assistida.
- Baixa Visão: Descrição rica, alternativas em alto contraste, instruções prontas para ampliação e suporte tátil/oral.
- Deficiência Intelectual: Foco no conceito essencial e funcional, exemplos do cotidiano, mediação concreta e menor carga de memorização mecânica.
- Altas Habilidades: Desafios abertos, aprofundamento investigativo, resolução de problemas reais e autonomia criativa.

RETORNE EXCLUSIVAMENTE O JSON SEGUINDO O SCHEMA.
`;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await generateGeminiWithRetry(ai, {
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: ADAPTACAO_SCHEMA as any,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text || '{}');

  return {
    id: `adap_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    tipoNecessidade,
    disciplina,
    ano_serie,
    tituloOriginal: `Adaptação ${tipoNecessidade} - ${disciplina}`,
    tipoMaterial,
    principaisAjustesAplicados: parsed.principaisAjustesAplicados || [],
    recursosAcessibilidadeSugeridos: parsed.recursosAcessibilidadeSugeridos || [],
    tempoSugeridoFlexibilizacao: parsed.tempoSugeridoFlexibilizacao || 'Tempo flexibilizado (+50%) conforme legislação de acessibilidade.',
    conteudoAdaptadoFormatado: parsed.conteudoAdaptadoFormatado || '',
    registroPeiAee: parsed.registroPeiAee,
    dataCriacao: new Date().toLocaleDateString('pt-BR'),
  };
}

// -------------------------------------------------------------------------
// 4. PARECER DESCRITIVO & CUMPRIMENTO BIMESTRAL
// -------------------------------------------------------------------------
const PARECER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    parecerCompletoFormatado: { type: Type.STRING },
    sinteseHabilidadesBncc: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    aspectosSocioemocionais: { type: Type.STRING },
    recomendacoesFamilia: { type: Type.STRING },
    metasProximoBimestre: { type: Type.STRING },
  },
  required: [
    'parecerCompletoFormatado',
    'sinteseHabilidadesBncc',
    'aspectosSocioemocionais',
    'recomendacoesFamilia',
    'metasProximoBimestre',
  ],
};

export async function generateParecerDescritivo(params: {
  nomeAluno: string;
  turma: string;
  disciplina: string;
  bimestre: string;
  ano_serie: string;
  rendimentoGeral: 'Excelente' | 'Bom' | 'Em Desenvolvimento' | 'Abaixo do Esperado';
  pontosObservadosNotas: string;
}): Promise<ParecerDescritivoResult> {
  const { nomeAluno, turma, disciplina, bimestre, ano_serie, rendimentoGeral, pontosObservadosNotas } = params;

  const prompt = `
VOCÊ É UM PEDAGOGO ESPECIALISTA EM REDAÇÃO DE PARECERES DESCRITIVOS E AVALIAÇÃO FORMATIVA (SISTEMA AULA CLARA).

SUA MISSÃO: Redigir um Parecer Descritivo individual, técnico, ético, construtivo e fundamentado nas diretrizes da BNCC para o Boletim / Histórico Escolar do aluno.

DADOS:
- Aluno: ${nomeAluno}
- Turma: ${turma}
- Disciplina: ${disciplina}
- Bimestre: ${bimestre}
- Ano/Série: ${ano_serie}
- Nível de Rendimento Geral: ${rendimentoGeral}
- Observações do Professor / Notas e Comportamento:
${pontosObservadosNotas}

DIRETRIZES ÉTICAS E DE REDAÇÃO:
1. Tom propositivo e respeitoso: Valorize o progresso demonstrado antes de pontuar os aspectos aprimorar.
2. Fundamentação na BNCC: Conecte o rendimento com as habilidades cognitivas, procedimentais e socioemocionais (ex: cooperação, persistência, autonomia).
3. Sem termos pejorativos: Use linguagem pedagógica elegante (ex: em vez de "tem preguiça", use "necessita de estímulo constante para manter a concentração nas tarefas autônomas").
4. Síntese clara para a Família e metas de evolução para o próximo bimestre.

RETORNE EXCLUSIVAMENTE O JSON SEGUINDO O SCHEMA.
`;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await generateGeminiWithRetry(ai, {
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: PARECER_SCHEMA as any,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text || '{}');

  return {
    id: `parecer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    nomeAluno,
    turma: turma || 'Turma A',
    disciplina,
    bimestre,
    ano_serie,
    parecerCompletoFormatado: parsed.parecerCompletoFormatado || '',
    sinteseHabilidadesBncc: parsed.sinteseHabilidadesBncc || [],
    aspectosSocioemocionais: parsed.aspectosSocioemocionais || '',
    recomendacoesFamilia: parsed.recomendacoesFamilia || '',
    metasProximoBimestre: parsed.metasProximoBimestre || '',
    dataCriacao: new Date().toLocaleDateString('pt-BR'),
  };
}
