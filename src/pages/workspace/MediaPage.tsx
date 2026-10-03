import { useEffect, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import {
  createMediaFile,
  deleteMediaFile,
  listMediaFiles,
  type CrmMediaFile,
} from '../../lib/crm'

export default function MediaPage() {
  const [files, setFiles] = useState<CrmMediaFile[]>([])
  const [categories, setCategories] = useState<{ name: string; total: number }[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    file_type: 'pdf',
    url: '',
    category: 'Propostas',
    file_size_kb: 500,
  })

  const loadData = () => {
    setLoading(true)
    listMediaFiles({
      search,
      category: selectedCategory || undefined,
      file_type: selectedType || undefined,
    })
      .then((res) => {
        setFiles(res.files)
        setCategories(res.categories)
        setTotal(res.total)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData()
    }, 250)
    return () => clearTimeout(timer)
  }, [search, selectedCategory, selectedType])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) return

    setSaving(true)
    try {
      await createMediaFile({
        name: form.name.trim(),
        file_type: form.file_type,
        url: form.url.trim(),
        category: form.category.trim() || 'Geral',
        file_size_bytes: form.file_size_kb * 1024,
      })
      setShowModal(false)
      setForm({
        name: '',
        file_type: 'pdf',
        url: '',
        category: 'Propostas',
        file_size_kb: 500,
      })
      loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar arquivo de mídia.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este arquivo da central de mídia?')) return
    try {
      await deleteMediaFile(id)
      loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir arquivo.')
    }
  }

  const handleCopyLink = (file: CrmMediaFile) => {
    navigator.clipboard.writeText(file.url)
    setCopiedId(file.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatFileSize = (bytes: number | string) => {
    const num = Number(bytes) || 0
    if (num < 1024) return `${num} B`
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
    return `${(num / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={22} className="text-violet-600" />
      case 'video':
        return <Video size={22} className="text-rose-600" />
      case 'pdf':
      case 'document':
      default:
        return <FileText size={22} className="text-blue-600" />
    }
  }

  return (
    <div>
      <Topbar
        title="Central de Mídia & Documentos"
        tab={`${total} arquivo(s) disponível(is)`}
        action="+ Adicionar Mídia"
        onAction={() => setShowModal(true)}
      />

      <div className="space-y-6 p-6">
        {/* Barra de Filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-1 items-center gap-2 max-w-md rounded-md bg-slate-50 border border-slate-200 px-3 py-1.5">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome do arquivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Abaixo de 640px os filtros dividem a linha em vez de empurrar a tela para o lado. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.total})
                </option>
              ))}
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="">Todos os Tipos</option>
              <option value="pdf">PDFs / Propostas</option>
              <option value="document">Documentos</option>
              <option value="image">Imagens</option>
              <option value="video">Vídeos</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Grid de Arquivos */}
        {loading && (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
            Carregando arquivos de mídia...
          </div>
        )}

        {!loading && files.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
            <FolderOpen size={36} className="mx-auto mb-3 text-slate-300" />
            <h4 className="text-sm font-bold text-slate-800">Nenhum arquivo de mídia encontrado</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Cadastre links de catálogos, PDFs de propostas e contratos para envio rápido aos clientes.
            </p>
            <button
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700"
              onClick={() => setShowModal(true)}
            >
              + Adicionar Primeiro Arquivo
            </button>
          </div>
        )}

        {!loading && files.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-50 border border-slate-100">
                      {getFileIcon(file.file_type)}
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {file.category}
                    </span>
                  </div>

                  <h4 className="mt-3 text-xs font-bold text-slate-900 line-clamp-1" title={file.name}>
                    {file.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatFileSize(file.file_size_bytes)} · {file.file_type.toUpperCase()}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <button
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
                    onClick={() => handleCopyLink(file)}
                  >
                    {copiedId === file.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    {copiedId === file.id ? 'Copiado!' : 'Copiar Link WhatsApp'}
                  </button>

                  <div className="flex items-center gap-1">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Abrir arquivo"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      onClick={() => handleDelete(file.id)}
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Adição de Mídia */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Adicionar Arquivo / Link de Mídia</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Nome do Documento / Arquivo *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Proposta Comercial Modelo - Ávila Ops.pdf"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  URL / Link do Arquivo *
                </label>
                <input
                  required
                  type="url"
                  placeholder="https://docs.avilaops.com/proposta.pdf"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Tipo do Arquivo
                  </label>
                  <select
                    value={form.file_type}
                    onChange={(e) => setForm({ ...form, file_type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                  >
                    <option value="pdf">PDF</option>
                    <option value="document">Documento / DOCX</option>
                    <option value="image">Imagem / JPG / PNG</option>
                    <option value="video">Vídeo / MP4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Categoria
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Propostas, Contratos, Catálogo"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Adicionar Mídia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
