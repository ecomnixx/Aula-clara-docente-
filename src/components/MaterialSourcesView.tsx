import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown, ChevronUp, Eye, FilePlus2, FolderOpen, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { MaterialSource, MaterialSourcePage } from '../types/materialSource';
import { materialSourcesApi } from '../utils/materialSourcesApi';
import { fileToPureBase64, prepareSourceFiles, type PreparedSourcePage } from '../utils/sourceFiles';
import './MaterialSourcesView.css';

interface Props {
  onUseSource: (text: string, title: string) => void;
  showToast: (message: string) => void;
}

const pageStatus: Record<string, string> = {
  uploading: 'Enviando', stored: 'Armazenada', preparing: 'Preparando', queued: 'Aguardando',
  reading: 'Lendo', processing: 'Processando', ready: 'Concluída', error: 'Erro',
};

export function MaterialSourcesView({ onUseSource, showToast }: Props) {
  const [sources, setSources] = useState<MaterialSource[]>([]);
  const [active, setActive] = useState<MaterialSource | null>(null);
  const [pending, setPending] = useState<PreparedSourcePage[]>([]);
  const [title, setTitle] = useState('Novo material');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const refresh = async (selectId?: string) => {
    const data = await materialSourcesApi.list();
    setSources(data.sources);
    const wanted = selectId || active?.id;
    setActive(wanted ? data.sources.find((item) => item.id === wanted) || null : null);
  };

  useEffect(() => { refresh().catch((error) => showToast(error.message)); }, []);
  useEffect(() => () => pending.forEach((page) => URL.revokeObjectURL(page.previewUrl)), [pending]);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const pages = await prepareSourceFiles(Array.from(list));
      if (active) {
        for (let index = 0; index < pages.length; index += 1) {
          const item = pages[index];
          await materialSourcesApi.uploadPage(active.id, {
            base64: await fileToPureBase64(item.file), filename: item.originalFilename,
            mimeType: item.file.type, size: item.file.size, width: item.width, height: item.height,
          });
          setProgress(Math.round(((index + 1) / pages.length) * 100));
          URL.revokeObjectURL(item.previewUrl);
        }
        await refresh(active.id);
        showToast(`${pages.length} nova(s) página(s) armazenada(s). A leitura ainda não começou.`);
        return;
      }
      setPending((old) => [...old, ...pages]);
      if (title === 'Novo material') setTitle(Array.from(list)[0].name.replace(/\.[^.]+$/, ''));
      showToast(`${pages.length} página(s) preparada(s). Confira antes de armazenar.`);
    } catch (error: any) { showToast(error.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; if (cameraRef.current) cameraRef.current.value = ''; }
  };

  const upload = async () => {
    if (!pending.length || !title.trim()) return;
    setBusy(true); setProgress(0);
    try {
      const hasPdf = pending.some((item) => item.originalFilename.toLowerCase().includes('.pdf'));
      const hasImage = pending.some((item) => !item.originalFilename.toLowerCase().includes('.pdf'));
      const created = await materialSourcesApi.create(title.trim(), hasPdf && hasImage ? 'mixed' : hasPdf ? 'pdf' : 'images');
      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        await materialSourcesApi.uploadPage(created.source.id, {
          base64: await fileToPureBase64(item.file), filename: item.originalFilename,
          mimeType: item.file.type, size: item.file.size, width: item.width, height: item.height,
        });
        setProgress(Math.round(((index + 1) / pending.length) * 100));
      }
      pending.forEach((page) => URL.revokeObjectURL(page.previewUrl));
      setPending([]); await refresh(created.source.id);
      showToast(`${pending.length} página(s) armazenada(s) com sucesso.`);
    } catch (error: any) { showToast(error.message); }
    finally { setBusy(false); }
  };

  const processOne = async (page: MaterialSourcePage) => {
    if (!active) return;
    try { await materialSourcesApi.processPage(active.id, page.id); }
    finally { await refresh(active.id); }
  };

  const processAll = async () => {
    if (!active) return;
    const queue = active.pages.filter((page) => page.processing_status !== 'ready');
    setBusy(true); setProgress(0);
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const index = cursor++;
        try { await materialSourcesApi.processPage(active.id, queue[index].id); } catch { /* page keeps its own error */ }
        setProgress(Math.round((cursor / queue.length) * 100));
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker));
    await refresh(active.id); setBusy(false); showToast('Leitura concluída. Páginas com erro podem ser tentadas novamente.');
  };

  const move = async (index: number, delta: number) => {
    if (!active) return;
    const pages = [...active.pages]; const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    await materialSourcesApi.reorder(active.id, pages.map((page) => page.id));
    await refresh(active.id);
  };

  const combinedText = useMemo(() => active?.pages
    .filter((page) => page.processing_status === 'ready' && page.extracted_text)
    .map((page) => `[${active.title} · página ${page.page_number}]\n${page.extracted_text}`)
    .join('\n\n') || '', [active]);

  if (!active) return <section className="sources-shell">
    <div className="sources-heading"><div><span className="sources-eyebrow">Materiais do professor</span><h1>Meus materiais</h1><p>Adicione uma apostila uma vez e reutilize o conteúdo em todas as ferramentas.</p></div></div>
    <div className="source-create-card">
      <label>Título do material<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label>
      <div className="source-actions">
        <button onClick={() => cameraRef.current?.click()}><Camera size={20}/> Fotografar página</button>
        <button onClick={() => fileRef.current?.click()}><Upload size={20}/> Selecionar imagens ou PDF</button>
      </div>
      <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => handleFiles(event.target.files)} />
      <input ref={fileRef} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => handleFiles(event.target.files)} />
      {pending.length > 0 && <><div className="pending-summary"><b>{pending.length} página(s) pronta(s) para armazenar</b><span>Confira a sequência. O OCR ainda não começou.</span></div>
        <div className="source-page-grid">{pending.map((page, index) => <article className="source-page" key={page.previewUrl}>
          <img src={page.previewUrl} alt={`Página ${index + 1}`} onClick={() => setLightbox(page.previewUrl)} />
          <b>Página {index + 1}</b><small>{page.originalFilename}</small><span className="status stored">Preparada</span>
          <button className="icon-danger" onClick={() => setPending((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16}/> Excluir</button>
        </article>)}</div>
        <button className="source-primary" disabled={busy} onClick={upload}><FolderOpen size={20}/> {busy ? `Armazenando… ${progress}%` : 'Armazenar fonte'}</button>
      </>}
    </div>
    <h2>Materiais salvos</h2>
    <div className="saved-sources">{sources.length === 0 ? <div className="source-empty"><FilePlus2/><b>Nenhuma fonte salva</b><span>As fontes armazenadas aparecerão aqui.</span></div> : sources.map((source) => <button key={source.id} onClick={() => setActive(source)}>
      <FolderOpen/><span><b>{source.title}</b><small>{source.total_pages} página(s) · {source.processing_status === 'ready' ? 'Processada' : 'Em preparação'}</small></span>
    </button>)}</div>
    {lightbox && <div className="source-lightbox" onClick={() => setLightbox(null)}><img src={lightbox}/></div>}
  </section>;

  return <section className="sources-shell">
    <button className="source-back" onClick={() => setActive(null)}>← Voltar para minhas fontes</button>
    <div className="sources-heading"><div><span className="sources-eyebrow">Fonte</span><h1>{active.title}</h1><p>{active.pages.length} página(s) · confira antes de iniciar a leitura.</p></div>
      <button className="icon-danger" onClick={async () => { if (confirm('Excluir esta fonte, páginas, OCR e indexação?')) { await materialSourcesApi.remove(active.id); setActive(null); await refresh(); } }}><Trash2 size={18}/> Excluir fonte</button></div>
    {busy && <div className="source-progress"><div><span style={{ width: `${progress}%` }}/></div><b>Processando páginas: {progress}%</b></div>}
    <div className="source-page-grid">{active.pages.map((page, index) => <article className="source-page" key={page.id}>
      {page.preview_url ? <img src={page.preview_url} alt={`Página ${page.page_number}`} onClick={() => setLightbox(page.preview_url!)} /> : <div className="preview-placeholder">Preview protegido</div>}
      <b>Página {page.page_number}</b><small>{page.original_filename} · {(page.file_size / 1024).toFixed(0)} KB</small>
      <span className={`status ${page.processing_status}`}>{pageStatus[page.processing_status]}</span>
      {page.processing_error && <em>{page.processing_error}</em>}
      <div className="page-buttons"><button title="Ampliar" onClick={() => page.preview_url && setLightbox(page.preview_url)}><Eye size={16}/></button>
        <button title="Subir" onClick={() => move(index, -1)}><ChevronUp size={16}/></button><button title="Descer" onClick={() => move(index, 1)}><ChevronDown size={16}/></button>
        {(page.processing_status === 'error') && <button title="Tentar novamente" onClick={() => processOne(page)}><RefreshCw size={16}/></button>}
        <button title="Excluir" onClick={async () => { if (confirm(`Excluir a página ${page.page_number}?`)) { await materialSourcesApi.removePage(active.id, page.id); await refresh(active.id); } }}><Trash2 size={16}/></button></div>
    </article>)}</div>
    <div className="source-footer-actions"><button onClick={() => fileRef.current?.click()}><FilePlus2 size={19}/> Adicionar página</button>
      <input ref={fileRef} hidden type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => handleFiles(event.target.files)} />
      <button className="source-primary" disabled={busy || active.pages.length === 0} onClick={processAll}>LER MATERIAL</button>
      {combinedText && <button onClick={() => onUseSource(combinedText, active.title)}>Usar esta fonte nas ferramentas</button>}</div>
    {lightbox && <div className="source-lightbox" onClick={() => setLightbox(null)}><img src={lightbox}/></div>}
  </section>;
}
