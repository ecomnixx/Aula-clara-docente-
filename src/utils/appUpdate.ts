export type UpdateDownloadContext = {
  isNativeAndroidApp: boolean;
  hasUpdate: boolean;
};

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map((part) => Number(part) || 0);
  const currentParts = current.split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index++) {
    const difference = (latestParts[index] || 0) - (currentParts[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export function hasAndroidUpdate(input: {
  installedVersion: string;
  installedVersionCode: number | null;
  latestVersion: string;
  latestVersionCode: number;
}): boolean {
  if (input.installedVersionCode !== null) {
    return input.latestVersionCode > input.installedVersionCode;
  }
  return isNewerVersion(input.latestVersion, input.installedVersion);
}

export function resolveOfficialApkUrl(apkUrl: string, officialOrigin: string): string {
  const resolved = new URL(apkUrl, officialOrigin);
  if (resolved.origin !== officialOrigin || resolved.pathname !== '/aula-clara-android.apk') {
    throw new Error('Endereço de download inválido.');
  }
  return resolved.href;
}

export function getUpdateDownloadLabel(context: UpdateDownloadContext): string {
  if (!context.isNativeAndroidApp) return 'Baixar aplicativo Android';
  if (context.hasUpdate) return 'Baixar atualização';
  return 'Baixar APK';
}
