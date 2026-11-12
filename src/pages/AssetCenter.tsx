import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Search, Plus, Copy, Trash2, Pencil, FilePlus2, History, RotateCcw, Eye, Bookmark, Layers, Archive, ArchiveRestore, HardDrive, Download, GitBranch } from 'lucide-react'
import { useApp, useUI, latestDef, KIND_LABEL, toast, isResourceKind, getRecord, storageStatus, type AnyRecord } from '../store/store'
import type { AssetRecord, CatalogKind, ChartDef, FixedDef, ReportDef, TableDef, ResourceKind, AssetKind, DatasetDef, ExpressionDef, VariableDef, ConnectionDef } from '../data/types'
import { PageHeader } from '../ui/PageHeader'
import { SidePanel } from '../ui/SidePanel'
import { Badge, Button, Card, Field, InlineEdit, Modal, StatusBlock, TextInput, cx } from '../ui/kit'
import { ChartView } from '../components/ChartView'
import { AnalysisTableView } from '../components/TableViews'
import { SheetTable } from '../components/FixedSheet'
import { expandFixed } from '../data/fixedModel'
import { collectRefs, outline } from '../data/reports'
import { newChartDef, newFixedDef, newReportDef, newTableDef } from '../data/seed'
import { newResourceDef, defaultEnv } from '../data/registry'
import { evaluateExpression, evaluateVariable, formatResult } from '../data/expr'
import { usagesOf } from '../data/deps'
import { CATALOG_ICON, EDITOR_FOR, catalogSubtitle, RevisionHistory, ChainTree, UsageList, ArchiveBadge } from '../components/Catalog'
import { DEFAULT_CONTEXT } from '../data/seed'
import { STORE_KEY, SCHEMA_VERSION } from '../store/migrate'

type TreeKey = 'all' | CatalogKind | 'views' | 'activity' | 'storage' | 'refs'
export const EDITOR_PAGE = EDITOR_FOR
const GROUPS: { label: string; items: CatalogKind[] }[] = [
  { label: '数据', items: ['connection', 'dataset', 'variable', 'expression'] },
  { label: '分析组件', items: ['chart', 'table', 'fixed'] },
  { label: '文档', items: ['report'] },
]

export function AssetPreview({ a }: { a: AnyRecord }) {
  const d = latestDef(a) as any
  if (a.kind === 'chart') return <ChartView def={d as ChartDef} height={190} />
  if (a.kind === 'table') return <AnalysisTableView def={d as TableDef} maxHeight={200} />
  if (a.kind === 'fixed') {
    const fd = d as FixedDef
    const ex = expandFixed(fd)
    const w = fd.colWidths.reduce((x, y) => x + y, 0)
    return (
      <div className="overflow-hidden bg-white border border-line rounded p-2 h-[200px]">
        <div style={{ zoom: 300 / w } as any}>
          <SheetTable rows={ex.rows.slice(0, 14)} colWidths={fd.colWidths} />
        </div>
      </div>
    )
  }
  if (a.kind === 'report') {
    const rd = d as ReportDef
    return (
      <div className="text-xs space-y-1">
        {outline(rd.doc).map((h) => (
          <div key={h.index} style={{ paddingLeft: (h.level - 1) * 12 }} className={cx(h.level === 1 ? 'font-semibold text-ink' : 'text-ink-2')}>
            {h.text}
          </div>
        ))}
        <div className="pt-2 flex flex-wrap gap-1">
          {collectRefs(rd.doc).map((r) => (
            <Badge key={r.nodeId} tone="brand">
              {r.assetId} r{r.assetRevision}
            </Badge>
          ))}
        </div>
      </div>
    )
  }
  return <ResourceSummary a={a} />
}

