import { useEffect, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import { Check, Edit2, Package, Search, Tag, Trash2, X } from 'lucide-react'
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
  type CrmProduct,
} from '../../lib/crm'

export default function ProductsPage() {
  const [products, setProducts] = useState<CrmProduct[]>([])
  const [categories, setCategories] = useState<{ name: string; total: number }[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<CrmProduct | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: 'Geral',
    price: '0,00',
    description: '',
    active: true,
  })

  const loadData = () => {
    setLoading(true)
    listProducts({
      search,
      category: categoryFilter || undefined,
      active: activeFilter,
      page: 1,
      pageSize: 50,
    })
      .then((res) => {
        setProducts(res.products)
        setCategories(res.categories)
        setTotal(res.pagination.total)
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
  }, [search, categoryFilter, activeFilter])

  const openCreateModal = () => {
    setEditingProduct(null)
    setForm({
      name: '',
      sku: '',
      category: 'Geral',
      price: '0,00',
      description: '',
      active: true,
    })
    setShowModal(true)
  }

  const openEditModal = (product: CrmProduct) => {
    setEditingProduct(product)
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      category: product.category,
      price: (product.price_cents / 100).toFixed(2).replace('.', ','),
      description: product.description ?? '',
      active: product.active,
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    const priceCents = Math.round(parseFloat(form.price.replace(',', '.')) * 100) || 0
    setSaving(true)
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, {
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          category: form.category.trim() || 'Geral',
          price_cents: priceCents,
          description: form.description.trim() || null,
          active: form.active,
        })
      } else {
        await createProduct({
          name: form.name.trim(),
          sku: form.sku.trim() || undefined,
          category: form.category.trim() || 'Geral',
          price_cents: priceCents,
          description: form.description.trim() || undefined,
          active: form.active,
        })
      }
      setShowModal(false)
      loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar produto.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este produto do catálogo?')) return
    try {
      await deleteProduct(id)
      loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir produto.')
    }
  }

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }

  const avgPrice = products.length > 0
    ? products.reduce((acc, p) => acc + p.price_cents, 0) / products.length
    : 0

  return (
    <div>
      <Topbar
        title="Produtos & Serviços"
        tab={`${total} item(ns) no catálogo`}
        action="+ Novo Item"
        onAction={openCreateModal}
      />

      <div className="space-y-5 p-6">
        {/* Métricas rápidas de catálogo */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Package size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Total Cadastrado</p>
                <p className="text-xl font-bold text-slate-900">{total}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Tag size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Ticket Médio</p>
                <p className="text-xl font-bold text-slate-900">{formatBRL(avgPrice)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-600">
                <Check size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Categorias Ativas</p>
                <p className="text-xl font-bold text-slate-900">{categories.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-1 items-center gap-2 max-w-md rounded-md bg-slate-50 border border-slate-200 px-3 py-1.5">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, código SKU ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Abaixo de 640px os filtros dividem a linha em vez de empurrar a tela para o lado. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as any)}
              className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">Status: Todos</option>
              <option value="true">Apenas Ativos</option>
              <option value="false">Apenas Inativos</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Tabela de Produtos */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Produto / Serviço</th>
                  <th className="px-4 py-3 font-semibold">SKU / Código</th>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 font-semibold">Preço Unitário</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Carregando produtos...
                    </td>
                  </tr>
                )}
                {!loading && products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Package size={32} className="mx-auto mb-2 text-slate-300" />
                      Nenhum produto cadastrado no momento.
                    </td>
                  </tr>
                )}
                {!loading &&
                  products.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{product.name}</div>
                        {product.description && (
                          <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {product.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {product.sku || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {formatBRL(product.price_cents)}
                      </td>
                      <td className="px-4 py-3">
                        {product.active ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            Ativo
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                            onClick={() => openEditModal(product)}
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            onClick={() => handleDelete(product.id)}
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingProduct ? 'Editar Item do Catálogo' : 'Novo Produto ou Serviço'}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setShowModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Nome do Produto / Serviço *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Consultoria de Automações n8n"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Código SKU / Identificador
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: SRV-N8N-01"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Categoria
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Serviços, Licença, Setup"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Preço de Venda (R$)
                  </label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Disponível para venda (Ativo)
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Descrição / Detalhes da Oferta
                </label>
                <textarea
                  rows={3}
                  placeholder="Descreva o escopo, entregáveis ou condições comerciais..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
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
                  {saving ? 'Salvando...' : editingProduct ? 'Atualizar Item' : 'Cadastrar Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
