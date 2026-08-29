export function isAccessTokenExpiring(token: string, nowMs = Date.now(), leewaySeconds = 60): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || Number(payload.exp) * 1000 <= nowMs + leewaySeconds * 1000;
  } catch {
    return true;
  }
}
