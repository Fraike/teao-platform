const TOKEN_KEY = "auth_token";

function temporaryStorage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function getToken(): string | null {
  return temporaryStorage()?.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, persistent = true): void {
  const temporary = temporaryStorage();
  const target = persistent || !temporary ? localStorage : temporary;
  localStorage.removeItem(TOKEN_KEY);
  temporary?.removeItem(TOKEN_KEY);
  target.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  temporaryStorage()?.removeItem(TOKEN_KEY);
}
