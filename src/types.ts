export interface GoogleUser {
  id: string;
  name: string;
  email: string;
  picture: string;
  school?: string;
  subject?: string;
  role?: 'professor' | 'gestao';
  gestaoRoleTitle?: string;
  hasCompletedOnboarding?: boolean;
  loggedInAt: string;
  createdAt?: string; // ISO string when user first registered
  trialDaysTotal?: number; // Default 30 days
  trialEndsAt?: string; // ISO string when trial expires
  isVitalicio?: boolean; // Admin / Unlimited access
  status?: 'Ativo' | 'Bloqueado';
}

export type DisciplinaType =
  | 'Língua Portuguesa'
  | 'Literatura'
  | 'Redação'
  | 'Alfabetização e Letramento'
  | 'Linguagens'
  | 'Matemática'
  | 'História'
  | 'Geografia'
  | 'Ciências'
  | 'Física'
  | 'Química'
  | 'Biologia'
  | 'Ciências da Natureza'
  | 'Ciências Humanas'
  | 'Filosofia'
  | 'Sociologia'
  | 'Arte'
  | 'Educação Física'
  | 'Língua Inglesa'
  | 'Inglês'
  | 'Língua Espanhola'
  | 'Espanhol'
  | 'Ensino Religioso'
  | 'Projeto de Vida'
  | 'Educação Financeira';

export type SegmentoType =
  | 'Educação Infantil'
  | 'Ensino Fundamental – Anos Iniciais'
  | 'Ensino Fundamental – Anos Finais'
  | 'Ensino Médio';

export type TipoMaterialType =
  | 'Ambas as Possibilidades (Aula + Prova)'
  | 'Plano de Aula'
  | 'Atividade'
  | 'Atividade Prática'
  | 'Prova';

export interface BnccSkill {
  codigo: string;
  descricao: string;
  disciplina: DisciplinaType;
  segmento: SegmentoType;
  ano: string;
  unidadeTematica?: string;
  objetoConhecimento?: string;
  areaConhecimento?: string;
  competenciasRelacionadas?: string[];
  fonte?: string;
  versao?: string;
  ativo?: boolean;
}

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
  base64: string;
}

export interface GeneratorInput {
  disciplina: DisciplinaType;
  segmento: SegmentoType;
  ano: string;
  tipo: TipoMaterialType;
  texto_ocr: string;
  files: AttachedFile[];
  lessonType?: import('./types/lesson').LessonType;
  teacherDescription?: string;
  tipoAulaEdFisica?: 'Teórica' | 'Prática';
  quantidadeAulas?: number;
  dificuldadeProva?: 'Fácil' | 'Médio' | 'Difícil';
}

export interface TurmaFolder {
  id: string;
  nome: string;
  createdAt?: string;
}

export interface ProvaQuestao {
  numero: number;
  tipo: 'Múltipla Escolha' | 'Discursiva';
  enunciado: string;
  opcoes?: string[];
  respostaGabarito: string;
}

export interface SinglePossibilityMaterial {
  titulo: string;
  tema?: string;
  objetivo?: string;
  habilidadesBNCC: {
    codigo: string;
    descricao: string;
  }[];
  unidadeTematica?: string;
  objetoConhecimento?: string;
  materiais?: string[];
  tempoEstimado?: string;
  duracao_min?: number;
  desenvolvimento?: Array<{ etapa: string; duracao_min: number; descricao: string }>;
  desenvolvimentoOuPassoAPasso?: string[];
  regrasOuProcedimentos?: string[];
  variacoes?: string[];
  questoes?: ProvaQuestao[];
  gabaritoSeparado?: string;
  avaliacao?: string;
  observacoesPedagogicas?: string;
  markdownCompleto: string;
  conteudoEscaneadoOCR?: string;

  // Educação Física Card Specific Parameters
  numAlunos?: string;
  espaco?: string;
  nivel?: string;
  formacao?: string;
  organizacao?: string;
  dicaProfessor?: string;
  tipoQuadra?: string;
  colegio?: string;
}

export interface MaterialResultData {
  id?: string;
  titulo: string;
  tema?: string;
  objetivo?: string;
  colegio?: string;
  habilidadesBNCC: {
    codigo: string;
    descricao: string;
  }[];
  unidadeTematica?: string;
  objetoConhecimento?: string;
  materiais?: string[];
  tempoEstimado?: string;
  duracao_min?: number;
  desenvolvimento?: Array<{ etapa: string; duracao_min: number; descricao: string }>;
  desenvolvimentoOuPassoAPasso?: string[];
  regrasOuProcedimentos?: string[];
  variacoes?: string[];
  questoes?: ProvaQuestao[];
  gabaritoSeparado?: string;
  avaliacao?: string;
  observacoesPedagogicas?: string;
  markdownCompleto: string;
  conteudoEscaneadoOCR?: string;
  createdAt?: string;
  disciplina?: DisciplinaType;
  segmento?: SegmentoType;
  ano?: string;
  tipo?: TipoMaterialType;

