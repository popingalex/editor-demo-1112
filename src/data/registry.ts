import type {
  DataContext,
  DataSetId,
  DatasetDef,
  ExpressionDef,
  Rec,
  ResourceDef,
  ResourceKind,
  ResourceRecord,
  ResourceSnapshot,
  VariableDef,
} from './types'
import { DATASETS, DATASET_IDS, FIELD_LABELS, getRecords, type RecordSource } from './engine'

/**
 * Evaluation environment: where shared resources, dataset records and variable values come from.
 * Live editing uses the store registry + DEMO JSON; instances/publications use frozen snapshots.
 */
export interface Env {
  resource: (assetId: string, revision: number) => ResourceSnapshot | null
  latest: (assetId: string) => number | undefined
  list: () => ResourceSnapshot[]
  data: RecordSource
  /** variable values keyed by variable assetId (template/instance scope) */
  varValues: Record<string, string | number | boolean | null>
  reportTitle?: string
}

let globalResources: Record<string, ResourceRecord> = {}
export const setGlobalResources = (r: Record<string, ResourceRecord>) => {
  globalResources = r
}
export const getGlobalResources = () => globalResources

export function snapshotOf(r: ResourceRecord | undefined, revision: number): ResourceSnapshot | null {
  const rev = r?.revisions.find((x) => x.revision === revision)
  if (!r || !rev) return null
  return { assetId: r.assetId, kind: r.kind, revision, title: (rev.def as any).title ?? r.title, def: rev.def }
}

export function envFromRecords(resources: Record<string, ResourceRecord>, extra: Partial<Env> = {}): Env {
  return {
    resource: (id, rev) => snapshotOf(resources[id], rev),
    latest: (id) => resources[id]?.latest,
    list: () => Object.values(resources).flatMap((r) => snapshotOf(r, r.latest) ?? []),
    data: getRecords,
    varValues: {},
    ...extra,
  }
}

export const defaultEnv = (extra: Partial<Env> = {}): Env => envFromRecords(globalResources, extra)

export const snapKey = (id: string, rev: number) => `${id}@${rev}`

export function envFromSnapshots(
  snaps: Record<string, ResourceSnapshot>,
  data?: Partial<Record<DataSetId, Rec[]>>,
  extra: Partial<Env> = {},
): Env {
  const list = Object.values(snaps)
  return {
    resource: (id, rev) => snaps[snapKey(id, rev)] ?? null,
    latest: (id) => {
      const revs = list.filter((s) => s.assetId === id).map((s) => s.revision)
      return revs.length ? Math.max(...revs) : undefined
    },
    list: () => list,
    data: (ds) => data?.[ds] ?? getRecords(ds),
    varValues: {},
    ...extra,
  }
}

/* ---------- seed resources ---------- */

export const CONNECTION_ID = 'DEMO-CONN-01'
export const datasetIdFor = (sourceKey: DataSetId) => `DEMO-DS-${sourceKey}`
export const EXPR_IDS = {
  inputTotal: 'DEMO-EXPR-INPUT-TOTAL',
  inputAvg: 'DEMO-EXPR-INPUT-AVG',
  inputCount: 'DEMO-EXPR-INPUT-COUNT',
  transferred: 'DEMO-EXPR-TRANSFERRED',
  transferTarget: 'DEMO-EXPR-TRANSFER-TARGET',
  completion: 'DEMO-EXPR-COMPLETION',
}
export const varIdFor = (name: string) => `DEMO-VAR-${name}`

const SEED_TIME = '2025-01-01T08:00:00.000Z'

function fieldType(ds: DataSetId, f: string): 'number' | 'string' | 'boolean' {
  const v = getRecords(ds).find((r) => r[f] !== null && r[f] !== undefined)?.[f]
  return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string'
}

