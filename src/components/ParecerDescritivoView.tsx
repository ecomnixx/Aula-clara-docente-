import React, { useState } from 'react';
import { ParecerDescritivoResult, DisciplinaType, SegmentoType } from '../types';
import { DISCIPLINAS_LIST, SEGMENTOS_LIST, ANOS_POR_SEGMENTO } from '../data/bnccData';

interface ParecerDescritivoViewProps {
  onBack: () => void;
  initialDisciplina?: DisciplinaType;
  initialSegmento?: SegmentoType;
  initialAno?: string;
  initialTurma?: string;
  initialBimestre?: string;
  onSaveMaterial?: (parecer: ParecerDescritivoResult) => void;
  showToast: (msg: string) => void;
}

export const ParecerDescritivoView: React.FC<ParecerDescritivoViewProps> = ({
  onBack,
  initialDisciplina = 'Educação Física',
  initialSegmento = 'Ensino Fundamental – Anos Finais',
  initialAno = '6º Ano',
  initialTurma = 'Turma 6º A',
  initialBimestre = '1º Bimestre',
  onSaveMaterial,
  showToast,
}) => {
  const [nomeAluno, setNomeAluno] = useState<string>('Gabriel Silveira');
  const [turma, setTurma] = useState<string>(initialTurma);
  const [disciplina, setDisciplina] = useState<string>(initialDisciplina);
  const [segmento, setSegmento] = useState<string>(initialSegmento);
  const [ano, setAno] = useState<string>(initialAno);
  const [bimestre, setBimestre] = useState<string>(initialBimestre);
  const [rendimento, setRendimento] = useState<'Excelente' | 'Bom' | 'Em Desenvolvimento' | 'Abaixo do Esperado'>('Bom');

  const [observacoes, setObservacoes] = useState<string>(
    'Participativo nos jogos coletivos, demonstra liderança positiva e respeito aos colegas. Apresentou média 7.5 na avaliação escrita, com pequenos lapsos na conceituação tática de handebol. Entrega todas as atividades no prazo.'
  );

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultado, setResultado] = useState<ParecerDescritivoResult | null>(null);

  const handleGerarParecer = async () => {
    if (!nomeAluno.trim() || !observacoes.trim()) {
      showToast('Por favor, informe o nome do aluno e as observações pedagógicas.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/parecer-descritivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_aluno: nomeAluno,
          turma,
          disciplina,
          bimestre,
          ano_serie: ano,
          rendimento,
          observacoes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao gerar parecer descritivo.');
      }

      setResultado(data.data);
      showToast('Parecer Descritivo elaborado com sucesso!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro de conexão com o servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopiarTexto = () => {
    if (!resultado) return;
    const texto = [
      `PARECER DESCRITIVO INDIVIDUAL — AULA CLARA`,
      `Estudante: ${resultado.nomeAluno} | Turma: ${resultado.turma}`,
      `Disciplina: ${resultado.disciplina} | Ano/Série: ${resultado.ano_serie} | Bimestre: ${resultado.bimestre}`,
      `\n--- TEXTO DO PARECER FORMATIVO ---\n${resultado.parecerCompletoFormatado}`,
      `\n--- SÍNTESE DE HABILIDADES BNCC TRABALHADAS ---`,
      ...resultado.sinteseHabilidadesBncc.map((h) => `• ${h}`),
      `\nAspectos Socioemocionais: ${resultado.aspectosSocioemocionais}`,
      `Recomendações para a Família: ${resultado.recomendacoesFamilia}`,
      `Metas para o Próximo Bimestre: ${resultado.metasProximoBimestre}`,
    ].join('\n');

    navigator.clipboard.writeText(texto);
    showToast('Parecer copiado para a área de transferência!');
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
          <span style={{ fontSize: '24px' }}>📝</span>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Parecer Descritivo do Bimestre
            </h1>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Redação pedagógica ética, técnica e alinhada à BNCC para boletins e conselho de classe
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
            + Novo Parecer
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
              1. Identificação do Estudante
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Nome do Aluno(a):
                </label>
                <input
                  type="text"
                  value={nomeAluno}
                  onChange={(e) => setNomeAluno(e.target.value)}
                  placeholder="Nome completo do aluno"
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

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Nível de Rendimento Geral:
                </label>
                <select
                  value={rendimento}
                  onChange={(e) => setRendimento(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#f8fafc',
                    fontWeight: '600',
                  }}
                >
                  <option value="Excelente">Excelente / Pleno Domínio</option>
                  <option value="Bom">Bom / Rendimento Satisfatório</option>
                  <option value="Em Desenvolvimento">Em Desenvolvimento / Requer Atenção</option>
                  <option value="Abaixo do Esperado">Abaixo do Esperado / Em Recuperação</option>
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
              2. Observações do Professor, Notas e Participação
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
              Escreva em tópicos informais o que você observou do aluno no bimestre (notas, postura, engajamento, dificuldades). A IA transformará isso em um parecer formal, acolhedor e fundamentado na BNCC.
            </p>

            <textarea
              rows={5}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex: Aluno atencioso, média 7.0, foi bem nas provas mas ainda tímido nas apresentações em grupo..."
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
              onClick={handleGerarParecer}
              disabled={isProcessing}
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '16px 36px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '800',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {isProcessing ? 'Redigindo Parecer Descritivo...' : '📝 Redigir Parecer Descritivo Oficial'}
            </button>
          </div>
        </div>
      )}

      {/* RESULT VIEW */}
      {resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Main Card */}
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
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: '#dcfce7',
                    color: '#15803d',
                    display: 'inline-block',
                    marginBottom: '6px',
                  }}
                >
                  ✓ Parecer Homologado
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  {resultado.nomeAluno} — {resultado.turma}
                </h2>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  <b>Disciplina:</b> {resultado.disciplina} &nbsp;•&nbsp; <b>Bimestre:</b> {resultado.bimestre} &nbsp;•&nbsp; <b>Ano/Série:</b> {resultado.ano_serie}
                </div>
              </div>
            </div>

            {/* Texto Formal do Parecer */}
            <div style={{ marginTop: '20px' }}>
              <b style={{ fontSize: '14px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                Texto do Parecer Descritivo (para Boletim / Prontuário Escolar):
              </b>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderLeft: '4px solid #059669',
                  padding: '16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#1e293b',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                }}
              >
                {resultado.parecerCompletoFormatado}
              </div>
            </div>
          </div>

          {/* Detailed Pillars */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <b style={{ color: '#0284c7', fontSize: '13.5px', display: 'block', marginBottom: '8px' }}>
                🎯 Habilidades BNCC Evidenciadas:
              </b>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#334155' }}>
                {resultado.sinteseHabilidadesBncc.map((h: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <b style={{ color: '#7c3aed', fontSize: '13.5px', display: 'block', marginBottom: '8px' }}>
                🤝 Aspectos Socioemocionais:
              </b>
              <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                {resultado.aspectosSocioemocionais}
              </p>
            </div>

            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <b style={{ color: '#d97706', fontSize: '13.5px', display: 'block', marginBottom: '8px' }}>
                🏠 Recomendações para a Família:
              </b>
              <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                {resultado.recomendacoesFamilia}
              </p>
            </div>

            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <b style={{ color: '#059669', fontSize: '13.5px', display: 'block', marginBottom: '8px' }}>
                🚀 Metas para o Próximo Bimestre:
              </b>
              <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                {resultado.metasProximoBimestre}
              </p>
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
                💾 Salvar Parecer no Bimestre
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              style={{
                background: '#059669',
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
              🖨️ Imprimir Parecer / Boletim
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
              📋 Copiar Parecer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
