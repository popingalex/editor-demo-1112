import { useMemo, useRef, useState } from 'react'
import { GitBranchPlus, Undo2, Copy, Archive, ArchiveRestore, ShieldCheck, Plus, AlertOctagon, CheckCircle2 } from 'lucide-react'
import type { ChartDef, ConnectionDef, DataContext, DataSetId, DatasetDef, ExpressionDef, FixedDef, Filters, ResourceDef, ResourceKind, TableDef, VariableDef } from '../data/types'
import { useApp, useUI, latestDef, KIND_LABEL, toast, RESOURCE_KINDS } from '../store/store'
import { PageHeader } from '../ui/PageHeader'
import { SidePanel } from '../ui/SidePanel'
import { Badge, Button, Card, Field, InlineEdit, Modal, NumberInput, SaveState, Section, Segmented, Select, TextInput, cx } from '../ui/kit'
import { DataContextBar, FilterBar, FilterEditor } from '../components/DataControls'
import { RecordsTable, AnalysisTableView } from '../components/TableViews'
import { ChartView } from '../components/ChartView'
import { SheetTable } from '../components/FixedSheet'
import { CATALOG_ICON, ChainTree, RevisionHistory, UsageList, ResourcePicker, catalogSubtitle } from '../components/Catalog'
import { DATASET_IDS, DATASETS, getRecords, resolveSlice, unitText } from '../data/engine'
import { datasetDefFor, defaultEnv, envFromRecords, datasetIdFor, EXPR_IDS, snapshotOf, newResourceDef } from '../data/registry'
import { analyzeExpression, evaluateDef, evaluateVariableSnap, formatResult, refToken } from '../data/expr'
import { computeChart } from '../data/chartModel'
import { computeTable } from '../data/tableModel'
import { expandFixed } from '../data/fixedModel'
import { rcKey } from '../data/grid'
import { DEFAULT_CONTEXT } from '../data/seed'
import { ReportCtx } from '../editor/context'
import { DocRenderer } from '../editor/DocRenderer'
import { useDraft } from './useDraft'

