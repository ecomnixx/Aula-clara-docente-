import assert from 'node:assert/strict';
import test from 'node:test';
import { getUpdateDownloadLabel, hasAndroidUpdate, resolveOfficialApkUrl } from '../src/utils/appUpdate';

test('instalada e servidor iguais: aplicativo atualizado', () => {
  assert.equal(hasAndroidUpdate({ installedVersion: '3.2.2', installedVersionCode: 30202, latestVersion: '3.2.2', latestVersionCode: 30202 }), false);
});

test('servidor mais novo: atualização disponível pelo versionCode', () => {
  assert.equal(hasAndroidUpdate({ installedVersion: '3.2.1', installedVersionCode: 30201, latestVersion: '3.2.2', latestVersionCode: 30202 }), true);
  assert.equal(getUpdateDownloadLabel({ isNativeAndroidApp: true, hasUpdate: true }), 'Baixar atualização');
});

test('sem versionCode usa comparação semântica como fallback', () => {
  assert.equal(hasAndroidUpdate({ installedVersion: '3.2.1', installedVersionCode: null, latestVersion: '3.2.2', latestVersionCode: 30202 }), true);
});

test('somente aceita APK na rota e origem oficiais', () => {
  assert.equal(resolveOfficialApkUrl('/aula-clara-android.apk', 'https://aulaclara-docente.vercel.app'), 'https://aulaclara-docente.vercel.app/aula-clara-android.apk');
  assert.throws(() => resolveOfficialApkUrl('https://exemplo.com/app.apk', 'https://aulaclara-docente.vercel.app'));
});

test('navegador mostra baixar aplicativo Android', () => {
  assert.equal(getUpdateDownloadLabel({ isNativeAndroidApp: false, hasUpdate: false }), 'Baixar aplicativo Android');
});

test('aplicativo atualizado mantém um único botão Baixar APK', () => {
  assert.equal(getUpdateDownloadLabel({ isNativeAndroidApp: true, hasUpdate: false }), 'Baixar APK');
});
