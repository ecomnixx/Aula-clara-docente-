import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { notificationDestination, relativeNotificationTime, unreadNotificationCount } from '../src/utils/notificationCenter';

test('contador considera somente notificações não lidas', () => {
  assert.equal(unreadNotificationCount([{ id: '1', type: 'SYSTEM' }, { id: '2', type: 'SYSTEM', readAt: new Date().toISOString() }]), 1);
});

test('destinos abrem o conteúdo correto', () => {
  assert.equal(notificationDestination('SLIDES_READY'), 'slides'); assert.equal(notificationDestination('CORRECTION_READY'), 'corrigir_prova');
  assert.equal(notificationDestination('ASSESSMENT_READY'), 'assessment'); assert.equal(notificationDestination('APP_UPDATE'), 'updates'); assert.equal(notificationDestination('ACCOUNT'), 'access');
});

test('datas relativas são legíveis', () => {
  const now = new Date('2026-09-02T12:00:00Z').getTime();
  assert.equal(relativeNotificationTime('2026-09-02T11:55:00Z', now), 'Há 5 min'); assert.equal(relativeNotificationTime('2026-09-01T11:00:00Z', now), 'Ontem');
});

test('migração garante persistência, RLS e deduplicação', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260902004646_align_notifications.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.notifications/); assert.match(sql, /enable row level security/);
  assert.match(sql, /unique\(user_id, idempotency_key\)/); assert.match(sql, /copy_admin_notification_to_master/);
});

test('backend emite eventos idempotentes de slides e correção', async () => {
  const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(source, /slides-ready:\$\{job\.id\}/); assert.match(source, /correction-ready:\$\{jobId\}/);
  assert.match(source, /type: 'SLIDES_READY'/); assert.match(source, /type: 'CORRECTION_READY'/);
});
