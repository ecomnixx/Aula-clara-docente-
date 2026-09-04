import { GoogleGenAI, Type } from '@google/genai';
import { GradeExamParams, RelatorioCorrecaoProva, QuestaoCorrigida } from '../types';
import { generateGeminiWithRetry, formatAiError } from './aiProvider';
import { generateMaterialHash } from './contentCleaner';

// Schema for structured JSON response from Gemini
const EXAM_CORRECTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    disciplina_identificada: { type: Type.STRING },
    ano_serie_identificado: { type: Type.STRING },
    nome_aluno_identificado: { type: Type.STRING },
    data_avaliacao_identificada: { type: Type.STRING },
    valor_total_prova: { type: Type.NUMBER },
    questoes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          numero: { type: Type.INTEGER },
          tipo: { type: Type.STRING }, // "Múltipla Escolha" ou "Discursiva"
          enunciado: { type: Type.STRING },
          opcoes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          valorMaximo: { type: Type.NUMBER },
          respostaAlunoTexto: { type: Type.STRING },
          alternativaMarcada: { type: Type.STRING },
          multiplasMarcacoesDetectadas: { type: Type.BOOLEAN },
          gabaritoEsperado: { type: Type.STRING },
          gabaritoOrigem: { type: Type.STRING }, // "professor" | "inferido_ia"
          notaAtribuida: { type: Type.NUMBER },
          status: { type: Type.STRING }, // "correta" | "parcialmente correta" | "insuficiente" | "incorreta" | "ilegil" | "revisar"
          feedbackConciso: { type: Type.STRING },
          elementosEsperadosIdentificados: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          elementosFaltantes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          confiancaLeitura: { type: Type.STRING }, // "alta" | "media" | "baixa"
          precisaRevisao: { type: Type.BOOLEAN },
          motivoRevisao: { type: Type.STRING },
        },
        required: [
          'numero',
          'tipo',
          'enunciado',
          'valorMaximo',
          'respostaAlunoTexto',
          'gabaritoEsperado',
          'notaAtribuida',
          'status',
          'feedbackConciso',
          'confiancaLeitura',
          'precisaRevisao',
        ],
      },
    },
    observacoesGerais: { type: Type.STRING },
  },
  required: ['disciplina_identificada', 'questoes'],
};

export interface CorrectExamOptions {
  compactGrading?: boolean;
  models?: string[];
  backoffDelaysMs?: number[];
}

export async function correctExam(params: GradeExamParams): Promise<RelatorioCorrecaoProva> {
  return (await correctExamDetailed(params)).report;
}