  // Educação Física Card Specific Parameters
  numAlunos?: string;
  espaco?: string;
  nivel?: string;
  formacao?: string;
  organizacao?: string;
  dicaProfessor?: string;
  tipoQuadra?: string;

  // Folder & Regimento Organization
  turmaId?: string;
  turmaNome?: string;
  bimestre?: '1º Bimestre' | '2º Bimestre' | '3º Bimestre' | '4º Bimestre';
  quantidadeAulas?: number;

  // Dual Possibilities
  possibilidade1_planoDeAula?: SinglePossibilityMaterial;
  possibilidade2_provaAvaliacao?: SinglePossibilityMaterial;

  // Etapa 1 - Interpretação e Análise Multimodal
  interpretacao?: InterpretacaoMaterial;
  analise?: MaterialAnalysisResult;
  validacao?: ValidationResult;
  validacaoFinal?: FinalReviewResult;
}

export interface MaterialAnalysisResult {
  titulo: string;
  titulo_exato?: string;
  componente_curricular_lido?: string;
  ano_serie_lido?: string;
  volume_lido?: string;
  capitulo_lido?: string;
  tema_principal: string;
  conteudos_identificados: string[];
  conceitos_chave: string[];
  dados_concretos?: string[]; // Nomes de aparelhos, medidas, regras, definições citados
  perguntas_atividades_texto?: string[]; // Perguntas ou atividades propostas no texto
  atividade_sugerida_pelo_livro?: string;
  resumo: string;
  confianca: number; // 0 a 100
}

export interface ValidationResult {
  aprovado: boolean;
  confianca: number; // 0 a 100
  tema_corrigido: string;
  motivo: string;
}

export interface FinalReviewResult {
  tema_corresponde_imagem: boolean;
  atividades_ensinam_tema: boolean;
  adequado_idade: boolean;
  tempo_correto: boolean;
  materiais_acessiveis: boolean;
  bncc_correta: boolean;
  inclusao_ativa: boolean;
  aprovado: boolean;
  observacoes?: string;
}

export interface InterpretacaoMaterial {
  titulo_identificado: string;
  titulo_exato?: string;
  componente_curricular_lido?: string;
  ano_serie_lido?: string;
  volume_lido?: string;
  capitulo_lido?: string;
  tema_principal: string;
  subtemas: string[];
  dados_concretos?: string[];
  perguntas_atividades_texto?: string[];
  pessoas_eventos_conceitos_importantes?: string[];
  resumo_fiel: string;
  confianca_interpretacao: 'alta' | 'media' | 'baixa';
  confianca_score?: number; // 0-100
}

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

export interface SamplePreset {
  id: string;
  title: string;
  disciplina: DisciplinaType;
  segmento: SegmentoType;
  ano: string;
  tipo: TipoMaterialType;
  ocrText: string;
  description: string;
}

export type QuestaoTipo = 'Múltipla Escolha' | 'Discursiva';
export type CorrecaoStatus = 'correta' | 'parcialmente correta' | 'insuficiente' | 'incorreta' | 'ilegil' | 'revisar';
export type LeituraConfianca = 'alta' | 'media' | 'baixa';

export interface QuestaoCorrigida {
  numero: number;
  tipo: QuestaoTipo;
  enunciado: string;
  opcoes?: string[];
  valorMaximo: number; // e.g. 1.00, 2.00
  
  // Resposta do aluno
  respostaAlunoTexto: string;
  alternativaMarcada?: string; // e.g. 'A', 'B', 'C', 'D', 'E'
  multiplasMarcacoesDetectadas?: boolean;
  
  // Gabarito
  gabaritoEsperado: string;
  gabaritoOrigem: 'professor' | 'inferido_ia';
  
  // Pontuação e Feedback
  notaAtribuida: number; // Incrementos de 0.25 (0.00, 0.25, 0.50, 0.75, 1.00, ...)
  status: CorrecaoStatus;
  feedbackConciso: string;
  elementosEsperadosIdentificados?: string[];
  elementosFaltantes?: string[];
  
  // Confiança e Revisão
  confiancaLeitura: LeituraConfianca;
  precisaRevisao: boolean;
  motivoRevisao?: string;
  
  // Edição
  foiEditadaPeloProfessor?: boolean;
}

export interface RelatorioCorrecaoProva {
  id: string;
  disciplina: string;
  ano_serie?: string;
  nomeAlunoDetectado?: string;
  dataAvaliacao?: string;
  
  modoGabarito: 'com_gabarito' | 'sem_gabarito_ia';
  gabaritoFornecidoTexto?: string;
  
  questoes: QuestaoCorrigida[];
  
  notaFinal: number; // Soma matemática estrita
  notaMaximaTotal: number; // Soma dos valores máximos das questões
  
  totalQuestoes: number;
  totalCorretas: number;
  totalParciais: number;
  totalIncorretas: number;
  totalParaRevisao: number;
  
  observacoesGerais?: string;
  dataCorrecao: string;
  hash_prova?: string;
}

