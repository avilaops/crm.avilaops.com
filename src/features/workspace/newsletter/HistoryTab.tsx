import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import {
  deleteCampaign,
  getCampaign,
  listDeliveries,
  pauseCampaign,
  sendCampaign,
  type CampaignDraft,
  type Delivery,
  type NewsletterOverview,
} from '../../../lib/mail'
import { FORMAT_LABEL, formatDate, tagLabel } from './labels'
import { StatusBadge } from './ui'

type Props = {
  overview: NewsletterOverview | null
  onEdit: (draft: CampaignDraft, id: string) => void
  onChange: () => void
  ok: (mensagem: string) => void
  fail: (erro: unknown, alternativa: string) => void
}

/**
 * Histórico das campanhas.
 *
 * Abrir uma campanha mostra as entregas, uma linha por destinatário, com o
 * erro de quem falhou. Sem isso, "12 falhas" não diz nada e ninguém consegue
 * corrigir endereço errado.
 */
function HistoryTab({ overview, onEdit, onChange, ok, fail }: Props) {
  const [aberta, setAberta] = useState<string | null>(null)
  const [entregas, setEntregas] = useState<Delivery[]>([])
  const [resumo, setResumo] = useState<Record<string, number>>({})
  const [filtro, setFiltro] = useState<'todos' | 'sent' | 'failed' | 'pending' | 'skipped'>('todos')
  const [busy, setBusy] = useState('')

  async function abrir(id: string, status = filtro) {
    if (aberta === id && status === filtro) {
      setAberta(null)
      return
    }
    setBusy(`open-${id}`)
    try {
      const resultado = await listDeliveries(id, status)
      setEntregas(resultado.deliveries)
      setResumo(resultado.summary)
      setFiltro(status)
      setAberta(id)
    } catch (caught) {
      fail(caught, 'Falha ao carregar as entregas.')
    } finally {
      setBusy('')
    }
  }

  async function editar(id: string) {
    setBusy(`edit-${id}`)
    try {
      const { campaign } = await getCampaign(id)
      onEdit(
        {
          name: campaign.name,
          subject: campaign.subject,
          previewText: campaign.preview_text ?? '',
          format: campaign.format,
          html: campaign.html ?? '',
          text: campaign.body_text ?? '',
          imageUrl: campaign.image_url ?? '',
          imageAlt: campaign.image_alt ?? '',
          imageLinkUrl: campaign.image_link_url ?? '',
          audienceTags: campaign.audience_tags,
        },
        campaign.id,
      )
    } catch (caught) {
      fail(caught, 'Falha ao abrir a campanha.')
    } finally {
      setBusy('')
    }
  }

  async function apagar(id: string, nome: string) {
    if (!window.confirm(`Apagar o rascunho "${nome}"?`)) return
    setBusy(`del-${id}`)
    try {
      await deleteCampaign(id)
      ok('Rascunho apagado.')
      onChange()
    } catch (caught) {
      fail(caught, 'Só rascunho pode ser apagado.')
    } finally {
      setBusy('')
    }
  }

  async function pausar(id: string) {
    setBusy(`pause-${id}`)
    try {
      await pauseCampaign(id)
      ok('Campanha pausada.')
      onChange()
    } catch (caught) {
      fail(caught, 'Não foi possível pausar.')
    } finally {
      setBusy('')
    }
  }

  async function continuar(id: string) {
    if (!window.confirm('Continuar o envio desta campanha?')) return
    setBusy(`send-${id}`)
    try {
      const { result } = await sendCampaign(id)
      ok(
        result.remaining > 0
          ? `${result.sent} enviados, ${result.failed} falhas. Ainda faltam ${result.remaining}.`
          : `Envio concluído: ${result.sent} enviados, ${result.failed} falhas.`,
      )
      onChange()
      if (aberta === id) await abrir(id, filtro)
    } catch (caught) {
      fail(caught, 'Não foi possível continuar o envio.')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase text-slate-500">Campanhas</header>
      <div className="divide-y divide-slate-100">
        {(overview?.campaigns ?? []).map((campaign) => (
          <div key={campaign.id}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button className="text-slate-400" onClick={() => void abrir(campaign.id)} aria-label="Ver entregas">
                {aberta === campaign.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{campaign.name}</p>
                <p className="truncate text-xs text-slate-500">{campaign.subject}</p>
                <p className="text-xs text-slate-400">
                  {FORMAT_LABEL[campaign.format] ?? campaign.format} ·{' '}
                  {campaign.audience_tags.length === 0 ? 'todos os inscritos' : campaign.audience_tags.map(tagLabel).join(', ')} ·{' '}
                  {formatDate(campaign.created_at)}
                </p>
              </div>
              <div className="text-xs text-slate-500">
                <p>{campaign.sent_count} enviados</p>
                <p>{campaign.failed_count} falhas</p>
              </div>
              <StatusBadge status={campaign.status} />

              {(campaign.status === 'draft' || campaign.status === 'failed') && (
                <>
                  <button
                    className="flex items-center gap-1 text-xs text-blue-600 disabled:opacity-50"
                    onClick={() => void editar(campaign.id)}
                    disabled={busy === `edit-${campaign.id}`}
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    className="flex items-center gap-1 text-xs text-red-600 disabled:opacity-50"
                    onClick={() => void apagar(campaign.id, campaign.name)}
                    disabled={busy === `del-${campaign.id}`}
                  >
                    <Trash2 size={13} /> Apagar
                  </button>
                </>
              )}

              {(campaign.status === 'sending' || campaign.status === 'scheduled') && (
                <>
                  <button
                    className="text-xs text-blue-600 disabled:opacity-50"
                    onClick={() => void continuar(campaign.id)}
                    disabled={busy === `send-${campaign.id}`}
                  >
                    Enviar lote agora
                  </button>
                  <button
                    className="text-xs text-amber-700 disabled:opacity-50"
                    onClick={() => void pausar(campaign.id)}
                    disabled={busy === `pause-${campaign.id}`}
                  >
                    Pausar
                  </button>
                </>
              )}
              {campaign.status === 'paused' && (
                <button
                  className="text-xs text-emerald-700 disabled:opacity-50"
                  onClick={() => void continuar(campaign.id)}
                  disabled={busy === `send-${campaign.id}`}
                >
                  Retomar
                </button>
              )}
              {campaign.status === 'sent' && <span className="text-xs text-slate-400">{formatDate(campaign.sent_at)}</span>}
            </div>

            {aberta === campaign.id && (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                  {(['todos', 'sent', 'failed', 'pending', 'skipped'] as const).map((opcao) => (
                    <button
                      key={opcao}
                      className={`rounded-full border px-3 py-1 ${filtro === opcao ? 'border-blue-500 bg-white font-medium text-blue-700' : 'border-slate-200 text-slate-600'}`}
                      onClick={() => void abrir(campaign.id, opcao)}
                    >
                      {opcao === 'todos' ? 'Todas' : opcao === 'sent' ? 'Enviadas' : opcao === 'failed' ? 'Falhas' : opcao === 'pending' ? 'Na fila' : 'Puladas'}
                      {resumo[opcao] ? ` · ${resumo[opcao]}` : ''}
                    </button>
                  ))}
                  <span className="ml-auto text-slate-500">{entregas.length} linha(s)</span>
                </div>

                {entregas.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma entrega registrada — a campanha ainda não foi enviada.</p>
                ) : (
                  <div className="max-h-72 divide-y divide-slate-200 overflow-auto rounded border border-slate-200 bg-white">
                    {entregas.map((entrega) => (
                      <div key={entrega.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{entrega.contact_name ?? entrega.email}</p>
                          <p className="truncate text-xs text-slate-500">
                            {entrega.email}
                            {entrega.company ? ` · ${entrega.company}` : ''}
                          </p>
                          {entrega.error && <p className="truncate text-xs text-red-600">{entrega.error}</p>}
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(entrega.sent_at)}</span>
                        <StatusBadge status={entrega.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {(overview?.campaigns.length ?? 0) === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma campanha ainda.</p>}
      </div>
    </section>
  )
}

export default HistoryTab
