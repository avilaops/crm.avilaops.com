import { useEffect, useRef, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import {
  Hash,
  MessageCircle,
  Plus,
  Send,
  Users,
  X,
} from 'lucide-react'
import {
  createTeamChannel,
  listTeamChannels,
  listTeamMessages,
  sendTeamMessage,
  type CrmTeamChannel,
  type CrmTeamMessage,
} from '../../lib/crm'

export default function TeamChatPage() {
  const [channels, setChannels] = useState<CrmTeamChannel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CrmTeamMessage[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelDesc, setNewChannelDesc] = useState('')
  const [savingChannel, setSavingChannel] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadChannels = () => {
    setLoadingChannels(true)
    listTeamChannels()
      .then((res) => {
        setChannels(res.channels)
        if (res.channels.length > 0 && !selectedChannelId) {
          setSelectedChannelId(res.channels[0].id)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingChannels(false))
  }

  useEffect(() => {
    loadChannels()
  }, [])

  const loadMessages = (channelId: string) => {
    setLoadingMessages(true)
    listTeamMessages(channelId)
      .then((res) => {
        setMessages(res.messages)
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingMessages(false))
  }

  useEffect(() => {
    if (!selectedChannelId) return
    loadMessages(selectedChannelId)

    const interval = setInterval(() => {
      listTeamMessages(selectedChannelId)
        .then((res) => setMessages(res.messages))
        .catch(() => undefined)
    }, 5000)

    return () => clearInterval(interval)
  }, [selectedChannelId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChannelId || !text.trim() || sending) return

    setSending(true)
    const content = text.trim()
    setText('')
    try {
      const res = await sendTeamMessage(selectedChannelId, content)
      setMessages((prev) => [...prev, res.message])
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar mensagem.')
      setText(content)
    } finally {
      setSending(false)
    }
  }

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannelName.trim()) return

    setSavingChannel(true)
    try {
      const res = await createTeamChannel({
        name: newChannelName.trim(),
        description: newChannelDesc.trim() || undefined,
      })
      setChannels((prev) => [...prev, res.channel])
      setSelectedChannelId(res.channel.id)
      setShowChannelModal(false)
      setNewChannelName('')
      setNewChannelDesc('')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao criar canal.')
    } finally {
      setSavingChannel(false)
    }
  }

  const activeChannel = channels.find((c) => c.id === selectedChannelId)

  return (
    <div>
      <Topbar title="Chat & Colaboração da Equipe" />

      {/* No celular os canais viram uma faixa rolável acima das mensagens; a
          coluna fixa de 280px empurrava a conversa para fora da tela. */}
      <div className="grid grid-cols-1 bg-slate-50 expanded:min-h-[calc(100dvh-4rem)] expanded:grid-cols-[280px_minmax(0,1fr)]">
        {/* Painel Esquerdo: Lista de Canais */}
        <aside className="flex min-w-0 flex-col justify-between border-b border-slate-200 bg-white expanded:border-b-0 expanded:border-r">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Canais de Comunicação
              </span>
              <button
                className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowChannelModal(true)}
                title="Novo canal"
                aria-label="Novo canal"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="scroll-chips flex gap-1 p-2 expanded:block expanded:space-y-1">
              {loadingChannels && (
                <p className="p-4 text-center text-xs text-slate-400">Carregando canais...</p>
              )}
              {channels.map((channel) => {
                const isSelected = channel.id === selectedChannelId
                return (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannelId(channel.id)}
                    className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition expanded:w-full ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Hash size={14} className={isSelected ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="truncate">{channel.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="hidden border-t border-slate-100 p-4 text-xs text-slate-500 expanded:block">
            🔒 Mensagens internas visíveis apenas para membros do workspace.
          </div>
        </aside>

        {/* Painel Direito: Mensagens do Canal */}
        <section className="flex min-h-[60dvh] min-w-0 flex-col justify-between expanded:h-[calc(100dvh-4rem)]">
          {activeChannel ? (
            <>
              {/* Header do Canal */}
              <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Hash size={18} className="text-blue-600" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{activeChannel.name}</h3>
                    {activeChannel.description && (
                      <p className="text-[11px] text-slate-400">{activeChannel.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <Users size={14} />
                  <span>Equipe</span>
                </div>
              </div>

              {/* Feed de Mensagens */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {loadingMessages && (
                  <p className="text-center text-xs text-slate-400">Carregando mensagens...</p>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <div className="py-16 text-center text-xs text-slate-400">
                    <MessageCircle size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-700">Nenhuma mensagem neste canal ainda.</p>
                    <p className="mt-1">Inicie uma conversa ou passe um recado para a equipe.</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 uppercase">
                      {msg.user_name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{msg.user_name}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="mt-1 rounded-lg bg-white p-3 text-xs text-slate-800 shadow-sm border border-slate-100 max-w-2xl leading-relaxed whitespace-pre-wrap">
                        {msg.body}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input de Envio de Mensagem */}
              <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Mensagem em #${activeChannel.name}...`}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={sending || !text.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send size={13} />
                    <span>Enviar</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="grid h-full place-items-center text-xs text-slate-400">
              Selecione um canal para visualizar as mensagens.
            </div>
          )}
        </section>
      </div>

      {/* Modal de Criação de Canal */}
      {showChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Novo Canal de Equipe</h3>
              <button
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setShowChannelModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Nome do Canal *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Novos Fechamentos"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Descrição / Objetivo do Canal
                </label>
                <input
                  type="text"
                  placeholder="Ex: Discussão de novos contratos e comissões"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => setShowChannelModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingChannel}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingChannel ? 'Criando...' : 'Criar Canal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

