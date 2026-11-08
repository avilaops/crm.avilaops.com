import { useCallback, useEffect, useState } from 'react'
import { newsletterOverview, type CampaignDraft, type NewsletterOverview } from '../../../lib/mail'
import Topbar from '../../../components/layout/Topbar'
import AutomationTab from './AutomationTab'
import CampaignTab from './CampaignTab'
import ContactsTab from './ContactsTab'
import HistoryTab from './HistoryTab'
import SignupsTab from './SignupsTab'
import { EMPTY_DRAFT } from './labels'
import { Chip } from './ui'

type Aba = 'contatos' | 'captacao' | 'campanha' | 'historico' | 'automacao'

/**
 * Casca da newsletter: métricas, abas e o recado de erro/sucesso que as três
 * abas compartilham. Cada aba cuida do próprio estado — a base tem milhares de
 * contatos e o compositor guarda um rascunho inteiro; juntar tudo num arquivo
 * só tornaria qualquer mudança arriscada.
 */
function NewsletterPage() {
  const [aba, setAba] = useState<Aba>('contatos')
  const [overview, setOverview] = useState<NewsletterOverview | null>(null)
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')

  const carregar = useCallback(async () => {
    try {
      setOverview(await newsletterOverview())
    } catch (caught) {
      setErro(caught instanceof Error ? caught.message : 'Falha ao carregar a newsletter.')
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const ok = useCallback((mensagem: string) => {
    setRecado(mensagem)
    setErro('')
  }, [])

  const fail = useCallback((caught: unknown, alternativa: string) => {
    setErro(caught instanceof Error ? caught.message : alternativa)
    setRecado('')
  }, [])

  function editarCampanha(rascunho: CampaignDraft, id: string) {
    setDraft(rascunho)
    setCampaignId(id)
    setAba('campanha')
    ok('Campanha aberta para edição.')
  }

  function novaCampanha() {
    setDraft(EMPTY_DRAFT)
    setCampaignId(null)
    setAba('campanha')
  }

  const metrics = overview?.metrics ?? { subscribed: 0, unsubscribed: 0, total: 0 }

  return (
    <div>
      <Topbar title="Newsletter" tab={`${metrics.subscribed} inscrito(s)`} />
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Inscritos', metrics.subscribed, 'recebem a próxima campanha'],
            ['Descadastrados', metrics.unsubscribed, 'não voltam por importação'],
            ['Com e-mail', metrics.total, 'contatos com endereço'],
          ].map(([label, valor, dica]) => (
            <div key={String(label)} className="rounded border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-400">{label}</p>
              <p className="text-2xl font-semibold">{valor}</p>
              <p className="text-xs text-slate-500">{dica}</p>
            </div>
          ))}
        </div>

        {erro && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}
        {recado && <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{recado}</p>}

        <div className="flex flex-wrap gap-2">
          <Chip active={aba === 'contatos'} onClick={() => setAba('contatos')}>Contatos</Chip>
          <Chip active={aba === 'captacao'} onClick={() => setAba('captacao')}>Captação</Chip>
          <Chip active={aba === 'campanha'} onClick={() => setAba('campanha')}>
            {campaignId ? 'Campanha em edição' : 'Nova campanha'}
          </Chip>
          <Chip active={aba === 'historico'} onClick={() => setAba('historico')}>Histórico</Chip>
          <Chip active={aba === 'automacao'} onClick={() => setAba('automacao')}>Automação</Chip>
          {campaignId && (
            <button className="text-xs text-slate-500 underline" onClick={novaCampanha}>
              começar do zero
            </button>
          )}
        </div>

        {aba === 'contatos' && <ContactsTab overview={overview} onChange={carregar} ok={ok} fail={fail} />}

        {aba === 'campanha' && (
          <CampaignTab
            overview={overview}
            draft={draft}
            setDraft={setDraft}
            campaignId={campaignId}
            setCampaignId={setCampaignId}
            onChange={carregar}
            onSent={() => {
              setDraft(EMPTY_DRAFT)
              setCampaignId(null)
              setAba('historico')
              void carregar()
            }}
            ok={ok}
            fail={fail}
          />
        )}

        {aba === 'historico' && (
          <HistoryTab overview={overview} onEdit={editarCampanha} onChange={carregar} ok={ok} fail={fail} />
        )}

        {aba === 'captacao' && <SignupsTab ok={ok} fail={fail} />}

        {aba === 'automacao' && <AutomationTab ok={ok} fail={fail} />}
      </div>
    </div>
  )
}

export default NewsletterPage
