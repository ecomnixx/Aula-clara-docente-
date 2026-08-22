import React, { useState, useEffect } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  School,
  User,
  BookOpen,
  Calendar,
  CheckCircle2,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { exportDocumentToPdf, ExportPdfOptions } from '../utils/pdfExport';
import { SchoolTemplate } from '../types/schoolTemplate';

interface ExportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  content: string;
  materialType: 'aula' | 'prova' | 'reensino' | 'adaptacao' | 'outro';
  defaultSubject?: string;
  defaultGrade?: string;
  defaultClass?: string;
  defaultBimester?: number | string;
  teacherNameProp?: string;
  schoolNameProp?: string;
  gabaritoContent?: string;
  showToast?: (msg: string) => void;
  schoolTemplate?: SchoolTemplate | null;
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  isOpen,
  onClose,
  title = 'Plano de Aula / Avaliação',
  content,
  materialType,
  defaultSubject = 'Língua Portuguesa',
  defaultGrade = '7º Ano',
  defaultClass = 'Turma A',
  defaultBimester = 1,
  teacherNameProp,
  schoolNameProp,
  gabaritoContent,
  showToast,
  schoolTemplate,
}) => {
  // Load saved school name from localStorage or prop
  const [schoolName, setSchoolName] = useState<string>(() => {
    if (schoolTemplate?.schoolName) return schoolTemplate.schoolName;
    if (schoolNameProp) return schoolNameProp;
    try {
      const savedSchool = localStorage.getItem('aula_clara_teacher_school');
      if (savedSchool) return savedSchool;
      const googleUser = localStorage.getItem('aula_clara_google_user');
      if (googleUser) {
        const parsed = JSON.parse(googleUser);
        if (parsed.school) return parsed.school;
      }
    } catch {}
    return 'COLÉGIO DO PROFESSOR';
  });

  // Load teacher name
  const [teacherName, setTeacherName] = useState<string>(() => {
    if (teacherNameProp) return teacherNameProp;
    try {
      const savedName = localStorage.getItem('aula_clara_user_name');
      if (savedName) return savedName;
      const googleUser = localStorage.getItem('aula_clara_google_user');
      if (googleUser) {
        const parsed = JSON.parse(googleUser);
        if (parsed.name) return parsed.name;
      }
    } catch {}
    return 'Professor(a)';
  });

  const [documentTitle, setDocumentTitle] = useState<string>(() => {
    if (materialType === 'prova') {
      return `AVALIAÇÃO BIMESTRAL DE ${defaultSubject.toUpperCase()}`;
    }
    return `PLANO DE AULA BNCC — ${defaultSubject.toUpperCase()}`;
  });

  const [subject, setSubject] = useState<string>(defaultSubject);
  const [grade, setGrade] = useState<string>(defaultGrade);
  const [className, setClassName] = useState<string>(defaultClass);
  const [bimester, setBimester] = useState<string | number>(defaultBimester);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [includeGabarito, setIncludeGabarito] = useState<boolean>(true);
  const [includeGuidelines, setIncludeGuidelines] = useState<boolean>(true);
  const [includeAnswerGrid, setIncludeAnswerGrid] = useState<boolean>(materialType === 'prova');

  // Quick School Presets
  const schoolPresets = [
    'COLÉGIO DO PROFESSOR',
    'COLÉGIO ALMANAC',
    'ESCOLA MUNICIPAL DE ENSINO FUNDAMENTAL',
    'ESCOLA ESTADUAL DE EDUCAÇÃO BÁSICA',
  ];

  // Sync state when props change
  useEffect(() => {
    if (defaultSubject) setSubject(defaultSubject);
    if (defaultGrade) setGrade(defaultGrade);
    if (defaultClass) setClassName(defaultClass);
    if (defaultBimester) setBimester(defaultBimester);
    if (materialType === 'prova') {
      setDocumentTitle(`AVALIAÇÃO BIMESTRAL DE ${(defaultSubject || '').toUpperCase()}`);
    } else {
      setDocumentTitle(`PLANO DE AULA BNCC — ${(defaultSubject || '').toUpperCase()}`);
    }
  }, [defaultSubject, defaultGrade, defaultClass, defaultBimester, materialType]);

  if (!isOpen) return null;

  const handleExportPdf = () => {
    // Save chosen school to localStorage for future exports
    try {
      localStorage.setItem('aula_clara_teacher_school', schoolName);
    } catch {}

    const options: ExportPdfOptions = {
      schoolName: schoolName.trim() || 'COLÉGIO DO PROFESSOR',
      documentTitle: documentTitle.trim() || (materialType === 'prova' ? 'AVALIAÇÃO BIMESTRAL' : 'PLANO DE AULA BNCC'),
      teacherName: teacherName.trim() || 'Professor(a)',
      subject: subject.trim() || defaultSubject,
      grade: grade.trim() || defaultGrade,
      className: className.trim() || defaultClass,
      bimester: bimester,
      year: year,
      content: content,
      materialType: materialType,
      includeGabarito: includeGabarito,
      includeGuidelines: includeGuidelines,
      includeAnswerGrid: includeAnswerGrid,
      gabaritoContent: gabaritoContent,
      logoUrl: schoolTemplate?.logoDataUrl || (schoolName.toUpperCase().includes('ALMANAC') ? '/colegio-almanac.jpg' : ''),
    };

    exportDocumentToPdf(options);
    if (showToast) {
      showToast('Gerando e preparando PDF com cabeçalho oficial...');
    }
    onClose();
  };

  const handleExportWord = () => {
    const htmlDoc = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${documentTitle} - ${subject}</title>
        <style>
          @page { size: A4; margin: 1.5cm; }
          body { font-family: '${schoolTemplate?.fontFamily || 'Arial'}', sans-serif; font-size: 11pt; color: #000; line-height: 1.35; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; border: ${schoolTemplate?.borderStyle === 'none' ? '0' : `1.5pt solid ${schoolTemplate?.primaryColor || '#000'}`}; }
          .header-table td { border: ${schoolTemplate?.borderStyle === 'none' ? '0' : `1pt solid ${schoolTemplate?.primaryColor || '#000'}`}; padding: 6px 10px; vertical-align: middle; font-size: 10pt; }
          .school-info { text-align: center; }
          .school-info b { font-size: 13pt; }
          .side-info { width: 90px; text-align: center; font-size: 9pt; }
          .student-row { margin-top: 8px; font-size: 10pt; }
        </style>
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td class="school-info" colspan="2">
              ${schoolTemplate?.logoDataUrl ? `<img src="${schoolTemplate.logoDataUrl}" width="64" alt="Logo"><br>` : ''}
              <b>${schoolName.toUpperCase()}</b><br>
              ${(schoolTemplate?.headerLines || []).map((line) => `${line}<br>`).join('')}
              <span style="font-size: 11pt; font-weight: bold;">${documentTitle.toUpperCase()}</span>
              <div class="student-row">
                <b>DISCIPLINA:</b> ${subject.toUpperCase()} &nbsp;|&nbsp; <b>TURMA:</b> ${grade} - ${className} &nbsp;|&nbsp; <b>BIMESTRE:</b> ${bimester}º
              </div>
            </td>
            <td class="side-info">
              <b>NOTA:</b><br><br>
              <b>DATA:</b><br>
              ___/___/${year}
            </td>
          </tr>
          ${
            materialType === 'prova'
              ? `<tr>
                  <td colspan="3">
                    <b>ALUNO(A):</b> _____________________________________________ <b>Nº:</b> ____ &nbsp;&nbsp; <b>PROF.:</b> ${teacherName}
                  </td>
                </tr>`
              : `<tr>
                  <td colspan="3">
                    <b>PROFESSOR(A):</b> ${teacherName} &nbsp;|&nbsp; <b>DATA DE EXECUÇÃO:</b> ${new Date().toLocaleDateString('pt-BR')}
                  </td>
                </tr>`
          }
        </table>
        <div style="white-space: pre-wrap; font-size: 10.5pt; line-height: 1.4;">${content}</div>
        ${
          includeGabarito && gabaritoContent
            ? `<div style="page-break-before: always; margin-top: 24px; border-top: 1pt dashed #000; padding-top: 12px;">
                <h3>GABARITO E CRITÉRIOS DE CORREÇÃO (USO DO PROFESSOR)</h3>
                <pre style="font-family: Arial; white-space: pre-wrap;">${gabaritoContent}</pre>
              </div>`
            : ''
        }
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF', htmlDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle.replace(/\s+/g, '-')}-${subject}-${grade}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (showToast) {
      showToast('Documento baixado em formato Word (.doc)!');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden my-auto animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-300">
                EXPORTAÇÃO DE DOCUMENTO OFICIAL
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                Exportar como PDF com Cabeçalho Oficial
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Banner Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-blue-900">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <b>Formatação A4 Padrão BNCC:</b> Seu documento será gerado com o cabeçalho oficial
              do colégio, quadro de identificação, linhas de resposta, orientações e folha de
              respostas pronta para impressão ou arquivamento em PDF.
            </div>
          </div>

          {/* School Name Field + Presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <School className="w-4 h-4 text-blue-600" />
              <span>Nome do Colégio / Escola Oficial:</span>
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Ex: COLÉGIO DO PROFESSOR, COLÉGIO ALMANAC..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-all uppercase"
            />
            {/* Quick school preset chips */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] font-semibold text-slate-500">Sugestões rápidas:</span>
              {schoolPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSchoolName(preset)}
                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer border ${
                    schoolName === preset
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset === 'COLÉGIO DO PROFESSOR'
                    ? '🏛️ Colégio do Professor'
                    : preset === 'COLÉGIO ALMANAC'
                    ? '⭐ Colégio Almanac'
                    : preset === 'ESCOLA MUNICIPAL DE ENSINO FUNDAMENTAL'
                    ? '🏫 Esc. Municipal'
                    : '🏫 Esc. Estadual'}
                </button>
              ))}
            </div>
          </div>

          {/* Document Title & Teacher Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Título do Documento:</span>
              </label>
              <input
                type="text"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-all uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>Nome do Professor(a):</span>
              </label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Academic Info Grid: Disciplina, Turma, Bimestre, Ano */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-700">Disciplina:</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Ano/Série:</label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Turma:</label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Bimestre:</label>
              <select
                value={bimester}
                onChange={(e) => setBimester(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="1">1º Bimestre</option>
                <option value="2">2º Bimestre</option>
                <option value="3">3º Bimestre</option>
                <option value="4">4º Bimestre</option>
              </select>
            </div>
          </div>

          {/* Format Options Checkboxes */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 block">
              Opções de Estrutura do Documento:
            </span>

            {materialType === 'prova' ? (
              <>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGuidelines}
                    onChange={(e) => setIncludeGuidelines(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <span>Incluir Caixa de Orientações Gerais ao Estudante</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAnswerGrid}
                    onChange={(e) => setIncludeAnswerGrid(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <span>Incluir Folha de Respostas com Bolhas (Gabarito do Aluno)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGabarito}
                    onChange={(e) => setIncludeGabarito(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <span>Incluir Gabarito e Critérios de Correção ao final (Uso do Professor)</span>
                </label>
              </>
            ) : (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeGuidelines}
                  onChange={(e) => setIncludeGuidelines(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                />
                <span>Incluir Campo de Assinatura da Coordenação Pedagógica</span>
              </label>
            )}
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExportWord}
              className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>Baixar Word (.doc)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Gerar e Baixar PDF Oficial</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
