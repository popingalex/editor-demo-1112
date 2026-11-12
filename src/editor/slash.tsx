import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import type { CatalogKind } from '../data/types'
import { useApp, KIND_LABEL } from '../store/store'
import { insertPick, runBlock, type BlockAction } from './insertActions'
import { cx } from '../ui/kit'

export interface SlashItem {
  id: string
  group: '文本' | '变量与表达式' | '共享组件' | '更多'
  label: string
  hint: string
  keywords: string
  run: (editor: Editor, range: Range) => void
}

const BLOCKS: { a: BlockAction; label: string; k: string }[] = [
  { a: 'paragraph', label: '正文段落', k: 'text paragraph zhengwen 正文 文本 段落' },
  { a: 'h1', label: '一级标题', k: 'h1 heading title biaoti 标题' },
  { a: 'h2', label: '二级标题（章节）', k: 'h2 heading section zhangjie 标题 章节' },
  { a: 'h3', label: '三级标题', k: 'h3 heading biaoti 标题' },
  { a: 'bullet', label: '无序列表', k: 'list bullet liebiao 列表' },
  { a: 'ordered', label: '有序列表', k: 'list ordered number liebiao 列表 编号' },
  { a: 'quote', label: '引用块', k: 'quote blockquote yinyong 引用' },
  { a: 'hr', label: '分隔线', k: 'hr divider fengexian 分隔线 分割线' },
]
const KIND_KEYWORDS: Record<string, string> = {
  variable: '变量 variable var bianliang',
  expression: '表达式 expression formula 公式 biaodashi gongshi 指标',
  chart: '图表 chart tubiao 图',
  table: '分析表 分析表格 表格 table biaoge 透视',
  fixed: '固定表 固定报表 报表 fixed baobiao',
}

/** Build the menu from the live shared registry; pinned to the latest revision at insertion time. */
export function buildSlashItems(query: string, onMore: () => void, allowAssets = true): SlashItem[] {
  const s = useApp.getState()
  const items: SlashItem[] = BLOCKS.map((b) => ({ id: b.a, group: '文本', label: b.label, hint: '', keywords: b.k, run: (e, r) => runBlock(e, b.a, r) }))
  const kinds: CatalogKind[] = ['variable', 'expression', ...(allowAssets ? (['chart', 'table', 'fixed'] as CatalogKind[]) : [])]
  for (const r of [...Object.values(s.resources), ...Object.values(s.assets)]) {
    if (!kinds.includes(r.kind) || r.status === 'archived') continue
    const def = r.revisions.find((x) => x.revision === r.latest)?.def as any
    items.push({
      id: r.assetId,
      group: r.kind === 'variable' || r.kind === 'expression' ? '变量与表达式' : '共享组件',
      label: `${KIND_LABEL[r.kind]} · ${r.title}`,
      hint: `${r.assetId}@r${r.latest}${def?.name ? ' · ' + def.name : ''}`,
      keywords: `${KIND_KEYWORDS[r.kind]} ${r.title} ${r.assetId} ${def?.name ?? ''}`,
      run: (e, range) => insertPick(e, { kind: r.kind, assetId: r.assetId, revision: r.latest }, range),
    })
  }
  items.push({ id: 'more', group: '更多', label: '更多资源…（打开资源选择器）', hint: '可选择历史版本', keywords: 'more picker 更多 资源 选择 版本', run: (e, range) => (e.chain().focus().deleteRange(range).run(), onMore()) })
  const toks = query.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter((it) => toks.every((t) => `${it.label} ${it.keywords} ${it.hint}`.toLowerCase().includes(t))).slice(0, 60)
}

interface MenuHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}
const SlashMenu = forwardRef<MenuHandle, SuggestionProps<SlashItem>>(function SlashMenu(props, ref) {
  const [idx, setIdx] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => setIdx(0), [props.query])
  useEffect(() => {
    list.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [idx])
  const pick = (i: number) => {
    const it = props.items[i]
    if (it) props.command(it)
  }
  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!props.items.length) return false
      if (e.key === 'ArrowDown') return setIdx((idx + 1) % props.items.length), true
      if (e.key === 'ArrowUp') return setIdx((idx - 1 + props.items.length) % props.items.length), true
      if (e.key === 'Enter' || e.key === 'Tab') return pick(idx), true
      return false
    },
  }))
  if (!props.items.length)
    return (
      <div data-slash-menu="empty" className="w-72 bg-white border border-line rounded-lg shadow-xl p-2 text-[12px] text-ink-3">
        没有匹配“{props.query}”的命令 · 继续输入将作为普通文本，Esc 关闭
      </div>
    )
  let last = ''
  return (
    <div ref={list} data-slash-menu="" role="listbox" aria-label="插入命令" className="w-80 max-h-80 overflow-auto scroll-thin bg-white border border-line rounded-lg shadow-xl p-1">
      {props.items.map((it, i) => {
        const header = it.group !== last ? ((last = it.group), it.group) : null
        return (
          <div key={it.id + i}>
            {header && <div className="px-2 pt-1.5 pb-0.5 text-[10.5px] font-semibold text-gray-400 tracking-wider">{header}</div>}
            <button
              data-idx={i}
              role="option"
              aria-selected={i === idx}
              onMouseEnter={() => setIdx(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              className={cx('w-full text-left px-2 py-1.5 rounded-md', i === idx ? 'bg-brand-50 text-brand-700' : 'text-ink-2')}
            >
              <div className="text-[12.5px] truncate">{it.label}</div>
              {it.hint && <div className="text-[10.5px] font-mono text-ink-3 truncate">{it.hint}</div>}
            </button>
          </div>
        )
      })}
      <div className="px-2 py-1 text-[10.5px] text-ink-3 border-t border-line mt-1">↑↓ 选择 · Enter 插入 · Esc 关闭（保留已输入文字）</div>
    </div>
  )
})

export interface SlashOptions {
  getItems: (query: string) => SlashItem[]
}
export const SlashKey = new PluginKey('slashCommand')

export const SlashCommand = Extension.create<SlashOptions>({
  name: 'slashCommand',
  addOptions() {
    return { getItems: () => [] }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        pluginKey: SlashKey,
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        // allow `/` right after CJK text (no space needed)
        allowedPrefixes: null,
        items: ({ query }) => this.options.getItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let comp: ReactRenderer<MenuHandle, SuggestionProps<SlashItem>> | null = null
          const place = (p: SuggestionProps<SlashItem>) => {
            const rect = p.clientRect?.()
            const el = comp?.element as HTMLElement | undefined
            if (!rect || !el) return
            const below = rect.bottom + 6
            const h = el.offsetHeight || 320
            el.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`
            el.style.top = `${below + h > window.innerHeight ? Math.max(8, rect.top - h - 6) : below}px`
          }
          return {
            onStart: (p) => {
              comp = new ReactRenderer(SlashMenu, { props: p, editor: p.editor })
              const el = comp.element as HTMLElement
              el.style.position = 'fixed'
              el.style.zIndex = '70'
              document.body.appendChild(el)
              requestAnimationFrame(() => place(p))
            },
            onUpdate: (p) => {
              comp?.updateProps(p)
              requestAnimationFrame(() => place(p))
            },
            onKeyDown: (p: SuggestionKeyDownProps) => {
              if (p.event.key === 'Escape') return true
              return comp?.ref?.onKeyDown(p.event) ?? false
            },
            onExit: () => {
              ;(comp?.element as HTMLElement | undefined)?.remove()
              comp?.destroy()
              comp = null
            },
          }
        },
      }),
    ]
  },
})
