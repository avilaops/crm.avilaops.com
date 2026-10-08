import { Download, FileUp, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FormField, Notice } from '../ui/Form'
import { Sheet } from '../ui/Sheet'
import {
  IMPORT_FIELD_LABELS,
  LEGAL_BASIS_OPTIONS,
  listContactImports,
  previewContactImport,
  readTextFile,
  rejectionsToCsv,
  runContactImport,
  undoContactImport,
  type ImportField,
  type ImportHistoryItem,
  type ImportMapping,
  type ImportPreview,
  type ImportResult,
  type LegalBasis,
} from '../../lib/contactImport'
import { buttonClass } from '../../lib/ui'

const MAX_BYTES = 8 * 1024 * 1024
const FIELDS: ImportField[] = ['name', 'phone', 'email', 'company', 'tags']
type Step = 'arquivo' | 'colunas' | 'origem' | 'resumo'
const STEP_TITLES: Record<Step, string> = { arquivo: 'Arquivo', colunas: 'Colunas', origem: 'Origem e repetidos', resumo: 'Resumo' }
const STEPS: Step[] = ['arquivo', 'colunas', 'origem', 'resumo']
const quando = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Importar contatos de uma planilha (CSV) ou da agenda do celular (vCard).
 *
 * Quatro passos: arquivo, colunas, origem e resumo. Nada é gravado antes do
 * último botão do terceiro passo, e a prévia mostra os números antes disso. A
 * origem e a base legal são obrigatórias: é o registro que a LGPD pede e o que
 * impede uma lista comprada de entrar sem ninguém assumir de onde veio.
 */