export interface GradeExamParams {
  images: Array<{ base64?: string; type?: string; mimeType?: string }>;
  textoOcr?: string;
  gabaritoTexto?: string;
  gabaritoImages?: Array<{ base64?: string; type?: string; mimeType?: string }>;
  disciplina?: string;
  segmento?: string;
  ano?: string;
  valorTotalDesejado?: number;
}

// 1. Diagnóstico e Mapa de Calor da Turma
export interface HabilidadeDiagnostico {
  codigoBncc?: string;
  habilidadeDescricao: string;
  taxaAcertoPorcentagem: number; // 0 - 100
  status: 'dominado' | 'em_desenvolvimento' | 'defasagem_critica';
  questoesRelacionadas: number[];
  recomendacaoPedagogica: string;
}

export interface DiagnosticoTurmaResult {
  id: string;
  turma: string;
  disciplina: string;
  ano_serie: string;
  bimestre: string;
  totalAlunosAvaliados: number;
  mediaGeralTurma: number; // e.g. 7.25
  notaMaxima: number;
  taxaAprovacaoPorcentagem: number; // % alunos >= media
  distribuicaoNotas: {
    abaixo_5: number;
    entre_5_e_7: number;
    entre_7_e_9: number;
    acima_9: number;
  };
  habilidadesDiagnostico: HabilidadeDiagnostico[];
  pontosFortesTurma: string[];
  principaisDefasagensColetivas: string[];
  resumoExecutivoDirecao: string;
  acoesRecomendadasCoordencao: string[];
  dataCriacao: string;
}

// 2. Reensino e Recuperação Paralela
export interface PlanoReensinoResult {
  id: string;
  disciplina: string;
  ano_serie: string;
  topicoPrincipal: string;
  lacunasFocadas: string[];
  objetivosAprendizagem: string[];
  planoAulaReensino: {
    tempoTotalMinutos: number;
    etapaDiagnostica: string;
    etapaMetodologiaAtiva: string;
    praticaGuiada: string;
    fechamentoConsolidacao: string;
  };
  atividadeRecuperacaoParalela: {
    instrucoesAluno: string;
    questoes: Array<{
      numero: number;
      enunciado: string;
      dicaAndaime?: string;
      gabaritoComentado: string;
    }>;
  };
  criteriosAvaliacaoRecuperacao: string;
  dataCriacao: string;
}

// 3. Adaptação Inclusiva / PEI / AEE
export type TipoNecessidadeEspecial =
  | 'TEA (Espectro Autista)'
  | 'TDAH (Atenção e Hiperatividade)'
  | 'Dislexia / Processamento de Leitura'
  | 'Baixa Visão / Deficiência Visual'
  | 'Deficiência Intelectual Leve/Moderada'
  | 'Altas Habilidades / Superdotação'
  | 'Geral / Múltiplas Adaptações';

export interface AdaptacaoInclusivaResult {
  id: string;
  tipoNecessidade: TipoNecessidadeEspecial;
  disciplina: string;
  ano_serie: string;
  tituloOriginal: string;
  tipoMaterial: 'plano_aula' | 'prova' | 'atividade';
  
  // Adaptações Metodológicas e Acessibilidade
  principaisAjustesAplicados: string[];
  recursosAcessibilidadeSugeridos: string[];
  tempoSugeridoFlexibilizacao: string;
  
  // Conteúdo Adaptado
  conteudoAdaptadoFormatado: string;
  
  // Ficha de Registro de AEE / PEI (Para Coordenação e Pasta do Aluno)
  registroPeiAee: {
    objetivoIndividualizado: string;
    barreirasIdentificadas: string[];
    estrategiasDiferenciadas: string[];
    criteriosAvaliativosFlexibilizados: string[];
    observacoesParaProntuario: string;
  };
  
  dataCriacao: string;
}

// 4. Parecer Descritivo e Cumprimento Bimestral
export interface ParecerDescritivoResult {
  id: string;
  nomeAluno: string;
  turma: string;
  disciplina: string;
  bimestre: string;
  ano_serie: string;
  parecerCompletoFormatado: string;
  sinteseHabilidadesBncc: string[];
  aspectosSocioemocionais: string;
  recomendacoesFamilia: string;
  metasProximoBimestre: string;
  dataCriacao: string;
}

export interface CumprimentoBimestreResult {
  id: string;
  disciplina: string;
  ano_serie: string;
  bimestre: string;
  porcentagemCumprida: number; // e.g. 95%
  habilidadesTrabalhadas: Array<{
    codigo: string;
    descricao: string;
    status: 'trabalhada_e_avaliada' | 'trabalhada_parcialmente' | 'recomenda_revisao';
  }>;
  resumoDocumentalParaSecretaria: string;
  dataCriacao: string;
}

export interface TeacherAccess {
  id: string;
  name: string;
  email: string;
  role?: 'professor' | 'gestao' | 'master';
  roleTitle?: string;
  daysRemaining: number;
  status: 'Ativo' | 'Bloqueado' | 'Expirado' | 'Excluído';
  createdAt: string;
  createdAtIso?: string;
  updatedAt?: string;
  lastActive?: string;
  deletedAt?: string;
  plan?: string;
  signupSource?: string;
  notes?: string;
}



