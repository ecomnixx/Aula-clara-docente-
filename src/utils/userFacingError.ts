const TECHNICAL_ERROR = /(stack|trace|\bat\s+\w+|unexpected token|json|status\s*\d+|ECONN|ENOTFOUND|fetch failed|supabase|postgres|violates|function\s+\w+|api[_ -]?key|bearer|jwt)/i;

export function userFacingError(error: unknown, fallback = 'Não foi possível concluir esta etapa. Tente novamente.'): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message || message.length > 220 || TECHNICAL_ERROR.test(message) || /^[\[{]/.test(message.trim())) return fallback;
  return message;
}
