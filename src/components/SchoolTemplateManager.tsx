import React, { useRef, useState } from 'react';
import { SchoolTemplate } from '../types/schoolTemplate';

interface Props {
  value: SchoolTemplate | null;
  onChange: (template: SchoolTemplate | null) => void;
  notify: (message: string) => void;
}

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

async function cropLogo(source: string, box?: { x: number; y: number; width: number; height: number }) {
  if (!box || box.width <= 0 || box.height <= 0) return undefined;
  return new Promise<string | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const sx = Math.max(0, Math.min(1, box.x)) * image.width;
      const sy = Math.max(0, Math.min(1, box.y)) * image.height;
      const sw = Math.max(1, Math.min(1 - box.x, box.width) * image.width);
      const sh = Math.max(1, Math.min(1 - box.y, box.height) * image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(600, Math.round(sw));
      canvas.height = Math.max(1, Math.round(canvas.width * sh / sw));
      canvas.getContext('2d')?.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png', 0.92));
    };
    image.onerror = () => resolve(undefined);
    image.src = source;
  });
}

export const SchoolTemplateManager: React.FC<Props> = ({ value, onChange, notify }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const analyze = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetch('/api/analyze-school-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { base64: dataUrl, mimeType: file.type || 'image/jpeg' } }),
      });
      const data = await response.json();
      if (!response.ok || !data.template) throw new Error(data.error || 'Não foi possível analisar o modelo.');
      const logoDataUrl = await cropLogo(dataUrl, data.template.logoBox);
      const template: SchoolTemplate = {
        id: crypto.randomUUID(), name: data.template.name || 'Avaliação padrão',
        schoolName: data.template.schoolName || 'Minha escola',
        headerLines: Array.isArray(data.template.headerLines) ? data.template.headerLines.slice(0, 4) : [],
        fields: Array.isArray(data.template.fields) ? data.template.fields.slice(0, 10) : ['Estudante', 'Turma', 'Data', 'Nota'],
        primaryColor: data.template.primaryColor || '#173342', accentColor: data.template.accentColor || '#e8a23a',
        fontFamily: data.template.fontFamily || 'Arial', borderStyle: data.template.borderStyle || 'boxed',
        logoDataUrl, createdAt: new Date().toISOString(),
      };
      onChange(template);
      localStorage.setItem('aula-clara-school-template', JSON.stringify(template));
      notify('Modelo da escola salvo. O conteúdo antigo e os dados pessoais foram descartados.');
    } catch (error: any) {
      notify(error.message || 'Falha ao analisar o modelo da escola.');
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return <section className="school-template-card">
    <div className="school-template-heading"><div><span>MODELO DA ESCOLA</span><h3>Aplicar o padrão do seu colégio</h3><p>Envie uma foto de uma avaliação antiga. Usaremos somente cabeçalho, logo e formatação — nunca questões, respostas, nomes ou notas.</p></div></div>
    <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyze(file); }}/>
    {value ? <div className="school-template-preview">
      {value.logoDataUrl ? <img src={value.logoDataUrl} alt={`Logo de ${value.schoolName}`}/> : <div className="school-logo-placeholder">LOGO</div>}
      <div><b>{value.schoolName}</b>{value.headerLines.map((line) => <small key={line}>{line}</small>)}<span>{value.fields.join(' · ')}</span></div>
      <button type="button" onClick={() => inputRef.current?.click()}>Trocar modelo</button>
    </div> : <button type="button" className="school-template-upload" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Analisando identidade visual…' : '↑ Enviar avaliação antiga'}</button>}
    {value && <button type="button" className="school-template-remove" onClick={() => { localStorage.removeItem('aula-clara-school-template'); onChange(null); }}>Usar padrão Aula Clara</button>}
  </section>;
};
