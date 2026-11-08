'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, PanelLeft, X } from 'lucide-react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { createContext, forwardRef, useContext, useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { cn } from '../../lib/utils'

const SPRING_LAYOUT = { type: 'spring', stiffness: 380, damping: 34 } as const
const SPRING_PRESS = { type: 'spring', stiffness: 500, damping: 30 } as const

type SidebarState = {
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  reduce: boolean
  layoutId: string
  returnFocus: RefObject<HTMLButtonElement | null>
}
const SidebarContext = createContext<SidebarState | null>(null)
const PanelContext = createContext({ collapsed: false, id: 'desktop' })
const MenuContext = createContext('menu')

export function useAnimatedSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('AnimatedSidebarProvider ausente')
  return context
}

export function useAnimatedSidebarPanel() {
  return useContext(PanelContext)
}

export function AnimatedSidebarProvider({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(true)
  const [openMobile, setOpenMobile] = useState(false)
  const isMobile = useMediaQuery('(max-width: 599px)')
  const reduce = Boolean(useReducedMotion())
  const layoutId = useId()
  const returnFocus = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        const target = event.target as HTMLElement | null
        if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
        event.preventDefault()
        if (isMobile) setOpenMobile((value) => !value)
        else setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobile])

  useEffect(() => { if (!isMobile) setOpenMobile(false) }, [isMobile])

  return (
    <SidebarContext.Provider value={{ open, setOpen, openMobile, setOpenMobile, isMobile, reduce, layoutId, returnFocus }}>
      <MotionConfig reducedMotion="user">{className ? <div className={cn('relative flex min-h-dvh w-full', className)}>{children}</div> : children}</MotionConfig>
    </SidebarContext.Provider>
  )
}

export function AnimatedSidebar({ children, className, panelClassName, ariaLabel = 'Barra lateral do CRM', collapsible = 'icon' }: { children: ReactNode; className?: string; panelClassName?: string; ariaLabel?: string; collapsible?: 'icon' | 'none' }) {
  const context = useAnimatedSidebar()
  const collapsed = collapsible === 'icon' && !context.open
  return (
    <>
      <PanelContext.Provider value={{ collapsed, id: 'desktop' }}>
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 72 : 248 }}
          transition={context.reduce ? { duration: 0 } : SPRING_LAYOUT}
          data-slot="sidebar"
          data-state={collapsed ? 'collapsed' : 'expanded'}
          aria-label={ariaLabel}
          className={cn('group/sidebar sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white medium:flex', className, panelClassName)}
        >{children}</motion.aside>
      </PanelContext.Provider>
      <Dialog.Root open={context.openMobile} onOpenChange={context.setOpenMobile}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
          <Dialog.Content
            onCloseAutoFocus={(event) => { event.preventDefault(); context.returnFocus.current?.focus() }}
            data-slot="sidebar-mobile"
            data-state="expanded"
            className={cn('group/sidebar fixed inset-y-0 left-0 z-50 flex w-[min(300px,calc(100vw-40px))] flex-col border-r border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-xl outline-none', panelClassName)}
          >
            <Dialog.Title className="sr-only">Menu do CRM</Dialog.Title>
            <Dialog.Description className="sr-only">Navegação e configurações da sua área de trabalho.</Dialog.Description>
            <PanelContext.Provider value={{ collapsed: false, id: 'mobile' }}>{children}</PanelContext.Provider>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

export function AnimatedSidebarTrigger({ className, children }: { className?: string; children?: ReactNode }) {
  const context = useAnimatedSidebar()
  return <button
    type="button"
    onClick={(event) => {
      if (context.isMobile) { context.returnFocus.current = event.currentTarget; context.setOpenMobile(!context.openMobile) }
      else context.setOpen(!context.open)
    }}
    aria-label={context.isMobile ? 'Abrir menu' : context.open ? 'Recolher menu' : 'Expandir menu'}
    aria-expanded={context.isMobile ? context.openMobile : context.open}
    aria-haspopup={context.isMobile ? 'dialog' : undefined}
    className={cn('grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100', className)}
  >{children ?? <PanelLeft size={18} />}</button>
}

