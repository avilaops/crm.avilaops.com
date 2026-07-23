import { ChevronRight } from 'lucide-react'

function AccountSelect({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-[#080034]">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-center text-3xl font-bold">Bem-vindo de volta, Nicolas Rosa</h1>
        <div className="mt-9 rounded-md bg-[#f7f4ff] px-6 py-8 text-center">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-yellow-300 text-3xl font-bold text-slate-950">NR</div>
          <p className="mt-4 font-semibold text-[#8b81a8]">nicolasrosadb@gmail.com</p>
          <div className="mt-7 flex flex-wrap justify-center gap-6 text-sm font-semibold">
            <button>Criar outra conta</button>
            <button>Acesse o portal do parceiro</button>
            <button>Sair</button>
          </div>
        </div>
        <h2 className="mt-9 text-center text-2xl font-bold">Selecione uma conta</h2>
        <button className="mt-7 flex w-full items-center justify-between rounded-md px-2 py-4 text-left hover:bg-slate-50" onClick={onEnter}>
          <span className="flex items-center gap-4">
            <span className="rounded-md bg-yellow-200 px-8 py-2 text-xs font-semibold">Teste</span>
            <span className="font-bold">nicolasrosadb</span>
          </span>
          <ChevronRight />
        </button>
      </section>
    </main>
  )
}

export default AccountSelect


