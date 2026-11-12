import { create, type StateCreator } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { JSONContent } from '@tiptap/core'
import type {
  AnyDef,
  AssetKind,
  AssetRecord,
  CatalogKind,
  DataContext,
  DataSetId,
  PersonalView,
  Publication,
  ReportDef,
  ReportInstance,
  ResourceDef,
  ResourceKind,
  ResourceRecord,
} from '../data/types'
import { seedAssets, DEFAULT_CONTEXT } from '../data/seed'
import { buildInstance, clone, collectRefs, resummarize, transitiveSnapshots, datasetsUsed, instanceEnv, freezeInline } from '../data/reports'
import { seedResources, setGlobalResources } from '../data/registry'
import { getRecords } from '../data/engine'
import { usagesOf, type DepEdge } from '../data/deps'
import { SCHEMA_VERSION, STORE_KEY, migrateState, validatePersisted, MigrationError, type MigrationReport } from './migrate'

export const nowIso = () => new Date().toISOString()

export interface Activity {
  id: string
  at: string
  text: string
}

interface DataState {
  assets: Record<string, AssetRecord>
  resources: Record<string, ResourceRecord>
  views: PersonalView[]
  instances: Record<string, ReportInstance>
  publications: Publication[]
  activity: Activity[]
  seq: number
  migrations: MigrationReport[]
}

export type AnyRecord = AssetRecord | ResourceRecord

interface Actions {
  createAsset: (kind: AssetKind, def: AnyDef) => string
  createResource: (kind: ResourceKind, def: ResourceDef) => string
  /** append a revision to an asset or resource (never rewrites existing revisions) */
  saveRevision: (assetId: string, def: AnyDef | ResourceDef, note: string) => number
  renameAsset: (assetId: string, title: string) => { ok: boolean; message?: string }
  duplicateAsset: (assetId: string) => string
  /** protected delete: refuses while any other definition revision references the item */
  deleteAsset: (assetId: string) => { ok: boolean; message?: string; usages?: DepEdge[] }
  archiveAsset: (assetId: string, archived: boolean) => void
  saveView: (v: Omit<PersonalView, 'id' | 'savedAt'>) => PersonalView
  deleteView: (id: string) => void
  generateInstance: (templateId: string, revision: number, selection: DataContext) => string
  saveInstanceDoc: (instanceId: string, doc: JSONContent) => void
  createInstanceRevision: (instanceId: string, doc: JSONContent, note: string) => number
  setInstanceVariable: (instanceId: string, variableId: string, value: string | number | boolean | null) => void
  addInstanceSnapshots: (instanceId: string, assetId: string, revision: number) => void
  publishInstance: (instanceId: string) => string
  resetDemo: () => void
  log: (text: string) => void
}

const PREFIX: Record<CatalogKind, string> = {
  chart: 'CHART',
  table: 'TABLE',
  fixed: 'FIXED',
  report: 'REPORT-TEMPLATE',
  connection: 'CONN',
  dataset: 'DS',
  variable: 'VAR',
  expression: 'EXPR',
}
export const KIND_LABEL: Record<CatalogKind, string> = {
  connection: '数据连接',
  dataset: '数据集',
  variable: '变量',
  expression: '表达式',
  chart: '图表',
  table: '分析型表格',
  fixed: '固定格式报表',
  report: '综合报告模板',
}
export const RESOURCE_KINDS: ResourceKind[] = ['connection', 'dataset', 'variable', 'expression']
export const isResourceKind = (k: string): k is ResourceKind => (RESOURCE_KINDS as string[]).includes(k)

function initialState(): DataState {
  const assets = seedAssets()
  const resources = seedResources()
  for (const a of Object.values(assets)) a.status = 'active'
  const tpl = assets['DEMO-REPORT-TEMPLATE-01'] as AssetRecord<ReportDef>
  const inst = buildInstance('DEMO-REPORT-INSTANCE-01', tpl, 1, { ...DEFAULT_CONTEXT }, assets, '2025-01-01T08:30:00.000Z', resources)
  return {
    assets,
    resources,
    views: [],
    instances: { [inst.instanceId]: inst },
    publications: [],
    activity: [{ id: 'A0', at: '2025-01-01T08:30:00.000Z', text: '载入 DEMO 种子：1 连接 / 7 数据集 / 9 变量 / 6 表达式 / 6 图表 / 3 分析表 / 2 固定模板 / 2 报告模板 / 1 报告实例' }],
    seq: 1,
    migrations: [],
  }
}

