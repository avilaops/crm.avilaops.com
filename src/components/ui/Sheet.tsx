import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRef, type ReactNode, type TouchEvent } from 'react'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** Ações fixas no rodapé; respeitam a área segura do iPhone. */
  footer?: ReactNode
  size?: 'md' | 'lg'
}

const DISTANCIA_PARA_FECHAR = 96

/**
 * Folha de baixo para cima no celular, diálogo centralizado a partir de 600px.
 *
 * No celular ela ocupa a tela inteira: um modal centralizado num visor de 390px
 * deixava o conteúdo espremido e o botão principal fora de vista. Fecha pelo X,
 * pelo Esc, tocando fora (no computador) e arrastando a alça para baixo. O foco
 * fica preso dentro enquanto ela está aberta e volta para quem a abriu — isso
 * vem do Radix, que já estava nas dependências sem uso.
 */
export function Sheet({ open, onClose, title, description, children, footer, size = 'md' }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)

  function onTouchStart(event: TouchEvent) {
    // Arrastar para fechar é gesto de folha; no tablet o diálogo é centralizado
    // e mexer no transform dele o tiraria do lugar.
    if (!window.matchMedia('(max-width: 37.49rem)').matches || !panel.current) return
    startY.current = event.touches[0]?.clientY ?? null
    panel.current.style.transition = 'none'
  }

  function onTouchMove(event: TouchEvent) {
    if (startY.current === null || !panel.current) return
    const delta = Math.max(0, (event.touches[0]?.clientY ?? 0) - startY.current)
    panel.current.style.transform = `translateY(${delta}px)`
  }

  function onTouchEnd(event: TouchEvent) {
    if (startY.current === null || !panel.current) return
    const delta = (event.changedTouches[0]?.clientY ?? 0) - startY.current
    startY.current = null
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    if (delta > DISTANCIA_PARA_FECHAR) onClose()
  }

  const width = size === 'lg' ? 'medium:w-[min(92vw,44rem)]' : 'medium:w-[min(92vw,32rem)]'

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content
          ref={panel}
          className={`fixed inset-x-0 bottom-0 top-[env(safe-area-inset-top)] z-50 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none transition-transform duration-150 medium:inset-auto medium:left-1/2 medium:top-1/2 medium:max-h-[90dvh] medium:-translate-x-1/2 medium:-translate-y-1/2 medium:rounded-2xl ${width}`}
        >
          <div
            className="shrink-0 touch-none border-b border-slate-100 px-4 pb-3 pt-2 medium:px-6 medium:pt-4"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300 medium:hidden" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-sm text-slate-500">{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title}</Dialog.Description>
                )}
              </div>
              <Dialog.Close
                className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={20} />
              </Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 medium:px-6">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] medium:px-6 medium:pb-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
