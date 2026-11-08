import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { listSignups, type Signup } from '../../../lib/mail'
import { formatDate } from './labels'
import { Chip } from './ui'

type Props = {
  ok: (mensagem: string) => void
  fail: (erro: unknown, alternativa: string) => void
}

const SITUACAO: Record<string, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  expired: 'Expirado',
}

/** Formulário pronto para colar em qualquer página do site. */
const SNIPPET = `<form id="avila-newsletter">
  <input type="email" name="email" placeholder="seu e-mail" required>
  <input type="text" name="name" placeholder="seu nome">
  <button type="submit">Quero receber</button>
  <p id="avila-newsletter-recado"></p>
</form>
<script>
document.getElementById('avila-newsletter').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.target));
  const recado = document.getElementById('avila-newsletter-recado');
  recado.textContent = 'Enviando...';
  try {
    const resposta = await fetch('https://crm.avilaops.com/nl/inscrever', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...dados, source: 'site' }),
    });
    const corpo = await resposta.json();
    recado.textContent = resposta.ok ? corpo.message : (corpo.error || 'Nao foi possivel inscrever.');
    if (resposta.ok) evento.target.reset();
  } catch {
    recado.textContent = 'Nao foi possivel inscrever agora.';
  }
});
</script>`

/**
 * Captação.
 *
 * A lista só cresce sozinha por aqui: formulário no site → confirmação por
 * e-mail → contato. Sem o clique de confirmação nada entra, o que protege de
 * quem digita o endereço de outra pessoa e dá prova de consentimento.
 */
function SignupsTab({ ok, fail }: Props) {
  const [signups, setSignups] = useState<Signup[]>([])
  const [resumo, setResumo] = useState<Record<string, number>>({})
  const [filtro, setFiltro] = useState<'todos' | 'pending' | 'confirmed' | 'expired'>('todos')
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const resultado = await listSignups(filtro)
      setSignups(resultado.signups)
      setResumo(resultado.summary)
    } catch (caught) {
      fail(caught, 'Falha ao carregar a captação.')
    }
  }, [filtro, fail])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(SNIPPET)
      setCopiado(true)
      ok('Formulário copiado — é só colar na página do site.')
      window.setTimeout(() => setCopiado(false), 3000)
    } catch (caught) {
      fail(caught, 'Não foi possível copiar.')
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Aguardando', resumo.pending ?? 0, 'receberam o link e ainda não clicaram'],
          ['Confirmados', resumo.confirmed ?? 0, 'viraram contato inscrito'],
          ['Expirados', resumo.expired ?? 0, 'passaram de 7 dias sem confirmar'],
        ].map(([rotulo, valor, dica]) => (
          <div key={String(rotulo)} className="rounded border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-400">{rotulo}</p>
            <p className="text-2xl font-semibold">{valor}</p>
            <p className="text-xs text-slate-500">{dica}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold uppercase text-slate-500">Formulário para o site</h3>
          <button
            className="ml-auto flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white"
            onClick={() => void copiar()}
          >
            {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar código'}
          </button>
        </div>
        <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {SNIPPET}
        </pre>
        <p className="text-xs text-slate-500">
          Cole em qualquer página do avilaops.com. Quem preencher recebe o link de confirmação no próximo ciclo da
          automação — se ela estiver desligada, os pedidos ficam aqui esperando.
        </p>
      </section>

      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          {(['todos', 'pending', 'confirmed', 'expired'] as const).map((opcao) => (
            <Chip key={opcao} active={filtro === opcao} onClick={() => setFiltro(opcao)}>
              {opcao === 'todos' ? 'Todos' : SITUACAO[opcao]}
            </Chip>
          ))}
          <button className="ml-auto text-slate-400" onClick={() => void carregar()} aria-label="Atualizar">
            <RefreshCw size={14} />
          </button>
        </header>
        <div className="max-h-96 divide-y divide-slate-100 overflow-auto">
          {signups.map((pedido) => (
            <div key={pedido.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{pedido.email}</p>
                <p className="truncate text-xs text-slate-500">
                  {pedido.name ?? 'sem nome'} · origem {pedido.source} · pedido em {formatDate(pedido.created_at)}
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {pedido.confirmed_at
                  ? `confirmado ${formatDate(pedido.confirmed_at)}`
                  : pedido.confirmation_sent_at
                    ? `link enviado ${formatDate(pedido.confirmation_sent_at)}`
                    : 'link ainda não enviado'}
              </span>
              <span
                className={`rounded px-2 py-1 text-xs ${pedido.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : pedido.status === 'expired' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}
              >
                {SITUACAO[pedido.status] ?? pedido.status}
              </span>
            </div>
          ))}
          {signups.length === 0 && (
            <p className="p-4 text-sm text-slate-500">Nenhum pedido ainda. Cole o formulário no site para começar.</p>
          )}
        </div>
      </section>
    </div>
  )
}

export default SignupsTab
