import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccessTokenExpiring } from '../src/utils/authSession';

const jwtWithExpiry = (exp: number) => {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `header.${payload}.signature`;
};

test('detecta JWT expirado antes de sincronizar o painel Master', () => {
  const now = Date.parse('2026-08-22T20:00:00Z');
  assert.equal(isAccessTokenExpiring(jwtWithExpiry(Math.floor(now / 1000) - 1), now), true);
});

test('mantém JWT válido e renova quando entra na margem de segurança', () => {
  const now = Date.parse('2026-08-22T20:00:00Z');
  assert.equal(isAccessTokenExpiring(jwtWithExpiry(Math.floor(now / 1000) + 3600), now), false);
  assert.equal(isAccessTokenExpiring(jwtWithExpiry(Math.floor(now / 1000) + 30), now), true);
});
