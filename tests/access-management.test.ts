import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationEventKey, summarizeAccessUsers } from '../src/server/accessManagement';

test('contadores usam apenas professores reais e preservam excluídos separadamente', () => {
  const now = new Date('2026-08-22T12:00:00-03:00');
  const stats = summarizeAccessUsers([
    { role: 'master', status: 'Ativo', createdAtIso: now.toISOString() },
    { role: 'professor', status: 'Ativo', createdAtIso: now.toISOString() },
    { role: 'professor', status: 'Bloqueado', createdAtIso: '2026-08-20T12:00:00-03:00' },
    { role: 'professor', status: 'Expirado', createdAtIso: '2026-08-19T12:00:00-03:00' },
    { role: 'professor', status: 'Excluído', createdAtIso: now.toISOString() },
  ], now);
  assert.deepEqual(stats, { usersTotal: 4, total: 3, active: 1, blocked: 1, expired: 1, deleted: 1, newToday: 1 });
});

test('chave de notificação de cadastro é estável e única por usuário Auth', () => {
  assert.equal(registrationEventKey('abc-123'), 'registration:abc-123');
  assert.equal(new Set(['abc-123', 'abc-123', 'xyz'].map(registrationEventKey)).size, 2);
});
