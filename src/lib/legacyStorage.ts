/**
 * Apaga do navegador os segredos que versões anteriores guardaram nele.
 *
 * A Central de integrações gravava chave do ERP, do n8n e token da Twilio no
 * `localStorage`, e a tela de fontes de lead guardava o token administrativo
 * do servidor no `sessionStorage`. Nada disso é lido mais; deixar lá só mantém
 * segredo exposto a qualquer script que rode na página.
 */
const LOCAL_KEYS = ['avila_n8n_url', 'avila_n8n_key', 'avila_erp_url', 'avila_erp_key', 'avila_twilio_sid', 'avila_twilio_token']
const SESSION_KEYS = ['agenda-meta-setup-token']

export function clearLegacySecrets() {
  try {
    for (const key of LOCAL_KEYS) window.localStorage.removeItem(key)
    for (const key of SESSION_KEYS) window.sessionStorage.removeItem(key)
  } catch {
    // Armazenamento bloqueado: não há o que limpar.
  }
}
