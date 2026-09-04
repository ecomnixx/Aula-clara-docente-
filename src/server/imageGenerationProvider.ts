import { generateImage } from 'ai';
import { GoogleGenAI, Modality } from '@google/genai';

export interface GeneratedVisual { dataUrl: string; model: string; fallbackUsed: boolean; durationMs: number; }
export interface ImageGenerationProvider { generate(prompt: string): Promise<GeneratedVisual>; }

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1';

export class VercelGatewayImageProvider implements ImageGenerationProvider {
  private readonly models = [
    process.env.SLIDE_IMAGE_MODEL || 'google/imagen-4.0-generate-001',
    process.env.SLIDE_IMAGE_FALLBACK_MODEL || 'openai/gpt-image-2',
  ];

  async generate(prompt: string): Promise<GeneratedVisual> {
    const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    const startedAt = Date.now();
    let lastError: unknown;
    if (apiKey) {
      for (const [index, model] of [...new Set(this.models)].entries()) {
        try {
          const result = await generateImage({
            model,
            prompt,
            aspectRatio: '16:9',
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(45_000),
          });
          const image = result.images?.[0];
          if (!image?.base64) throw new Error('O provedor não retornou imagem.');
          return {
            dataUrl: `data:${image.mediaType || 'image/png'};base64,${image.base64}`,
            model,
            fallbackUsed: index > 0,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          lastError = error;
        }
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const model = process.env.SLIDE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
        });
        const imagePart = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
        if (!imagePart?.inlineData?.data) throw new Error('O Gemini não retornou imagem.');
        return {
          dataUrl: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`,
          model,
          fallbackUsed: Boolean(apiKey),
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Falha ao gerar recurso visual.');
  }
}

export function imageGatewayDiagnostics() {
  return {
    configured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    authSource: process.env.AI_GATEWAY_API_KEY ? 'AI_GATEWAY_API_KEY' : process.env.VERCEL_OIDC_TOKEN ? 'VERCEL_OIDC_TOKEN' : 'none',
    endpoint: GATEWAY_URL,
    primaryModel: process.env.SLIDE_IMAGE_MODEL || 'google/imagen-4.0-generate-001',
    fallbackModel: process.env.SLIDE_IMAGE_FALLBACK_MODEL || 'openai/gpt-image-2',
    geminiFallbackConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiFallbackModel: process.env.SLIDE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  };
}

export function getImageGenerationProvider(): ImageGenerationProvider { return new VercelGatewayImageProvider(); }
