import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { FormField, FormSection, Notice, StickyActionBar, ToggleRow } from '../../components/ui/Form'
import type { Tone } from '../../lib/connection'
import { getTenantSettings, updateTenantSettings, type TenantSettings } from '../../lib/crm'
import { buttonClass } from '../../lib/ui'
import { useFormState } from '../../lib/useFormState'
import type { SettingsPage } from '../../types'
import { SettingsFrame } from './SettingsFrame'

type Feedback = { tone: Tone; text: string } | null

/**
 * Um pedaço de `tenant_settings` editado numa tela.
 *
 * Geral, Regras de atendimento e Agente de IA gravam na mesma linha, cada uma
 * com os próprios campos: `pick` tira o pedaço da tela, `toPatch` devolve só
 * ele no PATCH — salvar o horário não reescreve a instrução da IA.
 */
function useSettingsSection<T>(pick: (settings: TenantSettings) => T, toPatch: (form: T) => Partial<TenantSettings>) {
  const { form, setForm, dirty, load, reset } = useFormState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // `pick` é uma função de módulo e `load` é estável: carrega uma vez.
  useEffect(() => {
    getTenantSettings()
      .then((result) => load(pick(result.settings)))
      .catch((error: Error) => setFeedback({ tone: 'danger', text: error.message }))
      .finally(() => setLoading(false))
  }, [pick, load])

  const update = (patch: Partial<T>) => setForm((current) => (current ? { ...current, ...patch } : current))

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateTenantSettings(toPatch(form))
      load(pick(result.settings))
      setFeedback({ tone: 'success', text: 'Alterações salvas.' })
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível salvar.' })
    } finally {
      setSaving(false)
    }
  }

  return { form, update, dirty, reset, loading, saving, feedback, save }
}

function SectionForm({
  page,
  title,
  description,
  section,
  children,
}: {
  page: SettingsPage
  title: string
  description?: string
  section: { loading: boolean; saving: boolean; dirty: boolean; feedback: Feedback; reset: () => void; save: (event: FormEvent) => void }
  children: ReactNode
}) {
  return (
    <SettingsFrame page={page} title={title} description={description}>
      {section.loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <form onSubmit={section.save} className="space-y-5">
          {section.feedback && <Notice tone={section.feedback.tone}>{section.feedback.text}</Notice>}
          {children}
          <StickyActionBar visible={section.dirty}>
            <button type="button" className={buttonClass.secondary} onClick={section.reset}>
              Descartar
            </button>
            <button type="submit" className={buttonClass.primary} disabled={section.saving}>
              {section.saving ? 'Salvando…' : 'Salvar'}
            </button>
          </StickyActionBar>
        </form>
      )}
    </SettingsFrame>
  )
}

// ── Geral ────────────────────────────────────────────────────────────────────

type GeneralForm = {
  workspace_name: string
  cnpj: string
  phone: string
  email: string
  address: string
  timezone: string
  currency: string
  start: string
  end: string
  days: number[]
  hoursEnabled: boolean
}

const pickGeneral = (settings: TenantSettings): GeneralForm => ({
  workspace_name: settings.workspace_name ?? '',
  cnpj: settings.cnpj ?? '',
  phone: settings.phone ?? '',
  email: settings.email ?? '',
  address: settings.address ?? '',
  timezone: settings.timezone || 'America/Sao_Paulo',
  currency: settings.currency || 'BRL',
  start: settings.business_hours?.start || '08:00',
  end: settings.business_hours?.end || '18:00',
  days: settings.business_hours?.days?.length ? [...settings.business_hours.days].sort((a, b) => a - b) : [1, 2, 3, 4, 5],
  hoursEnabled: settings.business_hours?.enabled ?? true,
})

const generalPatch = (form: GeneralForm): Partial<TenantSettings> => ({
  workspace_name: form.workspace_name.trim(),
  cnpj: form.cnpj.trim() || null,
  phone: form.phone.trim() || null,
  email: form.email.trim() || null,
  address: form.address.trim() || null,
  timezone: form.timezone,
  currency: form.currency,
  // Antes os dias iam sempre como segunda a sexta, apagando o sábado de quem
  // abre no sábado. Agora vai o que está marcado na tela.
  business_hours: { enabled: form.hoursEnabled, start: form.start, end: form.end, days: form.days },
})

