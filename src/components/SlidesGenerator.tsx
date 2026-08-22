import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Download, Presentation, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { SlideAudience, SlideDeck, SlideRatio, SlideStyle } from '../types/slides';

interface SlidesGeneratorProps {
  disciplina: string;
  segmento: string;
  ano: string;
  getMaterialText: () => Promise<string>;
  onSave: (deck: SlideDeck) => Promise<void>;
  notify: (message: string) => void;
}

const stageLabel = (progress: number) => {
  if (progress < 25) return 'Analisando material…';
  if (progress < 40) return 'Organizando conteúdo…';
  if (progress < 55) return 'Selecionando estrutura…';
  if (progress < 70) return 'Consultando a BNCC…';
  if (progress < 85) return 'Criando textos e design…';
  if (progress < 100) return 'Revisando apresentação…';
  return 'Apresentação pronta';
};

export const SlidesGenerator: React.FC<SlidesGeneratorProps> = ({ disciplina, segmento, ano, getMaterialText, onSave, notify }) => {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(8);
  const [customCount, setCustomCount] = useState(false);
  const [style, setStyle] = useState<SlideStyle>('automatico');
  const [outputFormat, setOutputFormat] = useState<'pptx' | 'pdf' | 'docx'>('pptx');
  const [ratio, setRatio] = useState<SlideRatio>('16:9');
  const [audience, setAudience] = useState<SlideAudience>('professor');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState<SlideDeck | null>(null);

  const generate = async () => {
    setBusy(true); setProgress(10);
    try {
      const materialText = await getMaterialText();
      if (!materialText.trim()) throw new Error('Leia ou selecione o material antes de gerar os slides.');
      setProgress(25);
      const response = await fetch('/api/generate-slides', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disciplina, segmento, ano, materialText, quantidade: count, estilo: style, proporcao: ratio, incluirNotas: includeNotes, versao: audience }),
      });
      setProgress(55);
      const data = await response.json();
      if (!response.ok || !data.deck) throw new Error(data.error || 'Não foi possível gerar os slides.');
      setProgress(85);
      setDeck(data.deck);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      setProgress(100);
    } catch (error: any) {
      notify(error.message || 'Falha ao gerar slides.');
      setProgress(0);
    } finally { setBusy(false); }
  };

  const updateSlide = (index: number, patch: Record<string, unknown>) => setDeck((current) => current ? ({ ...current, slides: current.slides.map((slide, itemIndex) => itemIndex === index ? { ...slide, ...patch } : slide) }) : current);
  const move = (index: number, direction: number) => setDeck((current) => {
    if (!current) return current;
    const target = index + direction;
    if (target < 0 || target >= current.slides.length) return current;
    const slides = [...current.slides]; [slides[index], slides[target]] = [slides[target], slides[index]];
    return { ...current, slides };
  });
  const duplicate = (index: number) => setDeck((current) => current ? ({ ...current, slides: [...current.slides.slice(0, index + 1), { ...current.slides[index], id: crypto.randomUUID(), title: `${current.slides[index].title} — cópia` }, ...current.slides.slice(index + 1)] }) : current);
  const refineSlide = (index: number, action: string) => {
    if (!deck) return;
    const slide = deck.slides[index];
    if (action === 'simple') updateSlide(index, { bullets: slide.bullets.slice(0, 3).map((item) => item.split(/[.;:]/)[0]) });
    if (action === 'visual') updateSlide(index, { layout: 'visual-list', bullets: slide.bullets.slice(0, 5) });
    if (action === 'summary') updateSlide(index, { bullets: slide.bullets.slice(0, 4).map((item) => item.length > 90 ? `${item.slice(0, 87)}…` : item) });
    if (action === 'example') updateSlide(index, { bullets: [...slide.bullets.slice(0, 5), 'Exemplo para discutir com a turma.'] });
    if (action === 'layout') updateSlide(index, { layout: slide.layout === 'cards' ? 'columns' : slide.layout === 'columns' ? 'highlight' : 'cards' });
    if (action === 'color') setDeck({ ...deck, style: 'criativo' });
  };

  const download = async (format: 'pptx' | 'pdf' | 'docx') => {
    if (!deck) return;
    const response = await fetch('/api/export-slides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deck, format }) });
    if (!response.ok) { const error = await response.json().catch(() => ({})); notify(error.error || 'Falha ao preparar o arquivo.'); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${deck.title}.${format}`; link.click(); URL.revokeObjectURL(url);
  };

  return <>
    <button type="button" className="slides-entry-button" onClick={() => setOpen(true)}>
      <Presentation size={24}/><b>Gerar Slides</b><span>Crie uma apresentação didática a partir do material enviado.</span>
    </button>
    {open && <section className="slides-workspace">
      <header><div><span>APRESENTAÇÃO DIDÁTICA</span><h2>Gerar Slides</h2><p>Configure, gere e edite antes de baixar.</p></div><button onClick={() => setOpen(false)} aria-label="Fechar"><X/></button></header>
      {!deck && <div className="slides-config-grid">
        <label>Formato de saída<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as 'pptx' | 'pdf' | 'docx')}><option value="pptx">PowerPoint editável (.pptx)</option><option value="pdf">PDF horizontal</option><option value="docx">Word editável (.docx)</option></select></label>
        <label>Quantidade de slides<select value={customCount ? 'custom' : count} onChange={(event) => { if (event.target.value === 'custom') setCustomCount(true); else { setCustomCount(false); setCount(Number(event.target.value)); } }}><option value="5">Resumo rápido — 5</option><option value="8">Aula curta — 8</option><option value="10">Aula completa — 10</option><option value="15">Aula detalhada — 15</option><option value="custom">Personalizado</option></select></label>
        {customCount && <label>Número personalizado<input type="number" min="3" max="20" value={count} onChange={(event) => setCount(Math.max(3, Math.min(20, Number(event.target.value))))}/></label>}
        <label>Estilo<select value={style} onChange={(event) => setStyle(event.target.value as SlideStyle)}><option value="automatico">Automático</option><option value="colorido">Colorido e Escolar</option><option value="moderno">Moderno</option><option value="infantil">Infantil</option><option value="fundamental">Ensino Fundamental</option><option value="medio">Ensino Médio</option><option value="minimalista">Minimalista</option><option value="criativo">Criativo</option></select></label>
        <label>Proporção<select value={ratio} onChange={(event) => setRatio(event.target.value as SlideRatio)}><option>16:9</option><option>4:3</option><option>A4</option></select></label>
        <label>Versão<select value={audience} onChange={(event) => setAudience(event.target.value as SlideAudience)}><option value="professor">Versão do professor</option><option value="aluno">Versão do aluno</option></select></label>
        <label className="slides-check"><input type="checkbox" checked={includeNotes} disabled={audience === 'aluno'} onChange={(event) => setIncludeNotes(event.target.checked)}/> Incluir notas do professor</label>
        <button className="slides-generate" disabled={busy} onClick={generate}><Presentation/> Criar apresentação</button>
      </div>}
      {busy && <div className="slides-progress"><b>{progress}%</b><div><span style={{width:`${progress}%`}}/></div><p>{stageLabel(progress)}</p></div>}
      {deck && !busy && <div className="slides-editor">
        <div className="slides-editor-toolbar"><input value={deck.title} onChange={(event) => setDeck({...deck,title:event.target.value})}/><select value={deck.style} onChange={(event) => setDeck({...deck,style:event.target.value as SlideStyle})}>{['automatico','colorido','moderno','infantil','fundamental','medio','minimalista','criativo'].map((item)=><option key={item}>{item}</option>)}</select></div>
        <div className="slides-list">{deck.slides.map((slide,index)=><article className="slide-edit-card" key={slide.id}><div className="slide-number">{index+1}</div><div className={`slide-live-preview style-${deck.style} layout-${slide.layout}`}><div className="slide-preview-accent"/><h4>{slide.title}</h4><div className="slide-preview-body">{slide.bullets.slice(0,6).map((item,itemIndex)=><div className="slide-preview-item" key={`${slide.id}-${itemIndex}`}><span>{itemIndex+1}</span><p>{item}</p></div>)}</div>{slide.visualHint && <aside>✦ {slide.visualHint}</aside>}</div><input aria-label={`Título do slide ${index+1}`} value={slide.title} onChange={(event)=>updateSlide(index,{title:event.target.value})}/><textarea aria-label={`Conteúdo do slide ${index+1}`} value={slide.bullets.join('\n')} onChange={(event)=>updateSlide(index,{bullets:event.target.value.split('\n').filter(Boolean)})}/><div className="slide-card-actions"><button onClick={()=>move(index,-1)} title="Subir"><ChevronUp/></button><button onClick={()=>move(index,1)} title="Descer"><ChevronDown/></button><button onClick={()=>duplicate(index)} title="Duplicar"><Copy/></button><select defaultValue="" onChange={(event)=>{refineSlide(index,event.target.value);event.target.value=''}} aria-label={`Refazer slide ${index+1}`}><option value="" disabled>Refazer este slide…</option><option value="simple">Deixar mais simples</option><option value="visual">Deixar mais visual</option><option value="summary">Resumir</option><option value="example">Adicionar exemplo</option><option value="layout">Mudar layout</option><option value="color">Deixar mais colorido</option></select><button onClick={()=>setDeck({...deck,slides:deck.slides.filter((_,i)=>i!==index)})} title="Excluir"><Trash2/></button></div></article>)}</div>
        <div className="slides-final-actions"><button onClick={()=>download(outputFormat)}><Download/> Baixar formato escolhido</button><button onClick={()=>download('pptx')}><Download/> PowerPoint</button><button onClick={()=>download('pdf')}><Download/> PDF</button><button onClick={()=>download('docx')}><Download/> Word</button><button onClick={()=>onSave(deck)}><Save/> Salvar em Pastas</button><button onClick={()=>{setDeck(null);setProgress(0)}}><RefreshCw/> Gerar novamente</button></div>
      </div>}
    </section>}
  </>;
};