export async function correctExamDetailed(
  params: GradeExamParams,
  options: CorrectExamOptions = {},
): Promise<{ report: RelatorioCorrecaoProva; modelUsed: string }> {
  const { images, textoOcr, gabaritoTexto, gabaritoImages, disciplina, segmento, ano, valorTotalDesejado } = params;

  console.log('[CORRETOR DE PROVA] Iniciando correção com IA...', {
    numImagensProva: images?.length || 0,
    hasOcr: Boolean(textoOcr),
    hasGabaritoTexto: Boolean(gabaritoTexto),
    numImagensGabarito: gabaritoImages?.length || 0,
    disciplina,
    ano,
  });

  const parts: any[] = [];

  // Add exam images
  if (images && images.length > 0) {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.base64) {
        parts.push({
          inlineData: {
            data: img.base64,
            mimeType: img.mimeType || 'image/jpeg',
          },
        });
      }
    }
  }

  // Add gabarito images if provided
  if (gabaritoImages && gabaritoImages.length > 0) {
    for (let i = 0; i < gabaritoImages.length; i++) {
      const gImg = gabaritoImages[i];
      if (gImg.base64) {
        parts.push({
          inlineData: {
            data: gImg.base64,
            mimeType: gImg.mimeType || 'image/jpeg',
          },
        });
      }
    }
  }

  const promptText = options.compactGrading ? `
CORRIJA SOMENTE O BLOCO DE QUESTÕES TRANSCRITO ABAIXO.
Contexto: ${disciplina || 'não informado'}; ${segmento || 'não informado'}; ${ano || 'não informado'}.
${gabaritoTexto ? `GABARITO OFICIAL (prioridade absoluta):\n${gabaritoTexto}` : 'Sem gabarito oficial: infira com rigor pedagógico.'}
TRANSCRIÇÃO DA PROVA E RESPOSTAS DO ALUNO:\n${textoOcr || ''}

Regras essenciais:
- Separe enunciado e resposta do aluno; não invente trechos ilegíveis.
- Objetivas: compare a alternativa marcada ao gabarito; marca ambígua exige revisão.
- Discursivas: aceite equivalência semântica e pontue conceitos, sem penalizar ortografia fora de Língua Portuguesa.
- Respostas vazias ou sem relação recebem zero.
- Use incrementos de 0,25 e nunca ultrapasse o valor da questão.
- Feedback em no máximo duas frases; sinalize leitura duvidosa para revisão.
- Retorne exclusivamente JSON conforme o schema, contendo apenas as questões deste bloco.
` : `
VOCÊ É UM ASSISTENTE ESPECIALISTA EM CORREÇÃO PEDAGÓGICA E LEITURA MULTIMODAL DE PROVAS ESCOLARES (SISTEMA AULA CLARA).

SUA MISSÃO: Ler e transcrever com máxima fidelidade as páginas da avaliação respondida pelo aluno, separar o enunciado impresso da resposta manuscrita/marcada, comparar com o gabarito e pontuar com justiça e precisão questão por questão.

=== DADOS DE CONTEXTO ===
- Disciplina informada: ${disciplina || 'A identificar na prova'}
- Segmento: ${segmento || 'Ensino Fundamental/Médio'}
- Ano/Série informado: ${ano || 'A identificar na prova'}
${gabaritoTexto ? `\n=== GABARITO OFICIAL FORNECIDO PELO PROFESSOR (PRIORIDADE ABSOLUTA) ===\n${gabaritoTexto}\n` : '\n=== GABARITO: NENHUM GABARITO FORNECIDO. INFERIR AS RESPOSTAS CORRETAS COM RIGOR PEDAGÓGICO. ===\n'}
${textoOcr ? `\n=== TRANSCRIÇÃO / TEXTO ADICIONAL DA PROVA ===\n${textoOcr}\n` : ''}

=== DIRETRIZES FUNDAMENTAIS DE LEITURA E IDENTIFICAÇÃO ===
1. SEPARAÇÃO RIGOROSA:
   - ENUNCIADO = o texto impresso da questão e suas alternativas (quando houver).
   - RESPOSTA DO ALUNO = o que foi marcado com X / círculo / traço nas alternativas, OU o que foi escrito à mão nas linhas de resposta. NUNCA misture enunciado com resposta.
2. IDENTIFICAR DADOS DO CABEÇALHO:
   - Nome do aluno (se preenchido).
   - Disciplina, Ano/Série, Data da avaliação.
   - Valor de cada questão (se especificado na prova, ex: "(1,0 ponto)", "(2,0 pts)"). Caso não esteja explícito, distribua proporcionalmente para totalizar ${valorTotalDesejado || 10.0}.

=== DIRETRIZES DE CORREÇÃO E GABARITO ===
1. MODO GABARITO:
   ${gabaritoTexto || (gabaritoImages && gabaritoImages.length > 0) ? '- Um gabarito foi fornecido pelo professor. USE-O COM PRIORIDADE TOTAL. Defina gabaritoOrigem = "professor".' : '- Não foi fornecido gabarito. Construa a resposta esperada analisando o enunciado, alternativas e conhecimento pedagógico. Defina gabaritoOrigem = "inferido_ia".'}
2. QUESTÕES OBJETIVAS (MÚLTIPLA ESCOLHA):
   - Identifique a alternativa marcada pelo aluno (ex: "A", "B", "C", "D", "E").
   - Se houver duas alternativas marcadas ou rasura ambígua, marque precisaRevisao = true, motivoRevisao = "Marcação dupla ou ambígua — revisar."
   - Se a marcação for ilegível: Não presuma. Indique precisaRevisao = true, motivoRevisao = "Marcação não identificada com segurança — revisar."
   - Compare com o gabarito. Se correta: nota integral (ex: 1.00). Se incorreta: 0.00.
3. QUESTÕES DISSERTATIVAS:
   - Avalie compreensão semântica e conceitos essenciais. NÃO exija palavras idênticas ao gabarito.
   - Aceite respostas equivalentes com vocabulário próprio do estudante.
   - NÃO penalize letra imperfeita (desde que legível). Erros ortográficos ou gramaticais só podem reduzir a nota quando a disciplina for Língua Portuguesa/Redação e esse aspecto estiver explicitamente previsto no comando ou critério; nas demais disciplinas, avalie o conceito e não a ortografia.
   - NÃO seja permissivo com respostas vazias ou enrolações ("chute") que não respondem à pergunta central.
   - Classifique o status: "correta" | "parcialmente correta" | "insuficiente" | "incorreta" | "ilegil".
4. SISTEMA DE PONTUAÇÃO EM INCREMENTOS DE 0,25:
   - A nota DEVE ser atribuída estritamente em incrementos de 0,25: 0.00, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00...
   - O limite máximo de cada questão NUNCA pode ser ultrapassado. Se a questão vale 1.00, as notas possíveis são apenas: 0.00, 0.25, 0.50, 0.75 ou 1.00.
   - Para questões dissertativas com múltiplos elementos esperados: pontue proporcionalmente aos elementos corretos (ex: 3 de 4 elementos em questão de 1.0 = 0.75; 2 de 4 = 0.50; 1 de 4 = 0.25).
5. CONFIANÇA E SINALIZAÇÃO DE DÚVIDA:
   - Defina confiancaLeitura ("alta" | "media" | "baixa").
   - Se a caligrafia for duvidosa ou ilegível, NUNCA atribua 0.00 sumariamente. Sinalize: precisaRevisao = true e motivoRevisao = "⚠ Resposta com leitura duvidosa — revisão recomendada."
6. FEEDBACK CONCISO:
   - Forneça justificativas curtas e objetivas (1 a 2 frases no máximo). Ex: "Acertou a definição de esportes de invasão, mas não citou os dois exemplos pedidos."

RETORNE EXCLUSIVAMENTE O JSON CONFORME O SCHEMA ESPECIFICADO.
`;

  parts.push({ text: promptText });

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const response = await generateGeminiWithRetry(ai, {
    contents: [{ parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: EXAM_CORRECTION_SCHEMA as any,
      temperature: 0.1, // High precision and consistency for grading
    },
  }, {
    // Exam correction receives several high-resolution pages. Prefer the
    // low-latency models so the request finishes inside Vercel's 60s limit.
    models: options.models || ['gemini-flash-latest'],
    maxRetriesPerModel: 0,
    backoffDelaysMs: options.backoffDelaysMs,
  });

  const rawText = response.text || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    console.error('[CORRETOR DE PROVA] Erro ao interpretar a resposta estruturada da IA.');
    throw new Error('Falha ao processar a resposta da IA na correção da prova.');
  }

  // Strict Mathematical & Validation Trava (Requirement 11 & 17)
  const questoesRaw: any[] = Array.isArray(parsed.questoes) ? parsed.questoes : [];
  if (questoesRaw.length === 0) {
    console.error('[CORRETOR DE PROVA] A IA retornou uma correção vazia.', {
      modelUsed: response.modelUsed,
    });
    throw new Error(
      'Não foi possível identificar as questões nas imagens. Confira se todas as páginas estão legíveis e tente novamente.'
    );
  }
  const defaultTotalValor = valorTotalDesejado || parsed.valor_total_prova || 10.0;
  const valorPadraoQuestao = questoesRaw.length > 0 ? defaultTotalValor / questoesRaw.length : 1.0;

  const questoesTratadas: QuestaoCorrigida[] = questoesRaw.map((q, idx) => {
    const num = Number(q.numero) || idx + 1;
    const tipo = (q.tipo && q.tipo.toLowerCase().includes('múltipla')) ? 'Múltipla Escolha' : 'Discursiva';
    
    // Valor máximo da questão
    let valorMax = typeof q.valorMaximo === 'number' && q.valorMaximo > 0 ? q.valorMaximo : valorPadraoQuestao;
    valorMax = Math.round(valorMax * 4) / 4; // Round to 0.25 increment

    // Tratar nota atribuída em incrementos estritos de 0.25
    let nota = typeof q.notaAtribuida === 'number' ? q.notaAtribuida : 0;
    nota = Math.round(nota * 4) / 4; // strictly step of 0.25
    if (nota < 0) nota = 0;
    if (nota > valorMax) nota = valorMax; // Nunca ultrapassar valor da questão

    // Status
    let status = q.status || (nota === valorMax ? 'correta' : nota > 0 ? 'parcialmente correta' : 'incorreta');
    if (q.precisaRevisao && !status) status = 'revisar';

    const confianca: 'alta' | 'media' | 'baixa' = (q.confiancaLeitura === 'baixa' || q.confiancaLeitura === 'media')
      ? q.confiancaLeitura
      : 'alta';

    return {
      numero: num,
      tipo,
      enunciado: (q.enunciado || `Questão ${num}`).trim(),
      opcoes: Array.isArray(q.opcoes) ? q.opcoes.map((o: any) => String(o).trim()) : undefined,
      valorMaximo: valorMax,
      respostaAlunoTexto: (q.respostaAlunoTexto || '').trim() || (tipo === 'Múltipla Escolha' ? (q.alternativaMarcada ? `Alternativa ${q.alternativaMarcada}` : 'Não respondida') : 'Sem resposta detectada'),
      alternativaMarcada: q.alternativaMarcada ? String(q.alternativaMarcada).trim().toUpperCase() : undefined,
      multiplasMarcacoesDetectadas: Boolean(q.multiplasMarcacoesDetectadas),
      gabaritoEsperado: (q.gabaritoEsperado || '').trim(),
      gabaritoOrigem: (gabaritoTexto || (gabaritoImages && gabaritoImages.length > 0)) ? 'professor' : 'inferido_ia',
      notaAtribuida: nota,
      status,
      feedbackConciso: (q.feedbackConciso || (nota === valorMax ? 'Resposta correta.' : 'Resposta incorreta ou incompleta.')).trim(),
      elementosEsperadosIdentificados: Array.isArray(q.elementosEsperadosIdentificados) ? q.elementosEsperadosIdentificados : undefined,
      elementosFaltantes: Array.isArray(q.elementosFaltantes) ? q.elementosFaltantes : undefined,
      confiancaLeitura: confianca,
      precisaRevisao: Boolean(q.precisaRevisao || q.multiplasMarcacoesDetectadas || confianca === 'baixa'),
      motivoRevisao: q.motivoRevisao || (confianca === 'baixa' ? '⚠ Resposta com leitura duvidosa — revisão recomendada.' : undefined),
    };
  });

  // Calculate strict mathematical sums (Requirement 11 & 17)
  const notaFinalCalculada = Math.round(questoesTratadas.reduce((acc, q) => acc + q.notaAtribuida, 0) * 100) / 100;
  const notaMaximaTotalCalculada = Math.round(questoesTratadas.reduce((acc, q) => acc + q.valorMaximo, 0) * 100) / 100;

  const totalCorretas = questoesTratadas.filter(q => q.notaAtribuida === q.valorMaximo && !q.precisaRevisao).length;
  const totalParciais = questoesTratadas.filter(q => q.notaAtribuida > 0 && q.notaAtribuida < q.valorMaximo).length;
  const totalIncorretas = questoesTratadas.filter(q => q.notaAtribuida === 0 && !q.precisaRevisao).length;
  const totalParaRevisao = questoesTratadas.filter(q => q.precisaRevisao).length;

  const hash = generateMaterialHash(textoOcr || '', images || [], disciplina, segmento, ano);

  const relatorio: RelatorioCorrecaoProva = {
    id: `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    disciplina: parsed.disciplina_identificada || disciplina || 'Educação Física',
    ano_serie: parsed.ano_serie_identificado || ano || 'Ensino Fundamental',
    nomeAlunoDetectado: parsed.nome_aluno_identificado || undefined,
    dataAvaliacao: parsed.data_avaliacao_identificada || new Date().toLocaleDateString('pt-BR'),
    modoGabarito: (gabaritoTexto || (gabaritoImages && gabaritoImages.length > 0)) ? 'com_gabarito' : 'sem_gabarito_ia',
    gabaritoFornecidoTexto: gabaritoTexto || undefined,
    questoes: questoesTratadas,
    notaFinal: notaFinalCalculada,
    notaMaximaTotal: notaMaximaTotalCalculada || 10.0,
    totalQuestoes: questoesTratadas.length,
    totalCorretas,
    totalParciais,
    totalIncorretas,
    totalParaRevisao,
    observacoesGerais: parsed.observacoesGerais || undefined,
    dataCorrecao: new Date().toISOString(),
    hash_prova: hash,
  };

  console.log('[CORRETOR DE PROVA] Correção concluída com sucesso:', {
    id: relatorio.id,
    totalQuestoes: relatorio.totalQuestoes,
    notaFinal: `${relatorio.notaFinal} / ${relatorio.notaMaximaTotal}`,
    corretas: totalCorretas,
    parciais: totalParciais,
    incorretas: totalIncorretas,
    revisao: totalParaRevisao,
  });

  return { report: relatorio, modelUsed: response.modelUsed };
}