export function datasetDefFor(ds: DataSetId): DatasetDef {
  const m = DATASETS[ds]
  const warnings: string[] = []
  if (ds === 'printStressRows') warnings.push('版面压力数据：仅用于分页演示，不能加入资源投入合计')
  if (ds === 'resourceSplit') warnings.push('resourceInput 的确定性拆分：不能与 resourceInput 再相加')
  if (ds === 'transferProgress') warnings.push('累计值：可在同一 Tick 内跨目标相加，不可跨 Tick 相加')
  if (ds === 'dualMetric') warnings.push('派生联接视图：completionPercent 不可与其它来源混合求和')
  if (ds === 'componentSeries') warnings.push('包含布尔状态字段：连续为 true 的状态不是多次事件')
  const fields = [...new Set([...m.dims, ...m.measures])].map((id) => {
    const type = fieldType(ds, id)
    const role: 'dimension' | 'measure' = m.measures.includes(id) ? 'measure' : 'dimension'
    const unit = role === 'measure' ? (ds === 'componentSeries' ? null : (MEASURE_UNIT[id] ?? m.unit)) : null
    return { id, label: FIELD_LABELS[id] ?? id, type, role, unit }
  })
  return {
    title: `${m.label}（${ds}）`,
    connectionRef: { assetId: CONNECTION_ID, revision: 1 },
    sourceKey: ds,
    fields,
    contextKeys: m.contextKeys,
    defaultFilters: {},
    description: `${m.source}${m.note ? ' · ' + m.note : ''}`,
    warnings,
  }
}
const MEASURE_UNIT: Record<string, string> = {
  demo_amount: '演示量',
  transferredCount: '人（合成示例）',
  targetCount: '人（合成示例）',
  completionPercent: '%',
  progressPercent: '%',
  startMinute: '分钟',
  endMinute: '分钟',
  quantity: '演示量',
}

function rec<D extends ResourceDef>(kind: ResourceKind, assetId: string, def: D, provenance = 'DEMO_RESOURCE'): ResourceRecord<D> {
  return {
    assetId,
    kind,
    title: def.title,
    seed: true,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    latest: 1,
    revisions: [{ revision: 1, def, savedAt: SEED_TIME, note: '预置种子版本 r1' }],
    provenance,
    status: 'active',
  }
}

const expr = (name: string, title: string, ds: DataSetId, formula: string, unit: string | null, decimals: number | null, description: string): ExpressionDef => ({
  title,
  name,
  datasetRef: { assetId: datasetIdFor(ds), revision: 1 },
  formula,
  evaluationMode: 'aggregate',
  returnType: 'number',
  unit,
  decimals,
  description,
})

export function seedResources(): Record<string, ResourceRecord> {
  const out: Record<string, ResourceRecord> = {}
  out[CONNECTION_ID] = rec('connection', CONNECTION_ID, {
    title: 'DEMO JSON 本地数据连接',
    type: 'demo-json',
    source: 'src/data/demo.json',
    description: '仅指向项目内置的合成 DEMO JSON；不连接任何真实数据库或网络服务。',
    lastValidatedAt: null,
    lastValidation: null,
  })
  for (const ds of DATASET_IDS) out[datasetIdFor(ds)] = rec('dataset', datasetIdFor(ds), datasetDefFor(ds))
  const e = EXPR_IDS
  out[e.inputTotal] = rec('expression', e.inputTotal, expr('inputTotal', '资源投入合计', 'resourceInput', 'SUM(demo_amount)', '演示量', null, '当前上下文与筛选下的投入量求和'))
  out[e.inputAvg] = rec('expression', e.inputAvg, expr('inputAvg', '资源投入平均值', 'resourceInput', 'AVG(demo_amount)', '演示量', 2, '每条原始投入记录的平均值'))
  out[e.inputCount] = rec('expression', e.inputCount, expr('inputCount', '投入记录条数', 'resourceInput', 'COUNT()', '条', null, '参与计算的原始记录数'))
  out[e.transferred] = rec('expression', e.transferred, expr('transferred', '转移累计人数', 'transferProgress', 'SUM(transferredCount)', '人（合成示例）', null, '同一 Tick 跨目标求和（累计值，不跨 Tick 相加）'))
  out[e.transferTarget] = rec('expression', e.transferTarget, expr('transferTarget', '转移目标人数', 'transferProgress', 'SUM(targetCount)', '人（合成示例）', null, '同一 Tick 跨目标求和'))
  out[e.completion] = rec(
    'expression',
    e.completion,
    expr('completion', '转移完成率', 'transferProgress', `ROUND({{expr:${e.transferred}@1}} / {{expr:${e.transferTarget}@1}} * 100, 1)`, '%', 1, '引用两个共享表达式的派生指标'),
  )
  const ctxVar = (name: string, title: string, path: 'simulationId' | 'branch' | 'tick' | 'reportTitle', type: VariableDef['type']): VariableDef => ({
    title,
    name,
    type,
    scope: 'workspace',
    defaultValue: null,
    source: { kind: 'context', path },
    description: `报告/页面上下文中的 ${path}`,
  })
  const exprVar = (name: string, title: string, id: string): VariableDef => ({
    title,
    name,
    type: 'number',
    scope: 'workspace',
    defaultValue: null,
    source: { kind: 'expression', ref: { assetId: id, revision: 1 } },
    description: `由共享表达式 ${id} 派生`,
  })
  const vars: VariableDef[] = [
    ctxVar('simulationId', '演示运行 ID', 'simulationId', 'string'),
    ctxVar('branch', '分支', 'branch', 'string'),
    ctxVar('tick', '时间点 Tick', 'tick', 'number'),
    ctxVar('reportTitle', '报告标题', 'reportTitle', 'string'),
    exprVar('resourceInputTotal', '资源投入合计', e.inputTotal),
    exprVar('transferredTotal', '转移累计人数', e.transferred),
    exprVar('transferTarget', '转移目标人数', e.transferTarget),
    exprVar('completionPercent', '转移完成率 %', e.completion),
    exprVar('recordCount', '投入记录条数', e.inputCount),
  ]
  for (const v of vars) out[varIdFor(v.name)] = rec('variable', varIdFor(v.name), v)
  return out
}