export function ImportContactsSheet({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('arquivo')
  const [file, setFile] = useState<{ name: string; content: string } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [legalBasis, setLegalBasis] = useState<LegalBasis | ''>('')
  const [originNote, setOriginNote] = useState('')
  const [onDuplicate, setOnDuplicate] = useState<'update' | 'keep'>('update')
  const [tag, setTag] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [history, setHistory] = useState<ImportHistoryItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadHistory = () => listContactImports().then((data) => setHistory(data.imports)).catch(() => setHistory([]))

  useEffect(() => {
    if (!open) return
    setStep('arquivo')
    setFile(null)
    setPreview(null)
    setMapping({})
    setLegalBasis('')
    setOriginNote('')
    setOnDuplicate('update')
    setTag('')
    setResult(null)
    setError('')
    setNotice('')
    void loadHistory()
  }, [open])

  async function run<T>(work: () => Promise<T>) {
    setBusy(true)
    setError('')
    try {
      return await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function choose(selected: File | undefined) {
    if (!selected) return
    if (selected.size > MAX_BYTES) {
      setError('O arquivo passa de 8 MB. Divida a planilha em partes.')
      return
    }
    const content = await readTextFile(selected)
    const data = await run(() => previewContactImport({ fileName: selected.name, content }))
    if (!data) return
    setFile({ name: selected.name, content })
    setPreview(data)
    setMapping(data.mapping)
    setStep('colunas')
  }

  async function confirmColumns() {
    if (!file) return
    const data = await run(() => previewContactImport({ fileName: file.name, content: file.content, mapping }))
    if (!data) return
    setPreview(data)
    setStep('origem')
  }

  async function importNow() {
    if (!file || !legalBasis) return
    const data = await run(() =>
      runContactImport({ fileName: file.name, content: file.content, mapping, legalBasis, originNote: originNote.trim(), onDuplicate, tags: tag.trim() ? [tag.trim().toLowerCase()] : [] }),
    )
    if (!data) return
    setResult(data)
    setStep('resumo')
    onImported()
    void loadHistory()
  }

  async function undo(id: string) {
    if (!window.confirm('Desfazer esta importação? Os contatos que ela criou e que ninguém usou ainda serão apagados.')) return
    const data = await run(() => undoContactImport(id))
    if (!data) return
    const partes = [`${data.removed} contato(s) apagado(s)`]
    if (data.keptInUse > 0) partes.push(`${data.keptInUse} mantido(s) porque já têm conversa, negócio ou foram editados`)
    if (data.updatedNotReverted > 0) partes.push(`${data.updatedNotReverted} que já existiam continuam com o que a importação completou`)
    setNotice(`Importação desfeita: ${partes.join('; ')}.`)
    setResult(null)
    onImported()
    void loadHistory()
  }

  const hasKey = mapping.phone !== undefined || mapping.email !== undefined
  const totals = preview?.totals ?? null
  const canImport = Boolean(legalBasis) && originNote.trim().length >= 3 && Boolean(totals && totals.novos + totals.jaExistem > 0)

  const footer =
    step === 'colunas' ? (
      <div className="grid gap-2 medium:flex medium:justify-end">
        <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => setStep('arquivo')}>Trocar arquivo</button>
        <button type="button" className={buttonClass.primary} disabled={busy || !hasKey} onClick={confirmColumns}>{busy ? 'Conferindo…' : 'Continuar'}</button>
      </div>
    ) : step === 'origem' ? (
      <div className="grid gap-2 medium:flex medium:justify-end">
        <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => setStep('colunas')}>Voltar</button>
        <button type="button" className={buttonClass.primary} disabled={busy || !canImport} onClick={importNow}>
          {busy ? 'Importando…' : `Importar ${totals ? totals.novos + (onDuplicate === 'update' ? totals.jaExistem : 0) : ''} contato(s)`}
        </button>
      </div>
    ) : step === 'resumo' ? (
      <div className="grid gap-2 medium:flex medium:justify-end">
        <button type="button" className={buttonClass.primary} onClick={onClose}>Concluir</button>
      </div>
    ) : undefined

  return (
    <Sheet open={open} onClose={onClose} title="Importar contatos" description="De uma planilha (CSV) ou da agenda do celular (vCard, .vcf)." size="lg" footer={footer}>
      <div className="space-y-4 text-sm text-slate-700">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold" aria-label="Passos">
          {STEPS.map((item, index) => (
            <li key={item} className={item === step ? 'text-blue-700' : 'text-slate-400'} aria-current={item === step ? 'step' : undefined}>
              {index + 1}. {STEP_TITLES[item]}
            </li>
          ))}
        </ol>
        {error && <Notice tone="danger">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}

        {step === 'arquivo' && (
          <>
            <button
              type="button"
              className="grid w-full place-items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-blue-400 hover:bg-blue-50/40"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <FileUp size={28} className="text-slate-500" aria-hidden="true" />
              <span className="text-base font-semibold text-slate-900">{busy ? 'Lendo o arquivo…' : 'Escolher arquivo'}</span>
              <span className="text-slate-500">CSV ou vCard (.vcf), até 8 MB e 20 mil linhas.</span>
            </button>
            <input ref={input} type="file" accept=".csv,.vcf,.txt,text/csv,text/vcard" className="sr-only" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
            <ul className="list-disc space-y-1 pl-5 text-slate-600">
              <li>Planilha: salve como CSV. A primeira linha deve ter o nome das colunas.</li>
              <li>Google Contatos: Exportar › vCard. iPhone: Contatos › Listas › Exportar.</li>
              <li>Telefones sem código do país são tratados como do Brasil.</li>
            </ul>
            {history.length > 0 && (
              <section aria-labelledby="importacoes-titulo">
                <h3 id="importacoes-titulo" className="font-semibold text-slate-900">Últimas importações</h3>
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {history.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{item.file_name}</p>
                        <p className="text-xs text-slate-500">
                          {quando.format(new Date(item.created_at))} · {item.created_count} criados, {item.updated_count} completados
                          {item.user_name ? ` · ${item.user_name}` : ''}
                          {item.undone_at ? ' · desfeita' : ''}
                        </p>
                      </div>
                      {item.can_undo && (
                        <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => undo(item.id)}>
                          <Undo2 size={15} aria-hidden="true" />
                          Desfazer
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {step === 'colunas' && preview && (
          <>
            <p>
              {preview.kind === 'vcard' ? 'Os campos do vCard já vêm identificados.' : 'Confira qual coluna do arquivo é cada informação.'} É preciso telefone
              ou e-mail: sem um dos dois não há como falar com a pessoa.
            </p>
            <div className="grid gap-3 medium:grid-cols-2">
              {FIELDS.map((field) => (
                <FormField key={field} label={IMPORT_FIELD_LABELS[field]}>
                  <select
                    className="input"
                    value={mapping[field] ?? ''}
                    disabled={preview.kind === 'vcard'}
                    onChange={(event) => {
                      const next = { ...mapping }
                      if (event.target.value === '') delete next[field]
                      else next[field] = Number(event.target.value)
                      setMapping(next)
                    }}
                  >
                    <option value="">Não importar</option>
                    {preview.columns.map((column, index) => (
                      <option key={`${column}-${index}`} value={index}>{column || `Coluna ${index + 1}`}</option>
                    ))}
                  </select>
                </FormField>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <caption className="sr-only">Primeiras linhas do arquivo</caption>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>{preview.columns.map((column, index) => <th key={`${column}-${index}`} className="px-3 py-2 font-semibold">{column || `Coluna ${index + 1}`}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-slate-100">
                      {preview.columns.map((_, index) => <td key={index} className="max-w-[14rem] truncate px-3 py-2">{row[index] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {step === 'origem' && totals && (
          <>
            <dl className="grid grid-cols-2 gap-2 medium:grid-cols-4">
              {[
                ['Novos', totals.novos],
                ['Já estão na base', totals.jaExistem],
                ['Repetidos no arquivo', totals.repetidosNoArquivo],
                ['Sem telefone ou e-mail válido', totals.invalidos],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 p-3">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>

            <fieldset className="space-y-2">
              <legend className="font-semibold text-slate-900">Por que você pode falar com essas pessoas?</legend>
              {LEGAL_BASIS_OPTIONS.map((option) => (
                <label key={option.value} className="flex min-h-11 cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50">
                  <input type="radio" name="base-legal" className="mt-1" checked={legalBasis === option.value} onChange={() => setLegalBasis(option.value)} />
                  <span>
                    <span className="block font-medium text-slate-900">{option.label}</span>
                    <span className="text-slate-600">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {legalBasis === 'legitimo_interesse' && (
              <Notice tone="warning">
                Para usar interesse legítimo, a ANPD pede um teste de balanceamento documentado (Guia Orientativo de 02/02/2024). Guarde esse registro com você.
              </Notice>
            )}
            <FormField label="De onde veio esta lista?" hint="Fica registrado com a importação. Ex.: clientes do sistema antigo, cadastro da feira de maio.">
              <input className="input" value={originNote} maxLength={300} onChange={(event) => setOriginNote(event.target.value)} />
            </FormField>
            <Notice tone="neutral">Lista comprada ou cedida por terceiros não pode ser importada: é envio sem base legal, e a Meta bloqueia o número que dispara para ela.</Notice>

            {totals.jaExistem > 0 && (
              <fieldset className="space-y-2">
                <legend className="font-semibold text-slate-900">Para os {totals.jaExistem} que já estão na base</legend>
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input type="radio" name="repetidos" className="mt-1" checked={onDuplicate === 'update'} onChange={() => setOnDuplicate('update')} />
                  <span>Completar o que falta (e-mail, empresa, etiquetas). Nome e telefone que já existem não mudam.</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input type="radio" name="repetidos" className="mt-1" checked={onDuplicate === 'keep'} onChange={() => setOnDuplicate('keep')} />
                  <span>Não mexer neles.</span>
                </label>
              </fieldset>
            )}
            <FormField label="Etiqueta para todos (opcional)" hint="Ajuda a achar depois quem veio desta importação.">
              <input className="input" value={tag} maxLength={40} onChange={(event) => setTag(event.target.value)} />
            </FormField>
          </>
        )}

        {step === 'resumo' && result && (
          <>
            <Notice tone="success">
              {result.summary.created} criado(s), {result.summary.updated} completado(s), {result.summary.kept + result.summary.skipped} sem alteração,{' '}
              {result.summary.invalid} fora por telefone ou e-mail inválido.
            </Notice>
            {result.rejected.length > 0 && (
              <button type="button" className={buttonClass.secondary} onClick={() => download('contatos-nao-importados.csv', rejectionsToCsv(result.rejected))}>
                <Download size={15} aria-hidden="true" />
                Baixar o que ficou de fora ({result.rejected.length})
              </button>
            )}
            <p>
              Dá para desfazer até {quando.format(new Date(result.undoUntil))}. Desfazer apaga os contatos criados que ninguém usou; o que foi completado em
              contatos que já existiam fica.
            </p>
            <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => undo(result.importId)}>
              <Undo2 size={15} aria-hidden="true" />
              Desfazer esta importação
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