export const latestDef = <D = AnyDef>(a: AnyRecord | undefined): D | undefined => (a ? (a.revisions.find((r) => r.revision === a.latest)?.def as D) : undefined)
export const revisionDef = <D = AnyDef>(a: AnyRecord | undefined, rev: number): D | undefined => a?.revisions.find((r) => r.revision === rev)?.def as D | undefined
export const getRecord = (s: Pick<DataState, 'assets' | 'resources'>, id: string): AnyRecord | undefined => s.assets[id] ?? s.resources?.[id]

export interface RefUse {
  type: 'template' | 'instance' | 'asset' | 'resource' | 'publication'
  id: string
  title: string
  revision: number
  /** all consumer revisions that reference the item */
  consumerRevisions: number[]
  latestUses: boolean
  nodeIds: string[]
  locations: string[]
  pinnedRevision: number[]
}

/** Grouped usages across every saved revision, instance and publication (see data/deps.ts). */
export function findReferences(state: Pick<DataState, 'assets' | 'resources' | 'instances' | 'publications'> & Partial<DataState>, assetId: string): RefUse[] {
  const edges = usagesOf({ assets: state.assets, resources: state.resources ?? {}, instances: state.instances, publications: state.publications ?? [] }, assetId)
  const by = new Map<string, RefUse>()
  for (const e of edges) {
    const type: RefUse['type'] = e.consumerKind === 'report' ? 'template' : e.consumerKind === 'instance' ? 'instance' : e.consumerKind === 'publication' ? 'publication' : isResourceKind(e.consumerKind) ? 'resource' : 'asset'
    const k = `${type}:${e.consumerId}`
    const u = by.get(k) ?? { type, id: e.consumerId, title: e.consumerTitle, revision: e.consumerRev, consumerRevisions: [], latestUses: false, nodeIds: [], locations: [], pinnedRevision: [] }
    if (!u.consumerRevisions.includes(e.consumerRev)) u.consumerRevisions.push(e.consumerRev)
    u.revision = Math.max(u.revision, e.consumerRev)
    u.latestUses ||= e.latestConsumerRev
    if (!u.locations.includes(e.location)) u.locations.push(e.location)
    const nid = /node (\S+)/.exec(e.location)?.[1]
    if (nid && !u.nodeIds.includes(nid)) u.nodeIds.push(nid)
    if (!u.pinnedRevision.includes(e.revision)) u.pinnedRevision.push(e.revision)
    by.set(k, u)
  }
  return [...by.values()].map((u) => ({ ...u, consumerRevisions: u.consumerRevisions.sort((a, b) => a - b) }))
}

export type AppState = DataState & Actions