/** Definition summary + live value preview for upstream resources (DEMO-RUN-A / Tick 2). */
export function ResourceSummary({ a }: { a: AnyRecord }) {
  const d = latestDef(a) as any
  const env = defaultEnv()
  const ctx = { params: { ...DEFAULT_CONTEXT } }
  if (a.kind === 'expression') {
    const e = d as ExpressionDef
    const r = evaluateExpression({ assetId: a.assetId, revision: a.latest }, ctx, env)
    return (
      <div className="text-[12px] space-y-1.5">
        <div className="font-mono bg-gray-50 border border-line rounded px-2 py-1.5 break-all">{e.formula}</div>
        <div>
          数据集 <span className="font-mono">{e.datasetRef.assetId}@r{e.datasetRef.revision}</span> · {e.evaluationMode === 'aggregate' ? '聚合' : '行级'} · 单位 {e.unit ?? '未定义单位'}
        </div>
        <div className={cx('rounded px-2 py-1.5 border', r.status === 'invalid' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-brand-50 border-brand-100')}>
          DEMO-RUN-A / Tick 2 预览：<b>{formatResult(r, e.decimals, true)}</b>
        </div>
      </div>
    )
  }
  if (a.kind === 'variable') {
    const v = d as VariableDef
    const r = evaluateVariable({ assetId: a.assetId, revision: a.latest }, ctx, env)
    return (
      <div className="text-[12px] space-y-1">
        <div>
          标识符 <span className="font-mono">{v.name}</span> · 类型 {v.type} · 作用域 {v.scope}
        </div>
        <div>来源：{v.source.kind === 'context' ? `报告上下文 ${v.source.path}` : v.source.kind === 'expression' ? `共享表达式 ${v.source.ref.assetId}@r${v.source.ref.revision}` : `常量 ${String(v.defaultValue)}`}</div>
        <div className="rounded px-2 py-1.5 border bg-brand-50 border-brand-100">
          当前值（DEMO-RUN-A / Tick 2）：<b>{formatResult(r)}</b>
        </div>
      </div>
    )
  }
  if (a.kind === 'dataset') {
    const ds = d as DatasetDef
    return (
      <div className="text-[12px] space-y-1">
        <div>
          来源 <span className="font-mono">{ds.sourceKey}</span> · 连接 <span className="font-mono">{ds.connectionRef.assetId}@r{ds.connectionRef.revision}</span>
        </div>
        <div className="text-ink-3">{ds.fields.map((f) => `${f.id}${f.role === 'measure' ? `（${f.unit ?? '未定义单位'}）` : ''}`).join('、')}</div>
        {ds.warnings.map((w) => (
          <div key={w} className="text-amber-800">
            ⚠ {w}
          </div>
        ))}
      </div>
    )
  }
  const c = d as ConnectionDef
  return (
    <div className="text-[12px] space-y-1">
      <div>
        {c.type} · <span className="font-mono">{c.source}</span>
      </div>
      <div className="text-ink-3">{c.description}</div>
      <div>上次校验：{c.lastValidatedAt ? `${new Date(c.lastValidatedAt).toLocaleString('zh-CN')} · ${c.lastValidation}` : '尚未校验'}</div>
    </div>
  )
}

export function AssetCenter() {
  const assets = useApp((s) => s.assets)
  const resources = useApp((s) => s.resources)
  const instances = useApp((s) => s.instances)
  const publications = useApp((s) => s.publications)
  const views = useApp((s) => s.views)
  const { go, params } = useUI()
  const [tree, setTree] = useState<TreeKey>((params.kind as TreeKey) ?? 'all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(params.assetId ?? 'DEMO-CHART-01')
  const [showArchived, setShowArchived] = useState(true)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKind, setNewKind] = useState<CatalogKind>('expression')
  const [newName, setNewName] = useState('')
  const [del, setDel] = useState<string | null>(null)
  const [insertFor, setInsertFor] = useState<string | null>(null)
  const [reset, setReset] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300)
    return () => clearTimeout(t)
  }, [])

  const all = useMemo(() => [...Object.values(resources), ...Object.values(assets)] as AnyRecord[], [assets, resources])
  const graph = useMemo(() => ({ assets, resources, instances, publications }), [assets, resources, instances, publications])
  const order: CatalogKind[] = ['connection', 'dataset', 'variable', 'expression', 'chart', 'table', 'fixed', 'report']
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return all
      .filter((a) => (tree === 'all' || a.kind === tree) && (showArchived || a.status !== 'archived'))
      .filter((a) => !k || a.title.toLowerCase().includes(k) || a.assetId.toLowerCase().includes(k) || catalogSubtitle(a).toLowerCase().includes(k) || KIND_LABEL[a.kind].includes(k))
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.assetId.localeCompare(b.assetId))
  }, [all, tree, q, showArchived])
  const selected = sel ? getRecord({ assets, resources }, sel) : undefined
  const count = (k: CatalogKind) => all.filter((a) => a.kind === k).length
  const dup = all.some((a) => a.kind === newKind && a.title === newName.trim())

  const create = () => {
    let id: string
    if (isResourceKind(newKind)) id = useApp.getState().createResource(newKind, newResourceDef(newKind, newName.trim()))
    else {
      const def: any = { chart: newChartDef, table: newTableDef, fixed: newFixedDef, report: newReportDef }[newKind as AssetKind]()
      if (newName.trim()) def.title = newName.trim()
      id = useApp.getState().createAsset(newKind as AssetKind, def)
    }
    setCreating(false)
    setNewName('')
    toast(`已创建${KIND_LABEL[newKind]} ${id}（r1），正在打开编辑器`)
    go(EDITOR_FOR[newKind], { assetId: id })
  }

  const navItem = (k: TreeKey, label: string, icon: any, n?: number) => {
    const I = icon
    return (
      <button key={k} onClick={() => setTree(k)} data-tree={k} className={cx('w-full flex items-center gap-2 h-8 px-2 rounded-md text-[13px]', tree === k ? 'bg-gray-100 font-medium text-ink' : 'text-ink-2 hover:bg-gray-50')}>
        <I className="size-4 text-gray-400" />
        <span className="flex-1 text-left truncate">{label}</span>
        {n !== undefined && <span className="text-[11px] text-ink-3 tabular-nums">{n}</span>}
      </button>
    )
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: '共享资源与资产中心' }]}
        title="共享资源与资产中心"
        actions={
          <>
            <Button icon={<RotateCcw className="size-3.5" />} onClick={() => setReset(true)}>
              重置演示数据
            </Button>
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
              新建
            </Button>
          </>
        }
      />
      <div className="flex-1 min-h-0 flex">
        <SidePanel id="assetTree" side="left" title="资源分类">
          <div className="p-2 space-y-3">
            {navItem('all', '全部共享定义', LayoutGrid, all.length)}
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="px-2 mb-0.5 text-[10.5px] font-semibold text-gray-400 tracking-wider">{g.label}</div>
                {g.items.map((k) => navItem(k, KIND_LABEL[k], CATALOG_ICON[k], count(k)))}
                {g.label === '文档' && (
                  <button onClick={() => go('instances')} className="w-full flex items-center gap-2 h-8 px-2 rounded-md text-[13px] text-ink-2 hover:bg-gray-50">
                    <Layers className="size-4 text-gray-400" />
                    <span className="flex-1 text-left">报告实例（入口）</span>
                    <span className="text-[11px] text-ink-3">{Object.keys(instances).length}</span>
                  </button>
                )}
              </div>
            ))}
            <div>
              <div className="px-2 mb-0.5 text-[10.5px] font-semibold text-gray-400 tracking-wider">辅助</div>
              {navItem('refs', '引用关系', GitBranch)}
              {navItem('views', '个人视图', Bookmark, views.length)}
              {navItem('activity', '活动记录', History)}
              {navItem('storage', '存储与迁移', HardDrive)}
            </div>
          </div>
        </SidePanel>

        {tree === 'views' ? (
          <ViewsList />
        ) : tree === 'activity' ? (
          <ActivityList />
        ) : tree === 'storage' ? (
          <StoragePanel />
        ) : tree === 'refs' ? (
          <RefsOverview onSelect={(id) => (setSel(id), setTree('all'))} />
        ) : (
          <>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="px-5 py-3 flex items-center gap-2 border-b border-line bg-white">
                <div className="relative w-96 max-w-full">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
                  <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称、ID、字段、公式或类型" className="pl-8" aria-label="搜索资源" />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-ink-2">
                  <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                  显示已归档
                </label>
                <span className="text-xs text-ink-3">{list.length} 项</span>
              </div>
              <div className="flex-1 overflow-auto scroll-thin p-5">
                {loading ? (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-[104px] rounded-lg bg-white border border-line animate-pulse" />
                    ))}
                  </div>
                ) : list.length === 0 ? (
                  <StatusBlock status="empty" message={q ? `没有与“${q}”匹配的资源` : '该分类下暂无资源'} actions={q ? <Button size="sm" onClick={() => setQ('')}>清除搜索</Button> : <Button size="sm" variant="primary" onClick={() => setCreating(true)}>新建</Button>} />
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3" data-catalog-list="">
                    {list.map((a) => {
                      const I = CATALOG_ICON[a.kind]
                      const n = new Set(usagesOf(graph, a.assetId).map((e) => e.consumerId)).size
                      return (
                        <div
                          key={a.assetId}
                          data-card={a.assetId}
                          onClick={() => setSel(a.assetId)}
                          onDoubleClick={() => go(EDITOR_FOR[a.kind], { assetId: a.assetId })}
                          className={cx('group rounded-lg bg-white border p-3.5 cursor-pointer', sel === a.assetId ? 'border-brand-500 ring-2 ring-brand-100' : 'border-line hover:shadow-md', a.status === 'archived' && 'opacity-70')}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cx('size-7 rounded-md grid place-items-center', isResourceKind(a.kind) ? 'bg-violet-50' : 'bg-brand-50')}>
                              <I className={cx('size-4', isResourceKind(a.kind) ? 'text-violet-600' : 'text-brand-600')} />
                            </div>
                            <span className="font-mono text-[10.5px] text-ink-3 truncate">{a.assetId}</span>
                            <span className="flex-1" />
                            <Badge tone="gray">r{a.latest}</Badge>
                          </div>
                          <div className="mt-2 text-[13.5px] font-semibold text-ink truncate">{a.title}</div>
                          <div className="mt-0.5 text-[11.5px] text-ink-3 truncate font-mono">{catalogSubtitle(a)}</div>
                          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                            <Badge tone={isResourceKind(a.kind) ? 'violet' : 'brand'}>{KIND_LABEL[a.kind]}</Badge>
                            <Badge tone={a.seed ? 'amber' : 'green'}>{a.seed ? '预置' : '新增'}</Badge>
                            {n > 0 && <Badge tone="cyan">被引用 {n}</Badge>}
                            <ArchiveBadge rec={a} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <SidePanel id="assetDetail" side="right" title="详情">
              {!selected ? (
                <div className="p-6 text-center text-xs text-ink-3">选择资源以查看定义、版本与引用</div>
              ) : (
                <div data-detail={selected.assetId}>
                  <div className="p-4 border-b border-line">
                    <div className="flex items-center gap-2 text-[11px] text-ink-3">
                      <Badge tone={isResourceKind(selected.kind) ? 'violet' : 'brand'}>{KIND_LABEL[selected.kind]}</Badge>
                      <span className="font-mono">{selected.assetId}</span>
                      <ArchiveBadge rec={selected} />
                    </div>
                    <InlineEdit
                      value={selected.title}
                      className="mt-1.5 text-[15px] font-semibold block max-w-full"
                      onCommit={(v) => {
                        const r = useApp.getState().renameAsset(selected.assetId, v)
                        toast(r.ok ? '已重命名（资产 ID 不变）' : r.message!, r.ok ? 'success' : 'error')
                      }}
                    />
                    <div className="mt-1 text-[11.5px] text-ink-3">
                      当前 r{selected.latest} · {selected.revisions.length} 个已存版本 · {selected.provenance} · {selected.status === 'archived' ? '已归档' : '活跃'}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="primary" icon={<Pencil className="size-3" />} onClick={() => go(EDITOR_FOR[selected.kind], { assetId: selected.assetId })}>
                        打开编辑
                      </Button>
                      <Button
                        size="sm"
                        icon={<Copy className="size-3" />}
                        onClick={() => {
                          const id = useApp.getState().duplicateAsset(selected.assetId)
                          setSel(id)
                          toast(`已复制为 ${id}`)
                        }}
                      >
                        复制
                      </Button>
                      {['chart', 'table', 'fixed'].includes(selected.kind) && (
                        <Button size="sm" icon={<FilePlus2 className="size-3" />} onClick={() => setInsertFor(selected.assetId)}>
                          插入到报告
                        </Button>
                      )}
                      {selected.kind === 'report' && (
                        <Button size="sm" icon={<FilePlus2 className="size-3" />} onClick={() => go('generate', { templateId: selected.assetId })}>
                          生成实例
                        </Button>
                      )}
                      <Button
                        size="sm"
                        icon={selected.status === 'archived' ? <ArchiveRestore className="size-3" /> : <Archive className="size-3" />}
                        onClick={() => {
                          useApp.getState().archiveAsset(selected.assetId, selected.status !== 'archived')
                          toast(selected.status === 'archived' ? '已恢复为活跃' : '已归档：所有修订保留，历史引用仍可打开')
                        }}
                      >
                        {selected.status === 'archived' ? '恢复' : '归档'}
                      </Button>
                      <Button size="sm" variant="danger" icon={<Trash2 className="size-3" />} onClick={() => setDel(selected.assetId)}>
                        删除
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border-b border-line">
                    <div className="text-xs font-semibold text-ink-2 mb-2 flex items-center gap-1.5">
                      <Eye className="size-3.5" />
                      当前版本 r{selected.latest} 定义与预览
                    </div>
                    <AssetPreview a={selected} />
                  </div>
                  <div className="p-4 border-b border-line">
                    <div className="text-xs font-semibold text-ink-2 mb-2">依赖链（r{selected.latest} 向上游）</div>
                    <ChainTree id={selected.assetId} revision={selected.latest} />
                  </div>
                  <div className="p-4 border-b border-line">
                    <div className="text-xs font-semibold text-ink-2 mb-2">版本记录（打开旧版只读，可从旧版创建新修订）</div>
                    <RevisionHistory id={selected.assetId} />
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-semibold text-ink-2 mb-2">使用位置（含所有历史修订、实例与发布）</div>
                    <UsageList id={selected.assetId} />
                  </div>
                </div>
              )}
            </SidePanel>
          </>
        )}
      </div>

      <Modal
        open={creating}
        title="新建共享定义"
        onClose={() => setCreating(false)}
        width={620}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>取消</Button>
            <Button variant="primary" disabled={dup} onClick={create}>
              创建并打开编辑器
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-4 gap-2 mb-4">
          {order.map((k) => {
            const I = CATALOG_ICON[k]
            return (
              <button key={k} data-newkind={k} onClick={() => setNewKind(k)} className={cx('flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left', newKind === k ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-gray-50')}>
                <I className="size-4 text-brand-600" />
                <div className="text-[12.5px] font-semibold text-ink">{KIND_LABEL[k]}</div>
              </button>
            )
          })}
        </div>
        <Field label="名称" hint={dup ? <span className="text-red-600">已存在同名{KIND_LABEL[newKind]}</span> : '留空则使用默认名称；ID 自动分配且之后不变'}>
          <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`新建${KIND_LABEL[newKind]}`} />
        </Field>
        {newKind === 'connection' && <div className="mt-2 text-[11.5px] text-amber-800">DEMO 原型仅支持指向内置 JSON 的连接，不会进行任何网络请求或认证。</div>}
      </Modal>

      <DeleteModal assetId={del} onClose={() => setDel(null)} onDeleted={() => setSel(null)} />
      <InsertModal assetId={insertFor} onClose={() => setInsertFor(null)} />
      <Modal
        open={reset}
        title="重置演示数据？"
        onClose={() => setReset(false)}
        footer={
          <>
            <Button onClick={() => setReset(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                const raw = localStorage.getItem(STORE_KEY)
                if (raw) localStorage.setItem(`${STORE_KEY}.backup.before-reset.${Date.now()}`, raw)
                useApp.getState().resetDemo()
                setReset(false)
                setSel('DEMO-CHART-01')
                toast('已从 JSON 种子恢复；重置前的数据已另存为本地备份', 'info')
              }}
            >
              备份后重置
            </Button>
          </>
        }
      >
        将删除所有新增定义、共享新版本、个人视图、报告实例修订与模拟发布记录，恢复为 JSON 种子状态。重置前会把当前本地数据另存为一个备份键（可在“存储与迁移”中下载）。
      </Modal>
    </>
  )
}

export function DeleteModal({ assetId, onClose, onDeleted }: { assetId: string | null; onClose: () => void; onDeleted?: () => void }) {
  const assets = useApp((s) => s.assets)
  const resources = useApp((s) => s.resources)
  const instances = useApp((s) => s.instances)
  const publications = useApp((s) => s.publications)
  if (!assetId) return null
  const a = getRecord({ assets, resources }, assetId)
  if (!a) return null
  const usages = usagesOf({ assets, resources, instances, publications }, assetId)
  const blocking = usages.filter((e) => e.consumerKind !== 'instance' && e.consumerKind !== 'publication')
  const snapOnly = usages.length - blocking.length
  const blocked = blocking.length > 0
  return (
    <Modal
      open
      title={blocked ? '仍被引用，不能硬删除' : `删除「${a.title}」？`}
      onClose={onClose}
      width={560}
      footer={
        blocked ? (
          <>
            <Button onClick={onClose}>取消删除</Button>
            {a.status !== 'archived' && (
              <Button
                variant="primary"
                icon={<Archive className="size-3.5" />}
                onClick={() => {
                  useApp.getState().archiveAsset(assetId, true)
                  onClose()
                  toast(`已归档 ${assetId}：旧模板与历史修订仍可打开`)
                }}
              >
                改为归档
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                const r = useApp.getState().deleteAsset(assetId)
                if (!r.ok) return toast(r.message!, 'error')
                onClose()
                onDeleted?.()
                toast(`已删除 ${assetId}`)
              }}
            >
              确认删除
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <div className="space-y-3">
          <p>
            <b className="font-mono">{assetId}</b> 被以下定义（含历史修订）引用。数据层同样会拒绝硬删除；可以归档以停止新引用，旧版本保持可读。
          </p>
          <div className="space-y-1 max-h-64 overflow-auto scroll-thin">
            {blocking.map((e, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded border border-line text-[12px]">
                <Badge tone="brand">{KIND_LABEL[e.consumerKind as CatalogKind] ?? e.consumerKind}</Badge>
                <span className="flex-1 truncate">{e.consumerTitle}</span>
                <span className="font-mono text-[11px] text-ink-3">
                  {e.consumerId} r{e.consumerRev} · {e.location} → r{e.revision || '按名称'}
                </span>
              </div>
            ))}
          </div>
          {snapOnly > 0 && <p className="text-[12px] text-ink-3">另有 {snapOnly} 处实例/发布快照引用（已冻结，不受影响）。</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p>该定义没有被其它定义的任何修订引用，删除后所有版本与相关个人视图将被移除。</p>
          {snapOnly > 0 && <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">{snapOnly} 处实例/发布已保存快照，内容不会改变。</p>}
        </div>
      )}
    </Modal>
  )
}

export function InsertModal({ assetId, onClose }: { assetId: string | null; onClose: () => void }) {
  const assets = useApp((s) => s.assets)
  const go = useUI((s) => s.go)
  if (!assetId) return null
  const a = assets[assetId]
  const tpls = Object.values(assets).filter((x) => x.kind === 'report')
  return (
    <Modal open title={`插入「${a?.title}」到报告模板`} onClose={onClose} footer={<Button onClick={onClose}>取消</Button>}>
      <p className="mb-3">
        将以<b>引用</b>方式插入（保留 {assetId} r{a?.latest} 的资产身份与版本）。请选择目标模板：
      </p>
      <div className="space-y-1.5">
        {tpls.map((t) => (
          <button
            key={t.assetId}
            onClick={() => {
              onClose()
              go('report', { assetId: t.assetId, insertAssetId: assetId })
            }}
            className="w-full flex items-center gap-2 p-2.5 rounded-md border border-line hover:bg-brand-50 text-left"
          >
            <span className="flex-1 text-ink">{t.title}</span>
            <span className="font-mono text-[11px] text-ink-3">
              {t.assetId} r{t.latest}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function ActivityList() {
  const activity = useApp((s) => s.activity)
  return (
    <div className="flex-1 overflow-auto scroll-thin p-5">
      <Card title="活动记录（本地）">
        <div className="divide-y divide-gray-100">
          {activity.map((a) => (
            <div key={a.id} className="px-3.5 py-2 flex gap-3 text-[12.5px]">
              <span className="text-ink-3 tabular-nums w-36 shrink-0">{new Date(a.at).toLocaleString('zh-CN')}</span>
              <span className="text-ink-2">{a.text}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function RefsOverview({ onSelect }: { onSelect: (id: string) => void }) {
  const assets = useApp((s) => s.assets)
  const resources = useApp((s) => s.resources)
  const instances = useApp((s) => s.instances)
  const publications = useApp((s) => s.publications)
  const rows = useMemo(() => {
    const g = { assets, resources, instances, publications }
    return [...Object.values(resources), ...Object.values(assets)].map((r) => ({ r, n: new Set(usagesOf(g, r.assetId).map((e) => e.consumerId)).size }))
  }, [assets, resources, instances, publications])
  return (
    <div className="flex-1 overflow-auto scroll-thin p-5">
      <Card title="引用关系总览（被引用次数 = 不同使用方数量，覆盖全部历史修订）">
        <table className="w-full text-[12.5px]">
          <tbody>
            {rows
              .sort((a, b) => b.n - a.n)
              .map(({ r, n }) => (
                <tr key={r.assetId} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(r.assetId)}>
                  <td className="px-3.5 py-2">
                    <Badge tone={isResourceKind(r.kind) ? 'violet' : 'brand'}>{KIND_LABEL[r.kind]}</Badge>
                  </td>
                  <td className="px-3.5 py-2">{r.title}</td>
                  <td className="px-3.5 py-2 font-mono text-[11px] text-ink-3">{r.assetId}</td>
                  <td className="px-3.5 py-2 tabular-nums">{n} 个使用方</td>
                  <td className="px-3.5 py-2">{r.status === 'archived' && <Badge tone="amber">已归档</Badge>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function StoragePanel() {
  const migrations = useApp((s) => s.migrations)
  const [, force] = useState(0)
  const backups = typeof localStorage !== 'undefined' ? Object.keys(localStorage).filter((k) => k.startsWith(`${STORE_KEY}.backup`)) : []
  const dl = (key: string, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([localStorage.getItem(key) ?? ''], { type: 'application/json' }))
    a.download = name
    a.click()
  }
  const bootText = { fresh: '首次启动（本地尚无保存数据，使用 JSON 种子）', current: `本地数据已是当前 schema v${SCHEMA_VERSION}`, migrated: `检测到旧版本 v${storageStatus.rawVersion}，已备份并迁移到 v${SCHEMA_VERSION}`, corrupt: '本地数据损坏或无法迁移（写入已暂停）', unavailable: '运行环境不支持 localStorage' }[storageStatus.boot]
  return (
    <div className="flex-1 overflow-auto scroll-thin p-5 space-y-4">
      <Card title="本地存储状态">
        <div className="p-4 text-[12.5px] space-y-2">
          <div>
            启动状态：<Badge tone={storageStatus.boot === 'corrupt' ? 'red' : storageStatus.boot === 'migrated' ? 'amber' : 'green'}>{storageStatus.boot}</Badge> {bootText}
          </div>
          {storageStatus.error && <div className="text-red-700">错误：{storageStatus.error}</div>}
          <div>存储键：<span className="font-mono">{STORE_KEY}</span> · schema v{SCHEMA_VERSION} · 写入{storageStatus.blocked ? '已暂停' : '正常'}</div>
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => dl(STORE_KEY, 'rr-workbench-current.json')}>
            导出当前本地状态
          </Button>
        </div>
      </Card>
      <Card title={`迁移记录（${migrations.length}）`}>
        {migrations.length === 0 ? (
          <div className="p-4 text-[12px] text-ink-3">无（当前数据未经历版本迁移）</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {migrations.map((m, i) => (
              <div key={i} className="p-4 text-[12px] space-y-1">
                <div>
                  <Badge tone="green">v{m.from} → v{m.to}</Badge> {new Date(m.at).toLocaleString('zh-CN')} · 备份 <span className="font-mono">{m.backupKey ?? '—'}</span>
                </div>
                <div>
                  迁移前：{m.before.assets} 资产 / {m.before.instances.length} 实例 / {m.before.publications.length} 发布 / 修订 {Object.values(m.before.revisions).flat().length} 个；迁移后：{m.after.assets} / {m.after.instances.length} / {m.after.publications.length} / {Object.values(m.after.revisions).flat().length}
                </div>
                <div className="text-ink-3 font-mono text-[11px]">ID 一致：{JSON.stringify(m.before.assetIds) === JSON.stringify(m.after.assetIds) ? '是' : '否'} · 模板节点 {JSON.stringify(m.after.templateNodes)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title={`本地备份（${backups.length}）`}>
        <div className="divide-y divide-gray-100">
          {backups.length === 0 && <div className="p-4 text-[12px] text-ink-3">暂无备份</div>}
          {backups.map((k) => (
            <div key={k} className="flex items-center gap-3 px-4 py-2 text-[12px]">
              <span className="font-mono flex-1 truncate">{k}</span>
              <span className="text-ink-3">{Math.round((localStorage.getItem(k)?.length ?? 0) / 1024)} KB</span>
              <Button size="xs" onClick={() => dl(k, `${k}.json`)}>
                下载
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  localStorage.removeItem(k)
                  force((x) => x + 1)
                }}
              >
                删除备份
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function ViewsList() {
  const views = useApp((s) => s.views)
  const go = useUI((s) => s.go)
  return (
    <div className="flex-1 overflow-auto scroll-thin p-5">
      <Card title="个人视图（仅本地 ViewState，不改变共享资产）">
        {views.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink-3">暂无个人视图。</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {views.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Badge tone="violet">{{ chart: '图表', table: '分析表', workspace: '分析视图' }[v.scope]}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink">{v.name}</div>
                  <div className="text-[11px] text-ink-3">
                    {v.assetId ? `${v.assetId} 基于 r${v.baseRevision} · ` : ''}
                    {new Date(v.savedAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <Button size="sm" onClick={() => go(v.scope === 'workspace' ? 'workspace' : v.scope === 'chart' ? 'chart' : 'table', { assetId: v.assetId, viewId: v.id })}>
                  打开
                </Button>
                <Button size="sm" variant="ghost" onClick={() => useApp.getState().deleteView(v.id)}>
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export type { ResourceKind, AssetRecord }
export { History, Eye }
