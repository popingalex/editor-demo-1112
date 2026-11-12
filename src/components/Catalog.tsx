import { useMemo, useState } from 'react'
import { Search, Database, Plug, Braces, Sigma, BarChart3, Table2, FileSpreadsheet, FileText, ChevronRight, ExternalLink, History, Eye, CopyPlus, Archive } from 'lucide-react'
import type { CatalogKind, DataSetId, DatasetDef, ExpressionDef, VariableDef } from '../data/types'
import { useApp, useUI, KIND_LABEL, findReferences, getRecord, isResourceKind, toast, type AnyRecord, type PageId } from '../store/store'
import { dependencyChain, type ChainNode } from '../data/deps'
import { Badge, Button, Modal, TextInput, cx } from '../ui/kit'

export const CATALOG_ICON: Record<CatalogKind, any> = { connection: Plug, dataset: Database, variable: Braces, expression: Sigma, chart: BarChart3, table: Table2, fixed: FileSpreadsheet, report: FileText }
export const EDITOR_FOR: Record<CatalogKind, PageId> = { connection: 'resource', dataset: 'resource', variable: 'resource', expression: 'resource', chart: 'chart', table: 'table', fixed: 'fixed', report: 'report' }

export function catalogSubtitle(r: AnyRecord): string {
  const d = r.revisions.find((x) => x.revision === r.latest)?.def as any
  switch (r.kind) {
    case 'connection':
      return `${d.type} · ${d.source}`
    case 'dataset':
      return `来源 ${(d as DatasetDef).sourceKey} · ${(d as DatasetDef).fields.length} 字段${Object.keys((d as DatasetDef).defaultFilters ?? {}).length ? ' · 含默认筛选' : ''}`
    case 'variable': {
      const v = d as VariableDef
      return `${v.name} · ${v.type} · ${v.scope} · 来源 ${v.source.kind === 'context' ? `上下文 ${v.source.path}` : v.source.kind === 'expression' ? `表达式 ${v.source.ref.assetId}@r${v.source.ref.revision}` : '常量'}`
    }
    case 'expression': {
      const e = d as ExpressionDef
      return `${e.formula} · ${e.datasetRef.assetId}@r${e.datasetRef.revision}`
    }
    case 'chart':
      return `图表 · ${d.chartType} · ${d.dataSetId}${d.measureBinding ? ` · 指标 ${d.measureBinding.assetId}@r${d.measureBinding.revision}` : ''}`
    case 'table':
      return `分析表 · ${d.mode} · ${d.dataSetId}${d.measureBinding ? ` · 指标 ${d.measureBinding.assetId}@r${d.measureBinding.revision}` : ''}`
    case 'fixed':
      return `A4 ${d.page.orientation === 'portrait' ? '纵向' : '横向'} · ${d.regions.length} 个动态区`
    default:
      return '综合报告模板'
  }
}

export interface Pick {
  kind: CatalogKind
  assetId: string
  revision: number
  title: string
}

export function useCatalog(kinds?: CatalogKind[]) {
  const assets = useApp((s) => s.assets)
  const resources = useApp((s) => s.resources)
  return useMemo(() => [...Object.values(resources), ...Object.values(assets)].filter((r) => !kinds || kinds.includes(r.kind)) as AnyRecord[], [assets, resources, kinds])
}