const appSlice: StateCreator<AppState> = (set, get) => {
  const put = (rec: AnyRecord) =>
    set((s) => (isResourceKind(rec.kind) ? { resources: { ...s.resources, [rec.assetId]: rec as ResourceRecord } } : { assets: { ...s.assets, [rec.assetId]: rec as AssetRecord } }))
  const create = (kind: CatalogKind, def: AnyDef | ResourceDef): string => {
    const s = get()
    const pool = { ...s.assets, ...s.resources }
    let k = Object.values(pool).filter((a) => a.kind === kind && !a.seed).length + 1
    let id = `DEMO-${PREFIX[kind]}-U${String(k).padStart(2, '0')}`
    while (pool[id]) id = `DEMO-${PREFIX[kind]}-U${String(++k).padStart(2, '0')}`
    const t = nowIso()
    const rec = { assetId: id, kind, title: (def as any).title, seed: false, createdAt: t, updatedAt: t, latest: 1, revisions: [{ revision: 1, def: clone(def), savedAt: t, note: '新建' }], provenance: 'DEMO_USER_ASSET', status: 'active' } as AnyRecord
    put(rec)
    get().log(`新建${KIND_LABEL[kind]} ${id}「${rec.title}」r1`)
    return id
  }
  return {
    ...initialState(),
    log: (text) => set((s) => ({ activity: [{ id: `A${s.seq}`, at: nowIso(), text }, ...s.activity].slice(0, 120), seq: s.seq + 1 })),
    createAsset: (kind, def) => create(kind, def),
    createResource: (kind, def) => create(kind, def),
    saveRevision: (assetId, def, note) => {
      const a = getRecord(get(), assetId)!
      const rev = Math.max(...a.revisions.map((r) => r.revision)) + 1
      const t = nowIso()
      put({ ...a, title: (def as any).title ?? a.title, latest: rev, updatedAt: t, revisions: [...a.revisions, { revision: rev, def: clone(def), savedAt: t, note: note || `共享新版本 r${rev}` }] } as AnyRecord)
      get().log(`发布共享新版本 ${assetId} r${rev}${note ? `：${note}` : ''}`)
      return rev
    },
    renameAsset: (assetId, title) => {
      const t = title.trim()
      if (!t) return { ok: false, message: '名称不能为空' }
      const s = get()
      const a = getRecord(s, assetId)!
      if ([...Object.values(s.assets), ...Object.values(s.resources)].some((x) => x.assetId !== assetId && x.kind === a.kind && x.title === t)) return { ok: false, message: `已存在同名${KIND_LABEL[a.kind]}「${t}」` }
      put({ ...a, title: t, updatedAt: nowIso() } as AnyRecord)
      get().log(`重命名 ${assetId} →「${t}」（ID 不变）`)
      return { ok: true }
    },
    duplicateAsset: (assetId) => {
      const s = get()
      const a = getRecord(s, assetId)!
      const def = clone(latestDef(a)!) as any
      let title = `${a.title} 副本`
      let k = 2
      while ([...Object.values(s.assets), ...Object.values(s.resources)].some((x) => x.kind === a.kind && x.title === title)) title = `${a.title} 副本 ${k++}`
      def.title = title
      if (a.kind === 'variable' || a.kind === 'expression') def.name = `${def.name}_copy${k}`
      const id = create(a.kind, def)
      get().log(`复制 ${assetId} r${a.latest} → ${id}`)
      return id
    },
    deleteAsset: (assetId) => {
      const s = get()
      const usages = usagesOf(s, assetId)
      const blocking = usages.filter((e) => e.consumerKind !== 'instance' && e.consumerKind !== 'publication')
      if (blocking.length) return { ok: false, message: `仍被 ${new Set(blocking.map((e) => e.consumerId)).size} 个定义（含历史修订）引用，不能硬删除；可改为归档`, usages: blocking }
      const { [assetId]: _a, ...assets } = s.assets
      const { [assetId]: _r, ...resources } = s.resources
      set({ assets, resources, views: s.views.filter((v) => v.assetId !== assetId) })
      get().log(`删除 ${assetId}${usages.length ? `（${usages.length} 处实例/发布快照引用保持不变）` : ''}`)
      return { ok: true }
    },
    archiveAsset: (assetId, archived) => {
      const a = getRecord(get(), assetId)!
      put({ ...a, status: archived ? 'archived' : 'active', updatedAt: nowIso() } as AnyRecord)
      get().log(`${archived ? '归档' : '恢复'} ${assetId}（所有修订保留，历史引用可继续打开）`)
    },
    saveView: (v) => {
      const view: PersonalView = { ...clone(v), id: `VIEW-${get().seq}`, savedAt: nowIso() }
      set((s) => ({ views: [view, ...s.views.filter((x) => !(x.name === v.name && x.scope === v.scope && x.assetId === v.assetId))] }))
      get().log(`保存个人视图「${v.name}」（不改变共享资产）`)
      return view
    },
    deleteView: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),
    generateInstance: (templateId, revision, selection) => {
      const s = get()
      const nums = Object.keys(s.instances).map((k) => Number(/(\d+)$/.exec(k)?.[1] ?? 0))
      const id = `DEMO-REPORT-INSTANCE-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`
      const inst = buildInstance(id, s.assets[templateId] as AssetRecord<ReportDef>, revision, selection, s.assets, nowIso(), s.resources)
      set({ instances: { ...s.instances, [id]: inst } })
      get().log(`生成演示报告实例 ${id}（模板 ${templateId} r${revision} · ${selection.simulationId} Tick ${selection.tick} · 固定 ${Object.keys(inst.assetSnapshots).length} 个资产 + ${Object.keys(inst.resourceSnapshots ?? {}).length} 个上游资源快照）`)
      return id
    },
    saveInstanceDoc: (instanceId, doc) => {
      const i = get().instances[instanceId]
      const t = nowIso()
      const revisions = i.revisions.map((r) => (r.revision === i.currentRevision ? { ...r, doc: clone(doc), savedAt: t } : r))
      set((s) => ({ instances: { ...s.instances, [instanceId]: { ...i, doc: clone(doc), revisions, updatedAt: t, resolvedData: resummarize(i, doc) } } }))
      get().log(`保存报告实例修改 ${instanceId} 修订 ${i.currentRevision}（仅本报告生效）`)
    },
    createInstanceRevision: (instanceId, doc, note) => {
      const i = get().instances[instanceId]
      const rev = Math.max(...i.revisions.map((r) => r.revision)) + 1
      const t = nowIso()
      set((s) => ({
        instances: {
          ...s.instances,
          [instanceId]: { ...i, doc: clone(doc), currentRevision: rev, state: 'draft', revisions: [...i.revisions, { revision: rev, doc: clone(doc), savedAt: t, note: note || `修订 ${rev}` }], updatedAt: t, resolvedData: resummarize(i, doc) },
        },
      }))
      get().log(`报告实例 ${instanceId} 新建修订 ${rev}`)
      return rev
    },
    setInstanceVariable: (instanceId, variableId, value) => {
      const i = get().instances[instanceId]
      const vv = { ...(i.variableValues ?? {}) }
      if (value === null || value === '') delete vv[variableId]
      else vv[variableId] = value
      const next = { ...i, variableValues: vv, updatedAt: nowIso() }
      set((s) => ({ instances: { ...s.instances, [instanceId]: { ...next, resolvedData: resummarize(next, i.doc, vv) } } }))
      get().log(`实例 ${instanceId} 变量 ${variableId} = ${value ?? '（恢复默认）'}（仅本实例）`)
    },
    addInstanceSnapshots: (instanceId, assetId, revision) => {
      const s = get()
      const i = s.instances[instanceId]
      const t = transitiveSnapshots(s, [{ assetId, revision }])
      const assetSnapshots = { ...i.assetSnapshots, ...t.assetSnapshots }
      const resourceSnapshots = { ...(i.resourceSnapshots ?? {}), ...t.resourceSnapshots }
      const dataSnapshot = { ...(i.dataSnapshot ?? {}) }
      for (const ds of datasetsUsed(t.assetSnapshots, t.resourceSnapshots)) if (!dataSnapshot[ds as DataSetId]) dataSnapshot[ds as DataSetId] = clone(getRecords(ds))
      set((st) => ({ instances: { ...st.instances, [instanceId]: { ...i, assetSnapshots, resourceSnapshots, dataSnapshot } } }))
      get().log(`实例 ${instanceId} 增补 ${assetId} r${revision} 及其 ${Object.keys(t.resourceSnapshots).length} 个上游依赖快照（模板不变）`)
    },
    publishInstance: (instanceId) => {
      const i = get().instances[instanceId]
      const id = `DEMO-PUB-${String(get().publications.length + 1).padStart(3, '0')}`
      const env = instanceEnv(i)
      const pub: Publication = {
        publicationId: id,
        instanceId,
        instanceRevision: i.currentRevision,
        createdAt: nowIso(),
        state: 'demo-published',
        frozenContent: clone({
          title: i.title,
          doc: i.doc,
          selection: i.selection,
          resolvedValues: i.resolvedValues,
          assetSnapshots: i.assetSnapshots,
          resolvedData: i.resolvedData,
          templateRef: i.templateRef,
          resourceSnapshots: i.resourceSnapshots ?? {},
          dataSnapshot: i.dataSnapshot ?? Object.fromEntries(datasetsUsed(i.assetSnapshots, {}).map((ds) => [ds, getRecords(ds)])),
          variableValues: i.variableValues ?? {},
          frozenResults: freezeInline(i.doc, i.selection, env),
        }),
      }
      set((s) => ({ publications: [pub, ...s.publications], instances: { ...s.instances, [instanceId]: { ...i, state: 'demo-published' } } }))
      get().log(`模拟发布 ${id}（${instanceId} 修订 ${i.currentRevision}，文档、资产/资源快照、数据与行内结果已冻结）`)
      return id
    },
    resetDemo: () => {
      set({ ...initialState() })
      useUI.getState().resetNav()
    },
  }
}

