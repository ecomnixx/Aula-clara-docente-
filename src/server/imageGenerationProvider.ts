import OpenAI from 'openai';

export interface GeneratedVisual { dataUrl: string; model: string; }
export interface ImageGenerationProvider { generate(prompt: string): Promise<GeneratedVisual>; }

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1';

export class VercelGatewayImageProvider implements ImageGenerationProvider {
  private readonly models = [
    process.env.SLIDE_IMAGE_MODEL || 'google/imagen-4.0-ultra-generate-001',
    process.env.SLIDE_IMAGE_FALLBACK_MODEL || 'openai/gpt-image-2',
  ];

  async generate(prompt: string): Promise<GeneratedVisual> {
    const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!apiKey) throw new Error('AI Gateway não configurado; usando composição visual editável.');
    const client = new OpenAI({ apiKey, baseURL: GATEWAY_URL, timeout: 45_000, maxRetries: 0 });
    let lastError: unknown;
    for (const model of [...new Set(this.models)]) {
      try {
        const result = await client.images.generate({ model, prompt, n: 1, response_format: 'b64_json' });
        const item = result.data?.[0];
        const dataUrl = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url || '';
        if (!dataUrl) throw new Error('O provedor não retornou imagem.');
        return { dataUrl, model };
      } catch (error) { lastError = error; }
    }
    throw lastError instanceof Error ? lastError : new Error('Falha ao gerar recurso visual.');
  }
}

export function getImageGenerationProvider(): ImageGenerationProvider { return new VercelGatewayImageProvider(); }
