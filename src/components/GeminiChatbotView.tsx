import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  Paperclip,
  Image as ImageIcon,
  Trash2,
  Copy,
  Check,
  Download,
  Bot,
  User,
  Zap,
  Brain,
  Layers,
  ArrowLeft,
  X,
  RefreshCw,
  BookOpen,
  HeartHandshake,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  images?: Array<{ base64: string; mimeType: string }>;
  modelUsed?: string;
}

interface RoleOption {
  id: string;
  title: string;
  icon: string;
  badge: string;
  description: string;
  systemInstruction: string;
  quickPrompts: string[];
}

const CHAT_ROLES: RoleOption[] = [
  {
    id: 'bncc_consultant',
    title: 'Consultor BNCC & Metodologias Ativas',
    icon: '🧑‍🏫',
    badge: 'Pedagógico Geral',
    description: 'Especialista em habilidades BNCC, sequências didáticas e dinâmicas participativas.',
    systemInstruction: `Você é o Consultor Pedagógico Sênior do Aula Clara. Sua missão é apoiar professores na elaboração de planos de aula, alinhamento curricular rigoroso com as habilidades da BNCC (ex: EF06EF01, EM13LGG101), dinâmicas de metodologias ativas (sala de aula invertida, rotação por estações, PBL) e avaliações formativas. Seja objetivo, didático, acolhedor e forneça passos práticos e executáveis para a sala de aula real.`,
    quickPrompts: [
      '💡 Sugira uma dinâmica prática de 15 min para prender a atenção da turma.',
      '🎯 Quais habilidades da BNCC combinam com uma aula sobre saúde e esportes?',
      '📋 Como montar uma sequência didática de 3 aulas para o Ensino Fundamental?',
      '🗣️ Dê 3 perguntas disparadoras para iniciar um debate reflexivo.',
    ],
  },
  {
    id: 'aee_inclusion',
    title: 'Especialista em AEE & Inclusão (PEI/DUA)',
    icon: '🎯',
    badge: 'Educação Especial',
    description: 'Adaptação curricular para TEA, TDAH, dislexia, deficiências e altas habilidades.',
    systemInstruction: `Você é o Especialista em Educação Especial Inclusiva, Atendimento Educacional Especializado (AEE) e Desenho Universal para a Aprendizagem (DUA) do Aula Clara. Ajude professores a adaptar conteúdos, provas e atividades para estudantes com TEA, TDAH, deficiência intelectual, sensorial ou física. Dê orientações respeitosas, acessíveis, com apoios visuais e critérios de mediação sem infantilizar o estudante.`,
    quickPrompts: [
      '🧩 Como adaptar uma prova teórica para um estudante com TEA nível 1?',
      '⏳ Dicas para manter o foco de alunos com TDAH em atividades longas.',
      '📖 Estratégias de leitura para alunos com Dislexia no Fundamental II.',
      '🤝 Como estruturar um Plano de Ensino Individualizado (PEI) simplificado?',
    ],
  },
  {
    id: 'exam_evaluator',
    title: 'Revisor de Avaliações & Provas',
    icon: '📝',
    badge: 'Avaliação & Itens',
    description: 'Elaboração de matrizes, revisão de distratores e rubricas de correção.',
    systemInstruction: `Você é um Especialista em Avaliação Educacional e Teoria da Resposta ao Item (TRI/BNCC). Auxilie o professor na formulação de questões contextualizadas (múltipla escolha e discursivas), identificação de pegadinhas indesejadas, calibragem do nível de dificuldade (fácil, médio, difícil) e elaboração de critérios e rubricas de correção com feedback construtivo.`,
    quickPrompts: [
      '📝 Crie 3 questões de múltipla escolha com distratores pedagógicos claros.',
      '⚖️ Elabore uma rubrica de avaliação formativa com 4 níveis de domínio.',
      '🔍 Como reformular uma questão discursiva para torná-la mais contextualizada?',
      '📊 Sugira critérios de pontuação parcial para uma prova bimestral.',
    ],
  },
  {
    id: 'gestao_coordination',
    title: 'Consultor de Gestão Escolar & Coordenação',
    icon: '🏛️',
    badge: 'Gestão Pedagógica',
    description: 'Auxílio em conselhos de classe, pareceres oficiais e mediação institucional.',
    systemInstruction: `Você é um Consultor de Coordenação Pedagógica e Direção Escolar do Aula Clara. Auxilie na mediação de conflitos escolares, estruturação de pautas para Conselho de Classe, elaboração de pareceres descritivos oficiais, diálogo acolhedor com famílias e acompanhamento de metas pedagógicas da escola.`,
    quickPrompts: [
      '📑 Como conduzir um Conselho de Classe focado em intervenções práticas?',
      '✍️ Frases adequadas e éticas para um parecer descritivo de aluno com dificuldades.',
      '👨‍👩‍👧 Roteiro para reunião de pais sobre rendimento e frequência escolar.',
      '📈 Estratégias para recuperar turmas com alto índice de defasagem.',
    ],
  },
];