/** One picker shared by the report toolbar, the `/` menu, designers and fixed-table cells. */
export function ResourcePicker({ open, onClose, kinds, onPick, datasetKey, title, actionLabel = '插入引用' }: { open: boolean; onClose: () => void; kinds: CatalogKind[]; onPick: (p: Pick) => void; datasetKey?: DataSetId; title?: string; actionLabel?: string }) {
  const items = useCatalog(kinds)
  const resources = useApp((s) => s.resources)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<CatalogKind | 'all'>('all')
  const [revs, setRevs] = useState<Record<string, number>>({})
  if (!open) return null
  const k = q.trim().toLowerCase()
  const list = items.filter((r) => (tab === 'all' || r.kind === tab) && (!k || r.title.toLowerCase().includes(k) || r.assetId.toLowerCase().includes(k) || String((r.revisions.find((x) => x.revision === r.latest)?.def as any)?.name ?? '').toLowerCase().includes(k)))
  const mismatch = (r: AnyRecord, rev: number): string | null => {
    if (!datasetKey || r.kind !== 'expression') return null
    const e = r.revisions.find((x) => x.revision === rev)?.def as ExpressionDef
    const ds = resources[e.datasetRef.assetId]?.revisions.find((x) => x.revision === e.datasetRef.revision)?.def as DatasetDef | undefined
    return ds && ds.sourceKey !== datasetKey ? `基于 ${ds.sourceKey}，与当前数据集 ${datasetKey} 不匹配` : null
  }
  return (
    <Modal open title={title ?? '选择共享资源'} onClose={onClose} width={640}>
      <div className="space-y-3" data-picker="">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称、标识符或资产 ID（支持中文）" className="pl-8" />
        </div>
        {kinds.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {(['all', ...kinds] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cx('h-6 px-2 rounded border text-xs', tab === t ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-line text-ink-2')}>
                {t === 'all' ? '全部' : KIND_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        <div className="max-h-[420px] overflow-auto scroll-thin space-y-1">
          {list.length === 0 && <div className="text-center text-xs text-ink-3 py-8">没有匹配的资源</div>}
          {list.map((r) => {
            const I = CATALOG_ICON[r.kind]
            const rev = revs[r.assetId] ?? r.latest
            const mm = mismatch(r, rev)
            const archived = r.status === 'archived'
            return (
              <div key={r.assetId} className={cx('flex items-center gap-2.5 p-2 rounded-md border', mm ? 'border-line bg-gray-50 opacity-70' : 'border-line hover:border-brand-200 hover:bg-brand-50/50')}>
                <I className="size-4 text-brand-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate flex items-center gap-1.5">
                    {r.title}
                    <Badge tone="gray">{KIND_LABEL[r.kind]}</Badge>
                    {archived && <Badge tone="amber">已归档 · 不推荐新引用</Badge>}
                  </div>
                  <div className="text-[11px] text-ink-3 font-mono truncate">
                    {r.assetId} · {catalogSubtitle(r)}
                  </div>
                  {mm && <div className="text-[11px] text-amber-800">{mm}</div>}
                </div>
                <select value={rev} onChange={(e) => setRevs({ ...revs, [r.assetId]: Number(e.target.value) })} className="h-7 text-xs border border-line rounded px-1" aria-label="版本">
                  {[...r.revisions].reverse().map((x) => (
                    <option key={x.revision} value={x.revision}>
                      r{x.revision}
                      {x.revision === r.latest ? '（最新）' : ''}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={!!mm}
                  data-pick={r.assetId}
                  onClick={() => {
                    onPick({ kind: r.kind, assetId: r.assetId, revision: rev, title: r.title })
                    onClose()
                  }}
                >
                  {actionLabel}
                </Button>
              </div>
            )
          })}
        </div>
        <div className="text-[11px] text-ink-3">引用保存为稳定的 assetId + revision；之后发布新版本不会自动改变此处。</div>
      </div>
    </Modal>
  )
}

const KEY_LABELS: Record<string, string> = {
  title: '标题',
  formula: '公式',
  datasetRef: '数据集',
  evaluationMode: '求值层级',
  unit: '单位',
  source: '来源',
  defaultValue: '默认值',
  scope: '作用域',
  defaultFilters: '默认筛选',
  measureBinding: '指标绑定',
  dimensions: '维度',
  chartType: '图型',
  doc: '正文',
  cells: '单元格',
  merges: '合并',
  regions: '动态区',
  filters: '筛选',
}
export const diffKeys = (a: any, b: any) => (a && b ? [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])) : [])

/** Version list: read-only view of any rN, diff against latest, create a new revision from it. */
export function RevisionHistory({ id, compact }: { id: string; compact?: boolean }) {
  const rec = useApp((s) => getRecord(s, id))
  const [view, setView] = useState<number | null>(null)
  if (!rec) return null
  const latest = rec.revisions.find((r) => r.revision === rec.latest)!
  const v = view !== null ? rec.revisions.find((r) => r.revision === view) : null
  return (
    <div className="space-y-1.5" data-history={id}>
      {[...rec.revisions].reverse().map((r, i, arr) => {
        const prev = arr[i + 1]
        const ch = prev ? diffKeys(prev.def, r.def) : []
        return (
          <div key={r.revision} className="flex gap-2 text-[12px] items-start">
            <Badge tone={r.revision === rec.latest ? 'brand' : 'gray'}>r{r.revision}</Badge>
            <div className="min-w-0 flex-1">
              <div className="text-ink-2 truncate">{r.note}</div>
              <div className="text-[11px] text-ink-3">
                {new Date(r.savedAt).toLocaleString('zh-CN')}
                {ch.length > 0 && ` · 变更：${ch.map((k) => KEY_LABELS[k] ?? k).join('、')}`}
              </div>
            </div>
            {!compact && (
              <Button size="xs" variant="ghost" icon={<Eye className="size-3" />} onClick={() => setView(r.revision)} aria-label={`查看 r${r.revision}`}>
                查看
              </Button>
            )}
          </div>
        )
      })}
      <Modal
        open={!!v}
        title={`${rec.assetId} · r${v?.revision}（只读）`}
        onClose={() => setView(null)}
        width={760}
        footer={
          v && v.revision !== rec.latest ? (
            <Button
              variant="primary"
              icon={<CopyPlus className="size-3.5" />}
              onClick={() => {
                const nr = useApp.getState().saveRevision(rec.assetId, v.def as any, `基于 r${v.revision} 创建（不改写 r${v.revision}）`)
                setView(null)
                toast(`已从 r${v.revision} 创建新修订 r${nr}；历史 r${v.revision} 保持不变`)
              }}
            >
              以此版本创建新修订 r{rec.latest + 1}
            </Button>
          ) : undefined
        }
      >
        {v && (
          <div className="space-y-3">
            <div className="text-[12px]">
              {v.note} · {new Date(v.savedAt).toLocaleString('zh-CN')}
            </div>
            {v.revision !== rec.latest && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12px]">
                与最新 r{rec.latest} 的差异：{diffKeys(v.def, latest.def).map((k) => KEY_LABELS[k] ?? k).join('、') || '无'}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {diffKeys(v.def, latest.def)
                    .slice(0, 4)
                    .map((k) => (
                      <div key={k} className="col-span-2 grid grid-cols-2 gap-2">
                        <pre className="text-[10.5px] bg-white border border-line rounded p-1.5 overflow-auto max-h-28">
                          r{v.revision}.{k} = {JSON.stringify((v.def as any)[k], null, 1)?.slice(0, 600)}
                        </pre>
                        <pre className="text-[10.5px] bg-white border border-line rounded p-1.5 overflow-auto max-h-28">
                          r{rec.latest}.{k} = {JSON.stringify((latest.def as any)[k], null, 1)?.slice(0, 600)}
                        </pre>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <pre className="text-[10.5px] font-mono bg-gray-50 border border-line rounded p-2 overflow-auto max-h-80">{JSON.stringify(v.def, null, 2)}</pre>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ChainRow({ n, depth }: { n: ChainNode; depth: number }) {
  const go = useUI((s) => s.go)
  const I = CATALOG_ICON[n.kind as CatalogKind] ?? ChevronRight
  return (
    <>
      <div className="flex items-center gap-1.5 text-[12px] py-0.5" style={{ paddingLeft: depth * 14 }}>
        {depth > 0 && <ChevronRight className="size-3 text-gray-300" />}
        <I className={cx('size-3.5', n.missing ? 'text-red-500' : 'text-brand-600')} />
        <button className="truncate hover:underline text-left" onClick={() => !n.missing && go(EDITOR_FOR[n.kind as CatalogKind], { assetId: n.assetId })}>
          {n.title}
        </button>
        <span className="font-mono text-[10.5px] text-ink-3">
          {n.assetId}@r{n.revision}
        </span>
        {n.location && <span className="text-[10.5px] text-ink-3">· {n.location}</span>}
        {n.missing && <Badge tone="red">缺失</Badge>}
        {n.cycle && <Badge tone="red">循环</Badge>}
      </div>
      {n.children.map((c, i) => (
        <ChainRow key={i} n={c} depth={depth + 1} />
      ))}
    </>
  )
}

/** Downward transitive dependency chain (e.g. 图表 → 表达式 → 数据集 → 连接). */
export function ChainTree({ id, revision }: { id: string; revision: number }) {
  const assets = useApp((s) => s.assets)
  const resources = useApp((s) => s.resources)
  const chain = useMemo(() => dependencyChain({ assets, resources, instances: {}, publications: [] }, id, revision), [assets, resources, id, revision])
  if (!chain.children.length) return <div className="text-[12px] text-ink-3">无上游依赖</div>
  return (
    <div data-chain={id}>
      <ChainRow n={chain} depth={0} />
    </div>
  )
}

/** Who uses this item — all template/asset revisions, instances and publications. */
export function UsageList({ id }: { id: string }) {
  const assets = useApp((s) => s.assets)
  const resources = useApp((s) => s.resources)
  const instances = useApp((s) => s.instances)
  const publications = useApp((s) => s.publications)
  const go = useUI((s) => s.go)
  const refs = useMemo(() => findReferences({ assets, resources, instances, publications }, id), [assets, resources, instances, publications, id])
  if (!refs.length) return <div className="text-[12px] text-ink-3">未被任何定义、报告或发布引用</div>
  const tone = { template: 'brand', asset: 'cyan', resource: 'violet', instance: 'gray', publication: 'green' } as const
  const label = { template: '报告模板', asset: '展示资产', resource: '共享资源', instance: '报告实例', publication: '模拟发布' }
  return (
    <div className="space-y-1.5" data-usages={id}>
      {refs.map((r) => {
        const rec = getRecord({ assets, resources }, r.id)
        return (
          <button
            key={r.type + r.id}
            onClick={() =>
              r.type === 'instance' ? go('instances', { instanceId: r.id }) : r.type === 'publication' ? go('instances', { publicationId: r.id }) : rec && go(EDITOR_FOR[rec.kind], { assetId: r.id })
            }
            className="w-full text-left flex items-start gap-2 p-2 rounded-md border border-line hover:bg-gray-50"
          >
            <Badge tone={tone[r.type]}>{label[r.type]}</Badge>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-ink truncate">{r.title}</div>
              <div className="text-[11px] text-ink-3 font-mono truncate">
                {r.id} · 使用方修订 {r.consumerRevisions.map((x) => 'r' + x).join('/')} · 固定引用 {r.pinnedRevision.map((x) => (x === 0 ? '按名称' : 'r' + x)).join('/')}
              </div>
              <div className="text-[10.5px] text-ink-3 truncate">{r.locations.join('；')}</div>
              {!r.latestUses && r.type !== 'instance' && r.type !== 'publication' && <div className="text-[10.5px] text-amber-700">仅历史修订引用</div>}
            </div>
            <ExternalLink className="size-3 text-ink-3 mt-1" />
          </button>
        )
      })}
    </div>
  )
}

export function ArchiveBadge({ rec }: { rec: AnyRecord }) {
  return rec.status === 'archived' ? (
    <Badge tone="amber">
      <Archive className="size-3" />
      已归档
    </Badge>
  ) : null
}

export { History, isResourceKind }