/** Legacy `{type:'variable', attrs:{name}}` nodes resolve through this alias table. */
export function variableByName(env: Env, name: string): ResourceSnapshot | null {
  const id = varIdFor(name)
  const l = env.latest(id)
  if (l !== undefined) return env.resource(id, l)
  return env.list().find((s) => s.kind === 'variable' && (s.def as VariableDef).name === name) ?? null
}

export const CONTEXT_PATHS = ['simulationId', 'branch', 'tick'] as const

/** Apply context-sourced variable overrides (e.g. selectedTick = 1) to the evaluation context. */
export function applyVarContext(params: DataContext, env: Env): DataContext {
  const out = { ...params }
  for (const [id, value] of Object.entries(env.varValues)) {
    if (value === null || value === undefined || value === '') continue
    const l = env.latest(id)
    const snap = l !== undefined ? env.resource(id, l) : null
    const def = snap?.def as VariableDef | undefined
    if (snap?.kind !== 'variable' || def?.source.kind !== 'context') continue
    const p = def.source.path
    if (p === 'tick') out.tick = Number(value)
    else if (p === 'simulationId' || p === 'branch') out[p] = String(value)
  }
  return out
}

/** Defaults for “新建” in the resource center. */
export function newResourceDef(kind: ResourceKind, name = ''): ResourceDef {
  switch (kind) {
    case 'connection':
      return { title: name || '新建 DEMO 连接', type: 'demo-json', source: 'src/data/demo.json', description: '指向内置 DEMO JSON（不连接真实服务）', lastValidatedAt: null, lastValidation: null }
    case 'dataset':
      return { ...datasetDefFor('resourceInput'), title: name || '新建数据集视图（resourceInput）', description: '基于 resourceInput 的数据集视图：只定义来源与默认筛选，不复制原始记录' }
    case 'variable':
      return { title: name || '新建变量', name: 'newVariable', type: 'number', scope: 'instance', defaultValue: null, source: { kind: 'context', path: 'tick' }, description: '' }
    case 'expression':
      return { title: name || '新建表达式', name: 'newExpression', datasetRef: { assetId: datasetIdFor('resourceInput'), revision: 1 }, formula: 'SUM(demo_amount)', evaluationMode: 'aggregate', returnType: 'number', unit: '演示量', decimals: null, description: '' }
  }
}
