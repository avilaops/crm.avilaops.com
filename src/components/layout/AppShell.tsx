'use client'

import { CircleHelp, Inbox, LogOut, Menu, Search, Settings, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { bottomBarSections, navSections, sectionOf } from '../../navigation'
import { isSettingsPage } from '../../routes'
import { useNavigation } from '../../lib/navigationContext'
import { initials, roleLabel, useSession } from '../../lib/session'
import { supportLinks } from '../../lib/support'
import {
  AnimatedSidebar, AnimatedSidebarClose, AnimatedSidebarContent, AnimatedSidebarFooter,
  AnimatedSidebarGroup, AnimatedSidebarGroupContent, AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader, AnimatedSidebarMenu, AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem, AnimatedSidebarMenuSub, AnimatedSidebarMenuSubButton,
  AnimatedSidebarMenuSubItem, AnimatedSidebarRail, AnimatedSidebarTrigger, useAnimatedSidebar,
  useAnimatedSidebarPanel,
} from '../ui/animated-sidebar'
import AvilaMark from './AvilaMark'

export default function AppShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const { route, navigate } = useNavigation()
  const sidebar = useAnimatedSidebar()
  const current = sectionOf(route.page)
  const immersive = route.page === 'chat-inbox' && Boolean(route.param)

  useEffect(() => {
    document.documentElement.toggleAttribute('data-immersive', immersive)
    return () => document.documentElement.removeAttribute('data-immersive')
  }, [immersive])

  const routeKey = `${route.page}:${route.param ?? ''}`
  useEffect(() => { window.scrollTo(0, 0) }, [routeKey])

  return (
    <div className="flex min-h-dvh bg-[#f3f3f3] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-slate-800">
      <AnimatedSidebar><SidebarNavigation /></AnimatedSidebar>
      <div className="min-w-0 flex-1 pb-[var(--app-bottom-nav)]">{children}</div>
      {aside}
      {!immersive && (
        <nav aria-label="Navegação móvel" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur medium:hidden">
          <ul className="grid grid-cols-5">
            {bottomBarSections.map((id) => {
              const section = navSections.find((item) => item.id === id)!
              const Icon = section.icon
              const active = current?.id === id
              return <li key={id}><button
                type="button" onClick={() => navigate(section.page)}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-blue-700' : 'text-slate-500'}`}
              ><span className={`grid h-7 w-12 place-items-center rounded-full ${active ? 'bg-blue-100' : ''}`}><Icon size={20} aria-hidden="true" /></span>{section.label}</button></li>
            })}
            <li><AnimatedSidebarTrigger className="flex h-16 w-full flex-col gap-1 rounded-none text-[11px] font-medium"><Menu size={20} aria-hidden="true" />Mais</AnimatedSidebarTrigger></li>
          </ul>
        </nav>
      )}
      {immersive && sidebar.isMobile && <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-40 rounded-xl border border-slate-200 bg-white shadow-sm"><AnimatedSidebarTrigger /></div>}
    </div>
  )
}

function SidebarNavigation() {
  const { route, navigate } = useNavigation()
  const { user, signOut } = useSession()
  const { collapsed } = useAnimatedSidebarPanel()
  const { setOpenMobile } = useAnimatedSidebar()
  const current = sectionOf(route.page)
  const [expanded, setExpanded] = useState<string | null>(current?.id ?? null)
  const inSettings = isSettingsPage(route.page)
  const { whatsapp, email } = supportLinks('Olá! Preciso de ajuda com o Ávila CRM.')
  const help = whatsapp ?? email
  const go = (page: Parameters<typeof navigate>[0]) => { navigate(page); setOpenMobile(false) }

  return <>
    <AnimatedSidebarHeader>
      <AvilaMark className="size-8 shrink-0" />
      {!collapsed && <span className="min-w-0 whitespace-nowrap"><span className="block text-sm font-bold tracking-tight text-slate-900">Avila CRM</span><span className="block text-[10px] font-medium tracking-widest text-slate-400">AVILA OPS</span></span>}
      <AnimatedSidebarClose className="ml-auto medium:hidden" />
    </AnimatedSidebarHeader>
    <AnimatedSidebarContent>
      <nav aria-label="Principal">
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupContent>
            <AnimatedSidebarMenu>
              <AnimatedSidebarMenuItem><AnimatedSidebarMenuButton icon={<Search size={18} />} onSelect={() => go('contacts')}>Buscar contatos</AnimatedSidebarMenuButton></AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuItem><AnimatedSidebarMenuButton icon={<Sparkles size={18} />} isActive={route.page === 'ai-agent'} onSelect={() => go('ai-agent')}>Assistente de IA</AnimatedSidebarMenuButton></AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuItem><AnimatedSidebarMenuButton icon={<Inbox size={18} />} isActive={route.page === 'chat-inbox'} onSelect={() => go('chat-inbox')}>Caixa de entrada</AnimatedSidebarMenuButton></AnimatedSidebarMenuItem>
            </AnimatedSidebarMenu>
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupLabel>Área de trabalho</AnimatedSidebarGroupLabel>
          <AnimatedSidebarGroupContent>
            <AnimatedSidebarMenu>
              {navSections.map((section) => {
                const Icon = section.icon
                const active = current?.id === section.id
                const open = expanded === section.id
                return <AnimatedSidebarMenuItem key={section.id}>
                  <AnimatedSidebarMenuButton
                    icon={<Icon size={19} />} isActive={active && !section.children}
                    ariaExpanded={section.children ? open : undefined}
                    className={active && section.children ? 'text-slate-900' : undefined}
                    onSelect={() => section.children ? setExpanded(open && !collapsed ? null : section.id) : go(section.page)}
                  >{section.label}</AnimatedSidebarMenuButton>
                  {section.children && <AnimatedSidebarMenuSub open={open}>
                    {section.children.map((child) => <AnimatedSidebarMenuSubItem key={child.page}>
                      <AnimatedSidebarMenuSubButton isActive={route.page === child.page} onSelect={() => go(child.page)}>
                        {child.label}
                      </AnimatedSidebarMenuSubButton>
                    </AnimatedSidebarMenuSubItem>)}
                  </AnimatedSidebarMenuSub>}
                </AnimatedSidebarMenuItem>
              })}
            </AnimatedSidebarMenu>
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>
      </nav>
    </AnimatedSidebarContent>
    <AnimatedSidebarFooter>
      <AnimatedSidebarMenu>
        <AnimatedSidebarMenuItem><AnimatedSidebarMenuButton icon={<Settings size={18} />} isActive={inSettings} onSelect={() => go('settings')}>Configurações</AnimatedSidebarMenuButton></AnimatedSidebarMenuItem>
        {help && <AnimatedSidebarMenuItem><AnimatedSidebarMenuButton icon={<CircleHelp size={18} />} href={help} target="_blank">Ajuda</AnimatedSidebarMenuButton></AnimatedSidebarMenuItem>}
      </AnimatedSidebarMenu>
      <div className="mt-2 flex min-w-0 items-center gap-1 border-t border-slate-100 pt-2">
        <button type="button" onClick={() => go('profile-settings')} aria-label={`Minha conta: ${user.name}`} title={user.name} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl px-1 hover:bg-slate-100">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-xs font-bold text-amber-900">{initials(user.name)}</span>
          {!collapsed && <span className="min-w-0 text-left"><span className="block truncate text-xs font-semibold text-slate-900">{user.name}</span><span className="block truncate text-[11px] text-slate-400">{user.email}</span><span className="sr-only">{roleLabel(user.role)}</span></span>}
        </button>
        {!collapsed && <button type="button" onClick={signOut} aria-label="Sair" className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><LogOut size={17} /></button>}
      </div>
      <div className={collapsed ? 'flex justify-center' : 'flex justify-end'}><AnimatedSidebarTrigger /></div>
    </AnimatedSidebarFooter>
    <AnimatedSidebarRail />
  </>
}
