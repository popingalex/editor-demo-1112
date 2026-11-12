import type { JSONContent } from '@tiptap/core'
import type {
  AnyDef,
  AssetRecord,
  CatalogKind,
  ChartDef,
  DatasetDef,
  ExpressionDef,
  FixedDef,
  ReportDef,
  ReportInstance,
  Publication,
  ResourceDef,
  ResourceRecord,
  TableDef,
  VariableDef,
} from './types'
import { parseRefBinding } from './fixedModel'
import { varIdFor, datasetIdFor } from './registry'
import { rcRef, parseKey, colName } from './grid'

export interface DirectDep {
  location: string
  assetId: string
  /** 0 = legacy reference by name (resolves to latest alias) */
  revision: number
}

const ASSET_NODE: Record<string, string> = { chartAsset: 'chart', tableAsset: 'table', fixedTableAsset: 'fixed' }

export function docDeps(doc: JSONContent | undefined): DirectDep[] {
  const out: DirectDep[] = []
  const walk = (n: JSONContent) => {
    const a = n.attrs ?? {}
    if (n.type && ASSET_NODE[n.type]) out.push({ location: `Report.doc.node ${a.nodeId}`, assetId: a.assetId, revision: a.assetRevision })
    if (n.type === 'expressionRef') out.push({ location: 'Report.doc.inline 表达式', assetId: a.assetId, revision: a.revision })
    if (n.type === 'variable') out.push(a.assetId ? { location: 'Report.doc.inline 变量', assetId: a.assetId, revision: a.revision } : { location: `Report.doc.inline 变量（旧名称 ${a.name}）`, assetId: varIdFor(a.name), revision: 0 })
    n.content?.forEach(walk)
  }
  if (doc) walk(doc)
  return out
}

function formulaRefs(formula: string): { kind: string; assetId: string; revision: number }[] {
  return [...formula.matchAll(/\{\{\s*(var|expr)\s*:\s*([A-Za-z0-9_-]+)\s*@\s*(\d+)\s*\}\}/g)].map((m) => ({ kind: m[1], assetId: m[2], revision: Number(m[3]) }))
}

export function directDeps(kind: CatalogKind, def: AnyDef | ResourceDef): DirectDep[] {
  const out: DirectDep[] = []
  if (kind === 'chart' || kind === 'table') {
    const d = def as ChartDef | TableDef
    const L = kind === 'chart' ? 'Chart' : 'Table'
    // legacy dataSetId maps to the seed shared Dataset definition (same ID mapping as migration)
    if (d.datasetRef) out.push({ location: `${L}.dataset`, ...d.datasetRef })
    else out.push({ location: `${L}.dataset（旧 dataSetId 映射）`, assetId: datasetIdFor(d.dataSetId), revision: 1 })
    if (d.measureBinding && d.measureBinding.kind !== 'field') out.push({ location: `${L}.measure`, assetId: d.measureBinding.assetId, revision: d.measureBinding.revision })
    for (const vf of d.variableFilters ?? []) out.push({ location: `${L}.filter ${vf.field}`, ...vf.variable })
  } else if (kind === 'fixed') {
    const d = def as FixedDef
    for (const ds of new Set([d.totalDataSetId, ...d.regions.map((g) => g.dataSetId)])) out.push({ location: `Fixed.dataset（${ds}）`, assetId: datasetIdFor(ds), revision: 1 })
    for (const [k, c] of Object.entries(d.cells)) {
      const r = c.binding ? parseRefBinding(c.binding) : null
      if (r) {
        const { r: row, c: col } = parseKey(k)
        out.push({ location: `Fixed.cell ${rcRef(row, col)}`, assetId: r.assetId, revision: r.revision })
      }
    }
    for (const g of d.regions)
      for (const [c, b] of Object.entries(g.columnBindings)) {
        const r = parseRefBinding(b)
        if (r) out.push({ location: `Fixed.region ${g.id} 列 ${colName(Number(c))}`, assetId: r.assetId, revision: r.revision })
      }
  } else if (kind === 'report') {
    out.push(...docDeps((def as ReportDef).doc))
  } else if (kind === 'expression') {
    const d = def as ExpressionDef
    out.push({ location: 'Expression.dataset', ...d.datasetRef })
    for (const r of formulaRefs(d.formula)) out.push({ location: 'Expression.formula', assetId: r.assetId, revision: r.revision })
  } else if (kind === 'variable') {
    const d = def as VariableDef
    if (d.source.kind === 'expression') out.push({ location: 'Variable.source', ...d.source.ref })
  } else if (kind === 'dataset') {
    out.push({ location: 'Dataset.connection', ...(def as DatasetDef).connectionRef })
  }
  return out
}

