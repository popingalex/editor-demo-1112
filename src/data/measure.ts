import type { BindingRef, DataContext, DataSetId, DatasetDef, ExpressionDef, Filters, Rec, RevRef } from './types'
import { measureValue, unitOf, fieldLabel, type Group } from './engine'
import { applyVarContext, defaultEnv, type Env } from './registry'
import { evaluateExpression, evaluateVariable, resultNumber } from './expr'

/** Inputs shared by ChartDef and TableDef. */
export interface MeasureSource {
  dataSetId: DataSetId
  measure: string
  aggregation: 'sum' | 'count' | 'none'
  measureBinding?: BindingRef
  datasetRef?: RevRef
  filters: Filters
  variableFilters?: { field: string; variable: RevRef }[]
  viewParams: DataContext
}

export interface PreparedMeasure {
  params: DataContext
  filters: Filters
  /** value for one record set (group / cell / total) */
  value: (records: Rec[]) => number | null
  unit: string | null
  label: string
  isExpression: boolean
  error: () => { code: string; message: string } | null
  setupError: { code: string; message: string } | null
}

/**
 * The single resolver every analysis component uses: applies shared-dataset default filters,
 * variable-bound filters, variable context overrides and the structured measure binding.
 */
export function prepareMeasure(def: MeasureSource, env: Env = defaultEnv()): PreparedMeasure {
  const params = applyVarContext(def.viewParams, env)
  let setupError: PreparedMeasure['setupError'] = null
  let dsDefaults: Filters = {}
  if (def.datasetRef) {
    const s = env.resource(def.datasetRef.assetId, def.datasetRef.revision)
    if (!s) setupError = { code: 'UNKNOWN_REF', message: `共享数据集 ${def.datasetRef.assetId} r${def.datasetRef.revision} 不存在` }
    else if ((s.def as DatasetDef).sourceKey !== def.dataSetId) setupError = { code: 'TYPE_MISMATCH', message: `共享数据集 ${def.datasetRef.assetId} 来源为 ${(s.def as DatasetDef).sourceKey}，与组件数据集 ${def.dataSetId} 不一致` }
    else dsDefaults = (s.def as DatasetDef).defaultFilters ?? {}
  }
  const varFilters: Filters = {}
  for (const vf of def.variableFilters ?? []) {
    const r = evaluateVariable(vf.variable, { params }, env)
    if (r.status === 'ok' && r.value !== null && r.value !== '') varFilters[vf.field] = [String(r.value)]
    else if (r.status === 'invalid') setupError = { code: r.code, message: `筛选 ${vf.field} 绑定的变量出错：${r.message}` }
  }
  const filters = { ...dsDefaults, ...def.filters, ...varFilters }
  let firstError: { code: string; message: string } | null = null
  const b = def.measureBinding
  if (b && b.kind === 'expression') {
    const s = env.resource(b.assetId, b.revision)
    const ed = s?.def as ExpressionDef | undefined
    if (!s || s.kind !== 'expression') setupError = { code: env.latest(b.assetId) !== undefined ? 'MISSING_REVISION' : 'UNKNOWN_REF', message: `指标表达式 ${b.assetId} r${b.revision} 不存在` }
    else {
      const eds = env.resource(ed!.datasetRef.assetId, ed!.datasetRef.revision)?.def as DatasetDef | undefined
      if (eds && eds.sourceKey !== def.dataSetId) setupError = { code: 'DATASET_MISMATCH', message: `表达式 ${s.title} 基于数据集 ${eds.sourceKey}，与组件数据集 ${def.dataSetId} 不一致` }
    }
    return {
      params,
      filters,
      isExpression: true,
      unit: ed?.unit ?? null,
      label: s ? `${s.title}（${b.assetId}@r${b.revision}）` : b.assetId,
      setupError,
      error: () => setupError ?? firstError,
      value: (records) => {
        if (setupError) return null
        const r = evaluateExpression(b, { params, filters, records, recordsSource: def.dataSetId }, env)
        if (r.status === 'invalid' && !firstError) firstError = { code: r.code, message: r.message }
        return resultNumber(r)
      },
    }
  }
  const agg = def.aggregation === 'none' ? 'sum' : def.aggregation
  return {
    params,
    filters,
    isExpression: false,
    unit: agg === 'count' ? '条' : unitOf(def.dataSetId, def.measure, filters),
    label: agg === 'count' ? 'COUNT(记录数)' : `SUM(${fieldLabel(def.measure)})`,
    setupError,
    error: () => setupError,
    value: (records) => measureValue(records, def.measure, agg),
  }
}

/** Recompute group values with the prepared measure (each group / cell from its own records). */
export const revalue = (groups: Group[], m: PreparedMeasure): Group[] => groups.map((g) => ({ ...g, value: m.value(g.records) }))
