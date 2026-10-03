import { useId, useState } from 'react'
import {
  categoriasMensagem,
  estimarCustoMensal,
  precoEmReais,
  type CategoriaMensagem,
  type TabelaPrecosWhatsApp,
} from '../../data/whatsappPricing'
import { formatBRL, formatUnitPrice } from '../../lib/format'

function PendingPrices() {
  return <p className="text-sm leading-relaxed text-slate-600">Respostas de serviço na janela de 24h são gratuitas, assim como avisos de utilidade enviados nessa janela. Valores das categorias pagas em reais aguardam conferência no CSV oficial da Meta.</p>
}

/** A frase que substitui o "a partir de $0,0002": o que é grátis e o que custa. */
export function PriceSummary({ tabela }: { tabela: TabelaPrecosWhatsApp }) {
  if (!tabela.conferidaNoCsvOficial) return <PendingPrices />
  return (
    <p className="text-[15px] leading-relaxed text-slate-700">
      Mensagens que seus clientes enviam são <strong className="font-semibold text-slate-900">grátis</strong>. Respostas:{' '}
      gratuitas na janela de 24h. Avisos de entrega fora dessa janela:{' '}
      {formatUnitPrice(precoEmReais(tabela, 'utilidade'))}. Promoções: {formatBRL(precoEmReais(tabela, 'marketing'))}.
    </p>
  )
}

export function PriceTable({ tabela }: { tabela: TabelaPrecosWhatsApp }) {
  if (!tabela.conferidaNoCsvOficial) return <PendingPrices />
  return (
    <div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {categoriasMensagem.map((categoria) => (
          <li key={categoria.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{categoria.nome}</p>
              <p className="text-xs leading-snug text-slate-500">{categoria.quando}</p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatUnitPrice(precoEmReais(tabela, categoria.id))}</p>
          </li>
        ))}
        <li className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Recebidas do cliente</p>
            <p className="text-xs leading-snug text-slate-500">Sempre</p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-emerald-700">Grátis</p>
        </li>
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Preço por mensagem entregue, para números do Brasil (+55). Serviço e utilidade na janela de atendimento de 24h são gratuitos.
        O simulador considera avisos fora dessa janela e não inclui descontos por volume nem entradas gratuitas de anúncios.
      </p>
    </div>
  )
}

const campos: { id: Extract<CategoriaMensagem, 'utilidade' | 'servico' | 'marketing'>; label: string; hint: string }[] = [
  { id: 'utilidade', label: 'Avisos por mês', hint: 'Avisos fora da janela de atendimento de 24h' },
  { id: 'servico', label: 'Respostas por mês', hint: 'Texto livre dentro da janela de 24h' },
  { id: 'marketing', label: 'Promoções por mês', hint: 'Campanhas e newsletter' },
]

/**
 * Simulador de custo mensal. Começa com o caso de uma transportadora: 500
 * avisos fora da janela e 3.000 respostas gratuitas. Só aparece após conferência oficial.
 */
export function CostSimulator({ tabela, numeros = 1 }: { tabela: TabelaPrecosWhatsApp; numeros?: number }) {
  const id = useId()
  const [volume, setVolume] = useState({ utilidade: 500, servico: 3000, marketing: 0 })
  const estimativa = estimarCustoMensal(tabela, { ...volume, numeros })
  if (!tabela.conferidaNoCsvOficial) return <PendingPrices />
  const nomes = Object.fromEntries(categoriasMensagem.map((categoria) => [categoria.id, categoria.nome]))

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-semibold text-slate-900">Quanto vou gastar por mês?</h4>
      <div className="mt-3 grid gap-3">
        {campos.map((campo) => (
          <label key={campo.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">{campo.label}</span>
              <span className="block text-xs leading-snug text-slate-500">{campo.hint}</span>
            </span>
            <input
              className="input text-right tabular-nums"
              type="number"
              inputMode="numeric"
              min={0}
              value={volume[campo.id]}
              aria-describedby={`${id}-total`}
              onChange={(event) => setVolume((current) => ({ ...current, [campo.id]: Number(event.target.value) }))}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3" aria-live="polite" id={`${id}-total`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-slate-600">Custo Meta estimado</span>
          <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatBRL(estimativa.total)}</span>
        </div>
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {estimativa.linhas
            .filter((linha) => linha.mensagens > 0)
            .map((linha) => (
              <li key={linha.categoria} className="flex justify-between gap-3">
                <span>
                  {nomes[linha.categoria]}: {linha.cobradas.toLocaleString('pt-BR')} cobrada(s)
                  {linha.categoria === 'servico' && linha.mensagens > linha.cobradas
                    ? ` (${(linha.mensagens - linha.cobradas).toLocaleString('pt-BR')} grátis)`
                    : ''}
                </span>
                <span className="tabular-nums">{formatBRL(linha.valor)}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}

