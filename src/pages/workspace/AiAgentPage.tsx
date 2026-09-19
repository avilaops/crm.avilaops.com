import { useCallback, useEffect, useState } from 'react'
import { Check, Sparkles, Trash2, Wand2 } from 'lucide-react'
import {
  applySuggestion,
  discardSuggestion,
  getAiConfig,
  listAiRuns,
  listSuggestions,
  runCatalogo,
  runTriagem,
  saveAiConfig,
  testAi,
  type AiConfig,
  type AiRun,
  type AiSuggestion,
  type AiUsage,
} from '../../lib/ai'
import Topbar from '../../components/layout/Topbar'

const PROVEDORES = [
  ['openai', 'OpenAI'],
  ['deepseek', 'DeepSeek'],
  ['groq', 'Groq'],
] as const

const JOB_LABEL: Record<string, string> = {
  triagem: 'Triagem de remetentes',
  catalogo: 'Catalogação de contatos',
  campanha: 'Redação de campanha',
}

const CONFIANCA: Record<string, string> = { alta: 'confiança alta', media: 'confiança média', baixa: 'confiança baixa' }

function formatDate(valor: string | null) {
  if (!valor) return '-'
  return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Agente de IA.
 *
 * Faz três trabalhos concretos sobre os dados que já estão aqui: triar quem
 * escreveu, catalogar contato que veio sujo da agenda e escrever a campanha.
 *
 * Em todos, o modelo **propõe** e a pessoa aplica. Deixar um modelo reescrever
 * quatro mil cadastros direto no banco é o tipo de automação que ninguém
 * consegue desfazer depois.
 */
function AiAgentPage() {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [uso, setUso] = useState<AiUsage[]>([])
  const [runs, setRuns] = useState<AiRun[]>([])
  const [sugestoes, setSugestoes] = useState<AiSuggestion[]>([])
  const [filtro, setFiltro] = useState<'todos' | 'triagem' | 'catalogo'>('todos')

  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4.1-mini')
  const [apiKey, setApiKey] = useState('')
  const [check, setCheck] = useState<{ ok: boolean; detail: string } | null>(null)

  const [busy, setBusy] = useState('')
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [dados, diario, propostas] = await Promise.all([
        getAiConfig(),
        listAiRuns(),
        listSuggestions(filtro, 'pending'),
      ])
      setConfig(dados.config)
      setUso(dados.usage)
      setRuns(diario.runs)
      setSugestoes(propostas.suggestions)
      if (dados.config) {
        setProvider(dados.config.provider)
        setModel(dados.config.model)
      }
    } catch (caught) {
      setErro(caught instanceof Error ? caught.message : 'Falha ao carregar o agente.')
    }
  }, [filtro])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function ok(mensagem: string) {
    setRecado(mensagem)
    setErro('')
  }

  function fail(caught: unknown, alternativa: string) {
    setErro(caught instanceof Error ? caught.message : alternativa)
    setRecado('')
  }

  async function salvar() {
    setBusy('save')
    try {
      const resultado = await saveAiConfig({ provider, model, apiKey: apiKey || undefined })
      setConfig(resultado.config)
      setCheck(resultado.check)
      setApiKey('')
      ok('Configuração salva.')
    } catch (caught) {
      fail(caught, 'Não foi possível salvar.')
    } finally {
      setBusy('')
    }
  }

  async function testar() {
    setBusy('test')
    try {
      const resultado = await testAi()
      setCheck(resultado.check)
      ok(resultado.check.ok ? 'Conexão ok.' : 'O provedor recusou.')
    } catch (caught) {
      fail(caught, 'Não foi possível testar.')
    } finally {
      setBusy('')
    }
  }

  async function analisar(tipo: 'triagem' | 'catalogo') {
    setBusy(tipo)
    try {
      const resultado = tipo === 'triagem' ? await runTriagem(10) : await runCatalogo(10)
      ok(`${resultado.analisados} análise(s) concluída(s). Revise abaixo antes de aplicar.`)
      await carregar()
    } catch (caught) {
      fail(caught, 'Falha na análise.')
    } finally {
      setBusy('')
    }
  }

  async function decidir(id: string, aplicar: boolean) {
    setBusy(id)
    try {
      await (aplicar ? applySuggestion(id) : discardSuggestion(id))
      setSugestoes((atual) => atual.filter((item) => item.id !== id))
      if (aplicar) ok('Sugestão aplicada ao cadastro.')
    } catch (caught) {
      fail(caught, 'Não foi possível concluir.')
    } finally {
      setBusy('')
    }
  }

  const tokensDoMes = uso.reduce((total, linha) => total + linha.inputTokens + linha.outputTokens, 0)

  return (
    <div>
      <Topbar title="Agente de IA" tab={config?.hasKey ? `${config.model}` : 'não configurado'} />
      <div className="space-y-4 p-5">
        {erro && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}
        {recado && <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{recado}</p>}

        <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles size={18} className="text-violet-600" />
            <h3 className="text-sm font-bold uppercase text-slate-500">Provedor</h3>
            <span className="ml-auto text-xs text-slate-500">
              {tokensDoMes.toLocaleString('pt-BR')} tokens neste mês
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Provedor</span>
              <select
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              >
                {PROVEDORES.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Modelo</span>
              <input
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {config?.hasKey ? 'Chave (em branco mantém a atual)' : 'Chave da API'}
              </span>
              <input
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-…"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void salvar()}
              disabled={busy === 'save'}
            >
              {busy === 'save' ? 'Salvando…' : 'Salvar e testar'}
            </button>
            <button
              className="rounded border border-slate-200 px-4 py-2 text-sm disabled:opacity-50"
              onClick={() => void testar()}
              disabled={busy === 'test' || !config?.hasKey}
            >
              {busy === 'test' ? 'Testando…' : 'Testar conexão'}
            </button>
            {check && (
              <span className={`text-sm ${check.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {check.ok ? '✓' : '✗'} {check.detail}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            A chave fica criptografada no banco, como a da conta de e-mail. Os três provedores falam o mesmo formato de
            API — trocar de um para outro é trocar chave e modelo aqui.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <article className="space-y-2 rounded border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Triagem de remetentes</h3>
            <p className="text-sm text-slate-600">
              Lê quem escreveu para a caixa e ainda não é contato: diz se é cliente, fornecedor, cobrança ou automático,
              deduz a empresa pelo domínio e propõe as etiquetas.
            </p>
            <button
              className="flex items-center gap-2 rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void analisar('triagem')}
              disabled={busy === 'triagem' || !config?.hasKey}
            >
              <Wand2 size={14} /> {busy === 'triagem' ? 'Analisando…' : 'Analisar 10 remetentes'}
            </button>
          </article>

          <article className="space-y-2 rounded border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Catalogação da base</h3>
            <p className="text-sm text-slate-600">
              Pega contato que veio torto da agenda — "Fabio Motorista Usina Nardini" — e propõe nome limpo, empresa e
              setor. Feito para as milhares de linhas que ninguém vai arrumar à mão.
            </p>
            <button
              className="flex items-center gap-2 rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void analisar('catalogo')}
              disabled={busy === 'catalogo' || !config?.hasKey}
            >
              <Wand2 size={14} /> {busy === 'catalogo' ? 'Analisando…' : 'Catalogar 10 contatos'}
            </button>
          </article>
        </section>

        <section className="overflow-hidden rounded border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
            <h3 className="text-xs font-bold uppercase text-slate-500">Sugestões aguardando revisão</h3>
            <div className="ml-auto flex gap-2">
              {(['todos', 'triagem', 'catalogo'] as const).map((opcao) => (
                <button
                  key={opcao}
                  className={`rounded-full border px-3 py-1 text-xs ${filtro === opcao ? 'border-blue-500 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  onClick={() => setFiltro(opcao)}
                >
                  {opcao === 'todos' ? 'Todas' : opcao === 'triagem' ? 'Triagem' : 'Catálogo'}
                </button>
              ))}
            </div>
          </header>

          <div className="max-h-[28rem] divide-y divide-slate-100 overflow-auto">
            {sugestoes.map((sugestao) => (
              <div key={sugestao.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  {sugestao.job === 'triagem' ? (
                    <>
                      <p className="truncate font-medium">
                        {sugestao.payload.pessoa || sugestao.payload.empresa || sugestao.payload.email}
                        {sugestao.payload.empresa ? ` · ${sugestao.payload.empresa}` : ''}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {sugestao.payload.email} · {sugestao.payload.categoria} ·{' '}
                        {sugestao.payload.cadastrar ? 'sugere cadastrar' : 'sugere ignorar'}
                      </p>
                      <p className="truncate text-xs text-slate-400">{sugestao.payload.motivo}</p>
                    </>
                  ) : (
                    <>
                      <p className="truncate font-medium">
                        {sugestao.payload.nome}
                        {sugestao.payload.empresa ? ` · ${sugestao.payload.empresa}` : ''}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        antes: {sugestao.payload.atual} · {CONFIANCA[sugestao.payload.confianca ?? ''] ?? ''}
                      </p>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {(sugestao.payload.etiquetas ?? []).map((etiqueta) => (
                    <span key={etiqueta} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500">
                      {etiqueta}
                    </span>
                  ))}
                </div>

                <button
                  className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  onClick={() => void decidir(sugestao.id, true)}
                  disabled={busy === sugestao.id}
                >
                  <Check size={13} /> Aplicar
                </button>
                <button
                  className="flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50"
                  onClick={() => void decidir(sugestao.id, false)}
                  disabled={busy === sugestao.id}
                >
                  <Trash2 size={13} /> Descartar
                </button>
              </div>
            ))}
            {sugestoes.length === 0 && (
              <p className="p-4 text-sm text-slate-500">
                Nenhuma sugestão pendente. Rode uma das análises acima para o agente propor cadastro.
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded border border-slate-200 bg-white">
          <header className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase text-slate-500">
            Uso — o que foi chamado, quanto custou em tokens
          </header>
          <div className="max-h-64 divide-y divide-slate-100 overflow-auto">
            {runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="w-40 shrink-0 text-xs text-slate-400">{formatDate(run.created_at)}</span>
                <span className="w-48 shrink-0">{JOB_LABEL[run.job] ?? run.job}</span>
                <span className="text-xs text-slate-500">{run.model}</span>
                <span className="text-xs text-slate-500">
                  {run.input_tokens}↑ {run.output_tokens}↓ · {run.duration_ms}ms
                </span>
                <span
                  className={`ml-auto rounded px-2 py-0.5 text-xs ${run.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                >
                  {run.status === 'ok' ? 'ok' : run.error?.slice(0, 60)}
                </span>
              </div>
            ))}
            {runs.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma chamada ainda.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

export default AiAgentPage
