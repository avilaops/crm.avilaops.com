/**
 * Quanto a Meta cobra por mensagem de WhatsApp entregue a um número do Brasil.
 *
 * A tela de conexão dizia "a partir de $0,0002": moeda errada e um valor que
 * não existe na tabela da Meta. Preço aqui é dado com data de vigência, não
 * texto no meio do componente. Valores pagos e vigência permanecem provisórios
 * até conferência no CSV oficial; a interface oculta tarifas e simulador.
 *
 * Os valores ficam em décimos de milésimo de real (R$ 0,0001) e são inteiros:
 * somar 0,035 em ponto flutuante milhares de vezes erra centavo.
 *
 * ⚠ Conferência pendente. Os valores em BRL vêm de quatro parceiros que
 * baixaram a tabela oficial (Flowcall, WizeBot, Zappy, Clickmassa), todos
 * iguais entre si. Isso não comprova a tarifa nem a vigência. O CSV "BRL rates" da página de preços da Meta não foi
 * aberto diretamente. Antes de publicar, baixe o CSV, confira e troque
 * `conferidaNoCsvOficial` para `true`.
 */

export type CategoriaMensagem = 'marketing' | 'utilidade' | 'autenticacao' | 'servico'

export type TabelaPrecosWhatsApp = {
  /** Primeiro dia em que a tabela vale, no formato AAAA-MM-DD. */
  vigenteDesde: string
  moeda: 'BRL'
  /** Código de país do destinatário: o preço da Meta é por país de destino. */
  paisDestino: '+55'
  /** Preço por mensagem entregue, em R$ 0,0001. */
  precoPorMensagem: Record<CategoriaMensagem, number>
  /** Limite legado; zero na tabela atual, pois serviço é sempre gratuito. */
  franquiaServicoPorNumero: number
  conferidaNoCsvOficial: boolean
  fontes: string[]
}

export const categoriasMensagem: { id: CategoriaMensagem; nome: string; quando: string }[] = [
  { id: 'servico', nome: 'Serviço', quando: 'Respostas livres na janela de 24h, gratuitas' },
  { id: 'utilidade', nome: 'Utilidade', quando: 'Confirmação de coleta, status de entrega, cobrança' },
  { id: 'autenticacao', nome: 'Autenticação', quando: 'Códigos de verificação' },
  { id: 'marketing', nome: 'Marketing', quando: 'Promoções, campanhas e newsletter' },
]

export const tabelasWhatsApp: TabelaPrecosWhatsApp[] = [
  {
    // Valores pagos e vigência ainda pendentes do CSV oficial.
    // Serviço é gratuito conforme a página oficial consultada em 02/10/2026.
    vigenteDesde: '2026-10-01',
    moeda: 'BRL',
    paisDestino: '+55',
    precoPorMensagem: { marketing: 3217, utilidade: 350, autenticacao: 350, servico: 0 },
    franquiaServicoPorNumero: 0,
    conferidaNoCsvOficial: false,
    fontes: [
      'https://developers.facebook.com/docs/whatsapp/pricing',
      'https://whatsappbusiness.com/products/platform-pricing/',
      'Tabela BRL reproduzida por Flowcall, WizeBot, Zappy e Clickmassa (valores iguais entre si)',
    ],
  },
]

/** A tabela que vale na data: a mais recente cuja vigência já começou. */
export function tabelaVigente(em: Date = new Date(), tabelas: TabelaPrecosWhatsApp[] = tabelasWhatsApp): TabelaPrecosWhatsApp {
  const dia = em.toISOString().slice(0, 10)
  const ordenadas = [...tabelas].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
  const vigente = ordenadas.filter((tabela) => tabela.vigenteDesde <= dia).at(-1)
  // Relógio atrasado ou tabela futura: melhor mostrar a mais antiga do que nada.
  return vigente ?? ordenadas[0]
}

/** Preço de uma mensagem, em reais (0,3217). */
export function precoEmReais(tabela: TabelaPrecosWhatsApp, categoria: CategoriaMensagem) {
  return tabela.precoPorMensagem[categoria] / 10_000
}

/** "01/10/2026", sem passar por fuso horário. */
export function formatarVigencia(tabela: TabelaPrecosWhatsApp) {
  const [ano, mes, dia] = tabela.vigenteDesde.split('-')
  return `${dia}/${mes}/${ano}`
}

export type VolumeMensal = {
  /** Mensagens de serviço: respostas livres dentro da janela de 24h. */
  servico: number
  /** Avisos de utilidade: coleta, entrega, cobrança. */
  utilidade: number
  marketing: number
  autenticacao?: number
  /** Números de WhatsApp da empresa; cada um tem a própria franquia. */
  numeros?: number
  /** Avisos de utilidade enviados dentro da janela de atendimento de 24h (grátis). */
  utilidadeNaJanela?: number
}

export type LinhaEstimativa = {
  categoria: CategoriaMensagem
  mensagens: number
  /** Quantas pagam depois da franquia. */
  cobradas: number
  /** Valor da linha em reais. */
  valor: number
}

export type EstimativaMensal = {
  linhas: LinhaEstimativa[]
  total: number
  franquia: number
  franquiaUsada: number
}

function inteiroNaoNegativo(valor: number | undefined) {
  return Number.isFinite(valor) ? Math.max(0, Math.floor(valor as number)) : 0
}

/**
 * Custo mensal estimado das mensagens enviadas pelo CRM.
 *
 * Mensagem que o cliente manda não entra: é sempre grátis. As enviadas pelo
 * app WhatsApp Business no celular (Coexistência) também não: quem cobra é a
 * Cloud API, e o app continua gratuito.
 */
export function estimarCustoMensal(tabela: TabelaPrecosWhatsApp, volume: VolumeMensal): EstimativaMensal {
  const numeros = Math.max(1, inteiroNaoNegativo(volume.numeros ?? 1))
  const franquia = tabela.franquiaServicoPorNumero * numeros
  const quantidades: Record<CategoriaMensagem, number> = {
    servico: inteiroNaoNegativo(volume.servico),
    utilidade: inteiroNaoNegativo(volume.utilidade),
    autenticacao: inteiroNaoNegativo(volume.autenticacao),
    marketing: inteiroNaoNegativo(volume.marketing),
  }

  let totalEmDecimosDeMilesimo = 0
  const linhas = categoriasMensagem.map(({ id }) => {
    const mensagens = quantidades[id]
    const cobradas = id === 'servico' && tabela.precoPorMensagem.servico === 0 ? 0
      : id === 'servico' ? Math.max(0, mensagens - franquia)
      : id === 'utilidade' ? Math.max(0, mensagens - inteiroNaoNegativo(volume.utilidadeNaJanela)) : mensagens
    const valorEmDecimosDeMilesimo = cobradas * tabela.precoPorMensagem[id]
    totalEmDecimosDeMilesimo += valorEmDecimosDeMilesimo
    return { categoria: id, mensagens, cobradas, valor: valorEmDecimosDeMilesimo / 10_000 }
  })

  return {
    linhas,
    total: totalEmDecimosDeMilesimo / 10_000,
    franquia,
    franquiaUsada: Math.min(quantidades.servico, franquia),
  }
}