export const AnimatedSidebarHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarHeader({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-header" className={cn('flex h-16 shrink-0 items-center gap-2 overflow-hidden px-3', className)} />
})
export const AnimatedSidebarContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarContent({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-content" className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2', className)} />
})
export const AnimatedSidebarFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarFooter({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-footer" className={cn('shrink-0 border-t border-slate-200 p-2', className)} />
})
export const AnimatedSidebarGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarGroup({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-group" className={cn('flex w-full min-w-0 flex-col px-1 py-1.5', className)} />
})
export const AnimatedSidebarGroupLabel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarGroupLabel({ className, ...props }, ref) {
  const { collapsed } = useAnimatedSidebarPanel()
  return <div {...props} ref={ref} aria-hidden={collapsed} data-slot="sidebar-group-label" className={cn('mb-1 h-7 overflow-hidden px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 transition-opacity', collapsed ? 'opacity-0' : 'opacity-100', className)} />
})
export const AnimatedSidebarGroupContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarGroupContent({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-group-content" className={cn('w-full min-w-0', className)} />
})
export const AnimatedSidebarMenu = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(function AnimatedSidebarMenu({ className, ...props }, ref) {
  const id = useId()
  return <MenuContext.Provider value={id}><ul {...props} ref={ref} data-slot="sidebar-menu" className={cn('flex w-full min-w-0 list-none flex-col gap-0.5', className)} /></MenuContext.Provider>
})
export const AnimatedSidebarMenuItem = forwardRef<HTMLLIElement, HTMLMotionProps<'li'>>(function AnimatedSidebarMenuItem({ className, ...props }, ref) {
  return <motion.li {...props} ref={ref} layout="position" transition={SPRING_LAYOUT} data-slot="sidebar-menu-item" className={cn('relative', className)} />
})

