export type NotificationKind = 'ACCOUNT' | 'APP_UPDATE' | 'CONTENT_READY' | 'CORRECTION_READY' | 'SLIDES_READY' | 'ASSESSMENT_READY' | 'SYSTEM';
export interface NotificationRecord { id: string; type: NotificationKind; readAt?: string | null; metadata?: Record<string, unknown>; createdAt?: string; }

export const unreadNotificationCount = (items: NotificationRecord[]) => items.reduce((total, item) => total + (item.readAt ? 0 : 1), 0);

export function relativeNotificationTime(value: string, now = Date.now()): string {
  const date = new Date(value); const diff = now - date.getTime();
  if (diff < 60_000) return 'Agora'; if (diff < 3_600_000) return `Há ${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (diff < 86_400_000) return `Há ${Math.floor(diff / 3_600_000)} h`; if (diff < 172_800_000) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function notificationDestination(type: NotificationKind) {
  if (type === 'ACCOUNT') return 'access'; if (type === 'APP_UPDATE') return 'updates'; if (type === 'SLIDES_READY') return 'slides';
  if (type === 'CORRECTION_READY') return 'corrigir_prova'; if (type === 'ASSESSMENT_READY') return 'assessment'; return 'saved';
}
