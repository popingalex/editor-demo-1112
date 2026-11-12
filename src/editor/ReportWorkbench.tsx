import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection } from '@tiptap/pm/state'
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  BarChart3,
  Table2,
  FileSpreadsheet,
  Braces,
  Sigma,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  ExternalLink,
  Eraser,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  Slash,
} from 'lucide-react'
import { ChartAssetNode, ExpressionRefNode, FixedTableAssetNode, TableAssetNode, VariableNode, InlineChip } from './extensions'
import { ReportCtx, type ReportCtxValue } from './context'
import { DocRenderer } from './DocRenderer'
import { addSection, deleteSection, moveSection, sectionRange } from './sections'
import { SlashCommand, buildSlashItems } from './slash'
import { insertPick, type InsertPick } from './insertActions'
import type { AssetKind, CatalogKind, ChartDef, DataContext, ExpressionDef, TableDef, VariableDef } from '../data/types'
import { ASSET_NODE_TYPES, OVERRIDE_LABELS, collectRefs, docText, overrideKeys, resolveInline, inlineKey, collectInlineRefs } from '../data/reports'
import { CHART_TYPES, PALETTES } from '../data/chartModel'
import { DATASETS, fieldLabel } from '../data/engine'
import { formatResult } from '../data/expr'
import { useApp, useUI, KIND_LABEL, getRecord } from '../store/store'
import { Badge, Button, Field, NumberInput, Section, Segmented, Select, TextInput, Toggle, cx } from '../ui/kit'
import { SidePanel } from '../ui/SidePanel'
import { DataContextBar, FilterEditor } from '../components/DataControls'
import { KIND_ICON } from '../components/AssetBlock'
import { ResourcePicker, EDITOR_FOR } from '../components/Catalog'

interface OutlineItem {
  index: number
  kind: 'h' | 'a'
  level: number
  text: string
  assetKind?: AssetKind
  rev?: number
}

interface Selected {
  pos: number
  type: string
  attrs: Record<string, any>
}

export interface WorkbenchProps {
  initialDoc: JSONContent
  onDocChange: (d: JSONContent) => void
  ctx: Omit<ReportCtxValue, 'preview'>
  preview: boolean
  mode: 'template' | 'instance'
  onParamsChange?: (p: DataContext) => void
  insertAssetId?: string
  headerSlot?: React.ReactNode
  /** Called once with the editor-normalized document so callers can rebase their dirty baseline. */
  onReady?: (d: JSONContent) => void
  /** current variable values in this scope (template draft / instance), keyed by variable assetId */
  varValues: Record<string, string | number | boolean | null>
  onVarValue: (variableId: string, value: string | number | boolean | null) => void
  /** instance mode: snapshot newly inserted shared resources (and their upstream chain) */
  onInsertResource?: (p: InsertPick) => void
  docKey?: string
}

const ZOOMS = [
  { value: 'fit', label: '适合宽度' },
  { value: '1', label: '100%' },
  { value: '0.9', label: '90%' },
  { value: '0.8', label: '80%' },
  { value: '0.7', label: '70%' },
]

