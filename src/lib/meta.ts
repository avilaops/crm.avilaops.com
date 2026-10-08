/**
 * Conexão direta com a Meta pelo app do próprio CRM — caminho antigo.
 *
 * Desde 04/09/2026 quem fala com a Meta é a Messageria (ver
 * docs/INTEGRACAO-MESSAGERIA.md). A tela usa só `getMetaStatus`, para avisar
 * quando ainda existe uma conexão direta; o OAuth e as credenciais ficam aqui,
 * sem tela, até a integração nova estar comprovada em produção — o roadmap pede
 * desativar e marcar, não apagar.
 */
const WORKER_BASE_URL =
  (import.meta.env.VITE_META_WORKER_URL as string | undefined) ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "/api/meta";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export type MetaStatus = {
  configured: boolean;
  connected: boolean;
  appConfiguredHint: string | null;
  userName: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${WORKER_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : "Erro ao comunicar com o servidor."
    throw message
  }
  return data as T;
}

export function getMetaStatus() {
  return fetchJson<MetaStatus>("/status");
}

export function saveMetaCredentials(appId: string, appSecret: string, setupToken: string) {
  return fetchJson<MetaStatus>("/credentials", {
    method: "POST",
    headers: { "X-Setup-Token": setupToken },
    body: JSON.stringify({ appId, appSecret }),
  });
}

export function disconnectMeta(setupToken: string) {
  return fetchJson<MetaStatus>("/disconnect", {
    method: "POST",
    headers: { "X-Setup-Token": setupToken },
  });
}

export function connectMeta(): Promise<MetaStatus> {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const redirectUri = `${window.location.origin}${basePath}/oauth-callback.html`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let popup: Window | null = null;
    let timeoutId: number | undefined;
    let intervalId: number | undefined;

    function cleanup() {
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener("message", onMessage);
    }

    function finish(action: () => void) {
      if (settled) return;
      cleanup();
      try {
        popup?.close();
      } catch {
        // ignore
      }
      action();
    }

    async function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; code?: string; state?: string; error?: string } | null;
      if (!data || data.type !== "meta-oauth-code") return;

      if (data.error) {
        finish(() => reject(data.error));
        return;
      }
      if (!data.code || !data.state) {
        finish(() => reject("Login com a Meta não retornou um código válido."));
        return;
      }

      try {
        const status = await fetchJson<MetaStatus>("/exchange", {
          method: "POST",
          body: JSON.stringify({ code: data.code, state: data.state, redirectUri }),
        });
        finish(() => resolve(status));
      } catch (error) {
        finish(() => reject(error));
      }
    }

    window.addEventListener("message", onMessage);

    fetchJson<{ url: string }>(`/login-url?redirectUri=${encodeURIComponent(redirectUri)}`)
      .then((result) => {
        if (settled) return;
        popup = window.open(result.url, "meta-login", "width=480,height=700");
        if (!popup) {
          finish(() => reject("Não foi possível abrir a janela de login (pop-up bloqueado pelo navegador)."));
          return;
        }

        timeoutId = window.setTimeout(() => {
          finish(() => reject("Tempo esgotado para concluir o login com a Meta."));
        }, LOGIN_TIMEOUT_MS);

        intervalId = window.setInterval(() => {
          if (popup?.closed) {
            finish(() => reject("Login cancelado."));
          }
        }, 500);
      })
      .catch((error) => {
        finish(() => reject(error));
      });
  });
}
