import React, { useState } from 'react';
import {
  AdaptacaoInclusivaResult,
  TipoNecessidadeEspecial,
  DisciplinaType,
  SegmentoType,
} from '../types';
import { DISCIPLINAS_LIST, SEGMENTOS_LIST, ANOS_POR_SEGMENTO } from '../data/bnccData';

interface AdaptacaoInclusivaViewProps {
  onBack: () => void;
  initialConteudo?: string;
  initialDisciplina?: DisciplinaType;
  initialSegmento?: SegmentoType;
  initialAno?: string;
  onSaveMaterial?: (adaptacao: AdaptacaoInclusivaResult) => void;
  showToast: (msg: string) => void;
}

const NECESSIDADES_LIST: TipoNecessidadeEspecial[] = [
  'TEA (Espectro Autista)',
  'TDAH (Atenção e Hiperatividade)',
  'Dislexia / Processamento de Leitura',
  'Baixa Visão / Deficiência Visual',
  'Deficiência Intelectual Leve/Moderada',
  'Altas Habilidades / Superdotação',
  'Geral / Múltiplas Adaptações',
];

export const AdaptacaoInclusivaView: React.FC<AdaptacaoInclusivaViewProps> = ({
  onBack,
  initialConteudo = '',
  initialDisciplina = 'Educação Física',
  initialSegmento = 'Ensino Fundamental – Anos Finais',
  initialAno = '6º Ano',
  onSaveMaterial,
  showToast,
}) => {
  const [disciplina, setDisciplina] = useState<string>(initialDisciplina);
  const [segmento, setSegmento] = useState<string>(initialSegmento);
  const [ano, setAno] = useState<string>(initialAno);
  const [tipoNecessidade, setTipoNecessidade] = useState<TipoNecessidadeEspecial>('TEA (Espectro Autista)');
  const [tipoMaterial, setTipoMaterial] = useState<'plano_aula' | 'prova' | 'atividade'>('plano_aula');

  const [conteudoOriginal, setConteudoOriginal] = useState<string>(
    initialConteudo ||
      'Plano de Aula: Fundamentos dos Esportes de Invasão e Handebol.\nObjetivo: Compreender a dinâmica coletiva de ataque e defesa, passe, recepção e arremesso.\nAtividade: Jogo reduzido 4x4 em meia quadra com tempo cronometrado e troca rápida de posse de bola.\nAvaliação: Prova teórica com 5 questões de múltipla escolha e 2 dissertativas sobre estratégia de jogo.'
  );
  const [perfilAluno, setPerfilAluno] = useState<string>(
    'Estudante com TEA nível 1 de suporte: Boa comunicação verbal, mas sobrecarrega-se com excesso de estímulos sonoros na quadra e instruções ambíguas. Prefere rotina previsível e regras visuais bem demarcadas.'
  );

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultado, setResultado] = useState<AdaptacaoInclusivaResult | null>(null);

  const handleGerarAdaptacao = async () => {
    if (!conteudoOriginal.trim()) {
      showToast('Por favor, insira o conteúdo da aula, prova ou atividade para adaptar.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/adaptacao-inclusiva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conteudo: conteudoOriginal,
          tipo_material: tipoMaterial,
          tipo_necessidade: tipoNecessidade,
          disciplina,
          ano_serie: ano,
          perfil_aluno: perfilAluno,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao gerar adaptação inclusiva.');
      }

      setResultado(data.data);
      showToast('Adaptação Inclusiva e Registro de PEI gerados com sucesso!');
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
      `ADAPTAÇÃO CURRICULAR INCLUSIVA & REGISTRO DE PEI / AEE — AULA CLARA`,
      `Especificidade: ${resultado.tipoNecessidade} | Disciplina: ${resultado.disciplina} | Ano/Série: ${resultado.ano_serie}`,
      `Tempo Flexibilizado Sugerido: ${resultado.tempoSugeridoFlexibilizacao}`,
      `\n--- AJUSTES METODOLÓGICOS E ACESSIBILIDADE ---`,
      ...resultado.principaisAjustesAplicados.map((a) => `• ${a}`),
      `\nRecursos Sugeridos: ${resultado.recursosAcessibilidadeSugeridos.join(', ')}`,
      `\n--- CONTEÚDO ADAPTADO ---\n${resultado.conteudoAdaptadoFormatado}`,
      `\n--- FICHA OFICIAL DE REGISTRO PEI / AEE (PARA A COORDENAÇÃO) ---`,
      `Objetivo Individualizado: ${resultado.registroPeiAee.objetivoIndividualizado}`,
      `Barreiras Identificadas:\n${resultado.registroPeiAee.barreirasIdentificadas.map((b) => `• ${b}`).join('\n')}`,
      `Estratégias Diferenciadas:\n${resultado.registroPeiAee.estrategiasDiferenciadas.map((e) => `• ${e}`).join('\n')}`,
      `Critérios Flexibilizados:\n${resultado.registroPeiAee.criteriosAvaliativosFlexibilizados.map((c) => `• ${c}`).join('\n')}`,
      `Observações para Prontuário Escolar: ${resultado.registroPeiAee.observacoesParaProntuario}`,
    ].join('\n');

    navigator.clipboard.writeText(texto);
    showToast('Adaptação e Ficha PEI copiadas para a área de transferência!');
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
          <span style={{ fontSize: '24px' }}>🎯</span>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Adaptação Inclusiva & Registro de PEI (AEE)
            </h1>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Adaptação curricular (TEA, TDAH, Dislexia, Acessibilidade) e emissão de ficha para o prontuário escolar
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
            + Nova Adaptação
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
              1. Necessidade Específica e Contexto
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Necessidade / Perfil de Inclusão:
                </label>
                <select
                  value={tipoNecessidade}
                  onChange={(e) => setTipoNecessidade(e.target.value as TipoNecessidadeEspecial)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '2px solid #818cf8',
                    fontSize: '14px',
                    background: '#f5f3ff',
                    color: '#4338ca',
                    fontWeight: '700',
                  }}
                >
                  {NECESSIDADES_LIST.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Tipo de Material:
                </label>
                <select
                  value={tipoMaterial}
                  onChange={(e) => setTipoMaterial(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#f8fafc',
                  }}
                >
                  <option value="plano_aula">Plano de Aula / Dinâmica</option>
                  <option value="prova">Prova / Avaliação Escrita</option>
                  <option value="atividade">Atividade Prática / Exercício</option>
                </select>
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
              2. Material Original a ser Adaptado
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
              Cole o plano de aula, questões de prova ou atividade padrão que você deseja tornar acessível.
            </p>

            <textarea
              rows={5}
              value={conteudoOriginal}
              onChange={(e) => setConteudoOriginal(e.target.value)}
              placeholder="Cole aqui o conteúdo original..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                marginBottom: '16px',
              }}
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
              Perfil / Observações do Estudante (opcional):
            </label>
            <textarea
              rows={3}
              value={perfilAluno}
              onChange={(e) => setPerfilAluno(e.target.value)}
              placeholder="Ex: Como o aluno reage, hiperfocos, barreiras sensoriais ou de linguagem..."
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
              onClick={handleGerarAdaptacao}
              disabled={isProcessing}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '16px 36px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '800',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {isProcessing ? 'Gerando Adaptação & Ficha PEI...' : '🎯 Gerar Adaptação Inclusiva & PEI (AEE)'}
            </button>
          </div>
        </div>
      )}

      {/* RESULT VIEW */}
      {resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Card */}
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
                    background: '#ede9fe',
                    color: '#6d28d9',
                    display: 'inline-block',
                    marginBottom: '6px',
                  }}
                >
                  🎯 {resultado.tipoNecessidade}
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Adaptação Curricular & Ficha de PEI
                </h2>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  <b>Disciplina:</b> {resultado.disciplina} &nbsp;•&nbsp; <b>Ano/Série:</b> {resultado.ano_serie} &nbsp;•&nbsp; <b>Flexibilização de Tempo:</b> {resultado.tempoSugeridoFlexibilizacao}
                </div>
              </div>
            </div>

            {/* Badges de Ajustes */}
            <div style={{ marginTop: '16px' }}>
              <b style={{ fontSize: '13px', color: '#334155', display: 'block', marginBottom: '8px' }}>
                Ajustes e Recursos de Acessibilidade Aplicados:
              </b>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {resultado.principaisAjustesAplicados.map((ajuste: string, idx: number) => (
                  <span
                    key={idx}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#1e293b',
                      fontWeight: '600',
                    }}
                  >
                    ✓ {ajuste}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Conteúdo Adaptado */}
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
              📄 Material Adaptado para o Estudante
            </h3>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '16px',
                borderRadius: '10px',
                fontSize: '14px',
                color: '#1e293b',
                lineHeight: 1.6,
                whiteSpace: 'pre-line',
              }}
            >
              {resultado.conteudoAdaptadoFormatado}
            </div>
          </div>

          {/* FICHA OFICIAL DE REGISTRO PEI / AEE */}
          <div
            className="card"
            style={{
              background: '#ffffff',
              border: '2px solid #a78bfa',
              borderRadius: '14px',
              padding: '22px',
              boxShadow: '0 4px 12px rgba(167, 139, 250, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '20px' }}>📋</span>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#4c1d95', margin: 0 }}>
                Ficha Oficial de Registro de PEI (Plano de Ensino Individualizado / AEE)
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: '#6d28d9', margin: '0 0 16px 0' }}>
              Documentação institucional para a Coordenação Pedagógica, Sala de Recursos e Prontuário Escolar do Estudante.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#f5f3ff', padding: '12px', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                <b style={{ color: '#5b21b6', fontSize: '13px' }}>Objetivo Individualizado:</b>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px' }}>
                  {resultado.registroPeiAee.objetivoIndividualizado}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <b style={{ color: '#b91c1c', fontSize: '13px' }}>Barreiras Identificadas:</b>
                  <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '12.5px', color: '#475569' }}>
                    {resultado.registroPeiAee.barreirasIdentificadas.map((b: string, i: number) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <b style={{ color: '#047857', fontSize: '13px' }}>Estratégias Diferenciadas (DUA):</b>
                  <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '12.5px', color: '#475569' }}>
                    {resultado.registroPeiAee.estrategiasDiferenciadas.map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <b style={{ color: '#1e40af', fontSize: '13px' }}>Critérios Avaliativos Flexibilizados:</b>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '12.5px', color: '#475569' }}>
                  {resultado.registroPeiAee.criteriosAvaliativosFlexibilizados.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <b style={{ color: '#334155', fontSize: '13px' }}>Parecer / Observações para o Prontuário:</b>
                <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
                  {resultado.registroPeiAee.observacoesParaProntuario}
                </div>
              </div>
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
                background: '#4f46e5',
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
              🖨️ Imprimir Ficha de PEI / PDF
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
              📋 Copiar Adaptação + PEI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
