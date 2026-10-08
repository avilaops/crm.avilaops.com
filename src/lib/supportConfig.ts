/** Aceita um destino único, sem parâmetros extras ou caracteres de controle. */
export function parseSupportContact(whatsapp?: string, email?: string) {
  const phone = whatsapp?.trim() ?? ''
  const address = email?.trim() ?? ''
  return {
    whatsapp: /^[1-9]\d{7,14}$/.test(phone) ? phone : null,
    email: /^[a-zA-Z0-9.!#$%&'*+/=^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(address) ? address : null,
  }
}
