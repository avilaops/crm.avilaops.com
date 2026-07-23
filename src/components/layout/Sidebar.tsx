import { Bell, CircleHelp, LayoutGrid, Settings } from 'lucide-react'
import { navGroups } from '../../data/crm'
import type { Page } from '../../types'

function Sidebar({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return (
    <aside className="flex min-h-screen flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <div className="text-2xl font-black italic text-slate-800">Agenda</div>
        <LayoutGrid size={16} className="text-slate-500" />
      </div>
      <nav className="flex-1 overflow-auto p-1 text-sm">
        {navGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon
              const isParentActive = item.id === page || item.children?.some((child) => child.id === page)
              return (
                <div key={item.id}>
                  <button
                    className={`flex w-full items-center gap-3 rounded px-4 py-2 text-left ${
                      isParentActive && !item.children ? 'bg-blue-100 font-semibold text-blue-700' : 'hover:bg-slate-100'
                    }`}
                    onClick={() => !item.children && setPage(item.id as Page)}
                  >
                    <Icon size={16} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{item.badge}</span>}
                  </button>
                  {item.children && (
                    <div className="ml-9 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <button
                          key={child.id}
                          className={`block w-full truncate rounded px-3 py-2 text-left ${
                            page === child.id ? 'bg-blue-100 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                          }`}
                          onClick={() => setPage(child.id as Page)}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-2 text-sm">
        <button className="flex w-full items-center gap-3 rounded px-4 py-2 hover:bg-slate-100" onClick={() => setPage('profile-settings')}>
          <Settings size={16} />
          Configurações
        </button>
        <button className="flex w-full items-center gap-3 rounded px-4 py-2 hover:bg-slate-100">
          <CircleHelp size={16} />
          Ajuda
        </button>
        <button className="flex w-full items-center gap-3 rounded px-4 py-2 hover:bg-slate-100">
          <Bell size={16} />
          Centro de Notificação
          <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">2</span>
        </button>
        <div className="mt-3 flex items-center gap-3 px-3 py-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-yellow-300 text-xs font-bold">NR</div>
          <div className="min-w-0">
            <p className="truncate font-medium">Nicolas Rosa</p>
            <p className="truncate text-xs text-slate-500">nicolasrosaab</p>
          </div>
        </div>
      </div>
    </aside>
  )
}


export default Sidebar

