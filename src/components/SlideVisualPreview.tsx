import React from 'react';
import { GeneratedSlide } from '../types/slides';

export const SlideVisualPreview: React.FC<{ slide: GeneratedSlide }> = ({ slide }) => {
  if (slide.assetDataUrl) return <div className="slide-generated-visual" aria-label="Imagem gerada" />;
  if (slide.visualKind !== 'programmatic' && slide.assetStatus !== 'fallback') return null;
  const items = (slide.bullets.length ? slide.bullets : slide.graphicElements || []).slice(0, 5);
  return <div className={`slide-programmatic visual-${String(slide.visualType || 'CARDS').toLowerCase()}`} data-testid="programmatic-visual">
    {items.map((item, index) => <div className="visual-node" key={`${slide.id}-visual-${index}`}><i>{index + 1}</i><span>{item}</span></div>)}
  </div>;
};
