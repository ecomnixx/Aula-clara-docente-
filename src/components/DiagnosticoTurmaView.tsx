import React, { useState } from 'react';
import {
  DiagnosticoTurmaResult,
  DisciplinaType,
  SegmentoType,
  HabilidadeDiagnostico,
} from '../types';
import { DISCIPLINAS_LIST, SEGMENTOS_LIST, ANOS_POR_SEGMENTO } from '../data/bnccData';

interface DiagnosticoTurmaViewProps {
  onBack: () => void;
  onNavigateToReensino?: (defasagens: string, disciplina: string, ano: string) => void;
  initialDisciplina?: DisciplinaType;
  initialSegmento?: SegmentoType;
  initialAno?: string;
  initialTurma?: string;
  initialBimestre?: string;
  showToast: (msg: string) => void;
}

export const DiagnosticoTurmaView: React.FC<DiagnosticoTurmaViewProps> = ({
  onBack,
  onNavigateToReensino,
  initialDisciplina = 'Educação Física',
  initialSegmento = 'Ensino Fundamental – Anos Finais',
  initialAno = '6º Ano',
  initialTurma = 'Turma 6º A',
  initialBimestre = '1º Bimestre',
  showToast,
}) => {
  const [turma, setTurma] = useState<string>(initialTurma);
  const [disciplina, setDisciplina] = useState<string>(initialDisciplina);
  const [segmento, setSegmento] = useState<string>(initialSegmento);
  const [ano, setAno] = useState<string>(initialAno);
  const [bimestre, setBimestre] = useState<string>(initialBimestre);

  // Input Data
  const [dadosProvas, setDadosProvas] = useState<string>(
    'Exemplo de dados:\n- Prova 1: Média da turma 6.8. Questão 3 (esportes de invasão) teve 65% de erro.\n- Questão 5 (diferença entre jogo e esporte) teve 80% de acerto.\n- Questão 8 (regras do handebol e passe) teve 50% de acerto.\n- 5 alunos tiraram abaixo de 5.0; 12 alunos entre 6.0 e 7.5; 8 alunos acima de 8.5.'
  );
  const [habilidadesPrevistas, setHabilidadesPrevistas] = useState<string>(
    'EF67EF03, EF67EF04, EF67EF05 — Esportes de marca, precisão, invasão e cooperação.'
  );

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultado, setResultado] = useState<DiagnosticoTurmaResult | null>(null);

  const handleGerarDiagnostico = async () => {
    if (!dadosProvas.trim()) {
      showToast('Por favor, insira as notas ou o resumo dos erros/acertos da turma.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/diagnostico-turma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turma,
          disciplina,
          ano_serie: ano,
          bimestre,
          dados_provas: dadosProvas,
          habilidades: habilidadesPrevistas,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao processar diagnóstico da turma.');
      }

      setResultado(data.data);
      showToast('Diagnóstico e Mapa de Calor gerados com sucesso!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopiarRelatorio = () => {
    if (!resultado) return;
    const texto = [
      `RELATÓRIO DIAGNÓSTICO E GESTÃO PEDAGÓGICA — AULA CLARA`,
      `Turma: ${resultado.turma} | Disciplina: ${resultado.disciplina} | Bimestre: ${resultado.bimestre}`,
      `Média Geral da Turma: ${resultado.mediaGeralTurma.toFixed(2)} / 10,00 | Taxa de Aprovação: ${resultado.taxaAprovacaoPorcentagem}%`,
      `\nRESUMO EXECUTIVO PARA A DIREÇÃO / CONSELHO DE CLASSE:\n${resultado.resumoExecutivoDirecao}`,
      `\nMAPA DE HABILIDADES:`,
      ...resultado.habilidadesDiagnostico.map(
        (h) =>
          `• [${h.taxaAcertoPorcentagem}% - ${h.status.toUpperCase()}] ${h.codigoBncc ? `${h.codigoBncc}: ` : ''}${h.habilidadeDescricao} (Recomendação: ${h.recomendacaoPedagogica})`
      ),
      `\nPONTOS FORTES:\n${resultado.pontosFortesTurma.map((p) => `✓ ${p}`).join('\n')}`,
      `\nDEFASAGENS COLETIVAS:\n${resultado.principaisDefasagensColetivas.map((d) => `⚠ ${d}`).join('\n')}`,
      `\nAÇÕES RECOMENDADAS PARA COORDENAÇÃO:\n${resultado.acoesRecomendadasCoordencao.map((a) => `→ ${a}`).join('\n')}`,
    ].join('\n');

    navigator.clipboard.writeText(texto);
    showToast('Relatório executivo copiado para a área de transferência!');
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
          <span style={{ fontSize: '24px' }}>📊</span>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Mapa de Calor & Diagnóstico da Turma
            </h1>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Diagnóstico de domínio da BNCC, defasagens coletivas e relatório para a Direção
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
            + Novo Diagnóstico
          </button>
        )}
      </div>

      {/* INPUT FORM */}
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
              1. Identificação da Turma e Bimestre
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Turma:
                </label>
                <input
                  type="text"
                  value={turma}
                  onChange={(e) => setTurma(e.target.value)}
                  placeholder="Ex: 6º Ano A"
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
                  Bimestre:
                </label>
                <select
                  value={bimestre}
                  onChange={(e) => setBimestre(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#f8fafc',
                  }}
                >
                  <option value="1º Bimestre">1º Bimestre</option>
                  <option value="2º Bimestre">2º Bimestre</option>
                  <option value="3º Bimestre">3º Bimestre</option>
                  <option value="4º Bimestre">4º Bimestre</option>
                </select>
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
              2. Dados das Avaliações / Notas da Turma
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
              Cole as notas individuais dos alunos, a porcentagem de acertos por questão ou o resumo pós-correção.
            </p>

            <textarea
              rows={6}
              value={dadosProvas}
              onChange={(e) => setDadosProvas(e.target.value)}
              placeholder="Cole aqui o panorama de notas, acertos por questão ou lista de notas dos alunos..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontFamily: 'monospace',
                marginBottom: '16px',
              }}
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
              Habilidades BNCC ou Tópicos Curriculares Trabalhados (opcional):
            </label>
            <input
              type="text"
              value={habilidadesPrevistas}
              onChange={(e) => setHabilidadesPrevistas(e.target.value)}
              placeholder="Ex: EF06MA01, EF06MA02 ou Frações e Porcentagem"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                background: '#f8fafc',
              }}
            />
          </div>

          <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '30px' }}>
            <button
              type="button"
              onClick={handleGerarDiagnostico}
              disabled={isProcessing}
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '16px 36px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '800',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {isProcessing ? 'Gerando Diagnóstico da Turma...' : '📊 Gerar Mapa de Calor & Diagnóstico'}
            </button>
          </div>
        </div>
      )}

      {/* RESULT VIEW */}
      {resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Executive Header Card */}
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
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Diagnóstico Pedagógico: {resultado.turma}
                </h2>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  <b>Disciplina:</b> {resultado.disciplina} &nbsp;•&nbsp; <b>Ano/Série:</b> {resultado.ano_serie} &nbsp;•&nbsp; <b>Bimestre:</b> {resultado.bimestre}
                </div>
              </div>

              {/* Metric Cards */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>
                    Média da Turma
                  </span>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: '#0284c7' }}>
                    {resultado.mediaGeralTurma.toFixed(2).replace('.', ',')}
                  </div>
                </div>

                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#166534', fontWeight: '700', textTransform: 'uppercase' }}>
                    Taxa de Aprovação
                  </span>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: '#16a34a' }}>
                    {resultado.taxaAprovacaoPorcentagem}%
                  </div>
                </div>
              </div>
            </div>

            {/* Distribution Graph */}
            <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                Distribuição das Notas dos Alunos:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#9f1239', fontWeight: '600' }}>Abaixo de 5,0</div>
                  <b style={{ fontSize: '16px', color: '#e11d48' }}>{resultado.distribuicaoNotas.abaixo_5} alunos</b>
                </div>
                <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#854d0e', fontWeight: '600' }}>5,0 a 6,9</div>
                  <b style={{ fontSize: '16px', color: '#ca8a04' }}>{resultado.distribuicaoNotas.entre_5_e_7} alunos</b>
                </div>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: '600' }}>7,0 a 8,9</div>
                  <b style={{ fontSize: '16px', color: '#2563eb' }}>{resultado.distribuicaoNotas.entre_7_e_9} alunos</b>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#166534', fontWeight: '600' }}>9,0 a 10,0</div>
                  <b style={{ fontSize: '16px', color: '#16a34a' }}>{resultado.distribuicaoNotas.acima_9} alunos</b>
                </div>
              </div>
            </div>
          </div>

          {/* MAPA DE CALOR DE HABILIDADES BNCC */}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                🌡️ Mapa de Calor: Domínio de Habilidades BNCC
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Taxa de retenção e compreensão da turma
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {resultado.habilidadesDiagnostico.map((hab: HabilidadeDiagnostico, idx: number) => {
                const colorBar =
                  hab.taxaAcertoPorcentagem >= 75
                    ? '#16a34a' // Green
                    : hab.taxaAcertoPorcentagem >= 50
                    ? '#ca8a04' // Yellow/Orange
                    : '#dc2626'; // Red

                const statusLabel =
                  hab.status === 'dominado'
                    ? '✓ Dominado'
                    : hab.status === 'em_desenvolvimento'
                    ? '⚡ Em Desenvolvimento'
                    : '⚠ Defasagem Crítica';

                return (
                  <div
                    key={idx}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                        {hab.codigoBncc ? <span style={{ color: '#0284c7' }}>[{hab.codigoBncc}] </span> : ''}
                        {hab.habilidadeDescricao}
                      </div>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: '800',
                          color: colorBar,
                          background: '#ffffff',
                          border: `1px solid ${colorBar}`,
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {hab.taxaAcertoPorcentagem}% — {statusLabel}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        background: '#e2e8f0',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '8px',
                      }}
                    >
                      <div
                        style={{
                          width: `${hab.taxaAcertoPorcentagem}%`,
                          height: '100%',
                          background: colorBar,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </div>

                    <div style={{ fontSize: '12px', color: '#475569' }}>
                      <b>Orientação Pedagógica:</b> {hab.recomendacaoPedagogica}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RESUMO EXECUTIVO PARA A DIREÇÃO / CONSELHO */}
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
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginBottom: '12px' }}>
              📋 Resumo Executivo para Gestão / Conselho de Classe
            </h3>

            <div
              style={{
                background: '#f8fafc',
                borderLeft: '4px solid #0284c7',
                padding: '14px 16px',
                borderRadius: '6px',
                fontSize: '13.5px',
                color: '#334155',
                lineHeight: 1.6,
                marginBottom: '16px',
              }}
            >
              {resultado.resumoExecutivoDirecao}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '10px' }}>
                <b style={{ color: '#166534', fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  ✓ Pontos Fortes Consolidados:
                </b>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: '#15803d' }}>
                  {resultado.pontosFortesTurma.map((pf: string, i: number) => (
                    <li key={i} style={{ marginBottom: '4px' }}>
                      {pf}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '14px', borderRadius: '10px' }}>
                <b style={{ color: '#9f1239', fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  ⚠ Principais Defasagens Coletivas:
                </b>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: '#be123c' }}>
                  {resultado.principaisDefasagensColetivas.map((def: string, i: number) => (
                    <li key={i} style={{ marginBottom: '4px' }}>
                      {def}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS & FAST-FORWARD TO REENSINO */}
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
            {onNavigateToReensino && (
              <button
                type="button"
                onClick={() =>
                  onNavigateToReensino(
                    resultado.principaisDefasagensColetivas.join('; '),
                    resultado.disciplina,
                    resultado.ano_serie
                  )
                }
                style={{
                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
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
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
                }}
              >
                ⚡ Gerar Plano de Reensino para as Defasagens
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
              🖨️ Imprimir para Conselho de Classe
            </button>

            <button
              type="button"
              onClick={handleCopiarRelatorio}
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
              📋 Copiar Resumo Executivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