export function ReportWorkbench({ initialDoc, onDocChange, ctx, preview, mode, onParamsChange, insertAssetId, headerSlot, onReady, varValues, onVarValue, onInsertResource, docKey }: WorkbenchProps) {
  const [doc, setDoc] = useState<JSONContent>(initialDoc)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [picker, setPicker] = useState<CatalogKind[] | null>(null)
  const [zoom, setZoom] = useState('fit')
  const scrollRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onDocChange)
  onChangeRef.current = onDocChange
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onInsertRef = useRef(onInsertResource)
  onInsertRef.current = onInsertResource
  const assets = useApp((s) => s.assets)
  const go = useUI((s) => s.go)
  const collapsedSections = useUI((s) => s.outlineCollapsedSections)
  const toggleSection = useUI((s) => s.toggleOutlineSection)
  const openPickerRef = useRef<() => void>(() => {})
  openPickerRef.current = () => setPicker(['variable', 'expression', 'chart', 'table', 'fixed'])

  const doInsert = (p: InsertPick, range?: any) => {
    if (!editor) return
    onInsertRef.current?.(p)
    insertPick(editor, p, range)
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      ChartAssetNode,
      TableAssetNode,
      FixedTableAssetNode,
      VariableNode,
      ExpressionRefNode,
      SlashCommand.configure({
        getItems: (q: string) =>
          buildSlashItems(q, () => openPickerRef.current()).map((it) => ({
            ...it,
            // every slash insertion goes through the same insert action (+ instance snapshot)
            run: (e: any, range: any) => {
              if (it.group === '变量与表达式' || it.group === '共享组件') {
                const r = getRecord(useApp.getState(), it.id)
                if (r) onInsertRef.current?.({ kind: r.kind, assetId: r.assetId, revision: r.latest })
              }
              it.run(e, range)
            },
          })),
      }),
    ],
    content: initialDoc,
    editorProps: { attributes: { class: 'report-doc min-h-[560px]', 'aria-label': '报告正文（输入 / 唤起插入菜单）' } },
    onCreate: ({ editor }) => {
      const j = editor.getJSON()
      setDoc(j)
      onReadyRef.current?.(j)
    },
    onUpdate: ({ editor }) => {
      const j = editor.getJSON()
      setDoc(j)
      onChangeRef.current(j)
    },
  })

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      strike: e?.isActive('strike') ?? false,
      h1: e?.isActive('heading', { level: 1 }) ?? false,
      h2: e?.isActive('heading', { level: 2 }) ?? false,
      h3: e?.isActive('heading', { level: 3 }) ?? false,
      p: e?.isActive('paragraph') ?? false,
      ul: e?.isActive('bulletList') ?? false,
      ol: e?.isActive('orderedList') ?? false,
      quote: e?.isActive('blockquote') ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  })

  useEffect(() => {
    if (!editor) return
    const h = () => {
      const s = editor.state.selection
      if (s instanceof NodeSelection && (ASSET_NODE_TYPES[s.node.type.name] || s.node.type.name === 'variable' || s.node.type.name === 'expressionRef')) setSelected({ pos: s.from, type: s.node.type.name, attrs: s.node.attrs })
      else setSelected(null)
    }
    editor.on('selectionUpdate', h)
    editor.on('transaction', h)
    return () => {
      editor.off('selectionUpdate', h)
      editor.off('transaction', h)
    }
  }, [editor])

  useEffect(() => {
    editor?.setEditable(!preview, false)
  }, [editor, preview])

  // Values depend on variable overrides: re-render NodeViews when they change.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('ctxRefresh', true))
  }, [editor, ctx.env, ctx.params])

  const inserted = useRef(false)
  useEffect(() => {
    if (!editor || !insertAssetId || inserted.current) return
    const a = assets[insertAssetId]
    if (!a || a.kind === 'report') return
    inserted.current = true
    setTimeout(() => {
      const end = editor.state.doc.content.size
      editor.commands.setTextSelection(end)
      doInsert({ kind: a.kind, assetId: a.assetId, revision: a.latest })
      setTimeout(() => scrollRef.current?.querySelector(`[data-asset-node]:last-of-type`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    }, 50)
  }, [editor, insertAssetId, assets])

  const topPos = (index: number) => {
    let pos = 0
    editor?.state.doc.forEach((_, offset, i) => {
      if (i === index) pos = offset
    })
    return pos
  }
  const scrollToIndex = (index: number) => {
    if (!editor) return
    if (preview) {
      scrollRef.current?.querySelector(`[data-heading-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const pos = topPos(index)
    const n = editor.state.doc.child(index)
    if (ASSET_NODE_TYPES[n.type.name]) editor.chain().focus().setNodeSelection(pos).run()
    else editor.chain().focus().setTextSelection(pos + 1).run()
    ;(editor.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const replaceDoc = (d: JSONContent | null) => {
    if (!d || !editor) return
    editor.commands.setContent(d, { emitUpdate: true })
  }
  const updateAttrs = (patch: Record<string, any>) => {
    if (!editor || !selected) return
    const node = editor.state.doc.nodeAt(selected.pos)
    if (!node) return
    const tr = editor.state.tr.setNodeMarkup(selected.pos, undefined, { ...node.attrs, ...patch })
    tr.setSelection(NodeSelection.create(tr.doc, selected.pos))
    editor.view.dispatch(tr)
  }
  const setOverride = (k: string, v: any) => {
    const cur = { ...(selected?.attrs.overrides ?? {}) }
    if (v === undefined || v === null || v === '' || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) delete cur[k]
    else cur[k] = v
    updateAttrs({ overrides: cur })
  }

  const outlineItems = useMemo(
    () =>
      (doc.content ?? []).flatMap((n, index): OutlineItem[] => {
        if (n.type === 'heading') return [{ index, kind: 'h', level: n.attrs?.level ?? 1, text: docText(n) || '（空标题）' }]
        if (n.type && ASSET_NODE_TYPES[n.type]) return [{ index, kind: 'a', level: 9, text: n.attrs?.assetId, assetKind: ASSET_NODE_TYPES[n.type], rev: n.attrs?.assetRevision }]
        return []
      }),
    [doc],
  )
  // hide items inside collapsed sections (outline grouping is independent of panel collapse)
  const visibleOutline = useMemo(() => {
    const out: (OutlineItem & { hiddenBy?: number; sectionKey?: string; hasChildren?: boolean })[] = []
    let hideUntil = -1
    for (const o of outlineItems) {
      if (o.index < hideUntil) continue
      const key = `${docKey ?? ''}:${o.index}:${o.text}`
      if (o.kind === 'h' && o.level >= 2) {
        const [, end] = sectionRange(doc, o.index)
        const hasChildren = outlineItems.some((x) => x.index > o.index && x.index < end)
        out.push({ ...o, sectionKey: key, hasChildren })
        if (collapsedSections[key]) hideUntil = end
      } else out.push(o)
    }
    return out
  }, [outlineItems, collapsedSections, doc, docKey])
  const refs = collectRefs(doc)
  const inlineRefs = collectInlineRefs(doc)
  const ctxValue: ReportCtxValue = { ...ctx, preview }
  const sectionCount = outlineItems.filter((o) => o.kind === 'h' && o.level === 2).length

  const TB = ({ on, onClick, icon, label, disabled }: { on?: boolean; onClick: () => void; icon: any; label: string; disabled?: boolean }) => {
    const I = icon
    return (
      <button title={label} aria-label={label} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className={cx('size-7 grid place-items-center rounded text-ink-2 hover:bg-gray-100 disabled:opacity-30', on && 'bg-brand-50 text-brand-700')}>
        <I className="size-4" />
      </button>
    )
  }
  const zoomValue = zoom === 'fit' ? undefined : Number(zoom)

  return (
    <ReportCtx.Provider value={ctxValue}>
      <div className="flex-1 min-h-0 flex">
        <SidePanel
          id="outline"
          side="left"
          title="章节目录"
          actions={
            !preview && (
              <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} aria-label="新增章节" onClick={() => replaceDoc(addSection(doc, null, `${sectionCount + 1}. 新章节`))}>
                章节
              </Button>
            )
          }
        >
          <div className="p-2 space-y-px" data-outline="">
            {visibleOutline.map((o) =>
              o.kind === 'h' ? (
                <div key={o.index} className="group flex items-center rounded hover:bg-gray-50 focus-within:bg-gray-50" style={{ paddingLeft: (o.level - 1) * 8 }}>
                  {o.sectionKey && o.hasChildren ? (
                    <button
                      aria-expanded={!collapsedSections[o.sectionKey]}
                      aria-label={collapsedSections[o.sectionKey] ? `展开章节 ${o.text}` : `折叠章节 ${o.text}`}
                      onClick={() => toggleSection(o.sectionKey!)}
                      className="size-5 grid place-items-center rounded hover:bg-gray-200 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {collapsedSections[o.sectionKey] ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}
                  <button onClick={() => scrollToIndex(o.index)} className={cx('flex-1 text-left truncate py-1.5 px-1 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded', o.level === 1 ? 'font-semibold text-ink' : o.level === 2 ? 'text-ink-2 font-medium' : 'text-ink-3')}>
                    {o.text}
                  </button>
                  {!preview && o.level >= 2 && (
                    <span className="hidden group-hover:flex group-focus-within:flex items-center pr-1">
                      <button title="上移章节" aria-label={`上移章节 ${o.text}`} onClick={() => replaceDoc(moveSection(doc, o.index, -1))} className="size-5 grid place-items-center rounded hover:bg-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                        <ArrowUp className="size-3" />
                      </button>
                      <button title="下移章节" aria-label={`下移章节 ${o.text}`} onClick={() => replaceDoc(moveSection(doc, o.index, 1))} className="size-5 grid place-items-center rounded hover:bg-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                        <ArrowDown className="size-3" />
                      </button>
                      <button title="在此后插入章节" aria-label={`在 ${o.text} 后插入章节`} onClick={() => replaceDoc(addSection(doc, o.index, '新章节'))} className="size-5 grid place-items-center rounded hover:bg-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                        <Plus className="size-3" />
                      </button>
                      <button title="删除整个章节" aria-label={`删除章节 ${o.text}`} onClick={() => replaceDoc(deleteSection(doc, o.index))} className="size-5 grid place-items-center rounded hover:bg-red-100 text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  )}
                </div>
              ) : (
                <button
                  key={o.index}
                  onClick={() => scrollToIndex(o.index)}
                  className={cx('w-full flex items-center gap-1.5 pl-8 pr-1.5 py-1 rounded text-[11.5px] text-ink-3 hover:bg-gray-50', selected && editor && topPos(o.index) === selected.pos && 'bg-brand-50 text-brand-700')}
                >
                  {(() => {
                    const I = KIND_ICON[o.assetKind!]
                    return <I className="size-3 shrink-0" />
                  })()}
                  <span className="font-mono truncate">
                    {o.text} r{o.rev}
                  </span>
                </button>
              ),
            )}
          </div>
          <div className="px-3 py-2 border-t border-line text-[11px] text-ink-3">
            {refs.length} 个资源节点 · {inlineRefs.length} 个行内引用
          </div>
        </SidePanel>

        <div className="flex-1 min-w-0 flex flex-col bg-[#EEF0F3]" data-canvas="">
          <div className="shrink-0 bg-white border-b border-line px-3 py-1.5 flex flex-wrap items-center gap-0.5" data-toolbar="">
            {!preview && (
              <>
                <TB icon={Undo2} label="撤销" disabled={!st?.canUndo} onClick={() => editor?.chain().focus().undo().run()} />
                <TB icon={Redo2} label="恢复" disabled={!st?.canRedo} onClick={() => editor?.chain().focus().redo().run()} />
                <span className="w-px h-5 bg-line mx-1" />
                <TB icon={Heading1} label="一级标题" on={st?.h1} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
                <TB icon={Heading2} label="二级标题（章节）" on={st?.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
                <TB icon={Heading3} label="三级标题" on={st?.h3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
                <TB icon={Pilcrow} label="正文段落" on={st?.p} onClick={() => editor?.chain().focus().setParagraph().run()} />
                <span className="w-px h-5 bg-line mx-1" />
                <TB icon={Bold} label="加粗" on={st?.bold} onClick={() => editor?.chain().focus().toggleBold().run()} />
                <TB icon={Italic} label="斜体" on={st?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()} />
                <TB icon={Strikethrough} label="删除线" on={st?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()} />
                <TB icon={List} label="无序列表" on={st?.ul} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
                <TB icon={ListOrdered} label="有序列表" on={st?.ol} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
                <TB icon={Quote} label="引用" on={st?.quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
                <span className="w-px h-5 bg-line mx-1" />
                <Button size="sm" variant="ghost" icon={<BarChart3 className="size-3.5" />} onClick={() => setPicker(['chart'])}>
                  图表
                </Button>
                <Button size="sm" variant="ghost" icon={<Table2 className="size-3.5" />} onClick={() => setPicker(['table'])}>
                  分析表
                </Button>
                <Button size="sm" variant="ghost" icon={<FileSpreadsheet className="size-3.5" />} onClick={() => setPicker(['fixed'])}>
                  固定表
                </Button>
                <Button size="sm" variant="ghost" icon={<Braces className="size-3.5" />} onClick={() => setPicker(['variable'])}>
                  变量
                </Button>
                <Button size="sm" variant="ghost" icon={<Sigma className="size-3.5" />} onClick={() => setPicker(['expression'])}>
                  表达式
                </Button>
                <span className="text-[11px] text-ink-3 inline-flex items-center gap-1 ml-1" title="在正文中输入 / 唤起插入菜单">
                  <Slash className="size-3" />
                  输入 / 插入
                </span>
              </>
            )}
            <span className="flex-1" />
            <Select size="sm" className="w-28" value={zoom} onChange={setZoom} options={ZOOMS} aria-label="页面缩放" />
            {headerSlot}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-auto scroll-thin py-6 px-4">
            <div style={{ zoom: zoomValue } as any} className="mx-auto w-full max-w-[820px] bg-white rounded-sm shadow-[0_2px_10px_rgba(16,24,40,.08)] px-10 py-12 relative">
              <div className="absolute top-3 right-4 text-[10px] font-semibold text-amber-700 tracking-wider">
                DEMO / 演示数据 · {mode === 'template' ? (preview ? '模板预览' : '模板编辑') : preview ? '实例预览' : '实例编辑'}
              </div>
              <div className={cx(preview && 'hidden')}>
                <EditorContent editor={editor} />
              </div>
              {preview && <DocRenderer doc={doc} />}
            </div>
          </div>
        </div>

        <SidePanel id="props" side="right" title={selected && !preview ? '节点属性' : '文档属性'}>
          {selected && !preview && ASSET_NODE_TYPES[selected.type] ? (
            <NodePanel
              sel={selected}
              mode={mode}
              ctx={ctx}
              onOverride={setOverride}
              onAttrs={updateAttrs}
              onClear={() => updateAttrs({ overrides: {} })}
              onDelete={() => editor?.chain().focus().deleteSelection().run()}
              onEditShared={(kind, id) => go(kind === 'chart' ? 'chart' : kind === 'table' ? 'table' : 'fixed', { assetId: id })}
              assets={assets}
            />
          ) : selected && !preview ? (
            <InlinePanel sel={selected} mode={mode} ctx={ctx} varValues={varValues} onVarValue={onVarValue} onAttrs={updateAttrs} onDelete={() => editor?.chain().focus().deleteSelection().run()} />
          ) : (
            <>
              <Section title="数据参数">
                {mode === 'template' ? (
                  <>
                    <DataContextBar value={ctx.params} onChange={(p) => onParamsChange?.(p)} />
                    <div className="text-[11px] text-ink-3">模板默认参数（编辑与预览共用）；生成实例时可重新选择。</div>
                  </>
                ) : (
                  <div className="text-[12.5px] space-y-1">
                    <div>
                      冻结范围：<b>{ctx.params.simulationId}</b> / {ctx.params.branch} / Tick {ctx.params.tick}
                    </div>
                    <div className="text-[11px] text-ink-3">实例在生成时固定数据范围与依赖快照；可通过实例作用域变量做局部修订。</div>
                  </div>
                )}
              </Section>
              <Section title={`行内变量与表达式（${inlineRefs.length}）`}>
                {inlineRefs.length === 0 && <div className="text-[12px] text-ink-3">尚未插入。在正文输入 / 搜索“变量”或“表达式”。</div>}
                {[...new Map(inlineRefs.map((r) => [inlineKey(r), r])).values()].map((r) => {
                  const { result, snap } = resolveInline(r, ctx.params, ctx.env)
                  return (
                    <div key={inlineKey(r)} className="flex items-center justify-between gap-2 text-[12px] px-1 py-1 border-b border-gray-100 last:border-0">
                      <span className="truncate">
                        <Badge tone={r.type === 'variable' ? 'violet' : 'green'} className="mr-1">
                          {r.type === 'variable' ? '变量' : '表达式'}
                        </Badge>
                        {snap?.title ?? r.name ?? r.assetId}
                        <span className="font-mono text-[10.5px] text-ink-3 ml-1">{r.assetId ? `${r.assetId}@r${r.revision}` : `旧名称 ${r.name}`}</span>
                      </span>
                      <span className={cx('tabular-nums font-semibold shrink-0', result.status === 'invalid' && 'text-red-700')}>{formatResult(result)}</span>
                    </div>
                  )
                })}
                {Object.keys(varValues).length > 0 && (
                  <div className="text-[11px] text-violet-800 bg-violet-50 border border-violet-100 rounded p-2 mt-1">
                    当前{mode === 'template' ? '模板' : '实例'}变量覆盖：{Object.entries(varValues).map(([k, v]) => `${k} = ${v}`).join('；')}
                  </div>
                )}
              </Section>
              <Section title={`资源节点（${refs.length}）`}>
                {refs.length === 0 && <div className="text-[12px] text-ink-3">尚未插入共享资产节点</div>}
                {refs.map((r) => {
                  const snap = ctx.resolveSnapshot(r.assetId, r.assetRevision)
                  const latest = ctx.latestRevision(r.assetId)
                  const I = KIND_ICON[r.kind]
                  return (
                    <button
                      key={r.nodeId}
                      onClick={() => {
                        const idx = (doc.content ?? []).findIndex((n) => n.attrs?.nodeId === r.nodeId)
                        if (idx >= 0 && !preview) scrollToIndex(idx)
                      }}
                      className="w-full text-left p-2 rounded-md border border-line hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-1.5">
                        <I className="size-3.5 text-brand-600" />
                        <span className="text-[12px] text-ink truncate flex-1">{snap?.title ?? '（缺失资产）'}</span>
                        {!snap && <Badge tone="red">引用失效</Badge>}
                        {overrideKeys(r.overrides).length > 0 && <Badge tone="violet">覆盖</Badge>}
                      </div>
                      <div className="text-[10.5px] font-mono text-ink-3 mt-0.5">
                        {r.nodeId} · {r.assetId} r{r.assetRevision}
                        {latest && latest > r.assetRevision ? ` · 最新 r${latest}` : ''}
                      </div>
                    </button>
                  )
                })}
              </Section>
            </>
          )}
        </SidePanel>
      </div>

      <ResourcePicker
        open={!!picker}
        onClose={() => setPicker(null)}
        kinds={picker ?? []}
        title={mode === 'instance' ? '插入共享资源到当前实例（将同时快照其依赖链）' : '插入共享资源（引用）'}
        onPick={(p) => doInsert({ kind: p.kind, assetId: p.assetId, revision: p.revision })}
      />
    </ReportCtx.Provider>
  )
}

/** Properties for inline variable / expression nodes: identity, pinned revision, value and source. */
function InlinePanel({
  sel,
  mode,
  ctx,
  varValues,
  onVarValue,
  onAttrs,
  onDelete,
}: {
  sel: Selected
  mode: 'template' | 'instance'
  ctx: Omit<ReportCtxValue, 'preview'>
  varValues: Record<string, any>
  onVarValue: (id: string, v: any) => void
  onAttrs: (p: Record<string, any>) => void
  onDelete: () => void
}) {
  const go = useUI((s) => s.go)
  const resources = useApp((s) => s.resources)
  const type = sel.type as 'variable' | 'expressionRef'
  const ref = { type, name: sel.attrs.name, assetId: sel.attrs.assetId ?? undefined, revision: sel.attrs.revision ?? undefined }
  const { result, snap } = resolveInline(ref, ctx.params, ctx.env)
  const latest = snap ? resources[snap.assetId]?.latest : undefined
  const [val, setVal] = useState<string>(snap && varValues[snap.assetId] !== undefined ? String(varValues[snap.assetId]) : '')
  const def = snap?.def as VariableDef | ExpressionDef | undefined
  return (
    <div data-inline-panel={type}>
      <div className="p-3.5 border-b border-line space-y-2">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          {type === 'variable' ? <Braces className="size-4 text-violet-600" /> : <Sigma className="size-4 text-emerald-600" />}
          {snap?.title ?? ref.name ?? ref.assetId}
        </div>
        <div className="grid grid-cols-[72px_1fr] gap-y-1 text-[11.5px]">
          <span className="text-ink-3">节点类型</span>
          <span className="font-mono">{type}</span>
          <span className="text-ink-3">资源 ID</span>
          <span className="font-mono">{snap?.assetId ?? ref.assetId ?? '—'}</span>
          <span className="text-ink-3">固定修订</span>
          <span className="font-mono">
            {ref.assetId ? `r${ref.revision}` : `未固定（旧名称 ${ref.name}，按别名解析 r${snap?.revision ?? '?'}）`}
            {latest && ref.revision && latest > ref.revision ? <span className="text-amber-700">（共享最新 r{latest}）</span> : ''}
          </span>
          <span className="text-ink-3">数据上下文</span>
          <span>
            {ctx.params.simulationId} · Tick {ctx.params.tick ?? '—'}
          </span>
          <span className="text-ink-3">当前值</span>
          <span className={cx('font-semibold tabular-nums', result.status === 'invalid' && 'text-red-700')} data-inline-result="">
            {formatResult(result, (def as ExpressionDef)?.decimals ?? null, true)}
          </span>
        </div>
        {def && 'formula' in def && <div className="font-mono text-[11.5px] bg-gray-50 border border-line rounded px-2 py-1 break-all">{def.formula}</div>}
        {def && 'source' in def && (
          <div className="text-[11.5px] text-ink-2">
            来源：{def.source.kind === 'context' ? `上下文 ${def.source.path}` : def.source.kind === 'expression' ? `共享表达式 ${def.source.ref.assetId}@r${def.source.ref.revision}` : `常量 ${String(def.defaultValue)}`} · 类型 {def.type} · 作用域 {def.scope}
          </div>
        )}
      </div>
      {type === 'variable' && snap && (
        <Section title={`当前值（仅本${mode === 'template' ? '模板' : '实例'}）`}>
          <div className="text-[11.5px] text-violet-800 bg-violet-50 border border-violet-100 rounded p-2">写入{mode === 'template' ? '模板' : '实例'}变量值，不修改共享变量定义，也不影响其它报告。{(def as VariableDef).source.kind === 'context' && ['tick', 'simulationId', 'branch'].includes(((def as VariableDef).source as any).path) ? ' 该变量绑定上下文，覆盖后本文档所有图表、表格和表达式按新上下文重算。' : ''}</div>
          <div className="flex gap-1.5">
            <TextInput value={val} onChange={(e) => setVal(e.target.value)} placeholder="留空 = 使用定义/上下文" aria-label="变量当前值" />
            <Button size="sm" variant="subtle" onClick={() => onVarValue(snap.assetId, val === '' ? null : (def as VariableDef).type === 'number' ? Number(val) : val)}>
              应用
            </Button>
          </div>
          {varValues[snap.assetId] !== undefined && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setVal('')
                onVarValue(snap.assetId, null)
              }}
            >
              恢复默认（当前覆盖 = {String(varValues[snap.assetId])}）
            </Button>
          )}
        </Section>
      )}
      <Section title="引用">
        {!ref.assetId && snap && (
          <Button size="sm" className="w-full" onClick={() => onAttrs({ assetId: snap.assetId, revision: snap.revision })}>
            转换为结构化引用（{snap.assetId}@r{snap.revision}）
          </Button>
        )}
        {ref.assetId && latest && ref.revision && latest > ref.revision && mode === 'template' && (
          <Button size="sm" variant="subtle" className="w-full" icon={<ArrowUpCircle className="size-3.5" />} onClick={() => onAttrs({ revision: latest })}>
            显式升级到 r{latest}
          </Button>
        )}
        {ref.assetId && mode === 'template' && resources[ref.assetId] && (
          <Select<number> value={ref.revision!} onChange={(v) => onAttrs({ revision: v })} options={resources[ref.assetId].revisions.map((r) => ({ value: r.revision, label: `r${r.revision} · ${r.note}` }))} aria-label="固定修订" />
        )}
        {snap && (
          <Button size="sm" className="w-full" icon={<ExternalLink className="size-3.5" />} onClick={() => go('resource', { assetId: snap.assetId })}>
            打开共享{type === 'variable' ? '变量' : '表达式'}定义
          </Button>
        )}
        <Button size="sm" variant="danger" className="w-full" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
          从文档删除此引用
        </Button>
      </Section>
    </div>
  )
}

function NodePanel({
  sel,
  mode,
  ctx,
  onOverride,
  onAttrs,
  onClear,
  onDelete,
  onEditShared,
  assets,
}: {
  sel: Selected;
  mode: "template" | "instance";
  ctx: Omit<ReportCtxValue, "preview">;
  onOverride: (k: string, v: any) => void;
  onAttrs: (p: Record<string, any>) => void;
  onClear: () => void;
  onDelete: () => void;
  onEditShared: (kind: AssetKind, id: string) => void;
  assets: ReturnType<typeof useApp.getState>["assets"];
}) {
  const kind = ASSET_NODE_TYPES[sel.type] as AssetKind;
  const { assetId, assetRevision, nodeId } = sel.attrs;
  const ov: Record<string, any> = sel.attrs.overrides ?? {};
  const snap = ctx.resolveSnapshot(assetId, assetRevision);
  const asset = assets[assetId];
  const latest = ctx.latestRevision(assetId);
  const scopeText =
    mode === "template"
      ? "仅此节点生效：写入模板节点 overrides，不修改共享资产"
      : "仅本报告生效：写入实例节点 overrides，不修改共享资产或模板";
  const ovKeys = overrideKeys(ov);
  const ds = snap ? (snap.def as any).dataSetId : null;
  const I = KIND_ICON[kind];
  return (
    <div>
      <div className="p-3.5 border-b border-line">
        <div className="flex items-center gap-2">
          <I className="size-4 text-brand-600" />
          <span className="text-[13px] font-semibold truncate">{snap?.title ?? assetId}</span>
        </div>
        <div className="mt-2 grid grid-cols-[72px_1fr] gap-y-1 text-[11.5px]">
          <span className="text-ink-3">节点 ID</span>
          <span className="font-mono">{nodeId}</span>
          <span className="text-ink-3">节点类型</span>
          <span className="font-mono">{sel.type}</span>
          <span className="text-ink-3">资产 ID</span>
          <span className="font-mono">{assetId}</span>
          <span className="text-ink-3">引用版本</span>
          <span className="font-mono">
            r{assetRevision}
            {latest && latest > assetRevision ? (
              <span className="text-amber-700">（共享最新 r{latest}）</span>
            ) : latest ? (
              "（最新）"
            ) : (
              ""
            )}
          </span>
          <span className="text-ink-3">数据范围</span>
          <span>
            {ctx.params.simulationId} · Tick {ctx.params.tick ?? "—"}
          </span>
        </div>
        {!snap && (
          <div className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
            引用失效：{assetId} r{assetRevision} 不存在。请替换引用。
          </div>
        )}
      </div>

      {mode === "template" && (
        <Section title="引用版本">
          {asset ? (
            <>
              <Select<number>
                value={assetRevision}
                onChange={(v) => onAttrs({ assetRevision: v })}
                options={asset.revisions.map((r) => ({
                  value: r.revision,
                  label: `r${r.revision} · ${r.note}`,
                }))}
              />
              {latest && latest > assetRevision && (
                <Button
                  size="sm"
                  variant="subtle"
                  className="w-full"
                  icon={<ArrowUpCircle className="size-3.5" />}
                  onClick={() => onAttrs({ assetRevision: latest })}
                >
                  升级到最新 r{latest}
                </Button>
              )}
            </>
          ) : (
            <div className="text-[12px] text-ink-3">资产不存在</div>
          )}
          <Field label="替换为其它资产">
            <Select
              placeholder="选择同类资产…"
              value={null}
              onChange={(id: string) =>
                onAttrs({ assetId: id, assetRevision: assets[id].latest, overrides: {} })
              }
              options={Object.values(assets)
                .filter((a) => a.kind === kind && a.assetId !== assetId)
                .map((a) => ({ value: a.assetId, label: `${a.assetId} · ${a.title}` }))}
            />
          </Field>
        </Section>
      )}

      {snap && (
        <Section
          title="仅调整这一处"
          actions={
            ovKeys.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                icon={<Eraser className="size-3" />}
                onClick={onClear}
              >
                清除覆盖
              </Button>
            )
          }
        >
          <div className="text-[11.5px] text-violet-800 bg-violet-50 border border-violet-100 rounded p-2">
            {scopeText}
          </div>
          {kind === "chart" && (
            <>
              <Field label="图型">
                <Select<string>
                  value={ov.chartType ?? ""}
                  onChange={(v) => onOverride("chartType", v || undefined)}
                  options={[
                    {
                      value: "",
                      label: `继承（${CHART_TYPES.find((t) => t.id === (snap.def as ChartDef).chartType)?.label}）`,
                    },
                    ...CHART_TYPES.map((t) => ({ value: t.id, label: t.label })),
                  ]}
                />
              </Field>
              <Field label="维度">
                <Select<string>
                  value={ov.dimensions ? JSON.stringify(ov.dimensions) : ""}
                  onChange={(v) => onOverride("dimensions", v ? JSON.parse(v) : undefined)}
                  options={[
                    {
                      value: "",
                      label: `继承（${(snap.def as ChartDef).dimensions.map(fieldLabel).join(" → ")}）`,
                    },
                    ...DATASETS[ds as keyof typeof DATASETS].dims
                      .filter((d) => !["simulationId", "branch"].includes(d))
                      .map((d) => ({ value: JSON.stringify([d]), label: `按${fieldLabel(d)}` })),
                  ]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="排序">
                  <Select<string>
                    value={ov.sort ?? ""}
                    onChange={(v) => onOverride("sort", v || undefined)}
                    options={[
                      { value: "", label: "继承" },
                      { value: "valueDesc", label: "数值降序" },
                      { value: "valueAsc", label: "数值升序" },
                      { value: "keyAsc", label: "分类升序" },
                    ]}
                  />
                </Field>
                <Field label="高度">
                  <NumberInput
                    value={ov.height ?? Math.min((snap.def as ChartDef).style.height, 280)}
                    min={160}
                    max={480}
                    step={20}
                    onChange={(v) => onOverride("height", v)}
                    suffix="px"
                  />
                </Field>
              </div>
              <Field label="配色">
                <Select<string>
                  value={ov.palette ?? ""}
                  onChange={(v) => onOverride("palette", v || undefined)}
                  options={[
                    { value: "", label: "继承" },
                    ...Object.entries(PALETTES).map(([k, p]) => ({ value: k, label: p.label })),
                  ]}
                />
              </Field>
              <Toggle
                label="数据标签"
                checked={ov.showLabels ?? (snap.def as ChartDef).style.showLabels}
                onChange={(v) => onOverride("showLabels", v)}
              />
            </>
          )}
          {kind === "table" && (
            <>
              {(snap.def as TableDef).mode === "pivot" && (
                <Toggle
                  label="行列交换"
                  checked={!!ov.swap}
                  onChange={(v) => onOverride("swap", v || undefined)}
                />
              )}
              <Toggle
                label="显示合计"
                checked={ov.showTotals ?? (snap.def as TableDef).showTotals}
                onChange={(v) => onOverride("showTotals", v)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label="排序">
                  <Select<string>
                    value={ov.sort ?? ""}
                    onChange={(v) => onOverride("sort", v || undefined)}
                    options={[
                      { value: "", label: "继承" },
                      { value: "valueDesc", label: "数值降序" },
                      { value: "valueAsc", label: "数值升序" },
                      { value: "keyDesc", label: "分类降序" },
                    ]}
                  />
                </Field>
                <Field label="最大高度">
                  <NumberInput
                    value={ov.height ?? 260}
                    min={120}
                    max={600}
                    step={20}
                    onChange={(v) => onOverride("height", v)}
                    suffix="px"
                  />
                </Field>
              </div>
            </>
          )}
          {kind === "fixed" && (
            <Field label="最多显示行数">
              <NumberInput
                value={ov.maxRows ?? 18}
                min={4}
                max={80}
                onChange={(v) => onOverride("maxRows", v)}
              />
            </Field>
          )}
          {ds && ds !== "taskSchedule" && ds !== "printStressRows" && (
            <Field label="节点筛选（仅此处）" hint={`资产默认筛选：${JSON.stringify((snap.def as any).filters ?? {})}`}>
              <Segmented
                size="sm"
                value={(ov.filterMode ?? (ov.filters ? "merge" : "inherit")) as "inherit" | "merge" | "replace"}
                onChange={(v) => onAttrs({ overrides: { ...ov, filterMode: v === "inherit" ? undefined : v, filters: v === "inherit" ? undefined : (ov.filters ?? {}) } })}
                options={[
                  { value: "inherit", label: "继承资产" },
                  { value: "merge", label: "合并" },
                  { value: "replace", label: "替换（可清空）" },
                ]}
              />
              <div className="mt-1.5">
                <FilterEditor
                  dataSetId={ds}
                  ctx={ctx.params}
                  filters={ov.filters ?? {}}
                  onChange={(f) => onAttrs({ overrides: { ...ov, filters: f, filterMode: ov.filterMode ?? "merge" } })}
                />
              </div>
              <div className="text-[11px] text-ink-3 mt-1">当前模式：{{ inherit: "继承资产筛选", merge: "资产筛选 + 节点筛选", replace: "仅使用节点筛选（空 = 清除资产默认筛选）" }[(ov.filterMode ?? (ov.filters ? "merge" : "inherit")) as "inherit"]}</div>
            </Field>
          )}
          <Field label="展示模式（displayMode）">
            <Segmented
              size="sm"
              value={(sel.attrs.displayMode === "summary" ? "summary" : "inline") as "inline" | "summary"}
              onChange={(v) => onAttrs({ displayMode: v })}
              options={[
                { value: "inline", label: "完整" },
                { value: "summary", label: "摘要" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="宽度">
              <Select<number>
                value={ov.width ?? 100}
                onChange={(v) => onOverride("width", v === 100 ? undefined : v)}
                options={[
                  { value: 100, label: "100%" },
                  { value: 75, label: "75%" },
                  { value: 50, label: "50%" },
                ]}
              />
            </Field>
            <Field label="对齐">
              <Segmented
                size="sm"
                value={(ov.align ?? "center") as "left" | "center" | "right"}
                onChange={(v) => onOverride("align", v === "center" ? undefined : v)}
                options={[
                  { value: "left", label: "左" },
                  { value: "center", label: "中" },
                  { value: "right", label: "右" },
                ]}
              />
            </Field>
          </div>
          <Field label="图注 / 注释">
            <TextInput
              value={ov.caption ?? ""}
              onChange={(e) => onOverride("caption", e.target.value || undefined)}
              placeholder="例如：图 1 资源投入（演示）"
            />
          </Field>
          <div>
            <div className="text-[11px] text-ink-3 mb-1">
              当前 overrides（{ovKeys.length} 项
              {ovKeys.length ? "：" + ovKeys.map((k) => OVERRIDE_LABELS[k] ?? k).join("、") : ""}）
            </div>
            <pre className="text-[10.5px] font-mono bg-gray-50 border border-line rounded p-2 overflow-auto max-h-32">
              {JSON.stringify(ov, null, 1)}
            </pre>
          </div>
        </Section>
      )}
      <Section title="操作">
        {asset && (
          <Button
            size="sm"
            className="w-full"
            icon={<ExternalLink className="size-3.5" />}
            onClick={() => onEditShared(kind, assetId)}
          >
            编辑共享{KIND_LABEL[kind]}（保存将产生新版本）
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          className="w-full"
          icon={<Trash2 className="size-3.5" />}
          onClick={onDelete}
        >
          从文档删除此节点
        </Button>
      </Section>
    </div>
  );
}