/* ---------------- persistence guard, backup & migration ---------------- */

export type BootStatus = 'fresh' | 'current' | 'migrated' | 'corrupt' | 'unavailable'
export interface StorageStatus {
  boot: BootStatus
  rawVersion: number | null
  blocked: boolean
  error: string | null
  issues: string[]
  backupKey: string | null
}
export const storageStatus: StorageStatus = { boot: 'fresh', rawVersion: null, blocked: false, error: null, issues: [], backupKey: null }

const hasLS = () => {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function detectBoot() {
  if (!hasLS()) return void (storageStatus.boot = 'unavailable')
  const raw = localStorage.getItem(STORE_KEY)
  if (raw === null) return void (storageStatus.boot = 'fresh')
  try {
    const parsed = JSON.parse(raw)
    storageStatus.rawVersion = typeof parsed?.version === 'number' ? parsed.version : null
    storageStatus.boot = parsed?.version === SCHEMA_VERSION ? 'current' : 'migrated'
    if (parsed?.version === SCHEMA_VERSION) {
      const issues = validatePersisted(parsed.state)
      if (issues.length) Object.assign(storageStatus, { boot: 'corrupt', blocked: true, error: '本地存储校验失败', issues })
    }
  } catch (e) {
    Object.assign(storageStatus, { boot: 'corrupt', blocked: true, error: `本地存储不是有效 JSON：${(e as Error).message}` })
  }
  if (storageStatus.boot === 'migrated' || storageStatus.boot === 'corrupt') {
    // Always keep an untouched copy of the raw string before any migration or recovery.
    const key = `${STORE_KEY}.backup.v${storageStatus.rawVersion ?? 'x'}.${Date.now()}`
    try {
      localStorage.setItem(key, raw)
      storageStatus.backupKey = key
    } catch {
      /* quota */
    }
  }
}
detectBoot()

const guardedStorage = createJSONStorage(() => {
  if (!hasLS()) throw new Error('localStorage unavailable')
  return {
    getItem: (k: string) => (storageStatus.blocked && k === STORE_KEY ? null : localStorage.getItem(k)),
    setItem: (k: string, v: string) => {
      if (storageStatus.blocked && k === STORE_KEY) return
      localStorage.setItem(k, v)
    },
    removeItem: (k: string) => {
      if (!storageStatus.blocked) localStorage.removeItem(k)
    },
  }
})

export const useApp = create<AppState>()(
  persist(appSlice, {
    name: STORE_KEY,
    version: SCHEMA_VERSION,
    storage: guardedStorage,
    migrate: (persisted, version) => migrateState(persisted, version, storageStatus.backupKey),
    onRehydrateStorage: () => (_state, error) => {
      if (error) {
        Object.assign(storageStatus, {
          boot: 'corrupt',
          blocked: true,
          error: (error as Error).message,
          issues: error instanceof MigrationError ? error.issues : [],
        })
      }
    },
  }),
)
setGlobalResources(useApp.getState().resources)
useApp.subscribe((s, p) => {
  if (s.resources !== p.resources) setGlobalResources(s.resources)
})

/** Explicit user choice after a failed migration: keep the raw backup and continue with seeds. */
export function unblockStorageWithSeed() {
  storageStatus.blocked = false
  useApp.getState().resetDemo()
  useApp.getState().log(`本地存储无法迁移，用户选择以 DEMO 种子继续；原始数据保留在 ${storageStatus.backupKey}`)
}

/** Isolated, non-persisted store with the same actions — used by the acceptance runner. */
export const createTestStore = () => createStore<AppState>()(appSlice)

/* ---------------- UI store ---------------- */

export type PageId = 'assets' | 'resource' | 'chart' | 'workspace' | 'table' | 'fixed' | 'report' | 'generate' | 'instances' | 'states' | 'acceptance'
export interface NavParams {
  assetId?: string
  instanceId?: string
  templateId?: string
  publicationId?: string
  insertAssetId?: string
  viewId?: string
  kind?: string
  revision?: number
}
export interface Toast {
  id: number
  text: string
  tone: 'success' | 'info' | 'warn' | 'error'
}

export interface PanelPref {
  collapsed: boolean
  width: number
}
export const PANEL_DEFAULTS: Record<string, PanelPref & { min: number; max: number }> = {
  nav: { collapsed: false, width: 220, min: 180, max: 320 },
  outline: { collapsed: false, width: 216, min: 160, max: 380 },
  props: { collapsed: false, width: 320, min: 260, max: 520 },
  studioLeft: { collapsed: false, width: 284, min: 220, max: 420 },
  studioRight: { collapsed: false, width: 300, min: 240, max: 460 },
  assetTree: { collapsed: false, width: 208, min: 170, max: 320 },
  assetDetail: { collapsed: false, width: 380, min: 300, max: 560 },
}

interface UIState {
  page: PageId
  params: NavParams
  dirty: string | null
  pending: { page: PageId; params: NavParams } | null
  toasts: Toast[]
  panels: Record<string, PanelPref>
  outlineCollapsedSections: Record<string, boolean>
  go: (page: PageId, params?: NavParams) => void
  confirmLeave: () => void
  cancelLeave: () => void
  setDirty: (label: string | null) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismiss: (id: number) => void
  resetNav: () => void
  setPanel: (id: string, p: Partial<PanelPref>) => void
  toggleOutlineSection: (key: string) => void
}

let toastSeq = 1
export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      page: 'assets',
      params: {},
      dirty: null,
      pending: null,
      toasts: [],
      panels: {},
      outlineCollapsedSections: {},
      go: (page, params = {}) => {
        if (get().dirty) set({ pending: { page, params } })
        else set({ page, params })
      },
      confirmLeave: () => {
        const p = get().pending
        if (p) set({ page: p.page, params: p.params, pending: null, dirty: null })
      },
      cancelLeave: () => set({ pending: null }),
      setDirty: (label) => {
        if (get().dirty !== label) set({ dirty: label })
      },
      toast: (text, tone = 'success') => {
        const id = toastSeq++
        set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
        setTimeout(() => get().dismiss(id), 3600)
      },
      dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      resetNav: () => set({ page: 'assets', params: {}, dirty: null, pending: null }),
      setPanel: (id, p) => set((s) => ({ panels: { ...s.panels, [id]: { ...(s.panels[id] ?? PANEL_DEFAULTS[id]), ...p } } })),
      toggleOutlineSection: (key) => set((s) => ({ outlineCollapsedSections: { ...s.outlineCollapsedSections, [key]: !s.outlineCollapsedSections[key] } })),
    }),
    {
      name: 'rr-workbench-nav',
      version: 2,
      migrate: (p: any) => ({ panels: {}, outlineCollapsedSections: {}, ...p }),
      partialize: (s) => ({ page: s.page, params: { ...s.params, insertAssetId: undefined }, panels: s.panels, outlineCollapsedSections: s.outlineCollapsedSections }),
    },
  ),
)

export const usePanel = (id: string): PanelPref => {
  const p = useUI((s) => s.panels[id])
  return p ?? PANEL_DEFAULTS[id]
}

export const toast = (text: string, tone?: Toast['tone']) => useUI.getState().toast(text, tone)