interface GeminiChatbotViewProps {
  initialDisciplina?: string;
  initialSegmento?: string;
  initialAno?: string;
  userRole?: 'professor' | 'gestao' | 'master';
  gestaoRoleTitle?: string;
  userName?: string;
  onBack: () => void;
  showToast: (msg: string) => void;
  onSaveMaterial?: (title: string, content: string) => void;
}

export const GeminiChatbotView: React.FC<GeminiChatbotViewProps> = ({
  initialDisciplina,
  initialSegmento,
  initialAno,
  userRole,
  gestaoRoleTitle,
  userName,
  onBack,
  showToast,
  onSaveMaterial,
}) => {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(() => {
    return userRole === 'gestao' ? 'gestao_coordination' : 'bncc_consultant';
  });
  const [modelPreference, setModelPreference] = useState<'fast' | 'general' | 'pro'>('general');
  const [input, setInput] = useState<string>('');
  const [attachedImages, setAttachedImages] = useState<Array<{ base64: string; mimeType: string }>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const currentRole = CHAT_ROLES.find((r) => r.id === selectedRoleId) || CHAT_ROLES[0];

  const storageKey = `aula_clara_chat_${selectedRoleId}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`aula_clara_chat_${selectedRoleId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (_) {}
    return [
      {
        id: 'welcome-1',
        role: 'assistant',
        content: `Olá, professor(a)! Sou o **${currentRole.title}** com inteligência Gemini.\n\nComo posso ajudar seu trabalho pedagógico hoje? Você pode me fazer perguntas, pedir sequências didáticas, solicitar adaptações inclusivas ou **enviar fotos de apostilas/provas** para analisarmos juntos!`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'gemini-3.7-flash',
      },
    ];
  });

  // Save messages to local storage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (_) {}
  }, [messages, storageKey]);

  // When role changes, reload role messages
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`aula_clara_chat_${selectedRoleId}`);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([
          {
            id: `welcome-${selectedRoleId}`,
            role: 'assistant',
            content: `Olá, professor(a)! Sou o **${currentRole.title}** com inteligência Gemini.\n\nComo posso apoiar sua prática pedagógica hoje? Você pode me fazer perguntas ou **anexar imagens de materiais** para analisarmos!`,
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            modelUsed: 'gemini-3.7-flash',
          },
        ]);
      }
    } catch (_) {}
  }, [selectedRoleId]);

  // Auto scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Handle image upload
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione apenas arquivos de imagem.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setAttachedImages((prev) => [...prev, { base64, mimeType: file.type }]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Send message
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || input.trim();
    if (!textToSend && attachedImages.length === 0) return;
    if (loading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachedImages([]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
            images: m.images,
          })),
          systemInstruction: currentRole.systemInstruction,
          modelPreference,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao comunicar com o servidor Gemini.');
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || 'gemini-3.7-flash',
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Erro no chatbot:', err);
      const errorMsg: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Não foi possível responder**: ${err.message || 'Tente novamente em instantes.'}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
      showToast('Erro ao processar resposta com a IA.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Deseja limpar todo o histórico desta conversa?')) {
      const resetMsg: ChatMessage = {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Histórico limpo! Sou o **${currentRole.title}**. Como posso ajudar você agora?`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'gemini-3.7-flash',
      };
      setMessages([resetMsg]);
      localStorage.removeItem(storageKey);
      showToast('Histórico do chat limpo.');
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    showToast('Resposta copiada para a área de transferência!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveToMaterials = (msg: ChatMessage) => {
    if (onSaveMaterial) {
      onSaveMaterial(`Consulta: ${currentRole.title} (${msg.timestamp})`, msg.content);
    } else {
      showToast('Conteúdo preparado para seus materiais salvos.');
    }
  };

  return (
    <div
      style={{
        maxWidth: '1080px',
        margin: '0 auto',
        background: '#ffffff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 140px)',
        minHeight: '620px',
        overflow: 'hidden',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid #4338ca',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '10px',
              padding: '8px 12px',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: '600',
            }}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>{currentRole.icon}</span>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#ffffff' }}>
                Assistente Pedagógico Gemini
              </h1>
              <span
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700',
                }}
              >
                Multi-Turno
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#c7d2fe' }}>
              {currentRole.description}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* SPEED / MODEL SELECTOR */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.12)',
              borderRadius: '10px',
              padding: '3px',
              gap: '3px',
            }}
          >
            <button
              type="button"
              onClick={() => setModelPreference('fast')}
              title="Respostas ultra-rápidas"
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '7px',
                background: modelPreference === 'fast' ? '#ffffff' : 'transparent',
                color: modelPreference === 'fast' ? '#1e1b4b' : '#c7d2fe',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Zap size={12} /> Rápido
            </button>
            <button
              type="button"
              onClick={() => setModelPreference('general')}
              title="Equilíbrio ideal entre profundidade e velocidade"
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '7px',
                background: modelPreference === 'general' ? '#ffffff' : 'transparent',
                color: modelPreference === 'general' ? '#1e1b4b' : '#c7d2fe',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Sparkles size={12} /> Padrão
            </button>
            <button
              type="button"
              onClick={() => setModelPreference('pro')}
              title="Maior raciocínio pedagógico para casos complexos"
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '7px',
                background: modelPreference === 'pro' ? '#ffffff' : 'transparent',
                color: modelPreference === 'pro' ? '#1e1b4b' : '#c7d2fe',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Brain size={12} /> Profundo
            </button>
          </div>

          <button
            type="button"
            onClick={handleClearHistory}
            title="Limpar histórico"
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              padding: '6px 10px',
              color: '#fca5a5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            <Trash2 size={14} /> Limpar
          </button>
        </div>
      </div>

      {/* ROLE SELECTOR TABS */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          background: '#f8fafc',
          padding: '8px 16px',
          borderBottom: '1px solid #e2e8f0',
          gap: '8px',
        }}
      >
        {CHAT_ROLES.map((role) => {
          const isSelected = role.id === selectedRoleId;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedRoleId(role.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '10px',
                border: isSelected ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                background: isSelected ? '#ffffff' : '#f1f5f9',
                color: isSelected ? '#4338ca' : '#475569',
                fontWeight: isSelected ? '800' : '600',
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: isSelected ? '0 2px 6px rgba(79, 70, 229, 0.12)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{role.icon}</span>
              <span>{role.title}</span>
            </button>
          );
        })}
      </div>

      {/* MESSAGES THREAD */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          background: '#fdfdfe',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                gap: '4px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  maxWidth: '85%',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                }}
              >
                {/* AVATAR */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: isUser ? '#4f46e5' : '#10b981',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                  }}
                >
                  {isUser ? <User size={16} /> : <Bot size={16} />}
                </div>

                {/* BUBBLE */}
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    background: isUser ? '#4f46e5' : '#ffffff',
                    color: isUser ? '#ffffff' : '#1e293b',
                    border: isUser ? 'none' : '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    fontSize: '14px',
                    lineHeight: '1.6',
                  }}
                >
                  {/* ATTACHED IMAGES IN USER MESSAGE */}
                  {msg.images && msg.images.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '10px',
                      }}
                    >
                      {msg.images.map((img, idx) => (
                        <img
                          key={idx}
                          src={img.base64}
                          alt="Anexo"
                          style={{
                            maxWidth: '180px',
                            maxHeight: '180px',
                            borderRadius: '8px',
                            objectFit: 'cover',
                            border: '1px solid rgba(255,255,255,0.3)',
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* MARKDOWN CONTENT */}
                  {isUser ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}

                  {/* ASSISTANT ACTION BAR */}
                  {!isUser && (
                    <div
                      style={{
                        marginTop: '12px',
                        paddingTop: '8px',
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: '#94a3b8',
                      }}
                    >
                      <span>
                        {msg.modelUsed ? `Modelo: ${msg.modelUsed}` : 'Gemini'} • {msg.timestamp}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.content, msg.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedId === msg.id ? '#10b981' : '#64748b',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '2px 4px',
                          }}
                        >
                          {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                          {copiedId === msg.id ? 'Copiado!' : 'Copiar'}
                        </button>
                        {onSaveMaterial && (
                          <button
                            type="button"
                            onClick={() => handleSaveToMaterials(msg)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#6366f1',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              padding: '2px 4px',
                            }}
                          >
                            <Download size={12} /> Salvar nos Arquivos
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* LOADING INDICATOR */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#10b981',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={16} />
            </div>
            <div
              style={{
                padding: '12px 18px',
                borderRadius: '4px 16px 16px 16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={14} className="animate-spin" />
              <span>O Gemini está formulando uma orientação pedagógica detalhada...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* QUICK PROMPT CHIPS */}
      <div
        style={{
          padding: '8px 16px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          overflowX: 'auto',
          gap: '6px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', alignSelf: 'center', whiteSpace: 'nowrap' }}>
          💡 Sugestões:
        </span>
        {currentRole.quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(prompt)}
            disabled={loading}
            style={{
              padding: '4px 10px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              fontSize: '11px',
              color: '#334155',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontWeight: '600',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* ATTACHED IMAGES PREVIEW TRAY */}
      {attachedImages.length > 0 && (
        <div
          style={{
            padding: '8px 16px',
            background: '#eff6ff',
            borderTop: '1px solid #dbeafe',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af' }}>
            Imagens anexadas ({attachedImages.length}):
          </span>
          {attachedImages.map((img, idx) => (
            <div
              key={idx}
              style={{
                position: 'relative',
                display: 'inline-block',
              }}
            >
              <img
                src={img.base64}
                alt="Miniatura"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '6px',
                  objectFit: 'cover',
                  border: '1px solid #93c5fd',
                }}
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '10px',
                }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* INPUT BAR */}
      <div
        style={{
          padding: '12px 16px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Anexar foto de apostila, prova ou atividade para analisar"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ImageIcon size={18} />
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={`Converse com o ${currentRole.title}... (Shift+Enter para pular linha)`}
          rows={1}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '12px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            maxHeight: '120px',
          }}
        />

        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={loading || (!input.trim() && attachedImages.length === 0)}
          style={{
            width: '44px',
            height: '40px',
            borderRadius: '10px',
            border: 'none',
            background: loading || (!input.trim() && attachedImages.length === 0)
              ? '#cbd5e1'
              : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: loading || (!input.trim() && attachedImages.length === 0) ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
          }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
