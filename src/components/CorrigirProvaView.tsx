import React, { useState, useRef } from 'react';
import { RelatorioCorrecaoProva, QuestaoCorrigida, DisciplinaType, SegmentoType } from '../types';
import { DISCIPLINAS_LIST, SEGMENTOS_LIST, ANOS_POR_SEGMENTO } from '../data/bnccData';
import { compressImage, fileToBase64, safeFetchJson } from '../utils/api';

interface CorrigirProvaViewProps {
  onBack: () => void;
  onSaveCorrecao: (relatorio: RelatorioCorrecaoProva) => void;
  initialDisciplina?: DisciplinaType;
  initialSegmento?: SegmentoType;
  initialAno?: string;
  showToast: (msg: string) => void;
}

export const CorrigirProvaView: React.FC<CorrigirProvaViewProps> = ({
  onBack,
  onSaveCorrecao,
  initialDisciplina = 'Educação Física',
  initialSegmento = 'Ensino Fundamental – Anos Finais',
  initialAno = '6º Ano',
  showToast,
}) => {
  // Config state
  const [disciplina, setDisciplina] = useState<string>(initialDisciplina);
  const [segmento, setSegmento] = useState<string>(initialSegmento);
  const [ano, setAno] = useState<string>(initialAno);
  const [valorTotalDesejado, setValorTotalDesejado] = useState<number>(10.0);

  // Uploaded images of the student's exam
  const [examImages, setExamImages] = useState<{ id: string; file: File; preview: string; name: string }[]>([]);
  const [ocrText, setOcrText] = useState<string>('');
  const [isOcrExpanded, setIsOcrExpanded] = useState<boolean>(false);

  // Gabarito Mode
  const [modoGabarito, setModoGabarito] = useState<'com_gabarito' | 'sem_gabarito_ia'>('sem_gabarito_ia');
  const [gabaritoTexto, setGabaritoTexto] = useState<string>('');
  const [gabaritoImages, setGabaritoImages] = useState<{ id: string; file: File; preview: string; name: string }[]>([]);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  // Result state
  const [relatorio, setRelatorio] = useState<RelatorioCorrecaoProva | null>(null);

  // Editing state for a specific question
  const [editingQuestaoIndex, setEditingQuestaoIndex] = useState<number | null>(null);
  const [tempNota, setTempNota] = useState<number>(0);
  const [tempFeedback, setTempFeedback] = useState<string>('');
  const [tempStatus, setTempStatus] = useState<string>('correta');

  // Input refs
  const examFileInputRef = useRef<HTMLInputElement>(null);
  const examCameraInputRef = useRef<HTMLInputElement>(null);
  const gabaritoFileInputRef = useRef<HTMLInputElement>(null);
  const gabaritoCameraInputRef = useRef<HTMLInputElement>(null);

  // Handle image files addition
  const handleAddExamFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: { id: string; file: File; preview: string; name: string }[] = [];
    Array.from(files).forEach((file) => {
      newItems.push({
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
      });
    });
    setExamImages((prev) => [...prev, ...newItems]);
    showToast(`${newItems.length} página(s) da prova adicionada(s)!`);
  };

  const handleRemoveExamImage = (id: string) => {
    setExamImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleAddGabaritoFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: { id: string; file: File; preview: string; name: string }[] = [];
    Array.from(files).forEach((file) => {
      newItems.push({
        id: `gab_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
      });
    });
    setGabaritoImages((prev) => [...prev, ...newItems]);
    showToast(`${newItems.length} imagem do gabarito adicionada!`);
  };

  const handleRemoveGabaritoImage = (id: string) => {
    setGabaritoImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Run AI Exam Correction
  const handleCorrigirProva = async () => {
    if (examImages.length === 0 && ocrText.trim().length === 0) {
      showToast('Por favor, adicione fotos da prova respondida ou o texto das questões.');
      return;
    }

    setIsProcessing(true);
    setProcessingStep('Lendo páginas e transcrevendo questões...');

    try {
      const prepareFile = async (file: File) => {
        if (file.type.startsWith('image/')) {
          const compressed = await compressImage(file, 1200, 1600, 0.64);
          return {
            base64: compressed.base64.replace(/^data:[^;]+;base64,/, ''),
            mimeType: 'image/jpeg',
          };
        }
        return { base64: await fileToBase64(file), mimeType: file.type || 'application/pdf' };
      };

      // Prepare exam images with a payload small enough for the Vercel request limit.
      const imagesPayload: { base64: string; mimeType: string }[] = [];
      for (let index = 0; index < examImages.length; index++) {
        const item = examImages[index];
        try {
          setProcessingStep(`Preparando página ${index + 1} de ${examImages.length}...`);
          imagesPayload.push(await prepareFile(item.file));
        } catch (err) {
          console.warn('Erro ao processar imagem da prova:', err);
        }
      }

      // Prepare gabarito images
      const gabaritoImagesPayload: { base64: string; mimeType: string }[] = [];
      if (modoGabarito === 'com_gabarito' && gabaritoImages.length > 0) {
        for (const item of gabaritoImages) {
          try {
            gabaritoImagesPayload.push(await prepareFile(item.file));
          } catch (err) {
            console.warn('Erro ao processar imagem do gabarito:', err);
          }
        }
      }

      const encodedSize = [...imagesPayload, ...gabaritoImagesPayload].reduce((total, image) => total + image.base64.length, 0);
      if (encodedSize > 3_600_000) {
        throw new Error('As páginas ainda ficaram muito grandes. Envie menos páginas por vez ou use fotos em vez de PDF.');
      }

      setProcessingStep('Separando enunciados e respostas do aluno...');

      const result = await safeFetchJson<{ success: boolean; data?: RelatorioCorrecaoProva; error?: string }>('/api/correct-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: imagesPayload,
          texto_ocr: ocrText,
          gabarito_texto: modoGabarito === 'com_gabarito' ? gabaritoTexto : undefined,
          gabarito_images: gabaritoImagesPayload,
          disciplina,
          segmento,
          ano,
          valor_total: valorTotalDesejado,
        }),
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Erro ao processar a correção da prova.');
      }

      setRelatorio(result.data);
      showToast('Prova corrigida com sucesso! Você pode revisar e ajustar notas.');
    } catch (err: any) {
      console.error('[CLIENT] Erro ao corrigir prova:', err);
      showToast(err.message || 'Falha na comunicação com o servidor de IA.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Open Edit Modal for a Question
  const handleOpenEditQuestao = (index: number) => {
    if (!relatorio) return;
    const q = relatorio.questoes[index];
    setEditingQuestaoIndex(index);
    setTempNota(q.notaAtribuida);
    setTempFeedback(q.feedbackConciso);
    setTempStatus(q.status);
  };

  // Save Edit and Recalculate Totals Mathematically without re-OCR (Requirement 13 & 15)
  const handleSaveEditQuestao = () => {
    if (!relatorio || editingQuestaoIndex === null) return;

    const novasQuestoes = [...relatorio.questoes];
    const qAntiga = novasQuestoes[editingQuestaoIndex];

    // Ensure 0.25 increment and limits
    let notaValidada = Math.round(tempNota * 4) / 4;
    if (notaValidada < 0) notaValidada = 0;
    if (notaValidada > qAntiga.valorMaximo) notaValidada = qAntiga.valorMaximo;

    novasQuestoes[editingQuestaoIndex] = {
      ...qAntiga,
      notaAtribuida: notaValidada,
      status: tempStatus as any,
      feedbackConciso: tempFeedback.trim(),
      precisaRevisao: false, // Mark reviewed by teacher
      foiEditadaPeloProfessor: true,
    };

    // Recalculate mathematical sum strictly
    const novaNotaFinal = Math.round(novasQuestoes.reduce((acc, q) => acc + q.notaAtribuida, 0) * 100) / 100;
    const totalCorretas = novasQuestoes.filter((q) => q.notaAtribuida === q.valorMaximo && !q.precisaRevisao).length;
    const totalParciais = novasQuestoes.filter((q) => q.notaAtribuida > 0 && q.notaAtribuida < q.valorMaximo).length;
    const totalIncorretas = novasQuestoes.filter((q) => q.notaAtribuida === 0 && !q.precisaRevisao).length;
    const totalParaRevisao = novasQuestoes.filter((q) => q.precisaRevisao).length;

    setRelatorio({
      ...relatorio,
      questoes: novasQuestoes,
      notaFinal: novaNotaFinal,
      totalCorretas,
      totalParciais,
      totalIncorretas,
      totalParaRevisao,
    });

    setEditingQuestaoIndex(null);
    showToast(`Nota da Questão ${qAntiga.numero} atualizada para ${notaValidada.toFixed(2).replace('.', ',')}!`);
  };

  // Copy plain text / markdown report to clipboard
  const handleCopyReport = () => {
    if (!relatorio) return;
    const linhas: string[] = [
      `RELATÓRIO DE CORREÇÃO — AULA CLARA`,
      `Disciplina: ${relatorio.disciplina} | Ano/Série: ${relatorio.ano_serie || 'Não especificado'}`,
      relatorio.nomeAlunoDetectado ? `Aluno: ${relatorio.nomeAlunoDetectado}` : '',
      `Data: ${relatorio.dataAvaliacao || new Date().toLocaleDateString('pt-BR')}`,
      `Gabarito: ${relatorio.modoGabarito === 'com_gabarito' ? 'Fornecido pelo Professor' : 'Inferido pela IA'}`,
      `--------------------------------------------------`,
      `RESULTADO QUESTÃO POR QUESTÃO:`,
      ...relatorio.questoes.map((q) => {
        const icone = q.notaAtribuida === q.valorMaximo ? '✓' : q.notaAtribuida > 0 ? '⚡' : '✕';
        return `Questão ${q.numero} — ${q.notaAtribuida.toFixed(2).replace('.', ',')} / ${q.valorMaximo.toFixed(2).replace('.', ',')} ${icone}\n${q.feedbackConciso}\n`;
      }),
      `--------------------------------------------------`,
      `NOTA FINAL: ${relatorio.notaFinal.toFixed(2).replace('.', ',')} / ${relatorio.notaMaximaTotal.toFixed(2).replace('.', ',')}`,
    ].filter(Boolean);

    navigator.clipboard.writeText(linhas.join('\n'));
    showToast('Relatório copiado para a área de transferência!');
  };

  // Reset for a new exam correction
  const handleNewCorrection = () => {
    setRelatorio(null);
    setExamImages([]);
    setOcrText('');
    setGabaritoTexto('');
    setGabaritoImages([]);
    showToast('Pronto para uma nova correção.');
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', color: '#1e293b' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#475569',
            cursor: 'pointer',
          }}
        >
          ← Voltar ao Início
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>📋</span>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Corrigir Prova com IA
            </h1>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Leitura de respostas manuscritas, correção por gabarito e notas em incrementos de 0,25
            </span>
          </div>
        </div>

        {relatorio && (
          <button
            type="button"
            onClick={handleNewCorrection}
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            + Nova Correção
          </button>
        )}
      </div>

      {/* VIEW MODE A: INPUT AND UPLOAD FORM */}
      {!relatorio && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: Context & Info */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '18px' }}>📌</span>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                1. Identificação da Avaliação
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Componente Curricular / Disciplina:
                </label>
                <select
                  value={disciplina}
                  onChange={(e) => setDisciplina(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#f8fafc',
                  }}
                >
                  {DISCIPLINAS_LIST.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Segmento:
                </label>
                <select
                  value={segmento}
                  onChange={(e) => {
                    const seg = e.target.value as SegmentoType;
                    setSegmento(seg);
                    const anosDisponiveis = ANOS_POR_SEGMENTO[seg] || [];
                    if (anosDisponiveis.length > 0 && !anosDisponiveis.includes(ano)) {
                      setAno(anosDisponiveis[0]);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#f8fafc',
                  }}
                >
                  {SEGMENTOS_LIST.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Ano / Série:
                </label>
                <select
                  value={ano}
                  onChange={(e) => setAno(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#f8fafc',
                  }}
                >
                  {(ANOS_POR_SEGMENTO[segmento as SegmentoType] || ['6º Ano', '7º Ano', '8º Ano', '9º Ano']).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Valor Total da Prova:
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="1"
                  max="100"
                  value={valorTotalDesejado}
                  onChange={(e) => setValorTotalDesejado(parseFloat(e.target.value) || 10.0)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#f8fafc',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Upload Pages of the Student's Exam */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📸</span>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                    2. Fotografar / Enviar Prova Respondida
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Fotografe todas as páginas da prova do aluno (múltipla escolha ou respostas manuscritas)
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => examCameraInputRef.current?.click()}
                  style={{
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  📷 Tirar Foto
                </button>
                <button
                  type="button"
                  onClick={() => examFileInputRef.current?.click()}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  📁 Galeria / Arquivos
                </button>
              </div>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={examFileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleAddExamFiles(e.target.files)}
            />
            <input
              ref={examCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => handleAddExamFiles(e.target.files)}
            />

            {/* Thumbnails grid */}
            {examImages.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '12px',
                  marginTop: '16px',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px dashed #cbd5e1',
                }}
              >
                {examImages.map((img, idx) => (
                  <div
                    key={img.id}
                    style={{
                      position: 'relative',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    <img
                      src={img.preview}
                      alt={`Página ${idx + 1}`}
                      style={{ width: '100%', height: '140px', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'rgba(15, 23, 42, 0.75)',
                        color: '#ffffff',
                        fontSize: '11px',
                        padding: '3px 6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>Página {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExamImage(img.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => examFileInputRef.current?.click()}
                style={{
                  padding: '30px 20px',
                  border: '2px dashed #cbd5e1',
                  borderRadius: '10px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  marginTop: '12px',
                }}
              >
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📄✍️</span>
                <b style={{ color: '#334155', fontSize: '14px' }}>Clique aqui para enviar as fotos da prova</b>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                  Suporta JPG, PNG ou PDF com todas as páginas da avaliação respondida.
                </p>
              </div>
            )}

            {/* Optional Transcribed Text Accordion */}
            <div style={{ marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => setIsOcrExpanded(!isOcrExpanded)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {isOcrExpanded ? '▼ Ocultar digitação de texto/transcrição' : '▶ Digitar ou colar texto da prova manualmente (opcional)'}
              </button>

              {isOcrExpanded && (
                <div style={{ marginTop: '8px' }}>
                  <textarea
                    rows={4}
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder="Cole aqui o texto da prova ou respostas caso prefira não usar fotos..."
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Gabarito Options (Modo A vs Modo B) */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '18px' }}>🔑</span>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                3. Gabarito da Prova
              </h3>
            </div>

            {/* Mode Selection Pills */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setModoGabarito('sem_gabarito_ia')}
                style={{
                  flex: 1,
                  minWidth: '220px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: modoGabarito === 'sem_gabarito_ia' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: modoGabarito === 'sem_gabarito_ia' ? '#eff6ff' : '#f8fafc',
                  color: modoGabarito === 'sem_gabarito_ia' ? '#1e40af' : '#475569',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: modoGabarito === 'sem_gabarito_ia' ? '700' : '500',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🤖</span>
                  <b>Modo B: Sem Gabarito (IA Infere)</b>
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>
                  A IA lerá os enunciados e deduzirá a resposta esperada e critérios.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModoGabarito('com_gabarito')}
                style={{
                  flex: 1,
                  minWidth: '220px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: modoGabarito === 'com_gabarito' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: modoGabarito === 'com_gabarito' ? '#f0fdf4' : '#f8fafc',
                  color: modoGabarito === 'com_gabarito' ? '#166534' : '#475569',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: modoGabarito === 'com_gabarito' ? '700' : '500',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📋</span>
                  <b>Modo A: Enviar Gabarito do Professor</b>
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>
                  Prioridade absoluta. Digite ou fotografe suas respostas oficiais.
                </div>
              </button>
            </div>

            {/* Gabarito Inputs when Modo A is selected */}
            {modoGabarito === 'com_gabarito' && (
              <div
                style={{
                  padding: '16px',
                  background: '#f0fdf4',
                  borderRadius: '10px',
                  border: '1px solid #bbf7d0',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#166534', marginBottom: '6px' }}>
                  Digite / Cole o Gabarito Oficial:
                </label>
                <textarea
                  rows={4}
                  value={gabaritoTexto}
                  onChange={(e) => setGabaritoTexto(e.target.value)}
                  placeholder="Exemplo:&#10;1) A&#10;2) C&#10;3) Resposta esperada: Pierre de Coubertin valorizava o esporte como ferramenta de respeito e união...&#10;4) B"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #86efac',
                    fontSize: '13px',
                    background: '#ffffff',
                    marginBottom: '10px',
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => gabaritoCameraInputRef.current?.click()}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    📷 Foto do Gabarito
                  </button>
                  <button
                    type="button"
                    onClick={() => gabaritoFileInputRef.current?.click()}
                    style={{
                      background: '#ffffff',
                      color: '#166534',
                      border: '1px solid #86efac',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    📁 Anexar Arquivo
                  </button>

                  <input
                    ref={gabaritoFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleAddGabaritoFiles(e.target.files)}
                  />
                  <input
                    ref={gabaritoCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => handleAddGabaritoFiles(e.target.files)}
                  />

                  {gabaritoImages.map((gImg) => (
                    <span
                      key={gImg.id}
                      style={{
                        fontSize: '11px',
                        background: '#dcfce7',
                        color: '#166534',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      ✓ {gImg.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveGabaritoImage(gImg.id)}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '30px' }}>
            <button
              type="button"
              onClick={handleCorrigirProva}
              disabled={isProcessing || (examImages.length === 0 && ocrText.trim().length === 0)}
              style={{
                background: isProcessing ? '#94a3b8' : 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '16px 36px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '800',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {isProcessing ? (
                <>
                  <span className="reading-spinner" style={{ width: '18px', height: '18px', borderTopColor: '#fff' }} />
                  {processingStep || 'Processando Correção...'}
                </>
              ) : (
                <>
                  <span style={{ fontSize: '20px' }}>🔍</span>
                  Corrigir Prova com IA
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* VIEW MODE B: RELATÓRIO DE CORREÇÃO (RESULT VIEW) */}
      {relatorio && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Summary Card */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '20px' }}>📋</span>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    Relatório de Correção
                  </h2>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: relatorio.modoGabarito === 'com_gabarito' ? '#dcfce7' : '#e0e7ff',
                      color: relatorio.modoGabarito === 'com_gabarito' ? '#15803d' : '#4338ca',
                    }}
                  >
                    {relatorio.modoGabarito === 'com_gabarito' ? '✓ Gabarito do Professor' : '🤖 Gabarito inferido pela IA'}
                  </span>
                </div>

                <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px' }}>
                  <b>Disciplina:</b> {relatorio.disciplina} &nbsp;•&nbsp; <b>Ano/Série:</b> {relatorio.ano_serie || ano} &nbsp;•&nbsp; <b>Data:</b> {relatorio.dataAvaliacao}
                  {relatorio.nomeAlunoDetectado && (
                    <div style={{ marginTop: '2px', color: '#0f172a' }}>
                      <b>Aluno(a):</b> {relatorio.nomeAlunoDetectado}
                    </div>
                  )}
                </div>
              </div>

              {/* Total Score Badge Box (Requirement 11) */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                  color: '#ffffff',
                  padding: '16px 24px',
                  borderRadius: '12px',
                  textAlign: 'center',
                  minWidth: '160px',
                  boxShadow: '0 4px 10px rgba(15, 23, 42, 0.2)',
                }}
              >
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', display: 'block', fontWeight: '700' }}>
                  Nota Final
                </span>
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#38bdf8', margin: '2px 0' }}>
                  {relatorio.notaFinal.toFixed(2).replace('.', ',')}{' '}
                  <span style={{ fontSize: '16px', color: '#94a3b8', fontWeight: '500' }}>
                    / {relatorio.notaMaximaTotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                  {((relatorio.notaFinal / (relatorio.notaMaximaTotal || 10)) * 100).toFixed(0)}% de aproveitamento
                </div>
              </div>
            </div>

            {/* Quick Metrics Badges */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                ✓ {relatorio.totalCorretas} Corretas
              </span>
              <span style={{ background: '#fefce8', color: '#854d0e', border: '1px solid #fef08a', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                ⚡ {relatorio.totalParciais} Parciais
              </span>
              <span style={{ background: '#fff1f2', color: '#9f1239', border: '1px solid #fecdd3', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                ✕ {relatorio.totalIncorretas} Incorretas
              </span>
              {relatorio.totalParaRevisao > 0 && (
                <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                  ⚠ {relatorio.totalParaRevisao} Para Revisão
                </span>
              )}
            </div>
          </div>

          {/* Question-by-Question List (Requirements 10, 11, 12, 13) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Correção Questão por Questão ({relatorio.questoes.length} questões)
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Toque em qualquer questão para editar nota ou comentário
              </span>
            </div>

            {relatorio.questoes.map((q, idx) => {
              const isAcertoTotal = q.notaAtribuida === q.valorMaximo && !q.precisaRevisao;
              const isParcial = q.notaAtribuida > 0 && q.notaAtribuida < q.valorMaximo;
              const isErro = q.notaAtribuida === 0 && !q.precisaRevisao;

              const badgeColor = isAcertoTotal
                ? { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: '✓' }
                : isParcial
                ? { bg: '#fefce8', border: '#fde047', text: '#854d0e', icon: '⚡' }
                : isErro
                ? { bg: '#fff1f2', border: '#fda4af', text: '#9f1239', icon: '✕' }
                : { bg: '#fffbeb', border: '#fcd34d', text: '#b45309', icon: '⚠' };

              return (
                <div
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: q.precisaRevisao ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Top line of question: Questão X — Nota / Max ✓ */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <b style={{ fontSize: '15px', color: '#0f172a' }}>
                        Questão {q.numero}
                      </b>
                      <span
                        style={{
                          background: badgeColor.bg,
                          border: `1px solid ${badgeColor.border}`,
                          color: badgeColor.text,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '800',
                        }}
                      >
                        {q.notaAtribuida.toFixed(2).replace('.', ',')} / {q.valorMaximo.toFixed(2).replace('.', ',')} {badgeColor.icon}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                        ({q.tipo})
                      </span>
                      {q.foiEditadaPeloProfessor && (
                        <span style={{ fontSize: '11px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                          ✓ Editada pelo Professor
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenEditQuestao(idx)}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        color: '#334155',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      ✏️ Ajustar Nota
                    </button>
                  </div>

                  {/* Doubtful Reading Warning Banner (Requirement 12) */}
                  {q.precisaRevisao && (
                    <div
                      style={{
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        color: '#b45309',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>⚠</span> {q.motivoRevisao || 'Resposta com leitura duvidosa — revisão recomendada.'}
                    </div>
                  )}

                  {/* Enunciado */}
                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px', lineHeight: 1.4 }}>
                    <b>Enunciado:</b> {q.enunciado}
                  </div>

                  {/* Resposta do Aluno detectada */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase' }}>
                      Resposta Detectada do Aluno:
                    </div>
                    <div style={{ color: '#0f172a', fontWeight: '500' }}>
                      {q.tipo === 'Múltipla Escolha' && q.alternativaMarcada ? (
                        <>
                          <span style={{ fontWeight: '700', color: '#2563eb' }}>Alternativa {q.alternativaMarcada}</span>
                          {q.respostaAlunoTexto && ` — ${q.respostaAlunoTexto}`}
                        </>
                      ) : (
                        q.respostaAlunoTexto || 'Sem resposta manuscrita detectada.'
                      )}
                    </div>
                  </div>

                  {/* Gabarito Esperado */}
                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    <b style={{ color: '#166534' }}>Gabarito Esperado:</b> {q.gabaritoEsperado}
                  </div>

                  {/* Feedback Conciso (Requirement 10) */}
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: isAcertoTotal ? '#166534' : isParcial ? '#854d0e' : '#9f1239',
                      marginTop: '4px',
                    }}
                  >
                    💬 {q.feedbackConciso}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons Bar (Requirement 14) */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: '10px',
              padding: '16px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}
          >
            <button
              type="button"
              onClick={() => onSaveCorrecao(relatorio)}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              💾 Salvar Correção
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🖨️ Imprimir / PDF
            </button>

            <button
              type="button"
              onClick={handleCopyReport}
              style={{
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📋 Copiar Relatório
            </button>

            <button
              type="button"
              onClick={handleNewCorrection}
              style={{
                background: '#ffffff',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🔄 Nova Correção
            </button>
          </div>
        </div>
      )}

      {/* EDIT MODAL FOR A QUESTION (Requirement 13) */}
      {editingQuestaoIndex !== null && relatorio && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Ajustar Questão {relatorio.questoes[editingQuestaoIndex].numero}
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestaoIndex(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Nota Atribuída (Valor Máximo: {relatorio.questoes[editingQuestaoIndex].valorMaximo.toFixed(2).replace('.', ',')}):
              </label>

              {/* Handy 0.25 increment buttons (Requirement 6 & 13) */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {[0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
                  .filter((v) => v <= relatorio.questoes[editingQuestaoIndex].valorMaximo)
                  .map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTempNota(val)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: tempNota === val ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: tempNota === val ? '#eff6ff' : '#f8fafc',
                        color: tempNota === val ? '#1e40af' : '#334155',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {val.toFixed(2).replace('.', ',')}
                    </button>
                  ))}
              </div>

              <input
                type="number"
                step="0.25"
                min="0"
                max={relatorio.questoes[editingQuestaoIndex].valorMaximo}
                value={tempNota}
                onChange={(e) => setTempNota(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '15px',
                  fontWeight: '700',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Status da Resposta:
              </label>
              <select
                value={tempStatus}
                onChange={(e) => setTempStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                }}
              >
                <option value="correta">Correta</option>
                <option value="parcialmente correta">Parcialmente Correta</option>
                <option value="insuficiente">Insuficiente</option>
                <option value="incorreta">Incorreta</option>
                <option value="revisar">Necessita Revisão</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Feedback / Justificativa da Correção:
              </label>
              <textarea
                rows={3}
                value={tempFeedback}
                onChange={(e) => setTempFeedback(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingQuestaoIndex(null)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditQuestao}
                style={{
                  background: '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Salvar Alteração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
