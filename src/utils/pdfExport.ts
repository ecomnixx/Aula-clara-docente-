/**
 * Helper to generate and export formatted PDF documents with official Brazilian school header
 */

export interface ExportPdfOptions {
  schoolName: string;
  documentTitle: string;
  teacherName: string;
  subject: string;
  grade: string;
  className?: string;
  bimester?: string | number;
  year?: string | number;
  content: string;
  materialType: 'aula' | 'prova' | 'reensino' | 'adaptacao' | 'outro';
  includeGabarito?: boolean;
  includeGuidelines?: boolean;
  includeAnswerGrid?: boolean;
  gabaritoContent?: string;
  logoUrl?: string;
}

export function generateOfficialSchoolHtml(options: ExportPdfOptions): string {
  const {
    schoolName = 'COLÉGIO DO PROFESSOR',
    documentTitle = 'PLANO DE AULA / AVALIAÇÃO',
    teacherName = 'PROFESSOR(A)',
    subject = 'DISCIPLINA',
    grade = '7º ANO',
    className = 'TURMA A',
    bimester = '1º BIMESTRE',
    year = new Date().getFullYear(),
    content = '',
    materialType = 'aula',
    includeGabarito = true,
    includeGuidelines = true,
    includeAnswerGrid = materialType === 'prova',
    gabaritoContent = '',
    logoUrl = '/colegio-almanac.jpg',
  } = options;

  const isProva = materialType === 'prova';
  const bimesterFormatted = typeof bimester === 'number' ? `${bimester}º BIMESTRE` : bimester;

  // Process text to render clean HTML paragraphs and question blocks
  let formattedBodyHtml = '';

  if (content) {
    // Break lines and create clean paragraphs
    const paragraphs = content.split('\n');
    let insideList = false;

    formattedBodyHtml = paragraphs
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '<div class="spacer-line"></div>';

        // Check if heading
        if (trimmed.startsWith('# ')) {
          return `<h2 class="doc-h2">${trimmed.replace(/^#\s*/, '')}</h2>`;
        }
        if (trimmed.startsWith('## ')) {
          return `<h3 class="doc-h3">${trimmed.replace(/^##\s*/, '')}</h3>`;
        }
        if (trimmed.startsWith('### ')) {
          return `<h4 class="doc-h4">${trimmed.replace(/^###\s*/, '')}</h4>`;
        }

        // Question pattern: "Questão 1:" or "1." or "1)"
        if (/^(questão\s*\d+|\d+[\.\)])/i.test(trimmed)) {
          return `<div class="question-block"><b class="q-title">${trimmed}</b></div>`;
        }

        // Multiple choice options: a) b) c) d) e) or (A) (B) (C)
        if (/^[\(\[]?[a-eA-E][\)\]\.\-]/i.test(trimmed)) {
          return `<div class="option-item">${trimmed}</div>`;
        }

        // Dissertative answer lines placeholder
        if (trimmed.includes('__________') || trimmed.startsWith('[Linhas para resposta]')) {
          return `
            <div class="answer-lines">
              <div class="rule-line"></div>
              <div class="rule-line"></div>
              <div class="rule-line"></div>
              <div class="rule-line"></div>
            </div>
          `;
        }

        // Bullet point
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
          return `<div class="bullet-item"><span class="bullet-dot">▪</span> <span>${trimmed.replace(/^[-•*]\s*/, '')}</span></div>`;
        }

        // BNCC Code highlight (e.g. EF07CI01)
        const highlighted = trimmed.replace(
          /\b(EF\d{2}[A-Z]{2}\d{2}|EM\d{2}[A-Z]{2}\d{2,3}|EI\d{2}[A-Z]{2}\d{2})\b/g,
          '<span class="bncc-tag">$1</span>'
        );

        return `<p class="doc-p">${highlighted}</p>`;
      })
      .join('\n');
  }

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle} - ${subject} (${schoolName})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 14mm 14mm;
      @bottom-right {
        content: "Página " counter(page) " de " counter(pages);
        font-family: Arial, sans-serif;
        font-size: 8pt;
        color: #666;
      }
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.35;
      color: #111827;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    /* OFFICIAL BRAZILIAN SCHOOL HEADER TABLE */
    .school-header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      border: 2px solid #0f172a;
      background-color: #ffffff;
    }

    .school-header-table td {
      border: 1px solid #0f172a;
      padding: 5px 8px;
      vertical-align: middle;
      font-size: 9pt;
    }

    .header-logo-cell {
      width: 90px;
      text-align: center;
      padding: 4px;
      background-color: #ffffff;
      border-right: 2px solid #0f172a;
    }

    .header-logo-img {
      max-width: 80px;
      max-height: 52px;
      object-fit: contain;
    }

    .header-logo-fallback {
      font-size: 8pt;
      font-weight: 900;
      color: #0284c7;
      text-transform: uppercase;
      border: 1.5px solid #0284c7;
      border-radius: 6px;
      padding: 6px 2px;
      line-height: 1.1;
    }

    .header-title-cell {
      text-align: center;
      padding: 6px 10px;
      border-bottom: 2px solid #0f172a;
    }

    .header-school-name {
      font-size: 13pt;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      margin: 0 0 2px 0;
      letter-spacing: 0.5px;
    }

    .header-doc-title {
      font-size: 10pt;
      font-weight: 800;
      text-transform: uppercase;
      color: #334155;
      margin: 0;
    }

    .header-info-label {
      font-weight: 700;
      color: #475569;
      font-size: 8pt;
      text-transform: uppercase;
      margin-right: 3px;
    }

    .header-info-value {
      font-weight: 700;
      color: #0f172a;
      font-size: 9pt;
      text-transform: uppercase;
    }

    .grade-box-cell {
      width: 85px;
      text-align: center;
      font-weight: 800;
      font-size: 9pt;
      background-color: #f8fafc;
    }

    .grade-box-inner {
      border: 1px dashed #64748b;
      padding: 4px;
      border-radius: 4px;
      margin-top: 2px;
      font-size: 11pt;
      color: #0f172a;
      min-height: 24px;
    }

    /* INSTRUCTIONS / ORIENTAÇÕES BOX (IF PROVA) */
    .guidelines-box {
      border: 1px solid #0f172a;
      padding: 6px 10px;
      background-color: #fcfcfc;
      margin-bottom: 12px;
      font-size: 8.5pt;
      border-radius: 2px;
    }

    .guidelines-title {
      font-weight: 800;
      font-size: 8.5pt;
      text-transform: uppercase;
      margin: 0 0 4px 0;
      color: #0f172a;
    }

    .guidelines-list {
      margin: 0;
      padding-left: 16px;
      line-height: 1.25;
      color: #334155;
    }

    .guidelines-list li {
      margin-bottom: 2px;
    }

    /* ANSWER BUBBLE SHEET (GABARITO) */
    .answer-grid-box {
      border: 1.5px solid #0f172a;
      padding: 6px 10px;
      background-color: #f8fafc;
      margin-bottom: 14px;
      text-align: center;
    }

    .answer-grid-title {
      font-weight: 800;
      font-size: 8.5pt;
      text-transform: uppercase;
      margin-bottom: 5px;
      color: #0f172a;
    }

    .answer-grid-row {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 2px 8px;
      font-weight: 700;
      font-size: 8.5pt;
    }

    .answer-bubble {
      display: inline-block;
      width: 15px;
      height: 15px;
      border: 1px solid #0f172a;
      border-radius: 50%;
      line-height: 15px;
      text-align: center;
      font-size: 7pt;
      font-weight: 800;
      background: #ffffff;
      color: #0f172a;
    }

    /* DOCUMENT CONTENT */
    .doc-h2 {
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
      margin: 12px 0 6px 0;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 2px;
      text-transform: uppercase;
    }

    .doc-h3 {
      font-size: 10pt;
      font-weight: 800;
      color: #1e293b;
      margin: 10px 0 4px 0;
    }

    .doc-h4 {
      font-size: 9.5pt;
      font-weight: 700;
      color: #334155;
      margin: 8px 0 3px 0;
    }

    .doc-p {
      margin: 0 0 5px 0;
      line-height: 1.35;
      text-align: justify;
    }

    .question-block {
      margin-top: 10px;
      margin-bottom: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .q-title {
      font-size: 9.5pt;
      font-weight: 800;
      color: #0f172a;
    }

    .option-item {
      padding-left: 14px;
      margin: 2px 0;
      font-size: 9pt;
      line-height: 1.25;
      color: #1e293b;
    }

    .bullet-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 3px;
      padding-left: 8px;
    }

    .bullet-dot {
      color: #0284c7;
      font-size: 8pt;
      margin-top: 1px;
    }

    .bncc-tag {
      font-weight: 800;
      color: #0369a1;
      background-color: #e0f2fe;
      padding: 0 4px;
      border-radius: 3px;
      font-size: 8.5pt;
    }

    .rule-line {
      border-bottom: 1px solid #94a3b8;
      height: 20px;
      width: 100%;
      margin-bottom: 2px;
    }

    .spacer-line {
      height: 6px;
    }

    /* FOOTER SIGNATURE & GABARITO */
    .teacher-signature-box {
      margin-top: 24px;
      padding-top: 10px;
      page-break-inside: avoid;
      display: flex;
      justify-content: space-between;
      gap: 30px;
      font-size: 8.5pt;
      text-align: center;
    }

    .sig-line {
      flex: 1;
      border-top: 1px solid #475569;
      padding-top: 4px;
      color: #334155;
    }

    .gabarito-section {
      page-break-before: always;
      break-before: page;
      margin-top: 20px;
      padding-top: 10px;
      border-top: 2px dashed #94a3b8;
    }

    .gabarito-header {
      font-size: 11pt;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      margin-bottom: 8px;
      text-align: center;
    }

    .gabarito-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 10px;
      font-size: 9pt;
      line-height: 1.35;
      white-space: pre-wrap;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>

  <!-- OFFICIAL SCHOOL HEADER -->
  <table class="school-header-table">
    <tr>
      <td class="header-logo-cell" rowspan="2">
        ${
          logoUrl
            ? `<img class="header-logo-img" src="${logoUrl}" alt="Logo Escola" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
               <div class="header-logo-fallback" style="display:none;">${schoolName.slice(0, 14)}</div>`
            : `<div class="header-logo-fallback">${schoolName.slice(0, 14)}</div>`
        }
      </td>
      <td class="header-title-cell" colspan="${isProva ? '2' : '3'}">
        <div class="header-school-name">${schoolName}</div>
        <div class="header-doc-title">${documentTitle}</div>
      </td>
      ${
        isProva
          ? `<td class="grade-box-cell" rowspan="2">
               <span class="header-info-label">NOTA</span>
               <div class="grade-box-inner"></div>
               <div style="font-size:7pt; color:#64748b; margin-top:2px;">VALOR: 10,0</div>
             </td>`
          : ''
      }
    </tr>

    <tr>
      <td>
        <span class="header-info-label">DISCIPLINA:</span>
        <span class="header-info-value">${subject}</span>
      </td>
      <td>
        <span class="header-info-label">TURMA / ANO:</span>
        <span class="header-info-value">${grade}${className ? ` - ${className}` : ''}</span>
      </td>
      ${
        !isProva
          ? `<td>
               <span class="header-info-label">BIMESTRE:</span>
               <span class="header-info-value">${bimesterFormatted}</span>
             </td>`
          : `<td>
               <span class="header-info-label">BIMESTRE / ANO:</span>
               <span class="header-info-value">${bimesterFormatted} · ${year}</span>
             </td>`
      }
    </tr>

    ${
      isProva
        ? `<tr>
             <td colspan="4" style="padding: 6px 8px;">
               <span class="header-info-label">ESTUDANTE:</span>
               <span style="display:inline-block; width:65%; border-bottom:1px solid #475569;">&nbsp;</span>
               &nbsp;
               <span class="header-info-label">Nº:</span>
               <span style="display:inline-block; width:40px; border-bottom:1px solid #475569;">&nbsp;</span>
               &nbsp;
               <span class="header-info-label">DATA:</span>
               <span style="display:inline-block; width:70px; border-bottom:1px solid #475569; text-align:center; font-size:8pt;">___/___/${year}</span>
             </td>
           </tr>`
        : `<tr>
             <td colspan="4" style="padding: 5px 8px;">
               <span class="header-info-label">DOCENTE RESPONSÁVEL:</span>
               <span class="header-info-value">${teacherName}</span>
               &nbsp; | &nbsp;
               <span class="header-info-label">DATA DE EXECUÇÃO:</span>
               <span class="header-info-value">${new Date().toLocaleDateString('pt-BR')}</span>
               &nbsp; | &nbsp;
               <span class="header-info-label">ANO LETIVO:</span>
               <span class="header-info-value">${year}</span>
             </td>
           </tr>`
    }

    ${
      isProva
        ? `<tr>
             <td colspan="4" style="padding: 4px 8px;">
               <span class="header-info-label">PROFESSOR(A):</span>
               <span class="header-info-value">${teacherName}</span>
               &nbsp; | &nbsp;
               <span class="header-info-label">TIPO:</span>
               <span class="header-info-value">AVALIAÇÃO FORMATIVA / SOMATIVA</span>
             </td>
           </tr>`
        : ''
    }
  </table>

  <!-- OPTIONAL PROVA ORIENTAÇÕES -->
  ${
    isProva && includeGuidelines
      ? `
    <div class="guidelines-box">
      <div class="guidelines-title">Orientações Gerais aos Estudantes:</div>
      <ul class="guidelines-list">
        <li>Leia atentamente todas as questões antes de iniciar as respostas.</li>
        <li>Utilize caneta esferográfica azul ou preta para preenchimento definitivo.</li>
        <li>Respostas a lápis e questões rasuradas não darão direito à revisão de nota.</li>
        <li>Evite rasuras e preencha as alternativas com clareza. Duração prevista: 50 minutos.</li>
      </ul>
    </div>
  `
      : ''
  }

  <!-- OPTIONAL ANSWER SHEET BUBBLE GRID -->
  ${
    isProva && includeAnswerGrid
      ? `
    <div class="answer-grid-box">
      <div class="answer-grid-title">Folha de Respostas / Gabarito do Aluno (Preencha as bolhas com caneta)</div>
      <div>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          .map(
            (num) => `
            <div class="answer-grid-row">
              <span>${String(num).padStart(2, '0')}</span>
              ${['A', 'B', 'C', 'D', 'E']
                .map((letter) => `<span class="answer-bubble">${letter}</span>`)
                .join('')}
            </div>
          `
          )
          .join('')}
      </div>
    </div>
  `
      : ''
  }

  <!-- FORMATTED BODY -->
  <div class="document-content">
    ${formattedBodyHtml}
  </div>

  <!-- TEACHER / PEDAGOGICAL SIGNATURE -->
  <div class="teacher-signature-box">
    <div class="sig-line">
      <b>${teacherName}</b><br>
      Professor(a) Regente
    </div>
    <div class="sig-line">
      <b>Coordenação Pedagógica</b><br>
      Visto / Validação Curricular
    </div>
  </div>

  <!-- OPTIONAL SEPARATE GABARITO (IF CHECKED) -->
  ${
    isProva && includeGabarito && gabaritoContent
      ? `
    <div class="gabarito-section">
      <div class="gabarito-header">--- GABARITO OFICIAL E CRITÉRIOS DE CORREÇÃO (USO DO PROFESSOR) ---</div>
      <div class="gabarito-box">${gabaritoContent}</div>
    </div>
  `
      : ''
  }

</body>
</html>
`;
}

/**
 * Triggers clean PDF generation / print dialog using an isolated iframe
 */
export function exportDocumentToPdf(options: ExportPdfOptions): void {
  const html = generateOfficialSchoolHtml(options);

  // Create an invisible iframe to host the print document
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('title', 'Documento PDF para Impressão');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    // Fallback: open print in new tab
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 400);
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for images and layout to settle before opening print dialog
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('[PDF Export print failed, falling back to window.open]', e);
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      }
    } finally {
      // Remove iframe after print dialog completes
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 60000);
    }
  }, 450);
}
