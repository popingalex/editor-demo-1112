import { useState, type ReactNode } from 'react'
import { Sigma, ArrowUpCircle, X, Plus } from 'lucide-react'
import type { BindingRef, DataSetId, DatasetDef, ExpressionDef, RevRef, VariableDef } from '../data/types'
import { useApp } from '../store/store'
import { fieldLabel } from '../data/engine'
import { Badge, Button, Field, Segmented, Select } from '../ui/kit'
import { ResourcePicker } from './Catalog'
import { FILTERABLE } from './DataControls'
import { DATASETS } from '../data/engine'

/** Choose a shared Dataset definition (pins id + revision); the legacy dataSetId stays the source key. */
export function SharedDatasetSelect({ value, sourceKey, onChange }: { value?: RevRef; sourceKey: DataSetId; onChange: (ref: RevRef | undefined, sourceKey: DataSetId) => void }) {
  const resources = useApp((s) => s.resources)
  const datasets = Object.values(resources).filter((r) => r.kind === 'dataset')
  const opts = [
    { value: '', label: '（不绑定共享数据集，直接使用数据源）' },
    ...datasets.flatMap((r) =>
      r.revisions.map((rv) => ({ value: `${r.assetId}@${rv.revision}`, label: `${r.title} · r${rv.revision}${r.status === 'archived' ? '（已归档）' : ''}` })),
    ),
  ]
  const cur = value ? resources[value.assetId] : undefined
  const def = cur?.revisions.find((r) => r.revision === value?.revision)?.def as DatasetDef | undefined
  return (
    <Field
      label="共享数据集"
      hint={
        value ? (
          <span>
            固定 <span className="font-mono">{value.assetId}@r{value.revision}</span>
            {cur && cur.latest > value.revision && <span className="text-amber-700"> · 共享最新 r{cur.latest}，当前仍固定 r{value.revision}</span>}
            {def && Object.keys(def.defaultFilters).length > 0 && ` · 默认筛选 ${JSON.stringify(def.defaultFilters)}`}
          </span>
        ) : (
          `当前直接使用数据源 ${sourceKey}`
        )
      }
    >
      <Select
        value={value ? `${value.assetId}@${value.revision}` : ''}
        onChange={(v) => {
          if (!v) return onChange(undefined, sourceKey)
          const [id, rev] = v.split('@')
          const d = resources[id].revisions.find((r) => r.revision === Number(rev))!.def as DatasetDef
          onChange({ assetId: id, revision: Number(rev) }, d.sourceKey)
        }}
        options={opts}
        aria-label="共享数据集"
      />
    </Field>
  )
}

/** Measure source: dataset field + aggregation, or a pinned shared ExpressionRef. */
export function MeasureBindingEditor({ dataSetId, binding, onChange, fieldEditor }: { dataSetId: DataSetId; binding?: BindingRef; onChange: (b: BindingRef | undefined) => void; fieldEditor: ReactNode }) {
  const resources = useApp((s) => s.resources)
  const [picker, setPicker] = useState(false)
  const isExpr = binding?.kind === 'expression'
  const rec = isExpr ? resources[binding.assetId] : undefined
  const def = isExpr ? (rec?.revisions.find((r) => r.revision === binding.revision)?.def as ExpressionDef | undefined) : undefined
  return (
    <div className="space-y-2" data-measure-source={isExpr ? 'expression' : 'field'}>
      <Field label="指标来源">
        <Segmented
          value={isExpr ? 'expression' : 'field'}
          onChange={(v) => (v === 'field' ? onChange(undefined) : setPicker(true))}
          options={[
            { value: 'field', label: '数据集字段' },
            { value: 'expression', label: '共享表达式' },
          ]}
        />
      </Field>
      {isExpr ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 text-[12px] space-y-1.5" data-measure-binding={`${binding.assetId}@${binding.revision}`}>
          <div className="flex items-center gap-1.5">
            <Sigma className="size-3.5 text-emerald-700" />
            <b className="truncate">{rec?.title ?? '（缺失表达式）'}</b>
            <span className="flex-1" />
            <button aria-label="解除表达式绑定" onClick={() => onChange(undefined)} className="size-5 grid place-items-center rounded hover:bg-emerald-100">
              <X className="size-3" />
            </button>
          </div>
          <div className="font-mono text-[11px] text-ink-3">
            {binding.assetId}@r{binding.revision} · {def?.formula}
          </div>
          <div className="text-[11px] text-ink-3">单位 {def?.unit ?? '未定义单位'} · 每个分组/单元格按其记录集合重新求值</div>
          {rec && rec.latest > binding.revision && (
            <div className="flex items-center gap-2 text-[11.5px] text-amber-800">
              有新版本 r{rec.latest}，当前仍固定 r{binding.revision}
              <Button size="xs" variant="subtle" icon={<ArrowUpCircle className="size-3" />} onClick={() => onChange({ kind: 'expression', assetId: binding.assetId, revision: rec.latest })}>
                显式升级
              </Button>
            </div>
          )}
          <Button size="xs" onClick={() => setPicker(true)}>
            更换表达式…
          </Button>
        </div>
      ) : (
        fieldEditor
      )}
      <ResourcePicker open={picker} onClose={() => setPicker(false)} kinds={['expression']} datasetKey={dataSetId} title="选择共享表达式作为指标" actionLabel="绑定" onPick={(p) => onChange({ kind: 'expression', assetId: p.assetId, revision: p.revision })} />
    </div>
  )
}

/** Filters whose value comes from a shared variable (re-evaluated when the context changes). */
export function VariableFilterEditor({ dataSetId, value, onChange }: { dataSetId: DataSetId; value: { field: string; variable: RevRef }[]; onChange: (v: { field: string; variable: RevRef }[]) => void }) {
  const resources = useApp((s) => s.resources)
  const dims = DATASETS[dataSetId].dims.filter((d) => FILTERABLE.includes(d))
  const [field, setField] = useState(dims[0] ?? '')
  const [picker, setPicker] = useState(false)
  if (!dims.length) return null
  return (
    <Field label="筛选绑定共享变量">
      <div className="space-y-1.5">
        {value.map((vf, i) => {
          const v = resources[vf.variable.assetId]?.revisions.find((r) => r.revision === vf.variable.revision)?.def as VariableDef | undefined
          return (
            <div key={i} className="flex items-center gap-1.5 text-[12px] rounded border border-violet-200 bg-violet-50 px-2 py-1">
              <span>{fieldLabel(vf.field)} =</span>
              <Badge tone="violet">{v?.name ?? vf.variable.assetId}</Badge>
              <span className="font-mono text-[10.5px] text-ink-3">r{vf.variable.revision}</span>
              <span className="flex-1" />
              <button aria-label="移除变量筛选" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <X className="size-3" />
              </button>
            </div>
          )
        })}
        <div className="flex gap-1.5">
          <Select size="sm" className="flex-1" value={field} onChange={setField} options={dims.map((d) => ({ value: d, label: fieldLabel(d) }))} />
          <Button size="sm" icon={<Plus className="size-3" />} onClick={() => setPicker(true)}>
            变量
          </Button>
        </div>
      </div>
      <ResourcePicker open={picker} onClose={() => setPicker(false)} kinds={['variable']} actionLabel="绑定" onPick={(p) => onChange([...value.filter((x) => x.field !== field), { field, variable: { assetId: p.assetId, revision: p.revision } }])} />
    </Field>
  )
}