export interface AnimatedSidebarMenuSubProps extends Omit<HTMLMotionProps<'ul'>, 'children'> { open: boolean; children?: ReactNode }
export const AnimatedSidebarMenuSub = forwardRef<HTMLUListElement, AnimatedSidebarMenuSubProps>(function AnimatedSidebarMenuSub({ open, children, className, ...props }, ref) {
  const { reduce } = useAnimatedSidebar()
  const { collapsed } = useAnimatedSidebarPanel()
  return <AnimatePresence initial={false}>{open && !collapsed && <motion.ul
    {...props} ref={ref} key="sidebar-submenu"
    initial={reduce ? false : { height: 0, opacity: 0 }}
    animate={{ height: 'auto', opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
    data-slot="sidebar-menu-sub"
    className={cn('relative ml-5 mt-1 flex min-w-0 flex-col gap-0.5 overflow-hidden border-l border-slate-200 pl-3', className)}
  >{children}</motion.ul>}</AnimatePresence>
})
export const AnimatedSidebarMenuSubItem = forwardRef<HTMLLIElement, HTMLMotionProps<'li'>>(function AnimatedSidebarMenuSubItem({ className, ...props }, ref) {
  return <motion.li {...props} ref={ref} data-slot="sidebar-menu-sub-item" className={cn('relative min-w-0', className)} />
})

export interface AnimatedSidebarMenuButtonProps {
  children: ReactNode
  icon?: ReactNode
  badge?: ReactNode
  href?: string
  isActive?: boolean
  ariaExpanded?: boolean
  disabled?: boolean
  closeOnSelect?: boolean
  target?: '_blank' | '_self' | '_parent' | '_top'
  rel?: string
  onSelect?: () => void
  className?: string
}

export function AnimatedSidebarMenuButton({ children, icon, badge, href, isActive = false, ariaExpanded, disabled = false, closeOnSelect, target, rel, onSelect, className }: AnimatedSidebarMenuButtonProps) {
  const context = useAnimatedSidebar()
  const { collapsed, id } = useAnimatedSidebarPanel()
  const menuId = useContext(MenuContext)
  const textLabel = typeof children === 'string' ? children : undefined
  const select = (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (disabled) { event.preventDefault(); return }
    onSelect?.()
    if (context.isMobile && (closeOnSelect ?? ariaExpanded === undefined)) context.setOpenMobile(false)
    if (ariaExpanded !== undefined && collapsed && !context.isMobile) context.setOpen(true)
  }
  const content = <>
    {isActive && <motion.span layoutId={`${context.layoutId}-${id}-${menuId}`} transition={context.reduce ? { duration: 0 } : SPRING_LAYOUT} className="absolute inset-0 rounded-xl bg-slate-100" />}
    {icon && <span aria-hidden="true" className="relative z-10 grid size-5 shrink-0 place-items-center">{icon}</span>}
    <motion.span initial={false} animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -4 : 0 }} transition={context.reduce ? { duration: 0 } : { duration: 0.15 }} aria-hidden={collapsed} className={cn('relative z-10 min-w-0 flex-1 truncate', collapsed && 'pointer-events-none')}>{children}</motion.span>
    {badge && !collapsed && <span className="relative z-10 shrink-0 text-xs text-slate-400">{badge}</span>}
    {ariaExpanded !== undefined && !collapsed && <motion.span aria-hidden="true" animate={{ rotate: ariaExpanded ? 90 : 0 }} transition={SPRING_LAYOUT} className="relative z-10"><ChevronRight size={14} /></motion.span>}
  </>
  const shared = {
    'aria-current': isActive && ariaExpanded === undefined ? 'page' as const : undefined,
    'aria-expanded': ariaExpanded,
    'aria-label': collapsed ? textLabel : undefined,
    title: collapsed ? textLabel : undefined,
    onClick: select,
    whileTap: context.reduce || disabled ? undefined : { scale: 0.98 },
    transition: SPRING_PRESS,
    className: cn('relative flex min-h-11 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl px-3 text-left text-sm font-medium text-slate-500 outline-none transition-colors hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500', isActive && 'text-slate-900', disabled && 'cursor-not-allowed opacity-40', className),
  }
  return href ? <motion.a {...shared} href={href} target={target} rel={rel ?? (target === '_blank' ? 'noreferrer noopener' : undefined)} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined}>{content}</motion.a>
    : <motion.button {...shared} type="button" disabled={disabled}>{content}</motion.button>
}

export type AnimatedSidebarMenuSubButtonProps = Omit<AnimatedSidebarMenuButtonProps, 'badge' | 'ariaExpanded'>
export function AnimatedSidebarMenuSubButton({ children, icon, className, ...props }: AnimatedSidebarMenuSubButtonProps) {
  return <AnimatedSidebarMenuButton {...props} icon={icon ?? <span className="size-1 rounded-full bg-current" />} className={cn('text-xs font-normal', className)}>{children}</AnimatedSidebarMenuButton>
}

export const AnimatedSidebarInset = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarInset({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-inset" className={cn('flex min-w-0 flex-1 flex-col', className)} />
})

export function AnimatedSidebarClose({ children, className }: { children?: ReactNode; className?: string }) {
  const { setOpenMobile } = useAnimatedSidebar()
  return <button type="button" onClick={() => setOpenMobile(false)} aria-label="Fechar menu" className={cn('grid size-11 place-items-center rounded-lg hover:bg-slate-100', className)}>{children ?? <X size={18} />}</button>
}

export function AnimatedSidebarRail() {
  const { open, setOpen } = useAnimatedSidebar()
  return <button type="button" onClick={() => setOpen(!open)} aria-label="Alternar largura do menu" title="Alternar largura do menu" className="absolute inset-y-0 right-0 hidden w-1 cursor-col-resize bg-slate-200 opacity-0 hover:opacity-100 focus-visible:opacity-100 medium:block" />
}

export default AnimatedSidebar
