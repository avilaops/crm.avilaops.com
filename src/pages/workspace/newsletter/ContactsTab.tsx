import { useCallback, useEffect, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import {
  bulkContacts,
  createNewsletterContact,
  importNewsletterContacts,
  searchNewsletterContacts,
  updateNewsletterContact,
  type NewsletterContact,
  type NewsletterOverview,
} from '../../../lib/mail'
import { parseTags, tagLabel } from './labels'
import { Chip, Field, StatusBadge } from './ui'

const PAGE_SIZE = 50

type Edicao = { name: string; company: string; phone: string; tags: string }

type Props = {
  overview: NewsletterOverview | null
  onChange: () => void
  ok: (mensagem: string) => void
  fail: (erro: unknown, alternativa: string) => void
}

/**
 * Base de contatos.
 *
 * Busca, filtro e paginação rodam no banco: a base passa de quatro mil
 * registros, e trazer tudo para o navegador a cada tecla seria absurdo.
 */
function ContactsTab({ overview, onChange, ok, fail }: Props) {
  const [busca, setBusca] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [situacao, setSituacao] = useState<'subscribed' | 'unsubscribed' | 'todos'>('todos')
  const [endereco, setEndereco] = useState<'sim' | 'nao' | 'todos'>('sim')
  const [pagina, setPagina] = useState(1)

  const [contatos, setContatos] = useState<NewsletterContact[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [etiquetaLote, setEtiquetaLote] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Edicao>({ name: '', company: '', phone: '', tags: '' })
  const [novo, setNovo] = useState(false)
  const [novoContato, setNovoContato] = useState({ name: '', email: '', phone: '', company: '', tags: 'clientes' })
  const [importRaw, setImportRaw] = useState('')
  const [importTags, setImportTags] = useState('clientes')
  const [busy, setBusy] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const resultado = await searchNewsletterContacts({
        search: busca,
        tag: etiqueta,
        status: situacao,
        withEmail: endereco,
        page: pagina,
        pageSize: PAGE_SIZE,
      })
      setContatos(resultado.contacts)
      setTotal(resultado.pagination.total)
    } catch (caught) {
      fail(caught, 'Falha ao buscar contatos.')
    } finally {
      setCarregando(false)
    }
  }, [busca, etiqueta, situacao, endereco, pagina, fail])

  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 300)
    return () => window.clearTimeout(timer)
  }, [carregar])

  // Trocar de filtro sem voltar para a primeira página mostraria lista vazia.
  useEffect(() => {
    setPagina(1)
    setSelecionados(new Set())
  }, [busca, etiqueta, situacao, endereco])

  const totalPaginas = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const todosMarcados = contatos.length > 0 && contatos.every((contato) => selecionados.has(contato.id))

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  function alternarPagina() {
    setSelecionados((atual) => {
      if (todosMarcados) {
        const proximo = new Set(atual)
        contatos.forEach((contato) => proximo.delete(contato.id))
        return proximo
      }
      return new Set([...atual, ...contatos.map((contato) => contato.id)])
    })
  }

  async function acaoEmLote(action: 'tag' | 'untag' | 'subscribe' | 'unsubscribe') {
    if (selecionados.size === 0) return
    setBusy('lote')
    try {
      const resultado = await bulkContacts({ ids: [...selecionados], action, tag: etiquetaLote })
      ok(`${resultado.updated} contato(s) atualizados.`)
      setSelecionados(new Set())
      await Promise.all([carregar(), onChange()])
    } catch (caught) {
      fail(caught, 'Falha na ação em lote.')
    } finally {
      setBusy('')
    }
  }

  function abrirEdicao(contato: NewsletterContact) {
    setEditando(contato.id)
    setEdicao({
      name: contato.name,
      company: contato.company ?? '',
      phone: contato.phone ?? '',
      tags: contato.tags.join(', '),
    })
  }

  async function salvarEdicao(id: string) {
    setBusy(id)
    try {
      await updateNewsletterContact(id, {
        name: edicao.name.trim(),
        company: edicao.company.trim(),
        phone: edicao.phone.trim(),
        tags: parseTags(edicao.tags),
      })
      setEditando(null)
      ok('Contato atualizado.')
      await Promise.all([carregar(), onChange()])
    } catch (caught) {
      fail(caught, 'Falha ao salvar o contato.')
    } finally {
      setBusy('')
    }
  }

  async function alternarSituacao(contato: NewsletterContact) {
    setBusy(contato.id)
    try {
      await updateNewsletterContact(contato.id, {
        newsletterStatus: contato.newsletter_status === 'subscribed' ? 'unsubscribed' : 'subscribed',
      })
      await Promise.all([carregar(), onChange()])
    } catch (caught) {
      fail(caught, 'Falha ao atualizar o contato.')
    } finally {
      setBusy('')
    }
  }

  async function salvarNovo() {
    setBusy('novo')
    try {
      await createNewsletterContact({ ...novoContato, tags: parseTags(novoContato.tags) })
      ok('Contato cadastrado.')
      setNovo(false)
      setNovoContato({ name: '', email: '', phone: '', company: '', tags: 'clientes' })
      await Promise.all([carregar(), onChange()])
    } catch (caught) {
      fail(caught, 'Falha ao cadastrar.')
    } finally {
      setBusy('')
    }
  }

  async function importar() {
    setBusy('import')
    try {
      const resultado = await importNewsletterContacts(importRaw, parseTags(importTags))
      ok(`${resultado.summary.created} novos, ${resultado.summary.updated} atualizados.`)
      setImportRaw('')
      await Promise.all([carregar(), onChange()])
    } catch (caught) {
      fail(caught, 'Falha na importação.')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              className="w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por nome, e-mail, empresa, telefone ou etiqueta"
            />
          </div>
          <button
            className="flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            onClick={() => setNovo((atual) => !atual)}
          >
            <Plus size={14} /> Novo contato
          </button>
        </div>

        {novo && (
          <div className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="Nome" value={novoContato.name} onChange={(v) => setNovoContato({ ...novoContato, name: v })} />
            <Field label="E-mail" value={novoContato.email} onChange={(v) => setNovoContato({ ...novoContato, email: v })} />
            <Field label="Empresa" value={novoContato.company} onChange={(v) => setNovoContato({ ...novoContato, company: v })} />
            <Field label="Telefone" value={novoContato.phone} onChange={(v) => setNovoContato({ ...novoContato, phone: v })} />
            <Field label="Etiquetas" value={novoContato.tags} onChange={(v) => setNovoContato({ ...novoContato, tags: v })} />
            <div className="flex items-end gap-2">
              <button
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void salvarNovo()}
                disabled={busy === 'novo' || !novoContato.name.trim()}
              >
                {busy === 'novo' ? 'Salvando…' : 'Cadastrar'}
              </button>
              <button className="rounded border border-slate-200 px-4 py-2 text-sm" onClick={() => setNovo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Chip active={etiqueta === ''} onClick={() => setEtiqueta('')}>Todas as etiquetas</Chip>
          {(overview?.tags ?? []).map((item) => (
            <Chip key={item.tag} active={etiqueta === item.tag} onClick={() => setEtiqueta(item.tag)}>
              {tagLabel(item.tag)} · {item.count}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <label className="flex items-center gap-2">
            Situação
            <select
              className="rounded border border-slate-200 px-2 py-1 text-xs outline-none"
              value={situacao}
              onChange={(event) => setSituacao(event.target.value as typeof situacao)}
            >
              <option value="todos">Todas</option>
              <option value="subscribed">Inscritos</option>
              <option value="unsubscribed">Descadastrados</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Endereço
            <select
              className="rounded border border-slate-200 px-2 py-1 text-xs outline-none"
              value={endereco}
              onChange={(event) => setEndereco(event.target.value as typeof endereco)}
            >
              <option value="sim">Só com e-mail</option>
              <option value="nao">Só telefone</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <span className="ml-auto">{carregando ? 'Buscando…' : `${total} resultado(s)`}</span>
        </div>
      </section>

      {selecionados.size > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
          <strong>{selecionados.size} selecionado(s)</strong>
          <input
            className="rounded border border-slate-200 px-3 py-1.5 text-sm outline-none"
            value={etiquetaLote}
            onChange={(event) => setEtiquetaLote(event.target.value)}
            placeholder="etiqueta"
          />
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50"
            onClick={() => void acaoEmLote('tag')}
            disabled={busy === 'lote' || !etiquetaLote.trim()}
          >
            Aplicar etiqueta
          </button>
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50"
            onClick={() => void acaoEmLote('untag')}
            disabled={busy === 'lote' || !etiquetaLote.trim()}
          >
            Remover etiqueta
          </button>
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50"
            onClick={() => void acaoEmLote('subscribe')}
            disabled={busy === 'lote'}
          >
            Reinscrever
          </button>
          <button
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 disabled:opacity-50"
            onClick={() => void acaoEmLote('unsubscribe')}
            disabled={busy === 'lote'}
          >
            Descadastrar
          </button>
          <button className="ml-auto text-xs text-slate-500" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </section>
      )}

      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
          <input type="checkbox" checked={todosMarcados} onChange={alternarPagina} aria-label="Selecionar a página" />
          <span>Selecionar os {contatos.length} desta página</span>
        </header>

        <div className="divide-y divide-slate-100">
          {contatos.map((contato) => (
            <div key={contato.id} className="px-4 py-3">
              {editando === contato.id ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome" value={edicao.name} onChange={(v) => setEdicao({ ...edicao, name: v })} />
                  <Field label="Empresa" value={edicao.company} onChange={(v) => setEdicao({ ...edicao, company: v })} />
                  <Field label="Telefone" value={edicao.phone} onChange={(v) => setEdicao({ ...edicao, phone: v })} />
                  <Field label="Etiquetas" value={edicao.tags} onChange={(v) => setEdicao({ ...edicao, tags: v })} />
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <button
                      className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => void salvarEdicao(contato.id)}
                      disabled={busy === contato.id}
                    >
                      <Check size={14} /> Salvar
                    </button>
                    <button className="rounded border border-slate-200 px-4 py-2 text-sm" onClick={() => setEditando(null)}>
                      <X size={14} />
                    </button>
                    <span className="text-xs text-slate-400">{contato.email || contato.phone}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selecionados.has(contato.id)}
                    onChange={() => alternar(contato.id)}
                    aria-label={`Selecionar ${contato.name}`}
                  />
                  <button className="min-w-0 flex-1 text-left" onClick={() => abrirEdicao(contato)}>
                    <p className="truncate font-medium">{contato.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {contato.email || contato.phone || 'sem contato'}
                      {contato.company ? ` · ${contato.company}` : ''}
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-1">
                    {contato.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
                        onClick={() => setEtiqueta(tag)}
                        title={`Filtrar por ${tagLabel(tag)}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <StatusBadge status={contato.newsletter_status} />
                  <button
                    className="text-xs text-blue-600 disabled:opacity-50"
                    disabled={busy === contato.id}
                    onClick={() => void alternarSituacao(contato)}
                  >
                    {contato.newsletter_status === 'subscribed' ? 'Descadastrar' : 'Reinscrever'}
                  </button>
                </div>
              )}
            </div>
          ))}
          {!carregando && contatos.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum contato para esse filtro.</p>}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <button
              className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
              disabled={pagina <= 1}
              onClick={() => setPagina((atual) => Math.max(atual - 1, 1))}
            >
              Anterior
            </button>
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            <button
              className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((atual) => Math.min(atual + 1, totalPaginas))}
            >
              Próxima
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase text-slate-500">Importar lista</h3>
        <textarea
          className="h-28 w-full rounded border border-slate-200 p-3 font-mono text-sm outline-none focus:border-blue-400"
          value={importRaw}
          onChange={(event) => setImportRaw(event.target.value)}
          placeholder={'um@cliente.com.br\nNome do Cliente <outro@cliente.com.br>'}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Etiquetas" value={importTags} onChange={setImportTags} />
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void importar()}
            disabled={busy === 'import' || !importRaw.trim()}
          >
            {busy === 'import' ? 'Importando…' : 'Importar'}
          </button>
          <span className="text-xs text-slate-500">
            Quem já existe só recebe as etiquetas novas — descadastrado não volta por importação.
          </span>
        </div>
      </section>
    </>
  )
}

export default ContactsTab
