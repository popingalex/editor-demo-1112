import { useRef, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { PANEL_DEFAULTS, usePanel, useUI } from '../store/store'
import { cx } from './kit'

/** Drag handle that resizes a persisted panel width. */
export function ResizeHandle({ id, side }: { id: string; side: 'left' | 'right' }) {
  const setPanel = useUI((s) => s.setPanel)
  const pref = usePanel(id)
  const d = PANEL_DEFAULTS[id]
  const start = useRef(0)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整宽度（方向键也可调整）"
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 16
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const grow = (e.key === 'ArrowRight') === (side === 'left')
          setPanel(id, { width: Math.min(d.max, Math.max(d.min, pref.width + (grow ? step : -step))) })
        }
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        start.current = e.clientX
        const w0 = pref.width
        const move = (ev: MouseEvent) => {
          const dx = ev.clientX - start.current
          setPanel(id, { width: Math.min(d.max, Math.max(d.min, w0 + (side === 'left' ? dx : -dx))) })
        }
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
          document.body.style.cursor = ''
        }
        document.body.style.cursor = 'col-resize'
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }}
      data-resize={id}
      className={cx('absolute top-0 bottom-0 w-1.5 z-20 cursor-col-resize hover:bg-brand-500/40 focus-visible:bg-brand-500/60 outline-none', side === 'left' ? '-right-[3px]' : '-left-[3px]')}
    />
  )
}

/**
 * Shared workbench side panel: independent collapse (to a narrow strip) and drag/keyboard resize,
 * both persisted in the UI store. Collapsing the whole panel is separate from any inner list grouping.
 */
export function SidePanel({ id, side, title, children, actions, className }: { id: string; side: 'left' | 'right'; title: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  const pref = usePanel(id)
  const setPanel = useUI((s) => s.setPanel)
  const OpenI = side === 'left' ? PanelLeftOpen : PanelRightOpen
  const CloseI = side === 'left' ? PanelLeftClose : PanelRightClose
  const bodyId = `panel-${id}`
  if (pref.collapsed)
    return (
      <aside data-panel={id} data-collapsed="true" className={cx('w-9 shrink-0 bg-white flex flex-col items-center py-2 gap-2', side === 'left' ? 'border-r border-line' : 'border-l border-line')}>
        <button
          aria-expanded={false}
          aria-controls={bodyId}
          title={`展开${typeof title === 'string' ? title : '面板'}`}
          aria-label={`展开${typeof title === 'string' ? title : '面板'}`}
          onClick={() => setPanel(id, { collapsed: false })}
          className="size-7 grid place-items-center rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-500 outline-none"
        >
          <OpenI className="size-4" />
        </button>
        <span className="text-[11px] text-ink-3 [writing-mode:vertical-rl] tracking-widest select-none">{title}</span>
      </aside>
    )
  return (
    <aside data-panel={id} data-collapsed="false" style={{ width: pref.width }} className={cx('relative shrink-0 bg-white flex flex-col min-h-0', side === 'left' ? 'border-r border-line' : 'border-l border-line', className)}>
      <div className="flex items-center justify-between gap-1 px-3 h-10 border-b border-line shrink-0">
        <span className="text-[12.5px] font-semibold truncate">{title}</span>
        <span className="flex items-center gap-0.5">
          {actions}
          <button
            aria-expanded
            aria-controls={bodyId}
            title="收起面板"
            aria-label={`收起${typeof title === 'string' ? title : '面板'}`}
            onClick={() => setPanel(id, { collapsed: true })}
            className="size-7 grid place-items-center rounded-md text-ink-3 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand-500 outline-none"
          >
            <CloseI className="size-4" />
          </button>
        </span>
      </div>
      <div id={bodyId} className="flex-1 min-h-0 overflow-auto scroll-thin">
        {children}
      </div>
      <ResizeHandle id={id} side={side} />
    </aside>
  )
}
