export function googleRedirectUri(base: string | undefined, production: boolean): string | null {
  try {
    if (!base && production) return null;
    const url = new URL(base?.trim() || "http://localhost:3000");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (url.protocol !== "https:" && (production || !local || url.protocol !== "http:")) return null;
    return `${url.origin}/api/integrations/google/callback`;
  } catch {
    return null;
  }
}
