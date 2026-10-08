import { useEffect, useMemo, useState } from 'react'
import { Send, Wand2 } from 'lucide-react'
import {
  createCampaign,
  getAutomation,
  previewCampaign,
  scheduleCampaign,
  sendCampaign,
  sendCampaignTest,
  updateCampaign,
  uploadCampaignImage,
  type CampaignDraft,
  type NewsletterOverview,
} from '../../../lib/mail'
import { writeCampaign } from '../../../lib/ai'
import { FORMAT_LABEL, tagLabel } from './labels'
import { Chip, Field } from './ui'


type Props = {
  overview: NewsletterOverview | null
  draft: CampaignDraft
  setDraft: (draft: CampaignDraft) => void
  campaignId: string | null
  setCampaignId: (id: string | null) => void
  onSent: () => void
  onChange: () => void
  ok: (mensagem: string) => void
  fail: (erro: unknown, alternativa: string) => void
}

/**
 * Compositor da campanha.
 *
 * A prévia vem do servidor, renderizada pelo mesmo código que envia — o que
 * aparece na tela é exatamente o que sai, inclusive o rodapé de descadastro.
 */
function CampaignTab({ overview, draft, setDraft, campaignId, setCampaignId, onSent, onChange, ok, fail }: Props) {
  const [preview, setPreview] = useState({ html: '', recipients: 0 })
  const [testTo, setTestTo] = useState('')
  const [quando, setQuando] = useState('')
  const [briefing, setBriefing] = useState('')
  const [alternativas, setAlternativas] = useState<string[]>([])
  const [automacaoLigada, setAutomacaoLigada] = useState<boolean | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    getAutomation()
      .then((resultado) => setAutomacaoLigada(resultado.settings.enabled && !resultado.hardDisabled))
      .catch(() => setAutomacaoLigada(null))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      previewCampaign(draft)
        .then((result) => setPreview({ html: result.html, recipients: result.recipients }))
        .catch(() => setPreview({ html: '', recipients: 0 }))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [draft])

  const audienceLabel = useMemo(
    () => (draft.audienceTags.length === 0 ? 'todos os inscritos' : draft.audienceTags.map(tagLabel).join(', ')),
    [draft.audienceTags],
  )

  async function persist(): Promise<string> {
    if (campaignId) {
      await updateCampaign(campaignId, draft)
      return campaignId
    }
    const criada = await createCampaign(draft)
    setCampaignId(criada.campaign.id)
    return criada.campaign.id
  }

  async function salvar() {
    setBusy('save')
    try {
      await persist()
      ok('Rascunho salvo.')
      onChange()
    } catch (caught) {
      fail(caught, 'Não foi possível salvar.')
    } finally {
      setBusy('')
    }
  }

  async function testar() {
    setBusy('test')
    try {
      const id = await persist()
      const resultado = await sendCampaignTest(id, testTo)
      ok(`Teste enviado para ${resultado.to}.`)
    } catch (caught) {
      fail(caught, 'Não foi possível enviar o teste.')
    } finally {
      setBusy('')
    }
  }

  /**
   * Entrega a campanha ao motor: sem data, ele comeca no proximo ciclo; com
   * data, espera a hora. O envio em si sai em lotes, no ritmo configurado - e
   * por isso que nao existe mais "mandar tudo de uma vez" por acidente.
   */
  async function enfileirar() {
    const alvo = quando ? `agendar para ${new Date(quando).toLocaleString('pt-BR')}` : 'colocar na fila de envio'
    if (!window.confirm(`Confirmar ${alvo}? Sao ${preview.recipients} contato(s) - ${audienceLabel}.`)) return

    setBusy('queue')
    try {
      const id = await persist()
      const resultado = await scheduleCampaign(id, quando ? new Date(quando).toISOString() : undefined)
      ok(
        quando
          ? `Agendada para ${new Date(quando).toLocaleString('pt-BR')} - ${resultado.recipients} destinatario(s).`
          : automacaoLigada
            ? `Na fila - o motor comeca em ate um minuto, ${resultado.recipients} destinatario(s).`
            : `Na fila, mas a automacao esta desligada: ligue na aba Automacao ou use "enviar um lote agora".`,
      )
      onSent()
    } catch (caught) {
      fail(caught, 'Nao foi possivel agendar.')
    } finally {
      setBusy('')
    }
  }

  /** Saida manual de um lote - util quando a automacao esta desligada. */
  async function enviarLoteAgora() {
    if (!window.confirm('Enviar um lote agora, sem esperar o motor?')) return
    setBusy('send')
    try {
      const id = await persist()
      const { result } = await sendCampaign(id)
      ok(
        result.remaining > 0
          ? `${result.sent} enviados, ${result.failed} falhas. Faltam ${result.remaining}.`
          : `Envio concluido: ${result.sent} enviados, ${result.failed} falhas.`,
      )
      onSent()
    } catch (caught) {
      fail(caught, 'Nao foi possivel enviar.')
    } finally {
      setBusy('')
    }
  }

  /**
   * Escreve a campanha com o agente. O texto entra como rascunho no formato
   * "mensagem": e ponto de partida para editar, nao e para sair como veio.
   */
  async function escreverComIa() {
    setBusy('ia')
    try {
      const resultado = await writeCampaign(briefing, audienceLabel)
      setDraft({
        ...draft,
        format: 'text',
        subject: resultado.subject || draft.subject,
        previewText: resultado.previewText || draft.previewText,
        text: resultado.body,
        name: draft.name || resultado.subject,
      })
      setAlternativas(resultado.alternatives)
      ok('Rascunho escrito pelo agente. Revise antes de enviar.')
    } catch (caught) {
      fail(caught, 'O agente nao conseguiu escrever.')
    } finally {
      setBusy('')
    }
  }

  async function enviarImagem(file: File) {
    setBusy('upload')
    try {
      const resultado = await uploadCampaignImage(file)
      setDraft({ ...draft, imageUrl: resultado.url })
      ok('Imagem enviada.')
    } catch (caught) {
      fail(caught, 'Falha no envio da imagem.')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="space-y-4 rounded border border-slate-200 bg-white p-4">
      {campaignId && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Editando um rascunho já salvo. Salvar sobrescreve o que está guardado.
        </p>
      )}

      {automacaoLigada === false && (
        <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          A automação está desligada: campanha agendada fica esperando. Ligue na aba Automação para o motor despachar
          sozinho, no ritmo configurado.
        </p>
      )}

      <div className="space-y-2 rounded border border-violet-200 bg-violet-50 p-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-violet-800">Escrever com o agente de IA</span>
          <textarea
            className="h-16 w-full rounded border border-violet-200 p-2 text-sm outline-none focus:border-violet-400"
            value={briefing}
            onChange={(event) => setBriefing(event.target.value)}
            placeholder="Do que esta edicao fala? Ex.: empresa que nao sabe quem cuida do proprio site, com as cinco perguntas do diagnostico."
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="flex items-center gap-2 rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void escreverComIa()}
            disabled={busy === 'ia' || briefing.trim().length < 10}
          >
            <Wand2 size={14} /> {busy === 'ia' ? 'Escrevendo…' : 'Escrever rascunho'}
          </button>
          <span className="text-xs text-violet-800">
            Vira rascunho em texto, para voce editar. Configure a chave em Agente de IA.
          </span>
        </div>
        {alternativas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-violet-800">Outros assuntos:</span>
            {alternativas.map((opcao) => (
              <button
                key={opcao}
                className="rounded-full border border-violet-300 bg-white px-3 py-1 text-violet-700"
                onClick={() => setDraft({ ...draft, subject: opcao })}
              >
                {opcao}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nome interno"
          value={draft.name}
          onChange={(valor) => setDraft({ ...draft, name: valor })}
          placeholder="Quem cuida do seu site — agosto"
        />
        <Field
          label="Assunto"
          value={draft.subject}
          onChange={(valor) => setDraft({ ...draft, subject: valor })}
          placeholder="Você ainda sabe quem cuida do seu site?"
        />
      </div>

      <Field
        label="Texto de prévia"
        value={draft.previewText}
        onChange={(valor) => setDraft({ ...draft, previewText: valor })}
        placeholder="A linha curta que aparece depois do assunto na caixa de entrada"
      />

      <div className="flex flex-wrap gap-2">
        {(['html', 'text', 'image'] as const).map((formato) => (
          <Chip key={formato} active={draft.format === formato} onClick={() => setDraft({ ...draft, format: formato })}>
            {FORMAT_LABEL[formato]}
          </Chip>
        ))}
      </div>

      {draft.format === 'html' && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">HTML da campanha</span>
          <textarea
            className="h-64 w-full rounded border border-slate-200 p-3 font-mono text-xs outline-none focus:border-blue-400"
            value={draft.html}
            onChange={(event) => setDraft({ ...draft, html: event.target.value })}
            placeholder="<!doctype html> … cole aqui o e-mail pronto"
          />
          <span className="text-xs text-slate-500">
            Use {'{{unsubscribe}}'} onde quiser o link de descadastro. Sem o marcador, entra um rodapé automático.
          </span>
        </label>
      )}

      {draft.format === 'text' && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Mensagem</span>
          <textarea
            className="h-56 w-full rounded border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
            value={draft.text}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            placeholder="Escreva como escreveria um e-mail. Linha em branco vira parágrafo."
          />
        </label>
      )}

      {draft.format === 'image' && (
        <div className="space-y-3">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void enviarImagem(file)
            }}
          />
          {busy === 'upload' && <p className="text-xs text-slate-500">Enviando imagem…</p>}
          {draft.imageUrl && <img className="max-w-xs rounded border border-slate-200" src={draft.imageUrl} alt="Prévia" />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Texto alternativo" value={draft.imageAlt} onChange={(valor) => setDraft({ ...draft, imageAlt: valor })} />
            <Field label="Link ao clicar" value={draft.imageLinkUrl} onChange={(valor) => setDraft({ ...draft, imageLinkUrl: valor })} />
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">Público</p>
        <div className="flex flex-wrap gap-2">
          <Chip active={draft.audienceTags.length === 0} onClick={() => setDraft({ ...draft, audienceTags: [] })}>
            Todos os inscritos
          </Chip>
          {(overview?.tags ?? []).map((item) => (
            <Chip
              key={item.tag}
              active={draft.audienceTags.includes(item.tag)}
              onClick={() =>
                setDraft({
                  ...draft,
                  audienceTags: draft.audienceTags.includes(item.tag)
                    ? draft.audienceTags.filter((tag) => tag !== item.tag)
                    : [...draft.audienceTags, item.tag],
                })
              }
            >
              {tagLabel(item.tag)} · {item.count}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Marcar mais de uma etiqueta soma os públicos. Quem estiver descadastrado fica de fora de qualquer combinação.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">Prévia — renderizada pelo mesmo código que envia</p>
        <iframe title="Prévia da campanha" className="h-96 w-full rounded border border-slate-200 bg-white" srcDoc={preview.html} sandbox="" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Enviar teste para" value={testTo} onChange={setTestTo} placeholder="nicolas@avilaops.com" />
        <button className="rounded border border-slate-200 px-4 py-2 text-sm disabled:opacity-50" onClick={() => void salvar()} disabled={busy === 'save'}>
          {busy === 'save' ? 'Salvando…' : 'Salvar rascunho'}
        </button>
        <button className="rounded border border-slate-200 px-4 py-2 text-sm disabled:opacity-50" onClick={() => void testar()} disabled={busy === 'test' || !testTo.trim()}>
          {busy === 'test' ? 'Enviando…' : 'Enviar teste'}
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Agendar para (vazio = assim que possível)</span>
          <input
            className="rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            type="datetime-local"
            value={quando}
            onChange={(event) => setQuando(event.target.value)}
          />
        </label>
        <button
          className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void enfileirar()}
          disabled={busy === 'queue' || preview.recipients === 0}
        >
          <Send size={14} />
          {busy === 'queue' ? 'Agendando…' : quando ? 'Agendar envio' : `Enviar para ${preview.recipients}`}
        </button>
        <button
          className="rounded border border-slate-200 px-4 py-2 text-xs text-slate-600 disabled:opacity-50"
          onClick={() => void enviarLoteAgora()}
          disabled={busy === 'send' || preview.recipients === 0}
          title="Manda um lote na hora, sem passar pelo motor"
        >
          {busy === 'send' ? 'Enviando…' : 'enviar um lote agora'}
        </button>
      </div>
    </section>
  )
}

export default CampaignTab