const weekDays = [
  { value: 1, short: 'Seg', label: 'Segunda' },
  { value: 2, short: 'Ter', label: 'Terça' },
  { value: 3, short: 'Qua', label: 'Quarta' },
  { value: 4, short: 'Qui', label: 'Quinta' },
  { value: 5, short: 'Sex', label: 'Sexta' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 0, short: 'Dom', label: 'Domingo' },
]

const timezones = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC−3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC−4)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (UTC−4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (UTC−5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC−2)' },
  { value: 'UTC', label: 'UTC' },
]

export function GeneralSettings() {
  const section = useSettingsSection(pickGeneral, generalPatch)
  const { form, update } = section

  return (
    <SectionForm page="workspace-settings" title="Geral" section={section}>
      {form && (
        <>
          <FormSection title="Empresa" description="Aparece nas mensagens, nos e-mails e nos documentos gerados pelo CRM.">
            <FormField label="Nome da empresa">
              <input className="input" required value={form.workspace_name} onChange={(event) => update({ workspace_name: event.target.value })} autoComplete="organization" />
            </FormField>
            <div className="grid gap-4 medium:grid-cols-2">
              <FormField label="CNPJ">
                <input className="input" inputMode="numeric" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={(event) => update({ cnpj: event.target.value })} />
              </FormField>
              <FormField label="Telefone comercial">
                <input className="input" type="tel" inputMode="tel" placeholder="(11) 3333-4444" value={form.phone} onChange={(event) => update({ phone: event.target.value })} autoComplete="tel" />
              </FormField>
            </div>
            <FormField label="E-mail comercial">
              <input className="input" type="email" inputMode="email" placeholder="contato@suaempresa.com.br" value={form.email} onChange={(event) => update({ email: event.target.value })} autoComplete="email" />
            </FormField>
            <FormField label="Endereço">
              <input className="input" placeholder="Rua, número — cidade, UF" value={form.address} onChange={(event) => update({ address: event.target.value })} autoComplete="street-address" />
            </FormField>
          </FormSection>

          <FormSection title="Horário de atendimento" description="Fora dele, o cliente recebe a mensagem de ausência das Regras de atendimento.">
            <ToggleRow
              checked={form.hoursEnabled}
              onChange={(hoursEnabled) => update({ hoursEnabled })}
              title="Usar horário de atendimento"
              description="Desligado, o CRM trata qualquer hora como horário comercial."
            />
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Dias</legend>
              <div className="flex flex-wrap gap-2">
                {weekDays.map((day) => {
                  const active = form.days.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={active}
                      aria-label={day.label}
                      onClick={() => update({ days: active ? form.days.filter((value) => value !== day.value) : [...form.days, day.value].sort((a, b) => a - b) })}
                      className={`min-h-11 min-w-12 rounded-lg border px-3 text-sm font-medium transition ${
                        active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600'
                      }`}
                    >
                      {day.short}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Abre às">
                <input className="input" type="time" value={form.start} onChange={(event) => update({ start: event.target.value })} />
              </FormField>
              <FormField label="Fecha às">
                <input className="input" type="time" value={form.end} onChange={(event) => update({ end: event.target.value })} />
              </FormField>
            </div>
            <div className="grid gap-4 medium:grid-cols-2">
              <FormField label="Fuso horário">
                <select className="input" value={form.timezone} onChange={(event) => update({ timezone: event.target.value })}>
                  {timezones.map((zone) => (
                    <option key={zone.value} value={zone.value}>{zone.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Moeda">
                <select className="input" value={form.currency} onChange={(event) => update({ currency: event.target.value })}>
                  <option value="BRL">Real (R$)</option>
                  <option value="USD">Dólar americano (US$)</option>
                </select>
              </FormField>
            </div>
          </FormSection>
        </>
      )}
    </SectionForm>
  )
}

// ── Regras de atendimento ─────────────────────────────────────────────────────

type ServiceForm = { welcome_message: string; away_message: string; auto_assign: boolean; sla_minutes: number }

const pickService = (settings: TenantSettings): ServiceForm => ({
  welcome_message: settings.welcome_message ?? '',
  away_message: settings.away_message ?? '',
  auto_assign: settings.auto_assign ?? true,
  sla_minutes: settings.sla_minutes || 15,
})

const servicePatch = (form: ServiceForm): Partial<TenantSettings> => ({
  welcome_message: form.welcome_message.trim() || null,
  away_message: form.away_message.trim() || null,
  auto_assign: form.auto_assign,
  sla_minutes: Math.min(1440, Math.max(1, Math.round(Number(form.sla_minutes) || 15))),
})

export function ServiceRulesSettings() {
  const section = useSettingsSection(pickService, servicePatch)
  const { form, update } = section

  return (
    <SectionForm
      page="chat-settings"
      title="Regras de atendimento"
      description="Valem para todas as conversas que chegam pelos canais da empresa."
      section={section}
    >
      {form && (
        <>
          <FormSection title="Mensagens automáticas">
            <FormField label="Boas-vindas" hint="Vai para quem escreve pela primeira vez. Cumprimente e pergunte o que a pessoa precisa.">
              <textarea
                className="input"
                rows={3}
                value={form.welcome_message}
                placeholder="Olá! Que bom falar com você. Me conta o que você precisa?"
                onChange={(event) => update({ welcome_message: event.target.value })}
              />
            </FormField>
            <FormField label="Ausência" hint="Vai para quem escreve fora do horário de atendimento.">
              <textarea
                className="input"
                rows={3}
                value={form.away_message}
                placeholder="Nosso atendimento é de segunda a sexta, das 8h às 18h. Respondemos assim que abrirmos."
                onChange={(event) => update({ away_message: event.target.value })}
              />
            </FormField>
          </FormSection>

          <FormSection title="Distribuição e prazo">
            <ToggleRow
              checked={form.auto_assign}
              onChange={(auto_assign) => update({ auto_assign })}
              title="Distribuir conversas novas automaticamente"
              description="Uma por vez, entre os atendentes ativos."
            />
            <FormField label="Prazo da primeira resposta (minutos)" hint="Depois disso a conversa aparece como SLA vencido no inbox.">
              <input
                className="input max-w-40"
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                value={form.sla_minutes}
                onChange={(event) => update({ sla_minutes: Number(event.target.value) })}
              />
            </FormField>
          </FormSection>
        </>
      )}
    </SectionForm>
  )
}

// ── Agente de IA ──────────────────────────────────────────────────────────────

type AiForm = { ai_copilot_enabled: boolean; ai_autonomous_reply: boolean; ai_tone: string; ai_custom_instructions: string }

const pickAi = (settings: TenantSettings): AiForm => ({
  ai_copilot_enabled: settings.ai_copilot_enabled ?? true,
  ai_autonomous_reply: settings.ai_autonomous_reply ?? false,
  ai_tone: settings.ai_tone || 'consultivo',
  ai_custom_instructions: settings.ai_custom_instructions ?? '',
})

const aiPatch = (form: AiForm): Partial<TenantSettings> => ({
  ai_copilot_enabled: form.ai_copilot_enabled,
  ai_autonomous_reply: form.ai_autonomous_reply,
  ai_tone: form.ai_tone,
  ai_custom_instructions: form.ai_custom_instructions.trim() || null,
})

export function AiSettings() {
  const section = useSettingsSection(pickAi, aiPatch)
  const { form, update } = section

  return (
    <SectionForm page="ai-settings" title="Agente de IA" section={section}>
      {form && (
        <>
          <FormSection title="Como a IA trabalha">
            <ToggleRow
              checked={form.ai_copilot_enabled}
              onChange={(ai_copilot_enabled) => update({ ai_copilot_enabled })}
              title="Sugerir respostas ao atendente"
              description="A IA escreve um rascunho; o atendente revisa e envia."
            />
            <ToggleRow
              checked={form.ai_autonomous_reply}
              onChange={(ai_autonomous_reply) => update({ ai_autonomous_reply })}
              title="Responder sozinha (recepcionista com IA)"
              description="Responde dúvidas frequentes 24h por dia com a Base de conhecimento e passa para um atendente quando precisar."
            />
          </FormSection>

          <FormSection title="Jeito de falar">
            <FormField label="Tom de voz">
              <select className="input" value={form.ai_tone} onChange={(event) => update({ ai_tone: event.target.value })}>
                <option value="consultivo">Consultivo, para vendas</option>
                <option value="amigavel">Amigável e descontraído</option>
                <option value="formal">Formal</option>
                <option value="tecnico">Técnico e preciso</option>
              </select>
            </FormField>
            <FormField label="Instruções" hint="Como apresentar a empresa, o que perguntar antes de passar para um atendente, o que nunca prometer.">
              <textarea
                className="input"
                rows={6}
                value={form.ai_custom_instructions}
                onChange={(event) => update({ ai_custom_instructions: event.target.value })}
              />
            </FormField>
          </FormSection>
        </>
      )}
    </SectionForm>
  )
}
