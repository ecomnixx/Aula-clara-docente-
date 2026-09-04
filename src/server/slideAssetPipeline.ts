import { GeneratedSlide } from '../types/slides';
import { ImageGenerationProvider } from './imageGenerationProvider';

export async function generateRequiredSlideAsset(slide: GeneratedSlide, provider: ImageGenerationProvider, logger: Pick<Console, 'info' | 'error'> = console): Promise<GeneratedSlide> {
  if (slide.visualKind !== 'generated_image') return slide;
  const startedAt = Date.now(); const next = { ...slide, assetStatus: 'generating' as const };
  try {
    const visual = await provider.generate(slide.imagePrompt || 'Premium educational illustration, NO TEXT, NO LETTERS, NO WORDS, NO NUMBERS, NO LABELS, NO TYPOGRAPHY.');
    logger.info(`[SLIDE IMAGE] slideId=${slide.id} visualType=${slide.visualType} provider=vercel-ai-gateway model=${visual.model} status=success durationMs=${visual.durationMs} fallbackUsed=${visual.fallbackUsed}`);
    return { ...next, assetDataUrl: visual.dataUrl, assetModel: visual.model, assetStatus: 'ready', assetError: '' };
  } catch (error: any) {
    logger.error(`[SLIDE IMAGE] slideId=${slide.id} visualType=${slide.visualType} provider=vercel-ai-gateway model=unavailable status=failed durationMs=${Date.now() - startedAt} fallbackUsed=true`);
    return { ...next, assetDataUrl: undefined, assetStatus: 'failed', assetError: error?.message || 'Não foi possível gerar a imagem deste slide.' };
  }
}
