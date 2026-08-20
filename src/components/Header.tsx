import React, { useState } from 'react';
import { AulaClaraLogo } from './AulaClaraLogo';
import {
  Menu,
  X,
  Home,
  Camera,
  BookOpen,
  Calendar,
  HelpCircle,
  Folder,
  History,
  UserCheck,
  Download,
  Sparkles,
  ChevronRight,
  Wrench,
  Calculator,
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  Power,
} from 'lucide-react';

import { GoogleUser } from '../types';

export type TabType =
  | 'generator'
  | 'database'
  | 'history'
  | 'guide'
  | 'account'
  | 'bimestral'
  | 'provas'
  | 'tools'
  | 'access_management';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  savedCount: number;
  googleUser?: GoogleUser | null;
  onLogout?: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  savedCount,
  googleUser,
  onLogout,
  isDarkMode = false,
  onToggleDarkMode,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [seenSavedCount, setSeenSavedCount] = useState<number>(0);

  // Sync seenSavedCount if currently on history tab
  React.useEffect(() => {
    if (activeTab === 'history') {
      setSeenSavedCount(savedCount);
    }
  }, [activeTab, savedCount]);

  const unreadSavedCount = Math.max(0, savedCount - seenSavedCount);

  const menuItems = [
    {
      id: 'generator' as TabType,
      label: 'Área inicial',
      icon: Home,
      description: 'Painel principal de geração com IA',
    },
    {
      id: 'generator' as TabType,
      label: 'Ativar captura de tela',
      icon: Camera,
      description: 'Importação de apostilas por imagem',
    },
    {
      id: 'generator' as TabType,
      label: 'Gerar aulas',
      icon: BookOpen,
      description: 'Criador de Planos de Aula Rápidos',
    },
    {
      id: 'bimestral' as TabType,
      label: 'Plano bimestral',
      icon: Calendar,
      description: 'Planejamento curricular completo por bimestre',
    },
    {
      id: 'provas' as TabType,
      label: 'Banco de provas',
      icon: HelpCircle,
      description: 'Gerador de Provas (5 Múltipla Escolha + 5 Dissertativas)',
    },
    {
      id: 'tools' as TabType,
      label: 'Ferramentas do Professor',
      icon: Calculator,
      description: 'Parecer com IA, Calculadora de Notas e Cronômetro de Aula',
    },
    {
      id: 'database' as TabType,
      label: 'Materiais e turmas',
      icon: Folder,
      description: 'Consulta BNCC e banco de dados de habilidades',
    },
    {
      id: 'history' as TabType,
      label: 'Arquivos salvos',
      icon: History,
      badge: unreadSavedCount,
      description: 'Histórico de materiais gerados',
    },
    {
      id: 'access_management' as TabType,
      label: 'Gerenciar Acessos',
      icon: ShieldCheck,
      description: 'Pesquisar professores (lupa), adicionar/retirar dias, vitalício e enviar avisos',
    },
    {
      id: 'account' as TabType,
      label: 'Minha conta e acessos',
      icon: UserCheck,
      description: 'Cadastrar novos professores e gerenciar licenças',
    },
    {
      id: 'guide' as TabType,
      label: 'Downloads e atualizações',
      icon: Download,
      description: 'Guia de uso offline e novos recursos',
    },
  ];

  const handleSelectMenu = (tab: TabType) => {
    if (tab === 'history') {
      setSeenSavedCount(savedCount);
    }
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Top Main Navigation Bar - Auguste Palette Theme with Dark Mode support */}
      <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-auguste-text dark:text-slate-100 border-b border-auguste-sand dark:border-slate-800 sticky top-0 z-40 shadow-xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          {/* Hamburger Menu & Brand Header */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-xl text-auguste-text dark:text-slate-200 hover:text-auguste-slate hover:bg-auguste-cream dark:hover:bg-slate-800 border border-auguste-sand dark:border-slate-700 transition-all focus:outline-none cursor-pointer"
              aria-label="Abrir menu lateral"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div
              onClick={() => setActiveTab('generator')}
              className="flex items-center space-x-3 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-auguste-slate dark:bg-sky-600 text-white border border-auguste-slate-dark dark:border-sky-500 p-1.5 shadow-2xs flex items-center justify-center shrink-0 group-hover:bg-auguste-slate-dark transition-all">
                <AulaClaraLogo className="w-full h-full text-white" />
              </div>

              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-auguste-text dark:text-white flex items-center gap-1.5 font-sans">
                  Aula Clara
                </h1>
                <p className="text-[11px] sm:text-xs text-auguste-muted dark:text-slate-400 font-medium">
                  Da apostila para o bimestre inteiro.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Nav Badges & Controls */}
          <div className="flex items-center gap-2">
            {/* Dark Mode Toggle Button */}
            {onToggleDarkMode && (
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="p-2 rounded-xl border border-auguste-sand dark:border-slate-700 bg-auguste-cream dark:bg-slate-800 text-auguste-text dark:text-amber-400 hover:bg-auguste-cream-dark dark:hover:bg-slate-700 transition-all cursor-pointer flex items-center justify-center"
                title={isDarkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
                aria-label="Alternar tema claro/escuro"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              </button>
            )}

            <button
              onClick={() => setActiveTab('generator')}
              className={`hidden sm:flex px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all items-center gap-1.5 cursor-pointer ${
                activeTab === 'generator'
                  ? 'bg-auguste-slate dark:bg-sky-600 text-white shadow-xs hover:bg-auguste-slate-dark border border-auguste-slate-dark dark:border-sky-500'
                  : 'bg-auguste-cream dark:bg-slate-800 text-auguste-text dark:text-slate-200 border border-auguste-sand dark:border-slate-700 hover:bg-auguste-cream-dark dark:hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-auguste-tan dark:text-sky-300" />
              <span>Gerar Aulas e Provas</span>
            </button>

            {googleUser && (
              <div className="flex items-center gap-2">
                {/* Trial Days Remaining Badge */}
                {(() => {
                  const isMaster =
                    googleUser.isVitalicio ||
                    googleUser.email === 'familiacardoso21@gmail.com' ||
                    googleUser.email === 'ecomnixx@gmail.com';
                  const created = googleUser.createdAt ? new Date(googleUser.createdAt).getTime() : new Date().getTime();
                  const trialMs = 30 * 24 * 60 * 60 * 1000;
                  const diffMs = created + trialMs - new Date().getTime();
                  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

                  if (isMaster) {
                    return (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveTab('access_management')}
                          className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-xl text-[11px] font-black border border-amber-600 shadow-xs cursor-pointer transition-all"
                          title="Gerenciar Acessos dos Professores"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Gerenciar Acessos</span>
                        </button>
                        <div className="hidden lg:flex items-center gap-1 bg-auguste-tan-light dark:bg-amber-950/40 text-auguste-tan-dark dark:text-amber-300 px-2.5 py-1 rounded-xl text-[11px] font-black border border-auguste-tan dark:border-amber-700">
                          <span>⚡ Master Vitalício</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${
                        daysLeft <= 5
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 animate-pulse'
                          : 'bg-auguste-tan-light dark:bg-slate-800 text-auguste-tan-dark dark:text-slate-200 border-auguste-tan dark:border-slate-700'
                      }`}
                      title="Contagem regressiva do seu período de testes de 30 dias"
                    >
                      <span>
                        ⌛ {daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias de teste'}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2 bg-auguste-cream dark:bg-slate-800 p-1.5 pl-3 rounded-xl border border-auguste-sand dark:border-slate-700 text-xs">
                  <div className="hidden md:block text-right">
                    <p className="font-bold text-auguste-text dark:text-slate-100 text-[11px] leading-tight truncate max-w-[120px]">
                      {googleUser.name || 'Professor'}
                    </p>
                    <p className="text-[9px] text-auguste-muted dark:text-slate-400 font-medium truncate max-w-[120px]">
                      {googleUser.email}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-auguste-slate dark:bg-sky-600 text-white font-black flex items-center justify-center text-xs border border-auguste-slate-dark">
                    {googleUser.name?.charAt(0) || 'P'}
                  </div>
                  {onLogout && (
                    <button
                      onClick={onLogout}
                      title="Sair / Desconectar da Conta"
                      className="flex items-center gap-1 px-2 py-1 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer"
                    >
                      <Power className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                      <span>Sair</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Slide-out Sidebar Drawer - Auguste Theme with Dark Mode */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-auguste-text/40 dark:bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Side Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] bg-white dark:bg-slate-900 text-auguste-text dark:text-slate-100 h-full shadow-2xl border-r border-auguste-sand dark:border-slate-800 flex flex-col z-10 animate-slideRight overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-6 bg-auguste-cream dark:bg-slate-800/80 border-b border-auguste-sand dark:border-slate-800 flex flex-col items-center justify-center text-center space-y-2 relative">
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-auguste-muted dark:text-slate-400 hover:text-auguste-text dark:hover:text-white hover:bg-auguste-cream-dark dark:hover:bg-slate-700 transition-colors"
                title="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-auguste-slate dark:bg-sky-600 text-white p-2 border border-auguste-slate-dark dark:border-sky-500 flex items-center justify-center shadow-2xs">
                <AulaClaraLogo className="w-full h-full text-white" />
              </div>

              <div>
                <h2 className="text-xl font-black text-auguste-text dark:text-white tracking-tight">
                  Aula Clara
                </h2>
                <p className="text-xs text-auguste-muted dark:text-slate-400">
                  Planejamento e Gestão BNCC
                </p>
              </div>
            </div>

            {/* Quick Dark Mode Switcher Row */}
            {onToggleDarkMode && (
              <div className="px-4 py-3 bg-stone-50 dark:bg-slate-800/50 border-b border-auguste-sand dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-auguste-text dark:text-slate-200">
                  {isDarkMode ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-600" />}
                  <span>Modo Escuro / Noturno</span>
                </div>
                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer ${
                    isDarkMode ? 'bg-sky-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                  aria-label="Alternar tema escuro"
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md transition-transform" />
                </button>
              </div>
            )}

            {/* Menu List */}
            <div className="p-4 space-y-2 flex-1 overflow-y-auto">
              {menuItems.map((item, idx) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectMenu(item.id)}
                    className={`w-full p-3 rounded-xl text-left font-bold text-sm transition-all flex items-center justify-between group border ${
                      isActive
                        ? 'bg-auguste-tan-light dark:bg-sky-950/40 text-auguste-text dark:text-sky-300 border-auguste-tan dark:border-sky-800 shadow-2xs'
                        : 'bg-white dark:bg-slate-800/80 text-auguste-text dark:text-slate-200 border-auguste-sand/80 dark:border-slate-700/80 hover:bg-auguste-cream dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-auguste-cream dark:bg-slate-700 border border-auguste-sand dark:border-slate-600 text-auguste-slate dark:text-sky-400 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-extrabold">{item.label}</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="px-2 py-0.5 bg-auguste-slate dark:bg-sky-600 text-white text-xs font-black rounded-full">
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-auguste-muted dark:text-slate-400 group-hover:text-auguste-text dark:group-hover:text-white" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Prominent Sair / Desligar Button inside Drawer */}
            {onLogout && (
              <div className="p-4 border-t border-auguste-sand dark:border-slate-800 bg-stone-50 dark:bg-slate-800/50">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onLogout();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <Power className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Encerrar Sessão & Sair</span>
                </button>
              </div>
            )}

            {/* Drawer Footer */}
            <div className="p-4 bg-auguste-cream dark:bg-slate-800/90 border-t border-auguste-sand dark:border-slate-800 text-center text-xs text-auguste-muted dark:text-slate-400">
              <p className="font-bold text-auguste-text dark:text-slate-200">Aula Clara v2.5 • BNCC IA</p>
              <p className="text-[10px]">Todos os direitos reservados • Plataforma Docente</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