export interface DepEdge extends DirectDep {
  consumerId: string
  consumerKind: CatalogKind | 'instance' | 'publication'
  consumerRev: number
  consumerTitle: string
  latestConsumerRev: boolean
}

export interface GraphState {
  assets: Record<string, AssetRecord>
  resources: Record<string, ResourceRecord>
  instances: Record<string, ReportInstance>
  publications: Publication[]
}

/** Every dependency edge across all saved revisions, instances (all revisions + snapshots) and publications. */
export function allEdges(s: GraphState): DepEdge[] {
  const out: DepEdge[] = []
  const recs = [...Object.values(s.assets), ...Object.values(s.resources ?? {})] as (AssetRecord | ResourceRecord)[]
  for (const a of recs)
    for (const r of a.revisions)
      for (const d of directDeps(a.kind, r.def as any))
        out.push({ ...d, consumerId: a.assetId, consumerKind: a.kind, consumerRev: r.revision, consumerTitle: a.title, latestConsumerRev: r.revision === a.latest })
  for (const i of Object.values(s.instances)) {
    const seen = new Set<string>()
    const push = (d: DirectDep, rev: number) => {
      const k = `${d.assetId}@${d.revision}|${d.location}`
      if (seen.has(k)) return
      seen.add(k)
      out.push({ ...d, consumerId: i.instanceId, consumerKind: 'instance', consumerRev: rev, consumerTitle: i.title, latestConsumerRev: true })
    }
    docDeps(i.doc).forEach((d) => push(d, i.currentRevision))
    i.revisions.forEach((r) => docDeps(r.doc).forEach((d) => push(d, r.revision)))
    Object.values(i.assetSnapshots).forEach((x) => push({ location: 'Instance.snapshot', assetId: x.assetId, revision: x.revision }, i.currentRevision))
    Object.values(i.resourceSnapshots ?? {}).forEach((x) => push({ location: 'Instance.snapshot', assetId: x.assetId, revision: x.revision }, i.currentRevision))
  }
  for (const p of s.publications) {
    const f = p.frozenContent
    ;[...Object.values(f.assetSnapshots), ...Object.values(f.resourceSnapshots ?? {})].forEach((x) =>
      out.push({ location: 'Publication.frozen', assetId: x.assetId, revision: x.revision, consumerId: p.publicationId, consumerKind: 'publication', consumerRev: p.instanceRevision, consumerTitle: f.title, latestConsumerRev: true }),
    )
  }
  return out
}

export const usagesOf = (s: GraphState, id: string) => allEdges(s).filter((e) => e.assetId === id && e.consumerId !== id)

export interface ChainNode {
  assetId: string
  revision: number
  kind: string
  title: string
  location?: string
  missing?: boolean
  cycle?: boolean
  children: ChainNode[]
}

/** Downward dependency chain, e.g. Chart → Expression → Dataset → Connection. */
export function dependencyChain(s: GraphState, assetId: string, revision: number, location?: string, stack: string[] = []): ChainNode {
  const rec = (s.assets[assetId] ?? s.resources?.[assetId]) as AssetRecord | ResourceRecord | undefined
  const rev = revision === 0 ? rec?.latest ?? 0 : revision
  const r = rec?.revisions.find((x) => x.revision === rev)
  if (!rec || !r) return { assetId, revision, kind: rec?.kind ?? '?', title: rec?.title ?? '（缺失）', location, missing: true, children: [] }
  if (stack.includes(assetId)) return { assetId, revision: rev, kind: rec.kind, title: rec.title, location, cycle: true, children: [] }
  const deps = directDeps(rec.kind, r.def as any)
  const uniq = deps.filter((d, i) => deps.findIndex((x) => x.assetId === d.assetId && x.revision === d.revision) === i)
  return { assetId, revision: rev, kind: rec.kind, title: (r.def as any).title ?? rec.title, location, children: uniq.map((d) => dependencyChain(s, d.assetId, d.revision, d.location, [...stack, assetId])) }
}

/** Flatten a chain into the unique set of (id, revision) — used for transitive snapshots. */
export function flattenChain(n: ChainNode, out = new Map<string, { assetId: string; revision: number }>()) {
  if (!n.missing) out.set(`${n.assetId}@${n.revision}`, { assetId: n.assetId, revision: n.revision })
  n.children.forEach((c) => flattenChain(c, out))
  return out
}