export function ResourceEditor() {
  const params = useUI((s) => s.params)
  const go = useUI((s) => s.go)
  const resources = useApp((s) => s.resources)
  const [q, setQ] = useState('')
  const id = params.assetId && resources[params.assetId] ? params.assetId : EXPR_IDS.inputTotal
  const rec = resources[id]
  const { draft, setDraft, dirty, markSaved, revert } = useDraft<ResourceDef>(latestDef<ResourceDef>(rec), `共享资源 · ${id}`)
  const [save, setSave] = useState(false)
  const [note, setNote] = useState('')
  if (!rec || !draft) return <div className="p-10 text-ink-3">资源不存在</div>
  const set = (p: Partial<any>) => setDraft({ ...(draft as any), ...p })
  const grouped = RESOURCE_KINDS.map((k) => ({ k, items: Object.values(resources).filter((r) => r.kind === k && (!q || r.title.includes(q) || r.assetId.toLowerCase().includes(q.toLowerCase()))) }))
  const I = CATALOG_ICON[rec.kind]
  const nameOk = !('name' in draft) || /^[A-Za-z_][A-Za-z0-9_]*$/.test((draft as any).name)

  return (
    <>
      <PageHeader
        crumbs={[{ label: '共享资源与资产中心', page: 'assets' }, { label: KIND_LABEL[rec.kind] }, { label: rec.assetId }]}
        title={<InlineEdit value={(draft as any).title} onCommit={(v) => set({ title: v })} />}
        meta={
          <>
            <Badge tone="violet">
              <I className="size-3" />
              {KIND_LABEL[rec.kind]}
            </Badge>
            <Badge tone="brand">r{rec.latest}</Badge>
            {rec.status === 'archived' && <Badge tone="amber">已归档</Badge>}
            <SaveState dirty={dirty} />
          </>
        }
        actions={
          <>
            <Button variant="ghost" icon={<Undo2 className="size-3.5" />} disabled={!dirty} onClick={revert}>
              撤销修改
            </Button>
            <Button
              icon={<Copy className="size-3.5" />}
              onClick={() => {
                const nid = useApp.getState().duplicateAsset(rec.assetId)
                toast(`已复制为 ${nid}`)
                go('resource', { assetId: nid })
              }}
            >
              复制
            </Button>
            <Button icon={rec.status === 'archived' ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} onClick={() => useApp.getState().archiveAsset(rec.assetId, rec.status !== 'archived')}>
              {rec.status === 'archived' ? '恢复' : '归档'}
            </Button>
            <Button variant="primary" icon={<GitBranchPlus className="size-3.5" />} disabled={!nameOk} onClick={() => setSave(true)}>
              保存共享新版本
            </Button>
          </>
        }
      />
      <div className="flex-1 min-h-0 flex">
        <SidePanel id="studioLeft" side="left" title="共享资源">
          <div className="p-2 space-y-3">
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索资源" className="h-7 text-xs" />
            {grouped.map((g) => (
              <div key={g.k}>
                <div className="flex items-center justify-between px-1 mb-0.5">
                  <span className="text-[10.5px] font-semibold text-gray-400 tracking-wider">{KIND_LABEL[g.k]}</span>
                  <button
                    title={`新建${KIND_LABEL[g.k]}`}
                    aria-label={`新建${KIND_LABEL[g.k]}`}
                    onClick={() => {
                      const nid = useApp.getState().createResource(g.k, newResourceDef(g.k))
                      toast(`已创建${KIND_LABEL[g.k]} ${nid} r1`)
                      go('resource', { assetId: nid })
                    }}
                    className="size-5 grid place-items-center rounded hover:bg-gray-100"
                  >
                    <Plus className="size-3 text-ink-3" />
                  </button>
                </div>
                {g.items.map((r) => (
                  <button key={r.assetId} onClick={() => go('resource', { assetId: r.assetId })} className={cx('w-full text-left px-2 py-1.5 rounded-md text-[12.5px]', r.assetId === id ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-ink-2', r.status === 'archived' && 'opacity-60')}>
                    <div className="truncate">{r.title}</div>
                    <div className="text-[10.5px] font-mono text-ink-3 truncate">
                      {r.assetId} · r{r.latest}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </SidePanel>
        <div className="flex-1 min-w-0 overflow-auto scroll-thin p-4 space-y-3">
          {rec.kind === 'expression' && <ExpressionForm def={draft as ExpressionDef} set={set} selfId={rec.assetId} savedRev={rec.latest} dirty={dirty} />}
          {rec.kind === 'variable' && <VariableForm def={draft as VariableDef} set={set} selfId={rec.assetId} />}
          {rec.kind === 'dataset' && <DatasetForm def={draft as DatasetDef} set={set} setDraft={(d) => setDraft(d)} />}
          {rec.kind === 'connection' && <ConnectionForm def={draft as ConnectionDef} set={set} selfId={rec.assetId} />}
        </div>
        <SidePanel id="studioRight" side="right" title="版本 · 依赖 · 使用方">
          <Section title={`依赖链（r${rec.latest}）`}>
            <ChainTree id={rec.assetId} revision={rec.latest} />
          </Section>
          <Section title="版本记录">
            <RevisionHistory id={rec.assetId} />
          </Section>
          <Section title="使用位置">
            <UsageList id={rec.assetId} />
          </Section>
        </SidePanel>
      </div>
      <Modal
        open={save}
        title={`保存共享新版本：${rec.assetId} r${rec.latest + 1}`}
        onClose={() => setSave(false)}
        footer={
          <>
            <Button onClick={() => setSave(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                const r = useApp.getState().saveRevision(rec.assetId, draft, note)
                markSaved()
                setSave(false)
                setNote('')
                toast(`已保存 ${rec.assetId} r${r}；引用 r${rec.latest} 的图表/报告保持不变，需显式升级`)
              }}
            >
              保存 r{rec.latest + 1}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-brand-50 border border-brand-100 p-3 text-[12.5px]">
            <b>作用范围：共享{KIND_LABEL[rec.kind]}定义</b>（revision +1）。已固定引用 r{rec.latest} 的表达式、图表、表格、固定报表、报告模板、实例与发布<b>不会自动升级</b>。
          </div>
          <Field label="版本说明">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：改为平均值" />
          </Field>
        </div>
      </Modal>
    </>
  )
}

function Issues({ def, env }: { def: ExpressionDef; env: ReturnType<typeof defaultEnv> }) {
  const a = analyzeExpression(def, env)
  if (a.ok)
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5" data-expr-check="ok">
        <CheckCircle2 className="size-3.5" />
        语法与类型检查通过 · 字段 {a.fields.join('、') || '无'} · 引用 {a.refs.map((r) => `${r.assetId}@r${r.revision}`).join('、') || '无'}
      </div>
    )
  return (
    <div className="space-y-1" data-expr-check="error">
      {a.issues.map((i, k) => (
        <div key={k} className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
          <Badge tone="red" className="mr-1.5">
            {i.code}
          </Badge>
          {i.message}
          {i.pos !== undefined && (
            <span className="ml-1.5 font-mono text-[11px]">
              （位置 {i.pos + 1}：<span className="bg-red-200 px-0.5">{def.formula.slice(i.pos, i.pos + 14) || '⟂'}</span>）
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ExpressionForm({ def, set, selfId, savedRev, dirty }: { def: ExpressionDef; set: (p: Partial<ExpressionDef>) => void; selfId: string; savedRev: number; dirty: boolean }) {
  const resources = useApp((s) => s.resources)
  const [ctx, setCtx] = useState<DataContext>({ ...DEFAULT_CONTEXT })
  const [filters, setFilters] = useState<Filters>({})
  const [picker, setPicker] = useState<'variable' | 'expression' | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const env = useMemo(() => envFromRecords(resources), [resources])
  const ds = env.resource(def.datasetRef.assetId, def.datasetRef.revision)?.def as DatasetDef | undefined
  const result = useMemo(() => evaluateDef(def, { params: ctx, filters }, env, [selfId]), [def, ctx, filters, env, selfId])
  const slice = ds ? resolveSlice(ds.sourceKey, ctx, { ...ds.defaultFilters, ...filters }) : null
  const insert = (text: string) => {
    const el = ta.current
    const at = el?.selectionStart ?? def.formula.length
    const end = el?.selectionEnd ?? at
    set({ formula: def.formula.slice(0, at) + text + def.formula.slice(end) })
    setTimeout(() => {
      el?.focus()
      el?.setSelectionRange(at + text.length, at + text.length)
    }, 0)
  }
  const dsOptions = Object.values(resources)
    .filter((r) => r.kind === 'dataset')
    .flatMap((r) => r.revisions.map((rv) => ({ value: `${r.assetId}@${rv.revision}`, label: `${r.title} · ${r.assetId}@r${rv.revision}` })))
  return (
    <>
      <Card title="表达式定义">
        <div className="p-4 grid grid-cols-4 gap-3">
          <Field label="标识符 name" hint={/^[A-Za-z_][A-Za-z0-9_]*$/.test(def.name) ? '用于识别，引用内部按 ID + revision 解析' : <span className="text-red-600">只允许字母、数字、下划线，且不能以数字开头</span>}>
            <TextInput value={def.name} onChange={(e) => set({ name: e.target.value })} aria-label="表达式标识符" />
          </Field>
          <Field label="数据集（固定修订）" className="col-span-2">
            <Select value={`${def.datasetRef.assetId}@${def.datasetRef.revision}`} onChange={(v) => set({ datasetRef: { assetId: v.split('@')[0], revision: Number(v.split('@')[1]) } })} options={dsOptions} />
          </Field>
          <Field label="求值层级">
            <Segmented
              value={def.evaluationMode}
              onChange={(v) => set({ evaluationMode: v })}
              options={[
                { value: 'aggregate', label: '聚合' },
                { value: 'row', label: '行级' },
              ]}
            />
          </Field>
          <Field label="输出类型">
            <Select
              value={def.returnType}
              onChange={(v) => set({ returnType: v })}
              options={[
                { value: 'number', label: '数值' },
                { value: 'string', label: '文本' },
                { value: 'boolean', label: '布尔' },
              ]}
            />
          </Field>
          <Field label="单位（留空 = 未定义单位）">
            <TextInput value={def.unit ?? ''} onChange={(e) => set({ unit: e.target.value || null })} />
          </Field>
          <Field label="小数位">
            <NumberInput value={def.decimals ?? 0} min={0} max={6} onChange={(v) => set({ decimals: v })} />
          </Field>
          <Field label="说明">
            <TextInput value={def.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
      </Card>
      <div className="grid grid-cols-[220px_1fr] gap-3">
        <Card title="插入字段 / 引用">
          <div className="p-3 space-y-3 text-[12px]">
            <div>
              <div className="text-[11px] text-ink-3 mb-1">字段（{ds?.sourceKey}）</div>
              <div className="flex flex-wrap gap-1">
                {ds?.fields.map((f) => (
                  <button key={f.id} onClick={() => insert(f.role === 'measure' && def.evaluationMode === 'aggregate' ? `SUM(${f.id})` : f.id)} title={`${f.label} · ${f.type} · ${unitText(f.unit)}`} className={cx('h-6 px-1.5 rounded border font-mono text-[11px]', f.role === 'measure' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line')}>
                    {f.id}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-3 mb-1">函数</div>
              <div className="flex flex-wrap gap-1">
                {['SUM()', 'AVG()', 'MIN()', 'MAX()', 'COUNT()', 'IF(, , )', 'ROUND(, 1)'].map((f) => (
                  <button key={f} onClick={() => insert(f)} className="h-6 px-1.5 rounded border border-line font-mono text-[11px]">
                    {f.split('(')[0]}
                  </button>
                ))}
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={() => setPicker('variable')}>
              插入共享变量…
            </Button>
            <Button size="sm" className="w-full" onClick={() => setPicker('expression')}>
              插入共享表达式…
            </Button>
          </div>
        </Card>
        <Card title="公式">
          <div className="p-3 space-y-2">
            <textarea
              ref={ta}
              value={def.formula}
              onChange={(e) => set({ formula: e.target.value })}
              rows={3}
              spellCheck={false}
              aria-label="公式"
              className="w-full font-mono text-[13px] bg-white border border-line rounded-md px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            <Issues def={def} env={env} />
            <div className="text-[11px] text-ink-3">受限语法：字段、数值、+ − × ÷、比较、&& ||、SUM/AVG/MIN/MAX/COUNT/IF/ROUND/ABS、{'{{var:ID@r}}'}、{'{{expr:ID@r}}'}。不执行任意 JavaScript。</div>
          </div>
        </Card>
      </div>
      <Card title="值预览（当前草稿）" actions={<DataContextBar compact value={ctx} onChange={setCtx} />}>
        <div className="p-3 space-y-2">
          {ds && <FilterEditor dataSetId={ds.sourceKey} ctx={ctx} filters={filters} onChange={setFilters} />}
          <FilterBar filters={filters} onChange={setFilters} />
          <div className={cx('rounded-md border px-3 py-2.5 flex items-baseline gap-3', result.status === 'invalid' ? 'bg-red-50 border-red-200' : 'bg-brand-50/60 border-brand-100')} data-expr-preview={result.status}>
            <span className="text-[12px] text-ink-3">结果</span>
            <span className="text-2xl font-semibold tabular-nums" data-testid="expr-value">
              {formatResult(result, def.decimals)}
            </span>
            <span className="text-[12px] text-ink-3">{result.status === 'ok' ? unitText(def.unit) : ''}</span>
            <span className="flex-1" />
            <span className="text-[11.5px] text-ink-3">
              {slice?.status === 'ok' ? `参与计算 ${slice.records.length} 条记录（${ds?.sourceKey}）` : slice?.message}
            </span>
          </div>
          {slice?.status === 'ok' && <RecordsTable records={slice.records} maxHeight={170} />}
        </div>
      </Card>
      <Linkage refId={selfId} rev={savedRev} dirty={dirty} sourceKey={ds?.sourceKey} />
      <ResourcePicker
        open={!!picker}
        onClose={() => setPicker(null)}
        kinds={[picker ?? 'variable']}
        actionLabel="插入"
        onPick={(p) => {
          if (p.assetId === selfId) return toast('不能引用自身（会形成循环）', 'warn')
          insert(refToken(p.kind === 'variable' ? 'var' : 'expr', p.assetId, p.revision))
        }}
      />
    </>
  )
}

/** Same ExpressionRef consumed by a chart, a pivot table, a fixed-table cell and report text in one shared context. */
function Linkage({ refId, rev, dirty, sourceKey }: { refId: string; rev: number; dirty: boolean; sourceKey?: DataSetId }) {
  const assets = useApp((s) => s.assets)
  const resources = useApp((s) => s.resources)
  const [ctx, setCtx] = useState<DataContext>({ ...DEFAULT_CONTEXT })
  const [t1, setT1] = useState(false)
  const env = useMemo(() => envFromRecords(resources), [resources])
  if (sourceKey !== 'resourceInput')
    return (
      <Card title="四处联动预览">
        <div className="p-4 text-[12px] text-ink-3">联动示例基于 resourceInput 的预置图表/透视表/固定日报；当前表达式数据集为 {sourceKey}。</div>
      </Card>
    )
  const binding = { kind: 'expression' as const, assetId: refId, revision: rev }
  const filters: Filters = t1 ? { targetId: ['T-1'] } : {}
  const chart: ChartDef = { ...latestDef<ChartDef>(assets['DEMO-CHART-01'])!, viewParams: ctx, filters, measureBinding: binding, dimensions: ['unitId'], chartType: 'bar' }
  const table: TableDef = { ...latestDef<TableDef>(assets['DEMO-TABLE-02'])!, mode: 'pivot', viewParams: ctx, filters, measureBinding: binding }
  const f0 = latestDef<FixedDef>(assets['DEMO-FIXED-01'])!
  const fixed: FixedDef = { ...f0, viewParams: ctx, filters, cells: { ...f0.cells, [rcKey(10, 3)]: { ...f0.cells[rcKey(10, 3)], binding: `expr:${refId}@${rev}` } }, regions: f0.regions.map((g) => ({ ...g, columnBindings: { ...g.columnBindings, 3: `expr:${refId}@${rev}` } })) }
  const cm = computeChart(chart, env)
  const tm = computeTable(table, env)
  const fx = expandFixed(fixed, env)
  const fixedTotal = fx.rows.find((r) => r.srcRow === 10)?.cells[3]?.text ?? '—'
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '报告正文：本期资源投入合计 ' }, { type: 'expressionRef', attrs: { assetId: refId, revision: rev } }, { type: 'text', text: '（同一 ExpressionRef）' }] }] }
  return (
    <Card
      title={
        <>
          四处联动：同一 ExpressionRef <span className="font-mono text-[11px] text-ink-3">{refId}@r{rev}</span>
          {dirty && <Badge tone="amber">使用已保存的 r{rev}，草稿未参与</Badge>}
        </>
      }
      actions={
        <>
          <DataContextBar compact value={ctx} onChange={setCtx} />
          <Button size="sm" active={t1} onClick={() => setT1(!t1)}>
            筛选 T-1
          </Button>
        </>
      }
    >
      <div className="p-3 grid grid-cols-4 gap-3" data-linkage="">
        {[
          ['图表合计', cm.status === 'ok' ? String(cm.total) : `⚠ ${cm.message}`, 'chart'],
          ['透视表总计', tm.status === 'ok' ? String(tm.total) : `⚠ ${tm.message}`, 'table'],
          ['固定报表合计单元格 D11', fixedTotal, 'fixed'],
          ['报告正文', '', 'report'],
        ].map(([l, v, k]) => (
          <div key={k} className="rounded-md border border-line p-2.5" data-consumer={k}>
            <div className="text-[11px] text-ink-3">{l}</div>
            {k === 'report' ? (
              <div className="text-[13px] mt-1">
                <ReportCtx.Provider value={{ mode: 'template', params: ctx, preview: true, env: { ...env }, resolveSnapshot: () => null, latestRevision: () => undefined }}>
                  {t1 ? <span className="text-[11.5px] text-ink-3">（报告正文不受此筛选影响：筛选仅作用于图表/表格/固定表节点）</span> : <DocRenderer doc={doc as any} />}
                </ReportCtx.Provider>
              </div>
            ) : (
              <div className="text-xl font-semibold tabular-nums" data-value="">
                {v}
              </div>
            )}
          </div>
        ))}
        <div className="col-span-2">
          <ChartView def={chart} model={cm} height={180} />
        </div>
        <div className="col-span-1">
          <AnalysisTableView def={table} model={tm} />
        </div>
        <div className="col-span-1 overflow-hidden">
          <div style={{ zoom: 0.42 } as any}>
            <SheetTable rows={fx.rows} colWidths={fixed.colWidths} />
          </div>
        </div>
      </div>
    </Card>
  )
}

function VariableForm({ def, set, selfId }: { def: VariableDef; set: (p: Partial<VariableDef>) => void; selfId: string }) {
  const resources = useApp((s) => s.resources)
  const [ctx, setCtx] = useState<DataContext>({ ...DEFAULT_CONTEXT })
  const [picker, setPicker] = useState(false)
  const env = useMemo(() => envFromRecords(resources, { reportTitle: '（当前报告标题）' }), [resources])
  const r = evaluateVariableSnap({ assetId: selfId, kind: 'variable', revision: 0, title: def.title, def }, { params: ctx }, env)
  return (
    <>
      <Card title="变量定义">
        <div className="p-4 grid grid-cols-4 gap-3">
          <Field label="标识符 name">
            <TextInput value={def.name} onChange={(e) => set({ name: e.target.value })} aria-label="变量标识符" />
          </Field>
          <Field label="类型">
            <Select value={def.type} onChange={(v) => set({ type: v })} options={(['number', 'string', 'boolean', 'date', 'enum'] as const).map((t) => ({ value: t, label: t }))} />
          </Field>
          <Field label="作用域" hint="共享的是定义；当前值由工作区/模板/实例上下文决定">
            <Select
              value={def.scope}
              onChange={(v) => set({ scope: v })}
              options={[
                { value: 'workspace', label: '工作区' },
                { value: 'template', label: '报告模板' },
                { value: 'instance', label: '报告实例' },
              ]}
            />
          </Field>
          <Field label="默认值">
            <TextInput value={def.defaultValue === null ? '' : String(def.defaultValue)} onChange={(e) => set({ defaultValue: e.target.value === '' ? null : def.type === 'number' ? Number(e.target.value) : e.target.value })} />
          </Field>
          <Field label="值来源">
            <Select
              value={def.source.kind}
              onChange={(v) => set({ source: v === 'context' ? { kind: 'context', path: 'tick' } : v === 'expression' ? { kind: 'expression', ref: { assetId: EXPR_IDS.inputTotal, revision: 1 } } : { kind: 'constant' } })}
              options={[
                { value: 'constant', label: '常量（默认值）' },
                { value: 'context', label: '报告/页面上下文' },
                { value: 'expression', label: '共享表达式' },
              ]}
            />
          </Field>
          {def.source.kind === 'context' && (
            <Field label="上下文路径" hint="实例/模板中覆盖此变量时，会同时改变该上下文（如 Tick）">
              <Select value={def.source.path} onChange={(v) => set({ source: { kind: 'context', path: v } })} options={(['simulationId', 'branch', 'tick', 'reportTitle'] as const).map((p) => ({ value: p, label: p }))} />
            </Field>
          )}
          {def.source.kind === 'expression' && (
            <Field label="表达式引用" className="col-span-2">
              <div className="flex gap-2 items-center">
                <span className="font-mono text-[12px]">
                  {def.source.ref.assetId}@r{def.source.ref.revision}
                </span>
                <Button size="sm" onClick={() => setPicker(true)}>
                  选择…
                </Button>
              </div>
            </Field>
          )}
          {def.type === 'enum' && (
            <Field label="枚举值（逗号分隔）" className="col-span-2">
              <TextInput value={(def.enumValues ?? []).join(',')} onChange={(e) => set({ enumValues: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </Field>
          )}
          <Field label="说明" className="col-span-4">
            <TextInput value={def.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card title="当前值预览" actions={<DataContextBar compact value={ctx} onChange={setCtx} />}>
        <div className="p-4 text-[13px]" data-var-preview={r.status}>
          值：<b className="text-xl tabular-nums">{formatResult(r)}</b>
          <div className="text-[11.5px] text-ink-3 mt-1">来源解释：{def.source.kind === 'context' ? `取当前上下文的 ${def.source.path}` : def.source.kind === 'expression' ? `计算共享表达式 ${def.source.ref.assetId}@r${def.source.ref.revision}` : '固定为默认值'}；修改实例/模板中的当前值不会写回本共享定义。</div>
        </div>
      </Card>
      <ResourcePicker open={picker} onClose={() => setPicker(false)} kinds={['expression']} actionLabel="选择" onPick={(p) => set({ source: { kind: 'expression', ref: { assetId: p.assetId, revision: p.revision } } })} />
    </>
  )
}

function DatasetForm({ def, set, setDraft }: { def: DatasetDef; set: (p: Partial<DatasetDef>) => void; setDraft: (d: DatasetDef) => void }) {
  const resources = useApp((s) => s.resources)
  const [ctx, setCtx] = useState<DataContext>({ ...DEFAULT_CONTEXT })
  const slice = resolveSlice(def.sourceKey, ctx, def.defaultFilters)
  const conns = Object.values(resources).filter((r) => r.kind === 'connection')
  return (
    <>
      <Card title="数据集定义（只定义来源与结构，不复制原始记录）">
        <div className="p-4 grid grid-cols-3 gap-3">
          <Field label="来源 sourceKey">
            <Select
              value={def.sourceKey}
              onChange={(v: DataSetId) => {
                const base = datasetDefFor(v)
                setDraft({ ...base, title: def.title, connectionRef: def.connectionRef, defaultFilters: {} })
              }}
              options={DATASET_IDS.map((d) => ({ value: d, label: `${DATASETS[d].label}（${d}）` }))}
            />
          </Field>
          <Field label="数据连接">
            <Select value={`${def.connectionRef.assetId}@${def.connectionRef.revision}`} onChange={(v) => set({ connectionRef: { assetId: v.split('@')[0], revision: Number(v.split('@')[1]) } })} options={conns.flatMap((c) => c.revisions.map((r) => ({ value: `${c.assetId}@${r.revision}`, label: `${c.title} r${r.revision}` })))} />
          </Field>
          <Field label="说明">
            <TextInput value={def.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="col-span-3">
            <div className="text-[11px] font-medium text-ink-3 uppercase tracking-wide mb-1">默认筛选（数据集视图）</div>
            <FilterEditor dataSetId={def.sourceKey} ctx={ctx} filters={def.defaultFilters} onChange={(f) => set({ defaultFilters: f })} />
          </div>
          {def.warnings.map((w) => (
            <div key={w} className="col-span-3 text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              来源限制：{w}
            </div>
          ))}
        </div>
      </Card>
      <Card title={`字段（${def.fields.length}）`}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[11px] text-ink-3 bg-gray-50">
              {['字段 ID', '展示名', '类型', '角色', '单位'].map((h) => (
                <th key={h} className="text-left px-3 h-8 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {def.fields.map((f) => (
              <tr key={f.id} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-mono">{f.id}</td>
                <td className="px-3 py-1.5">{f.label}</td>
                <td className="px-3 py-1.5">{f.type}</td>
                <td className="px-3 py-1.5">{f.role === 'measure' ? '指标' : '维度'}</td>
                <td className="px-3 py-1.5">{f.role === 'measure' ? unitText(f.unit) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-line text-[11.5px] text-ink-3">可应用上下文：{def.contextKeys.join(' / ') || '无（不受运行/Tick 约束）'} · 全部记录 {getRecords(def.sourceKey).length} 条</div>
      </Card>
      <Card title="样例记录与数据范围" actions={<DataContextBar compact value={ctx} onChange={setCtx} dataSetId={def.sourceKey} />}>
        {slice.status === 'ok' ? <RecordsTable records={slice.records.slice(0, 10)} maxHeight={260} /> : <div className="p-4 text-[12px] text-ink-3">{slice.message}</div>}
        <div className="px-3 py-2 border-t border-line text-[11.5px] text-ink-3">当前范围 + 默认筛选：{slice.records.length} 条</div>
      </Card>
    </>
  )
}

function ConnectionForm({ def, set, selfId }: { def: ConnectionDef; set: (p: Partial<ConnectionDef>) => void; selfId: string }) {
  const resources = useApp((s) => s.resources)
  const datasets = Object.values(resources).filter((r) => r.kind === 'dataset' && (latestDef<DatasetDef>(r)?.connectionRef.assetId === selfId))
  return (
    <>
      <Card title="数据连接（本地 DEMO）">
        <div className="p-4 grid grid-cols-2 gap-3 text-[12.5px]">
          <Field label="类型">
            <TextInput value="demo-json · 本地 DEMO" disabled />
          </Field>
          <Field label="来源">
            <TextInput value={def.source} disabled />
          </Field>
          <Field label="说明" className="col-span-2">
            <TextInput value={def.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="col-span-2 flex items-center gap-3">
            <Button
              icon={<ShieldCheck className="size-3.5" />}
              onClick={() => {
                const summary = DATASET_IDS.map((d) => `${d}:${getRecords(d).length}`).join(' ')
                const provs = [...new Set(DATASET_IDS.flatMap((d) => getRecords(d).map((r) => r.provenance)))].join('/')
                set({ lastValidatedAt: new Date().toISOString(), lastValidation: `前端校验通过 · ${summary} · 来源 ${provs}` })
                toast('已在前端核对合成数据（无网络请求）；保存新版本后记录校验结果', 'info')
              }}
            >
              校验数据（前端，无网络请求）
            </Button>
            <span className="text-[11.5px] text-ink-3">{def.lastValidatedAt ? `${new Date(def.lastValidatedAt).toLocaleString('zh-CN')} · ${def.lastValidation}` : '尚未校验'}</span>
          </div>
          <div className="col-span-2 text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">此连接只读取项目内置的合成 JSON；不存在认证、真实数据库或在线连通性。</div>
        </div>
      </Card>
      <Card title={`包含的数据集（${datasets.length}）`}>
        <div className="divide-y divide-gray-100">
          {datasets.map((r) => (
            <div key={r.assetId} className="px-3.5 py-2 text-[12.5px] flex items-center gap-3">
              <span className="flex-1">{r.title}</span>
              <span className="font-mono text-[11px] text-ink-3">{catalogSubtitle(r)}</span>
              <Badge tone="amber">{DATASETS[latestDef<DatasetDef>(r)!.sourceKey].source}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

export { AlertOctagon, snapshotOf, datasetIdFor, defaultEnv }
