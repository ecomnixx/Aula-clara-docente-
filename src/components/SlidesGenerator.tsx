import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Download, Image as ImageIcon, Presentation, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { PresentationJobSnapshot, SlideAudience, SlideDeck, SlideMode, SlideRatio, SlideStyle } from '../types/slides';
import { authenticatedFetch } from '../utils/supabaseAuth';

interface SlidesGeneratorProps { disciplina: string; segmento: string; ano: string; getMaterialText: () => Promise<string>; onSave: (deck: SlideDeck) => Promise<void>; notify: (message: string) => void; }

const stageLabels: Record<string, string> = { preparing: 'Preparando', planning: 'Criando roteiro pedagógico', generating_assets: 'Gerando recursos visuais', assembling: 'Montando apresentação', reviewing: 'Revisando apresentação', completed: 'Apresentação pronta', failed: 'Falha no processamento' };

export const SlidesGenerator: React.FC<SlidesGeneratorProps> = ({ disciplina, segmento, ano, getMaterialText, onSave, notify }) => {
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<SlideMode>('material');
  const [theme, setTheme] = useState(''); const [subject, setSubject] = useState(disciplina); const [schoolSegment, setSchoolSegment] = useState(segmento); const [schoolYear, setSchoolYear] = useState(ano);
  const [count, setCount] = useState<number | 'automatico'>(8); const [customCount, setCustomCount] = useState(false);
  const [style, setStyle] = useState<SlideStyle>('automatico'); const [outputFormat, setOutputFormat] = useState<'pptx' | 'pdf' | 'docx'>('pptx');
  const [ratio, setRatio] = useState<SlideRatio>('16:9'); const [audience, setAudience] = useState<SlideAudience>('professor'); const [includeNotes, setIncludeNotes] = useState(true);
  const [job, setJob] = useState<PresentationJobSnapshot | null>(null); const [busy, setBusy] = useState(false); const [deck, setDeck] = useState<SlideDeck | null>(null);

  const requestJson = async (url: string, init: RequestInit = {}) => {
    const response = await authenticatedFetch(url, init); const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `O servidor respondeu com código ${response.status}.`); return data as PresentationJobSnapshot;
  };

  const processAssets = async (snapshot: PresentationJobSnapshot) => {
    const required = snapshot.deck?.slides.filter((slide) => slide.needsImage && !['ready','fallback'].includes(slide.assetStatus || '')) || [];
    let cursor = 0; let latest = snapshot;
    const worker = async () => { while (cursor < required.length) { const slide = required[cursor++]; latest = await requestJson(`/api/presentation-jobs/${snapshot.id}/slides/${slide.id}/asset`, { method: 'POST' }); setJob(latest); if (latest.deck) setDeck(latest.deck); } };
    await Promise.all(Array.from({ length: Math.min(2, required.length) }, worker));
    return latest;
  };

  const generate = async () => {
    setBusy(true); setDeck(null);
    try {
      const materialText = mode === 'material' ? await getMaterialText() : '';
      const created = await requestJson('/api/presentation-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, tema: theme, disciplina: subject || disciplina, segmento: schoolSegment || segmento, ano: schoolYear || ano, materialText, quantidade: count, estilo: style, proporcao: ratio, incluirNotas: includeNotes, versao: audience }) });
      setJob(created); localStorage.setItem('aula_clara_presentation_job', created.id);
      let current = created.deck ? created : await requestJson(`/api/presentation-jobs/${created.id}/plan`, { method: 'POST' }); setJob(current); if (current.deck) setDeck(current.deck);
      current = await processAssets(current);
      const finalized = await requestJson(`/api/presentation-jobs/${created.id}/finalize`, { method: 'POST' }); setJob(finalized); setDeck(finalized.deck || current.deck || null); localStorage.removeItem('aula_clara_presentation_job');
    } catch (error: any) { notify(error.message || 'Falha ao gerar slides. Você pode tentar novamente sem perder o roteiro concluído.'); setJob((current) => current ? { ...current, status: 'failed', stage: 'failed', error: error.message } : current); }
    finally { setBusy(false); }
  };

  const updateSlide = (index: number, patch: Record<string, unknown>) => setDeck((current) => current ? ({ ...current, slides: current.slides.map((slide, itemIndex) => itemIndex === index ? { ...slide, ...patch } : slide) }) : current);
  const move = (index: number, direction: number) => setDeck((current) => { if (!current) return current; const target = index + direction; if (target < 0 || target >= current.slides.length) return current; const slides = [...current.slides]; [slides[index], slides[target]] = [slides[target], slides[index]]; return { ...current, slides }; });
  const duplicate = (index: number) => setDeck((current) => current ? ({ ...current, slides: [...current.slides.slice(0, index + 1), { ...current.slides[index], id: crypto.randomUUID(), title: `${current.slides[index].title} — cópia` }, ...current.slides.slice(index + 1)] }) : current);
  const refineSlide = async (index: number, action: string) => { if (!deck) return; const slide = deck.slides[index]; if (action === 'simple') updateSlide(index, { bullets: slide.bullets.slice(0, 3).map((item) => item.split(/[.;:]/)[0]) }); if (action === 'summary') updateSlide(index, { bullets: slide.bullets.slice(0, 4).map((item) => item.length > 90 ? `${item.slice(0, 87)}…` : item) }); if (action === 'example') updateSlide(index, { bullets: [...slide.bullets.slice(0, 5), 'Exemplo para discutir com a turma.'] }); if (action === 'layout') updateSlide(index, { layout: slide.layout === 'cards' ? 'columns' : 'cards', layoutType: slide.layout === 'cards' ? 'columns' : 'cards' }); if (action === 'visual' && job) { updateSlide(index, { assetStatus: 'pending', assetDataUrl: undefined }); setBusy(true); try { const refreshed = await requestJson(`/api/presentation-jobs/${job.id}/slides/${slide.id}/asset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) }); setJob(refreshed); setDeck(refreshed.deck || deck); } catch (error: any) { notify(error.message); } finally { setBusy(false); } } };
  const download = async (format: 'pptx' | 'pdf' | 'docx') => { if (!deck) return; const response = await fetch('/api/export-slides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deck, format }) }); if (!response.ok) { const error = await response.json().catch(() => ({})); notify(error.error || 'Falha ao preparar o arquivo.'); return; } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${deck.title}.${format}`; link.click(); URL.revokeObjectURL(url); };

  return <>
    <button type="button" className="slides-entry-button" onClick={() => setOpen(true)}><Presentation size={24}/><b>Gerar Slides</b><span>Crie uma apresentação visual com material ou somente com um tema.</span></button>
    {open && <section className="slides-workspace"><header><div><span>APRESENTAÇÃO DIDÁTICA</span><h2>Gerar Slides</h2><p>Roteiro pedagógico, recursos visuais e arquivos editáveis.</p></div><button onClick={() => setOpen(false)} aria-label="Fechar"><X/></button></header>
      {!deck && <div className="slides-config-grid">
        <div className="slides-mode-picker"><button className={mode === 'material' ? 'active' : ''} onClick={() => setMode('material')}>Com material</button><button className={mode === 'tema' ? 'active' : ''} onClick={() => setMode('tema')}>Somente tema</button></div>
        {mode === 'tema' && <label className="slides-wide">Tema da apresentação<input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="Ex.: Corpo, mídia e realidade biológica"/></label>}
        <label>Disciplina<input value={subject} onChange={(event) => setSubject(event.target.value)}/></label><label>Segmento<input value={schoolSegment} onChange={(event) => setSchoolSegment(event.target.value)}/></label><label>Ano/série<input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)}/></label>
        <label>Quantidade de slides<select value={customCount ? 'custom' : count} onChange={(event) => { const value = event.target.value; if (value === 'custom') setCustomCount(true); else { setCustomCount(false); setCount(value === 'automatico' ? 'automatico' : Number(value)); } }}><option value="automatico">Automático</option>{[5,8,10,12,15,20].map((item) => <option key={item} value={item}>{item} slides</option>)}<option value="custom">Personalizado</option></select></label>
        {customCount && <label>Número personalizado<input type="number" min="3" max="20" value={typeof count === 'number' ? count : 8} onChange={(event) => setCount(Math.max(3, Math.min(20, Number(event.target.value))))}/></label>}
        <label>Estilo<select value={style} onChange={(event) => setStyle(event.target.value as SlideStyle)}>{['automatico','colorido','moderno','infantil','fundamental','medio','minimalista','criativo'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Formato<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as any)}><option value="pptx">PowerPoint editável</option><option value="pdf">PDF horizontal</option><option value="docx">Word editável</option></select></label><label>Proporção<select value={ratio} onChange={(event) => setRatio(event.target.value as SlideRatio)}><option>16:9</option><option>4:3</option><option>A4</option></select></label><label>Versão<select value={audience} onChange={(event) => setAudience(event.target.value as SlideAudience)}><option value="professor">Professor</option><option value="aluno">Aluno</option></select></label>
        <label className="slides-check"><input type="checkbox" checked={includeNotes} disabled={audience === 'aluno'} onChange={(event) => setIncludeNotes(event.target.checked)}/> Incluir notas do professor</label>
        <div className="slides-generate-footer"><div><b>Tudo pronto?</b><small>{mode === 'tema' ? 'O Aula Clara criará o conteúdo e o visual.' : 'Todas as páginas lidas serão analisadas em conjunto.'}</small></div><button type="button" className="slides-generate" disabled={busy || (mode === 'tema' && !theme.trim())} onClick={generate}><Presentation/> {busy ? 'Gerando apresentação…' : 'Gerar apresentação'}</button></div>
      </div>}
      {(busy || job?.status === 'failed') && !deck && <div className="slides-progress"><b>{job?.progress || 5}%</b><div><span style={{width:`${job?.progress || 5}%`}}/></div><p>{job?.error || stageLabels[job?.stage || 'preparing']}</p>{job?.status === 'failed' && <button onClick={generate}>Tentar novamente</button>}</div>}
      {deck && <div className="slides-editor"><div className="slides-editor-toolbar"><input value={deck.title} onChange={(event) => setDeck({...deck,title:event.target.value})}/><select value={deck.style} onChange={(event) => setDeck({...deck,style:event.target.value as SlideStyle})}>{['automatico','colorido','moderno','infantil','fundamental','medio','minimalista','criativo'].map((item)=><option key={item}>{item}</option>)}</select></div>
        {busy && <div className="slides-inline-progress"><span style={{width:`${job?.progress || 40}%`}}/><b>{job?.progress || 40}% · {stageLabels[job?.stage || 'generating_assets']}</b></div>}
        <div className="slides-list">{deck.slides.map((slide,index)=><article className="slide-edit-card" key={slide.id}><div className="slide-number">{index+1}</div><div className={`slide-live-preview style-${deck.style} layout-${slide.layout}`} style={slide.assetDataUrl ? { backgroundImage: `linear-gradient(90deg,rgba(8,25,35,.93),rgba(8,25,35,.25)),url(${slide.assetDataUrl})` } : undefined}><div className="slide-preview-accent"/><small>{slide.visualType}</small><h4>{slide.title}</h4>{slide.subtitle && <h5>{slide.subtitle}</h5>}<div className="slide-preview-body">{slide.bullets.slice(0,6).map((item,itemIndex)=><div className="slide-preview-item" key={`${slide.id}-${itemIndex}`}><span>{itemIndex+1}</span><p>{item}</p></div>)}</div>{slide.needsImage && <aside><ImageIcon size={14}/> {slide.assetStatus === 'ready' ? 'Visual gerado' : slide.assetStatus === 'fallback' ? 'Composição editável aplicada' : 'Visual pendente'}</aside>}</div><input aria-label={`Título do slide ${index+1}`} value={slide.title} onChange={(event)=>updateSlide(index,{title:event.target.value})}/><textarea aria-label={`Conteúdo do slide ${index+1}`} value={slide.bullets.join('\n')} onChange={(event)=>updateSlide(index,{bullets:event.target.value.split('\n').filter(Boolean),content:event.target.value.split('\n').filter(Boolean)})}/><div className="slide-card-actions"><button onClick={()=>move(index,-1)} title="Subir"><ChevronUp/></button><button onClick={()=>move(index,1)} title="Descer"><ChevronDown/></button><button onClick={()=>duplicate(index)} title="Duplicar"><Copy/></button><select defaultValue="" onChange={(event)=>{void refineSlide(index,event.target.value);event.target.value=''}}><option value="" disabled>Refazer este slide…</option><option value="simple">Deixar mais simples</option><option value="visual">Regenerar visual</option><option value="summary">Resumir</option><option value="example">Adicionar exemplo</option><option value="layout">Mudar layout</option></select><button onClick={()=>setDeck({...deck,slides:deck.slides.filter((_,i)=>i!==index)})} title="Excluir"><Trash2/></button></div></article>)}</div>
        <div className="slides-final-actions"><button onClick={()=>download(outputFormat)}><Download/> Baixar escolhido</button><button onClick={()=>download('pptx')}><Download/> PowerPoint</button><button onClick={()=>download('pdf')}><Download/> PDF</button><button onClick={()=>onSave(deck)}><Save/> Salvar em Pastas</button><button onClick={()=>{setDeck(null);setJob(null)}}><RefreshCw/> Gerar novamente</button></div></div>}
    </section>}
  </>;
};
