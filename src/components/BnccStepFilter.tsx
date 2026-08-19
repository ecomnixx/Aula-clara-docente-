import React, { useState, useMemo } from 'react';
import { BnccSkill, DisciplinaType, SegmentoType } from '../types';
import { BNCC_SKILLS_DATABASE } from '../data/bnccData';
import {
  Search,
  Filter,
  Hash,
  Compass,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Pin,
  X,
  BookOpen,
  Sparkles,
} from 'lucide-react';

interface BnccStepFilterProps {
  disciplina: DisciplinaType;
  segmento: SegmentoType;
  ano: string;
  selectedPinnedSkills: BnccSkill[];
  onTogglePinSkill: (skill: BnccSkill) => void;
  onClearPinnedSkills: () => void;
  showToast: (message: string) => void;
}

export const BnccStepFilter: React.FC<BnccStepFilterProps> = ({
  disciplina,
  segmento,
  ano,
  selectedPinnedSkills,
  onTogglePinSkill,
  onClearPinnedSkills,
  showToast,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'codigo' | 'eixo' | 'todos'>('codigo');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEixo, setSelectedEixo] = useState<string>('TODOS');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // 1. Filter database for current context
  const contextSkills = useMemo(() => {
    const normalizeDisc = (d: string) => d.toLowerCase().trim();
    const currDisc = normalizeDisc(disciplina);

    return BNCC_SKILLS_DATABASE.filter((skill) => {
      const skillDisc = normalizeDisc(skill.disciplina);
      const discMatch =
        skillDisc === currDisc ||
        (currDisc === 'língua portuguesa' &&
          (skillDisc === 'alfabetização e letramento' ||
            skillDisc === 'redação' ||
            skillDisc === 'literatura')) ||
        (currDisc === 'inglês' && skillDisc === 'língua inglesa') ||
        (currDisc === 'língua inglesa' && skillDisc === 'inglês') ||
        (currDisc === 'espanhol' && skillDisc === 'língua espanhola') ||
        (currDisc === 'língua espanhola' && skillDisc === 'espanhol');

      const segMatch = skill.segmento === segmento;
      const anoMatch =
        !skill.ano ||
        skill.ano.toLowerCase().includes(ano.toLowerCase()) ||
        ano.toLowerCase().includes(skill.ano.toLowerCase());

      return discMatch && segMatch && anoMatch;
    });
  }, [disciplina, segmento, ano]);

  // Fallback to broader discipline skills if contextual is narrow
  const effectiveSkills = useMemo(() => {
    if (contextSkills.length > 0) return contextSkills;
    return BNCC_SKILLS_DATABASE.filter(
      (s) => s.disciplina.toLowerCase() === disciplina.toLowerCase()
    );
  }, [contextSkills, disciplina]);

  // 2. Extract unique Eixos / Unidades Temáticas
  const availableEixos = useMemo(() => {
    const set = new Set<string>();
    effectiveSkills.forEach((s) => {
      if (s.unidadeTematica && s.unidadeTematica.trim()) {
        set.add(s.unidadeTematica.trim());
      }
    });
    return Array.from(set).sort();
  }, [effectiveSkills]);

  // 3. Filter skills based on user input
  const filteredSkills = useMemo(() => {
    return effectiveSkills.filter((skill) => {
      // Eixo filter if a specific chip is selected
      if (selectedEixo !== 'TODOS') {
        if (!skill.unidadeTematica || skill.unidadeTematica.trim() !== selectedEixo) {
          return false;
        }
      }

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();

      if (filterMode === 'codigo') {
        return skill.codigo.toLowerCase().includes(q);
      }

      if (filterMode === 'eixo') {
        return (
          (skill.unidadeTematica && skill.unidadeTematica.toLowerCase().includes(q)) ||
          (skill.objetoConhecimento && skill.objetoConhecimento.toLowerCase().includes(q))
        );
      }

      // 'todos' mode
      return (
        skill.codigo.toLowerCase().includes(q) ||
        skill.descricao.toLowerCase().includes(q) ||
        (skill.unidadeTematica && skill.unidadeTematica.toLowerCase().includes(q)) ||
        (skill.objetoConhecimento && skill.objetoConhecimento.toLowerCase().includes(q))
      );
    });
  }, [effectiveSkills, selectedEixo, filterMode, searchQuery]);

  const handleCopyCode = (e: React.MouseEvent, code: string, desc: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${code}: ${desc}`);
    setCopiedCode(code);
    showToast(`Código ${code} copiado para a área de transferência!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const isSkillPinned = (code: string) => {
    return selectedPinnedSkills.some((s) => s.codigo === code);
  };

  return (
    <div
      style={{
        marginTop: '16px',
        borderRadius: '14px',
        border: selectedPinnedSkills.length > 0 ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header Toggle */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '14px 18px',
          background: selectedPinnedSkills.length > 0
            ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: isOpen ? '1px solid #e2e8f0' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: selectedPinnedSkills.length > 0 ? '#2563eb' : '#475569',
              color: '#ffffff',
              fontSize: '16px',
            }}
          >
            {selectedPinnedSkills.length > 0 ? '🎯' : '🧭'}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                Filtrar Habilidades BNCC por Código ou Eixo
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: selectedPinnedSkills.length > 0 ? '#1d4ed8' : '#e2e8f0',
                  color: selectedPinnedSkills.length > 0 ? '#ffffff' : '#475569',
                }}
              >
                {effectiveSkills.length} disponíveis
              </span>
              {selectedPinnedSkills.length > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                  }}
                >
                  ✓ {selectedPinnedSkills.length} fixada(s)
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
              Localize instantaneamente habilidades para vincular com precisão ao seu planejamento.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedPinnedSkills.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearPinnedSkills();
                showToast('Habilidades fixadas removidas.');
              }}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#dc2626',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                padding: '4px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Limpar fixação
            </button>
          )}
          {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
        </div>
      </div>

      {/* Pinned Skills Summary Bar */}
      {selectedPinnedSkills.length > 0 && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
            <Pin size={14} />
            <span>Habilidade(s) Fixada(s) para o Planejamento / Prova:</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {selectedPinnedSkills.map((s) => (
              <div
                key={s.codigo}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #93c5fd',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <b style={{ color: '#1d4ed8', fontFamily: 'monospace' }}>{s.codigo}</b>
                <span
                  style={{
                    color: '#334155',
                    maxWidth: '220px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={s.descricao}
                >
                  {s.descricao}
                </span>
                <button
                  type="button"
                  onClick={() => onTogglePinSkill(s)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Desafixar habilidade"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Body */}
      {isOpen && (
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Mode Selector Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>
              Modo de Filtro:
            </span>

            <button
              type="button"
              onClick={() => {
                setFilterMode('codigo');
                setSearchQuery('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: filterMode === 'codigo' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                backgroundColor: filterMode === 'codigo' ? '#eff6ff' : '#ffffff',
                color: filterMode === 'codigo' ? '#1d4ed8' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >
              <Hash size={14} />
              <span>Por Código BNCC</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterMode('eixo');
                setSearchQuery('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: filterMode === 'eixo' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                backgroundColor: filterMode === 'eixo' ? '#eff6ff' : '#ffffff',
                color: filterMode === 'eixo' ? '#1d4ed8' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >
              <Compass size={14} />
              <span>Por Eixo / Unidade Temática</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterMode('todos');
                setSearchQuery('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: filterMode === 'todos' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                backgroundColor: filterMode === 'todos' ? '#eff6ff' : '#ffffff',
                color: filterMode === 'todos' ? '#1d4ed8' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >
              <Search size={14} />
              <span>Busca Geral</span>
            </button>
          </div>

          {/* Search Input Bar */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                color: '#64748b',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                filterMode === 'codigo'
                  ? 'Filtrar por código ex: EF06LP, EM13, EF01HI, EF07...'
                  : filterMode === 'eixo'
                  ? 'Filtrar por eixo temático ex: Leitura, Números, Álgebra, Lutas...'
                  : 'Pesquise por código, eixo ou palavra-chave na descrição...'
              }
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                fontSize: '13px',
                color: '#0f172a',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Quick Eixo / Unidade Temática Pills */}
          {availableEixos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Eixos Temáticos de {disciplina}:
                </span>
                {selectedEixo !== 'TODOS' && (
                  <button
                    type="button"
                    onClick={() => setSelectedEixo('TODOS')}
                    style={{
                      fontSize: '11px',
                      color: '#2563eb',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Ver todos
                  </button>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  maxHeight: '85px',
                  overflowY: 'auto',
                  padding: '2px 0',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedEixo('TODOS')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: selectedEixo === 'TODOS' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                    backgroundColor: selectedEixo === 'TODOS' ? '#eff6ff' : '#f8fafc',
                    color: selectedEixo === 'TODOS' ? '#1d4ed8' : '#475569',
                  }}
                >
                  Todos os Eixos ({effectiveSkills.length})
                </button>
                {availableEixos.map((eixo) => {
                  const count = effectiveSkills.filter((s) => s.unidadeTematica?.trim() === eixo).length;
                  const isSelected = selectedEixo === eixo;
                  return (
                    <button
                      key={eixo}
                      type="button"
                      onClick={() => setSelectedEixo(isSelected ? 'TODOS' : eixo)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                        color: isSelected ? '#1d4ed8' : '#475569',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      {eixo} <span style={{ opacity: 0.7 }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Results List */}
          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px',
            }}
          >
            {filteredSkills.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '13px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px dashed #cbd5e1',
                }}
              >
                Nenhuma habilidade encontrada para os filtros selecionados. Tente buscar por outro código ou termo.
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const pinned = isSkillPinned(skill.codigo);
                return (
                  <div
                    key={skill.codigo}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: pinned ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                      backgroundColor: pinned ? '#eff6ff' : '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Top row: Code + Eixo Tag + Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            fontSize: '13px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: pinned ? '#1d4ed8' : '#0f172a',
                            color: '#ffffff',
                            letterSpacing: '0.03em',
                          }}
                        >
                          {skill.codigo}
                        </span>

                        {skill.unidadeTematica && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            🧭 {skill.unidadeTematica}
                          </span>
                        )}

                        {skill.ano && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            • {skill.ano}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={(e) => handleCopyCode(e, skill.codigo, skill.descricao)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Copiar código e descrição"
                        >
                          {copiedCode === skill.codigo ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          <span>{copiedCode === skill.codigo ? 'Copiado' : 'Copiar'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onTogglePinSkill(skill);
                            if (!pinned) {
                              showToast(`Habilidade ${skill.codigo} vinculada ao planejamento!`);
                            } else {
                              showToast(`Habilidade ${skill.codigo} desvinculada.`);
                            }
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: pinned ? '1px solid #2563eb' : '1px solid #0f172a',
                            backgroundColor: pinned ? '#2563eb' : '#0f172a',
                            color: '#ffffff',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                        >
                          {pinned ? <Check size={12} /> : <Pin size={12} />}
                          <span>{pinned ? '✓ Fixada' : '+ Fixar na Aula'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Objeto de Conhecimento */}
                    {skill.objetoConhecimento && (
                      <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                        <span style={{ color: '#94a3b8' }}>Objeto de Conhecimento:</span> {skill.objetoConhecimento}
                      </div>
                    )}

                    {/* Description */}
                    <p style={{ fontSize: '12px', color: '#334155', lineHeight: '1.5', margin: 0 }}>
                      {skill.descricao}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
