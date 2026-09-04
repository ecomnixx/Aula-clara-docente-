import React, { useState, useEffect } from 'react';
import { PlanoReensinoResult, DisciplinaType, SegmentoType } from '../types';
import { DISCIPLINAS_LIST, SEGMENTOS_LIST, ANOS_POR_SEGMENTO } from '../data/bnccData';
import { authenticatedFetch } from '../utils/supabaseAuth';

interface ReensinoRecuperacaoViewProps {
  onBack: () => void;
  initialDefasagens?: string;
  initialDisciplina?: DisciplinaType;
  initialSegmento?: SegmentoType;
  initialAno?: string;
  onSaveMaterial?: (plano: PlanoReensinoResult) => void;
  showToast: (msg: string) => void;
}

export const ReensinoRecuperacaoView: React.FC<ReensinoRecuperacaoViewProps> = ({
  onBack,
  initialDefasagens = '',
  initialDisciplina = 'Educação Física',
  initialSegmento = 'Ensino Fundamental – Anos Finais',
  initialAno = '6º Ano',
  onSaveMaterial,
  showToast,
}) => {
  const [disciplina, setDisciplina] = useState<string>(initialDisciplina);
  const [segmento, setSegmento] = useState<string>(initialSegmento);
  const [ano, setAno] = useState<string>(initialAno);
  const [defasagens, setDefasagens] = useState<string>(
    initialDefasagens ||
      'Dificuldade na compreensão dos esportes de invasão, diferença entre regras e táticas no handebol, e identificação dos papéis de ataque e defesa.'
  );
  const [habilidadeBncc, setHabilidadeBncc] = useState<string>('EF67EF03');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultado, setResultado] = useState<PlanoReensinoResult | null>(null);

  useEffect(() => {
    if (initialDefasagens) {
      setDefasagens(initialDefasagens);
    }
  }, [initialDefasagens]);

  const handleGerarReensino = async () => {
    if (!defasagens.trim()) {
      showToast('Por favor, descreva as defasagens ou questões com maior taxa de erro.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await authenticatedFetch('/api/plano-reensino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disciplina,
          ano_serie: ano,
          defasagens,
          habilidade_bncc: habilidadeBncc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao gerar plano de reensino.');
      }

      setResultado(data.data);
      showToast('Plano de Reensino e Recuperação Paralela gerados com sucesso!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro de comunicação com o servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopiarTexto = () => {
    if (!resultado) return;
    const texto = [
      `PLANO DE REENSINO E RECUPERAÇÃO PARALELA — AULA CLARA`,
      `Disciplina: ${resultado.disciplina} | Ano/Série: ${resultado.ano_serie}`,
      `Tópico Central: ${resultado.topicoPrincipal}`,
      `\nLACUNAS FOCADAS:\n${resultado.lacunasFocadas.map((l) => `• ${l}`).join('\n')}`,
      `\nOBJETIVOS DE APRENDIZAGEM:\n${resultado.objetivosAprendizagem.map((o) => `• ${o}`).join('\n')}`,
      `\n--- ESTRUTURA DA AULA DE REENSINO (${resultado.planoAulaReensino.tempoTotalMinutos} min) ---`,
      `1. Etapa Diagnóstica / Ativação:\n${resultado.planoAulaReensino.etapaDiagnostica}`,
      `2. Metodologia Ativa / Nova Abordagem:\n${resultado.planoAulaReensino.etapaMetodologiaAtiva}`,
      `3. Prática Guiada com Andaime:\n${resultado.planoAulaReensino.praticaGuiada}`,
      `4. Fechamento e Checagem:\n${resultado.planoAulaReensino.fechamentoConsolidacao}`,
      `\n--- ATIVIDADE DE RECUPERAÇÃO PARALELA ---`,
      `Instruções: ${resultado.atividadeRecuperacaoParalela.instrucoesAluno}`,
      ...resultado.atividadeRecuperacaoParalela.questoes.map(
        (q) =>
          `\nQuestão ${q.numero}:\n${q.enunciado}\n[Dica/Apoio]: ${q.dicaAndaime || 'Observe o conceito chave.'}\n[Gabarito Comentado]: ${q.gabaritoComentado}`
      ),
      `\nCritérios Avaliativos: ${resultado.criteriosAvaliacaoRecuperacao}`,
    ].join('\n');

    navigator.clipboard.writeText(texto);
    showToast('Plano de Reensino copiado para a área de transferência!');
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', color: '#1e293b' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
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
          <span style={{ fontSize: '24px' }}>⚡</span>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Plano de Reensino & Recuperação Paralela
            </h1>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Intervenção pedagógica imediata para superar defasagens diagnosticadas
            </span>
          </div>
        </div>

        {resultado && (
          <button
            type="button"
            onClick={() => setResultado(null)}
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
            + Novo Reensino
          </button>
        )}
      </div>

      {/* FORM INPUT */}
      {!resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '16px' }}>
              1. Configuração do Componente Curricular
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Disciplina:
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
                  Código BNCC Focado (opcional):
                </label>
                <input
                  type="text"
                  value={habilidadeBncc}
                  onChange={(e) => setHabilidadeBncc(e.target.value)}
                  placeholder="Ex: EF67EF03"
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
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
              2. Defasagens e Dificuldades Detectadas
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
              Explique quais conceitos os alunos erraram ou copie as defasagens do diagnóstico da turma.
            </p>

            <textarea
              rows={5}
              value={defasagens}
              onChange={(e) => setDefasagens(e.target.value)}
              placeholder="Descreva o que a turma não compreendeu na avaliação..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '30px' }}>
            <button
              type="button"
              onClick={handleGerarReensino}
              disabled={isProcessing}
              style={{
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '16px 36px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '800',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {isProcessing ? 'Estruturando Reensino e Atividades...' : '⚡ Gerar Plano de Reensino & Atividade'}
            </button>
          </div>
        </div>
      )}

      {/* RESULT VIEW */}
      {resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Summary */}
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
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              ⚡ Plano de Reensino: {resultado.topicoPrincipal}
            </h2>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              <b>Disciplina:</b> {resultado.disciplina} &nbsp;•&nbsp; <b>Ano/Série:</b> {resultado.ano_serie} &nbsp;•&nbsp; <b>Duração:</b> {resultado.planoAulaReensino.tempoTotalMinutos} min
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginTop: '16px' }}>
              <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', padding: '12px', borderRadius: '8px' }}>
                <b style={{ color: '#c2410c', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  🎯 Lacunas Prioritárias:
                </b>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#9a3412' }}>
                  {resultado.lacunasFocadas.map((l: string, idx: number) => (
                    <li key={idx}>{l}</li>
                  ))}
                </ul>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px' }}>
                <b style={{ color: '#166534', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  ✓ Objetivos de Nivelamento:
                </b>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#15803d' }}>
                  {resultado.objetivosAprendizagem.map((o: string, idx: number) => (
                    <li key={idx}>{o}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Roteiro da Aula de Reensino */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginBottom: '16px' }}>
              📖 Roteiro Metodológico da Aula de Reensino
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', borderLeft: '4px solid #0284c7', padding: '12px 16px', borderRadius: '6px' }}>
                <b style={{ color: '#0284c7', fontSize: '14px' }}>Etapa 1: Diagnóstico e Desmistificação do Erro (10 min)</b>
                <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
                  {resultado.planoAulaReensino.etapaDiagnostica}
                </p>
              </div>

              <div style={{ background: '#f8fafc', borderLeft: '4px solid #16a34a', padding: '12px 16px', borderRadius: '6px' }}>
                <b style={{ color: '#16a34a', fontSize: '14px' }}>Etapa 2: Metodologia Ativa e Nova Abordagem (15-20 min)</b>
                <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
                  {resultado.planoAulaReensino.etapaMetodologiaAtiva}
                </p>
              </div>

              <div style={{ background: '#f8fafc', borderLeft: '4px solid #ea580c', padding: '12px 16px', borderRadius: '6px' }}>
                <b style={{ color: '#ea580c', fontSize: '14px' }}>Etapa 3: Prática Guiada com Apoio / Andaime (15 min)</b>
                <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
                  {resultado.planoAulaReensino.praticaGuiada}
                </p>
              </div>

              <div style={{ background: '#f8fafc', borderLeft: '4px solid #6366f1', padding: '12px 16px', borderRadius: '6px' }}>
                <b style={{ color: '#6366f1', fontSize: '14px' }}>Etapa 4: Fechamento & Checagem de Compreensão (10 min)</b>
                <p style={{ margin: '6px 0 0 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
                  {resultado.planoAulaReensino.fechamentoConsolidacao}
                </p>
              </div>
            </div>
          </div>

          {/* Atividade de Recuperação Paralela */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                📝 Atividade & Avaliação de Recuperação Paralela
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Com andaimes pedagógicos e gabarito comentado
              </span>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', fontStyle: 'italic', marginBottom: '16px' }}>
              {resultado.atividadeRecuperacaoParalela.instrucoesAluno}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {resultado.atividadeRecuperacaoParalela.questoes.map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '16px',
                  }}
                >
                  <b style={{ fontSize: '14.5px', color: '#0f172a' }}>Questão {q.numero}:</b>
                  <div style={{ fontSize: '14px', color: '#1e293b', margin: '6px 0 10px 0', lineHeight: 1.4 }}>
                    {q.enunciado}
                  </div>

                  {q.dicaAndaime && (
                    <div
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        color: '#1e40af',
                        marginBottom: '8px',
                      }}
                    >
                      💡 <b>Dica de Apoio (Andaime):</b> {q.dicaAndaime}
                    </div>
                  )}

                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      color: '#166534',
                    }}
                  >
                    ✓ <b>Gabarito Comentado:</b> {q.gabaritoComentado}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '16px', fontSize: '13px', color: '#475569' }}>
              <b>Critérios Avaliativos de Recuperação:</b> {resultado.criteriosAvaliacaoRecuperacao}
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              padding: '16px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}
          >
            {onSaveMaterial && (
              <button
                type="button"
                onClick={() => onSaveMaterial(resultado)}
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
                💾 Salvar na Pasta do Bimestre
              </button>
            )}

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
              🖨️ Imprimir / Salvar PDF
            </button>

            <button
              type="button"
              onClick={handleCopiarTexto}
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
              📋 Copiar Plano Completo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
