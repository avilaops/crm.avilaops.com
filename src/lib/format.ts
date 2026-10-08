/**
 * Formatação pt-BR num lugar só: moeda, preço unitário e telefone.
 *
 * Sem dependência de DOM ou React, para os testes rodarem no Node.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlUnit = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** R$ 1.234,56 */
export function formatBRL(value: number) {
  return brl.format(value)
}

/** Preço por unidade com até quatro casas: R$ 0,3217 · R$ 0,035. */
export function formatUnitPrice(value: number) {
  return brlUnit.format(value)
}

/** Só os dígitos de um telefone, para comparar e montar link. */
export function digitsOnly(phone: string | null | undefined) {
  return (phone ?? '').replace(/\D/g, '')
}

/**
 * Telefone brasileiro para leitura: "(16) 99234-8303".
 *
 * O banco guarda em E.164 (+5516992348303) e às vezes com espaços, vindo de
 * fontes diferentes. Número de fora do Brasil, ou que não parece telefone,
 * volta como veio: mostrar errado é pior do que mostrar cru.
 */
export function formatPhoneBR(phone: string | null | undefined) {
  const raw = (phone ?? '').trim()
  const digits = digitsOnly(raw)
  const hasCountryCode = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
  const national = hasCountryCode ? digits.slice(2) : digits
  // Com "+", só é brasileiro se o país for 55 (o +1 da Meta de teste não é).
  // Sem "+", vale o tamanho do número nacional: DDD e oito ou nove dígitos.
  const brazilian = raw.startsWith('+') ? hasCountryCode : national.length === 10 || national.length === 11
  if (!brazilian) return raw
  const ddd = national.slice(0, 2)
  const local = national.slice(2)
  if (local.length === 9) return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
  if (local.length === 8) return `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`
  return raw
}
