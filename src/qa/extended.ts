import type { ChartDef, ExpressionDef, FixedDef, ReportDef, TableDef, VariableDef, AssetRecord } from '../data/types'
import { createTestStore, latestDef, type AppState } from '../store/store'
import { computeChart } from '../data/chartModel'
import { computeTable } from '../data/tableModel'
import { expandFixed } from '../data/fixedModel'
import { resolveSlice } from '../data/engine'
import { evaluateExpression, evaluateDef, formatResult } from '../data/expr'
import { EXPR_IDS, datasetIdFor, envFromRecords, getGlobalResources, setGlobalResources, varIdFor, CONNECTION_ID } from '../data/registry'
import { clone, collectRefs, instanceEnv, resolveInline, summarizeNode, validateGeneration, inlineKey } from '../data/reports'
import { dependencyChain, flattenChain, docDeps, usagesOf } from '../data/deps'
import { migrateState, countState } from '../store/migrate'
import { rcKey } from '../data/grid'
import { DEFAULT_CONTEXT } from '../data/seed'
import { runAcceptance, type AResult, type Method } from './acceptance'
import fixture from './fixture-v1.json'

const ctx2 = { ...DEFAULT_CONTEXT }
const ctx1 = { ...DEFAULT_CONTEXT, tick: 1 }
const ctxB2 = { simulationId: 'DEMO-RUN-B', branch: 'main', tick: 2 }

export function runExtended(): AResult[] {
  const prev = getGlobalResources()
  try {
    return inner()
  } finally {
    setGlobalResources(prev)
  }
}

function inner(): AResult[] {
  const out: AResult[] = []
  const s = createTestStore()
  const st = (): AppState => s.getState()
  setGlobalResources(st().resources)
  s.subscribe((x) => setGlobalResources(x.resources))
  const env = () => envFromRecords(st().resources)
  const E = (id: string, title: string, criteria: string, method: Method, entry: AResult['entry'], ui: string, fn: () => { pass: boolean; detail: string; status?: AResult['status'] }) => {
    try {
      const r = fn()
      out.push({ id, title, criteria, method, entry, ui, status: r.status ?? (r.pass ? 'PASS' : 'FAIL'), ...r })
    } catch (e: any) {
      out.push({ id, title, criteria, method, entry, ui, status: 'FAIL', pass: false, detail: `异常：${e?.message ?? e}` })
    }
  }
  const uiOnly = (id: string, title: string, criteria: string, entry: AResult['entry'], ui: string) =>
    E(id, title, criteria, '页面交互', entry, ui, () => ({ pass: false, status: 'NOT_VERIFIED', detail: '页面交互用例：应用内无法自动点击，状态记为 NOT_VERIFIED；浏览器自动化结果见交付报告' }))

  const exprDef = (name: string, formula: string, ds = 'resourceInput' as any, unit: string | null = '演示量'): ExpressionDef => ({ title: name, name, datasetRef: { assetId: datasetIdFor(ds), revision: 1 }, formula, evaluationMode: 'aggregate', returnType: 'number', unit, decimals: null, description: '' })
  const chart01 = latestDef<ChartDef>(st().assets['DEMO-CHART-01'])!
  const table02 = latestDef<TableDef>(st().assets['DEMO-TABLE-02'])!
  const fixed01 = latestDef<FixedDef>(st().assets['DEMO-FIXED-01'])!
  const tpl01 = latestDef<ReportDef>(st().assets['DEMO-REPORT-TEMPLATE-01'])!

  uiOnly('E01', '1280×800 下分别收起全局导航 / 章节目录 / 右属性栏', '三个独立开关，画布宽度实际变化', { page: 'report', label: '综合报告编辑器' }, '左下“收起导航”、目录与属性栏标题右侧按钮')
  uiOnly('E02', '两侧拖宽/拖窄并刷新', '宽度与折叠偏好恢复，工具栏完整可达', { page: 'report', label: '综合报告编辑器' }, '拖动面板内侧边缘或聚焦后用方向键')
  uiOnly('E03', '章节分组折叠、上移/删除', '与整体面板状态独立，键盘可操作', { page: 'report', label: '综合报告编辑器' }, '目录中章节前的折叠按钮；Tab 聚焦后出现上移/删除')

  E('E04', '资源中心八种类型、稳定 ID、版本与使用方', '有稳定资产 ID、版本与真实引用列表', 'Store', { page: 'assets', label: '资源中心' }, '左侧“数据/分析组件/文档”分类 + 详情“使用位置”', () => {
    const kinds = new Set([...Object.values(st().resources), ...Object.values(st().assets)].map((r) => r.kind))
    const u = usagesOf(st(), datasetIdFor('resourceInput'))
    return { pass: kinds.size === 8 && u.length > 0, detail: `类型 ${[...kinds].join('/')}；数据集 resourceInput 被 ${new Set(u.map((e) => e.consumerId)).size} 个定义引用（如 ${u[0]?.consumerId} · ${u[0]?.location}）` }
  })
  E('E05', '创建 DEMO 数据连接与数据集定义', '来源、字段、单位与限制可追溯，无真实连接', 'Store', { page: 'resource', params: { assetId: CONNECTION_ID }, label: '数据连接' }, '资源编辑器 · 连接“校验数据（前端）”', () => {
    const cid = st().createResource('connection', { title: 'QA 连接', type: 'demo-json', source: 'src/data/demo.json', description: '', lastValidatedAt: null, lastValidation: null })
    const dsDef = clone(latestDef<any>(st().resources[datasetIdFor('printStressRows')]))
    dsDef.title = 'QA 排版数据视图'
    dsDef.connectionRef = { assetId: cid, revision: 1 }
    const did = st().createResource('dataset', dsDef)
    const d = latestDef<any>(st().resources[did])
    const chain = dependencyChain(st(), did, 1)
    return { pass: d.sourceKey === 'printStressRows' && d.warnings.length > 0 && chain.children[0]?.assetId === cid, detail: `${did} → ${cid}；字段 ${d.fields.length} 个；限制：${d.warnings[0]}；连接类型 demo-json（无网络）` }
  })

  // shared expression totalInput
  const totalId = st().createResource('expression', exprDef('totalInput', 'SUM(demo_amount)'))
  const tRef = { kind: 'expression' as const, assetId: totalId, revision: 1 }
  E('E07', '创建 totalInput = SUM(demo_amount)', 'RUN-A Tick2 = 30，可看语法/类型与源记录范围', '纯函数', { page: 'resource', params: { assetId: totalId }, label: '表达式编辑器' }, '资源编辑器 · 值预览', () => {
    const r = evaluateExpression(tRef, { params: ctx2 }, env())
    const recs = resolveSlice('resourceInput', ctx2, {}).records.length
    return { pass: r.status === 'ok' && r.value === 30 && recs === 4, detail: `${totalId}@r1 = ${formatResult(r, null, true)}；参与计算 ${recs} 条记录` }
  })
  E('E08', 'COUNT() 与 AVG(demo_amount)', '分别为 4、7.5；SUM 不被误当 AVG', '纯函数', { page: 'resource', params: { assetId: EXPR_IDS.inputAvg }, label: '表达式编辑器' }, '预置 DEMO-EXPR-INPUT-AVG / COUNT', () => {
    const c = evaluateExpression({ assetId: EXPR_IDS.inputCount, revision: 1 }, { params: ctx2 }, env())
    const a = evaluateExpression({ assetId: EXPR_IDS.inputAvg, revision: 1 }, { params: ctx2 }, env())
    const sm = evaluateExpression(tRef, { params: ctx2 }, env())
    return { pass: (c as any).value === 4 && (a as any).value === 7.5 && (sm as any).value === 30, detail: `COUNT=${(c as any).value}，AVG=${(a as any).value}，SUM=${(sm as any).value}` }
  })
  const chartE: ChartDef = { ...chart01, title: '投入（共享表达式）', measureBinding: tRef, datasetRef: { assetId: datasetIdFor('resourceInput'), revision: 1 } }
  const chartEId = st().createAsset('chart', chartE)
  E('E09', '图表指标选择 totalInput', '按单位 18/12，按目标 20/10', '纯函数', { page: 'chart', params: { assetId: chartEId }, label: '图表设计器' }, '指标来源 → 共享表达式', () => {
    const u = computeChart({ ...chartE, viewParams: ctx2 }, env())
    const t = computeChart({ ...chartE, viewParams: ctx2, dimensions: ['targetId'] }, env())
    return { pass: u.summary.map((x) => x.value).join() === '18,12' && t.summary.map((x) => x.value).join() === '20,10' && u.total === 30, detail: `按单位 ${u.summary.map((x) => `${x.key}=${x.value}`).join('、')}；按目标 ${t.summary.map((x) => `${x.key}=${x.value}`).join('、')}；合计 ${u.total}` }
  })
  const tableE: TableDef = { ...table02, measureBinding: tRef }
  E('E10', '分析表透视选择同一表达式', '四格 12/6/8/4，总计 30', '纯函数', { page: 'table', params: { assetId: 'DEMO-TABLE-02' }, label: '分析表设计器' }, '指标区 → 共享表达式', () => {
    const p = computeTable({ ...tableE, viewParams: ctx2 }, env()).pivot!
    const v = ['U-A|T-1', 'U-A|T-2', 'U-B|T-1', 'U-B|T-2'].map((k) => p.cells.get(k)?.value)
    const avg = computeTable({ ...tableE, viewParams: ctx2, measureBinding: { kind: 'expression', assetId: EXPR_IDS.inputAvg, revision: 1 } }, env()).pivot!
    return { pass: v.join() === '12,6,8,4' && p.grand === 30 && avg.rowTotals.get('U-A') === 9 && avg.grand === 7.5, detail: `单元格 ${v.join('/')}，总计 ${p.grand}；AVG 行合计 U-A=${avg.rowTotals.get('U-A')}（非 6+12 相加）、总计 ${avg.grand}` }
  })
  const fixedE: FixedDef = { ...fixed01, cells: { ...fixed01.cells, [rcKey(10, 3)]: { ...fixed01.cells[rcKey(10, 3)], binding: `expr:${totalId}@1` } } }
  const fixedCell = (c: any) => expandFixed({ ...fixedE, viewParams: c }, env()).rows.find((r) => r.srcRow === 10)!.cells[3]!
  E('E11', '固定报表合计单元格绑定同一表达式', '显示 30，Tick1 = 24', '纯函数', { page: 'fixed', params: { assetId: 'DEMO-FIXED-01' }, label: '固定报表设计器' }, '单元格 → 绑定类型“表达式”', () => {
    const a = fixedCell(ctx2).text
    const b = fixedCell(ctx1).text
    return { pass: a === '30' && b === '24', detail: `D11 = ${a}；Tick 1 = ${b}` }
  })
  const inlineDoc = (rev = 1) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '合计 ' }, { type: 'expressionRef', attrs: { assetId: totalId, revision: rev } }] }] })
  E('E12', '报告正文插入同一表达式引用', '行内显示 30，可查看 ID/r1', '纯函数', { page: 'report', label: '综合报告编辑器' }, '正文输入 / → 表达式', () => {
    const r = resolveInline({ type: 'expressionRef', assetId: totalId, revision: 1 }, ctx2, env())
    return { pass: formatResult(r.result) === '30' && r.snap?.assetId === totalId && r.snap.revision === 1, detail: `expressionRef ${r.snap?.assetId}@r${r.snap?.revision} = ${formatResult(r.result)}；生成校验错误 ${validateGeneration(inlineDoc() as any, ctx2, st().assets, env()).length} 个` }
  })
  E('E13', '切换共同数据上下文', '四处同步 30 → 24 → 21', '纯函数', { page: 'resource', params: { assetId: totalId }, label: '表达式“四处联动”' }, '表达式编辑器底部“四处联动”切换 Tick / 运行', () => {
    const rows = [ctx2, ctx1, ctxB2].map((c) => [computeChart({ ...chartE, viewParams: c }, env()).total, computeTable({ ...tableE, viewParams: c }, env()).total, Number(fixedCell(c).text), Number(formatResult(resolveInline({ type: 'expressionRef', assetId: totalId, revision: 1 }, c, env()).result))])
    return { pass: rows.map((r) => r.join('/')).join(' | ') === '30/30/30/30 | 24/24/24/24 | 21/21/21/21', detail: `图表/透视/固定表/正文：${rows.map((r) => r.join('/')).join(' → ')}` }
  })
  E('E14', '仅报告甲节点筛选 T-1', '甲此节点 20；报告乙与共享定义仍 30', 'Store', { page: 'report', label: '综合报告编辑器' }, '选中图表节点 → 节点筛选（合并）', () => {
    const node = (ov: any) => ({ nodeId: 'NX', type: 'chartAsset', kind: 'chart' as const, assetId: chartEId, assetRevision: 1, overrides: ov })
    const snap = { assetId: chartEId, kind: 'chart' as const, revision: 1, title: 't', def: latestDef<ChartDef>(st().assets[chartEId])! }
    const a = summarizeNode(node({ filters: { targetId: ['T-1'] }, filterMode: 'merge' }), snap, ctx2, env())
    const b = summarizeNode(node({}), snap, ctx2, env())
    const cleared = summarizeNode(node({ filters: {}, filterMode: 'replace' }), { ...snap, def: { ...snap.def, filters: { unitId: ['U-A'] } } }, ctx2, env())
    return { pass: a.total === 20 && b.total === 30 && latestDef<ChartDef>(st().assets[chartEId])!.filters && Object.keys(latestDef<ChartDef>(st().assets[chartEId])!.filters).length === 0 && cleared.total === 30, detail: `报告甲节点 ${a.total}；报告乙 ${b.total}；共享定义筛选未变；replace + 空筛选可清除资产默认筛选 → ${cleared.total}` }
  })
  E('E15', '保存表达式 r2 = SUM(demo_amount)/COUNT()', '旧引用 r1 仍 30；显式升级到 r2 后 7.5', 'Store', { page: 'resource', params: { assetId: totalId }, label: '表达式编辑器' }, '保存共享新版本 → 节点“显式升级”', () => {
    st().saveRevision(totalId, { ...latestDef<ExpressionDef>(st().resources[totalId])!, formula: 'SUM(demo_amount)/COUNT()' }, 'r2 平均')
    const r1 = computeChart({ ...chartE, viewParams: ctx2 }, env()).total
    const r2 = computeChart({ ...chartE, viewParams: ctx2, measureBinding: { ...tRef, revision: 2 } }, env()).total
    return { pass: r1 === 30 && r2 === 7.5 && st().resources[totalId].latest === 2, detail: `固定 r1 的图表 = ${r1}；升级到 r2 = ${r2}` }
  })
  // two templates referencing the same expression / chart
  const tplA = st().createAsset('report', { title: 'QA 报告甲', parameters: ctx2, doc: { type: 'doc', content: [...(inlineDoc().content as any), { type: 'chartAsset', attrs: { nodeId: 'NA', assetId: chartEId, assetRevision: 1, overrides: {} } }] } } as ReportDef)
  const tplB = st().createAsset('report', { title: 'QA 报告乙', parameters: ctx2, doc: { type: 'doc', content: [...(inlineDoc().content as any), { type: 'chartAsset', attrs: { nodeId: 'NB', assetId: chartEId, assetRevision: 1, overrides: {} } }] } } as ReportDef)
  E('E16', '另一报告引用同一图表/表达式', '引用相同资产 ID/revision，而非复制名称', 'Store', { page: 'assets', label: '资源中心 · 使用位置' }, '表达式详情“使用位置”', () => {
    const a = docDeps(latestDef<ReportDef>(st().assets[tplA])!.doc).map((d) => `${d.assetId}@${d.revision}`)
    const b = docDeps(latestDef<ReportDef>(st().assets[tplB])!.doc).map((d) => `${d.assetId}@${d.revision}`)
    const users = new Set(usagesOf(st(), totalId).map((e) => e.consumerId))
    return { pass: a.join() === b.join() && users.has(tplA) && users.has(tplB), detail: `甲 ${a.join('、')}；乙 ${b.join('、')}；${totalId} 使用方：${[...users].join('、')}` }
  })
  uiOnly('E17', '正文输入 /图表，键盘选择回车', '插入真实 chartAsset 节点，版本可查看', { page: 'report', label: '综合报告编辑器' }, '正文输入 /图表 → ↓ → Enter')
  uiOnly('E18', '关闭 /、输入普通斜杠、鼠标点击', '不丢光标、无残留、无重复插入', { page: 'report', label: '综合报告编辑器' }, '输入 / 后 Esc；输入 a/b；鼠标点击菜单项')
  E('E19', '保存模板、刷新、重新打开（Store 往返部分）', 'Tiptap JSON、节点、变量与绑定无损', '页面交互', { page: 'report', label: '综合报告编辑器' }, '保存模板 → 刷新浏览器 → 重新打开', () => {
    const d = clone(latestDef<ReportDef>(st().assets[tplA])!)
    d.doc.content!.push({ type: 'paragraph', content: [{ type: 'variable', attrs: { name: 'tick', assetId: varIdFor('tick'), revision: 1 } }] })
    st().saveRevision(tplA, d, 'QA')
    const back = latestDef<ReportDef>(st().assets[tplA])!
    const same = JSON.stringify(back.doc) === JSON.stringify(d.doc)
    return { pass: false, status: 'NOT_VERIFIED', detail: `Store 往返${same ? '无损' : '有差异'}；浏览器刷新部分需页面交互（见交付报告）` }
  })
  // instances
  const iA = st().generateInstance(tplA, st().assets[tplA].latest, ctx2)
  const iB = st().generateInstance(tplB, 1, ctx2)
  const selVar = st().createResource('variable', { title: '选定时间点', name: 'selectedTick', type: 'number', scope: 'instance', defaultValue: null, source: { kind: 'context', path: 'tick' }, description: '' } as VariableDef)
  E('E06', '创建 selectedTick 变量并改当前实例值', '当前实例重算，不影响另一报告', 'Store', { page: 'instances', label: '报告实例' }, '实例正文选中变量 → 当前值', () => {
    st().addInstanceSnapshots(iA, selVar, 1)
    st().setInstanceVariable(iA, selVar, 1)
    const a = st().instances[iA]
    const b = st().instances[iB]
    const va = formatResult(resolveInline({ type: 'expressionRef', assetId: totalId, revision: 1 }, a.selection, instanceEnv(a)).result)
    const vb = formatResult(resolveInline({ type: 'expressionRef', assetId: totalId, revision: 1 }, b.selection, instanceEnv(b)).result)
    const ca = a.resolvedData.find((r) => r.assetId === chartEId)?.total
    const def = latestDef<VariableDef>(st().resources[selVar])!
    return { pass: va === '24' && vb === '30' && ca === 24 && def.defaultValue === null, detail: `实例甲 selectedTick=1 → 正文 ${va}、图表 ${ca}；实例乙 ${vb}；共享变量定义默认值仍为 null` }
  })
  E('E20', '报告实例局部改动/新建修订', '不污染模板或别的实例', 'Store', { page: 'instances', label: '报告实例' }, '实例编辑 → 保存实例修改 / 新建修订', () => {
    const tBefore = JSON.stringify(st().assets[tplA])
    const bBefore = JSON.stringify(st().instances[iB])
    const d = clone(st().instances[iA].doc)
    d.content!.unshift({ type: 'paragraph', content: [{ type: 'text', text: '实例甲的局部修订' }] })
    st().saveInstanceDoc(iA, d)
    st().createInstanceRevision(iA, d, 'QA')
    return { pass: JSON.stringify(st().assets[tplA]) === tBefore && JSON.stringify(st().instances[iB]) === bBefore && st().instances[iA].currentRevision === 2, detail: `实例甲修订 ${st().instances[iA].currentRevision}；模板与实例乙序列化前后一致` }
  })
  E('E21', '发布实例后升级共享图表/表达式', '冻结发布内容和历史数值不改变', 'Store', { page: 'instances', label: '报告实例 · 发布历史' }, '模拟发布 → 修改共享定义 → 查看冻结内容', () => {
    const pid = st().publishInstance(iB)
    const before = JSON.stringify(st().publications.find((p) => p.publicationId === pid))
    st().saveRevision(totalId, { ...latestDef<ExpressionDef>(st().resources[totalId])!, formula: 'SUM(demo_amount) * 100' }, 'QA r3')
    st().saveRevision(chartEId, { ...latestDef<ChartDef>(st().assets[chartEId])!, dimensions: ['targetId'], measureBinding: { ...tRef, revision: 3 } }, 'QA r2')
    const p = st().publications.find((x) => x.publicationId === pid)!
    const f = p.frozenContent
    const frozen = f.frozenResults?.[inlineKey({ type: 'expressionRef', assetId: totalId, revision: 1 })]
    const fenv = instanceEnv(f as any)
    const chart = computeChart({ ...(f.assetSnapshots[`${chartEId}@1`].def as ChartDef), viewParams: f.selection }, fenv)
    return { pass: JSON.stringify(p) === before && frozen?.status === 'ok' && (frozen as any).value === 30 && chart.total === 30, detail: `${pid}：冻结正文值 ${(frozen as any)?.value}、冻结图表 ${chart.total}（共享表达式已到 r3，图表已到 r2）；发布 JSON 不变` }
  })
  E('E22', '图表经表达式间接引用数据集/变量', '可查看完整依赖链', 'Store', { page: 'assets', params: { assetId: chartEId }, label: '资源中心 · 依赖链' }, '详情“依赖链”', () => {
    const id = st().createAsset('chart', { ...chartE, variableFilters: [{ field: 'targetId', variable: { assetId: varIdFor('simulationId'), revision: 1 } }] })
    const chain = dependencyChain(st(), id, 1)
    const flat = [...flattenChain(chain).keys()]
    return { pass: flat.includes(`${totalId}@1`) && flat.includes(`${datasetIdFor('resourceInput')}@1`) && flat.includes(`${CONNECTION_ID}@1`) && flat.includes(`${varIdFor('simulationId')}@1`), detail: `依赖链：${flat.join(' → ')}` }
  })
  E('E23', '删除被旧模板修订引用的资产', '被阻止或软归档；旧模板仍能打开', 'Store', { page: 'assets', label: '资源中心' }, '详情“删除” → 改为归档', () => {
    const x = st().createResource('expression', exprDef('qaTemp', 'MAX(demo_amount)'))
    const t = st().createAsset('report', { title: 'QA 旧模板', parameters: ctx2, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'expressionRef', attrs: { assetId: x, revision: 1 } }] }] } } as ReportDef)
    st().saveRevision(t, { title: 'QA 旧模板', parameters: ctx2, doc: { type: 'doc', content: [{ type: 'paragraph' }] } } as ReportDef, '移除引用')
    const del = st().deleteAsset(x)
    st().archiveAsset(x, true)
    const oldDoc = (st().assets[t] as AssetRecord<ReportDef>).revisions[0].def.doc
    const r = resolveInline({ type: 'expressionRef', assetId: x, revision: 1 }, ctx2, env())
    return { pass: !del.ok && st().resources[x]?.status === 'archived' && formatResult(r.result) === '12' && !!oldDoc, detail: `删除结果：${del.message}；归档后旧模板 r1 的引用仍解析为 ${formatResult(r.result)}` }
  })
  E('E24', '非法公式 / 未知字段 / 除零 / 循环', '每种情况有明确错误，不显示“—”', '纯函数', { page: 'resource', params: { assetId: totalId }, label: '表达式编辑器' }, '公式输入框下方的检查结果', () => {
    const cases: [string, string][] = [['SUM(demo_amount', 'SYNTAX'], ['SUM(foo)', 'UNKNOWN_FIELD'], ['SUM(demo_amount)/0', 'DIV_ZERO']]
    const res = cases.map(([f]) => evaluateDef(exprDef('x', f), { params: ctx2 }, env()))
    const a = st().createResource('expression', exprDef('cycA', 'SUM(demo_amount)'))
    const b = st().createResource('expression', exprDef('cycB', `{{expr:${a}@1}} + 1`))
    st().saveRevision(a, exprDef('cycA', `{{expr:${b}@1}} * 2`), 'cycle')
    const cyc = evaluateExpression({ assetId: a, revision: 2 }, { params: ctx2 }, env())
    const codes = [...res.map((r) => (r as any).code), (cyc as any).code]
    return { pass: codes.join() === 'SYNTAX,UNKNOWN_FIELD,DIV_ZERO,CYCLE', detail: res.map((r) => (r as any).message).concat((cyc as any).message).join('；') }
  })
  E('E25', '给不存在字段的数据集应用筛选', '显示字段不兼容提示，不返回虚假全量', '纯函数', { page: 'states', label: '状态展台' }, '状态展台 / 图表筛选', () => {
    const sl = resolveSlice('transferProgress', ctx2, { unitId: ['U-A'] })
    const c = computeChart({ ...chartE, viewParams: ctx2, filters: { status: ['done'] } }, env())
    return { pass: sl.status === 'invalid' && sl.code === 'INVALID_FILTER_FIELD' && c.status === 'invalid', detail: `${sl.message}；图表状态 ${c.status}：${c.message}` }
  })
  E('E26', '旧 rr-workbench-v3（v1）状态升级', '旧 ID、revision、报告 JSON、实例/发布仍在', 'Store', { page: 'assets', params: { kind: 'storage' }, label: '存储与迁移' }, '“存储与迁移”迁移记录', () => {
    const raw = fixture as any
    const outS = migrateState(clone(raw.state), raw.version, 'qa')
    const b = countState(raw.state)
    const a = countState(outS)
    const docSame = JSON.stringify(raw.state.assets['DEMO-REPORT-TEMPLATE-01'].revisions) === JSON.stringify(outS.assets['DEMO-REPORT-TEMPLATE-01'].revisions)
    return { pass: JSON.stringify(a) === JSON.stringify(b) && docSame && JSON.stringify(raw.state.publications) === JSON.stringify(outS.publications), detail: `真实 v1 夹具：${b.assets} 资产（CHART-01 修订 ${b.revisions['DEMO-CHART-01']}）、实例 ${b.instances.join('/')}、发布 ${b.publications.join('/')} → 迁移后一致；新增资源 ${Object.keys(outS.resources).length} 个` }
  })
  E('E27', 'DEMO-LIVE-HEAD0 强选 Tick2', '明确无效；无伪记录、无网络请求', '纯函数', { page: 'states', label: '状态展台' }, '任意数据范围选择 HEAD0 + Tick 2', () => {
    const r = evaluateExpression(tRef, { params: { simulationId: 'DEMO-LIVE-HEAD0', branch: 'main', tick: 2 } }, env())
    const sl = resolveSlice('resourceInput', { simulationId: 'DEMO-LIVE-HEAD0', branch: 'main', tick: 2 }, {})
    return { pass: r.status === 'invalid' && (r as any).message.includes('无此数据时间点') && sl.records.length === 0, detail: `${(r as any).message}；记录 ${sl.records.length} 条` }
  })
  E('E28', '固定表预览与报告预览对照同一表达式', '同值、同单位/错误状态，来源一致', '纯函数', { page: 'resource', params: { assetId: totalId }, label: '四处联动' }, '表达式编辑器“四处联动”', () => {
    const okF = fixedCell(ctx2)
    const okR = resolveInline({ type: 'expressionRef', assetId: totalId, revision: 1 }, ctx2, env()).result
    const bad = { simulationId: 'DEMO-LIVE-HEAD0', branch: 'main', tick: 2 }
    const badF = fixedCell(bad)
    const badR = resolveInline({ type: 'expressionRef', assetId: totalId, revision: 1 }, bad, env()).result
    return { pass: okF.text === formatResult(okR) && (okR as any).unit === '演示量' && !!badF.error && badR.status === 'invalid' && badF.text === `⚠ ${(badR as any).message}`, detail: `正常：固定表 ${okF.text} / 正文 ${formatResult(okR)}（${(okR as any).unit}）；无效范围：两处均为“${(badR as any).message}”` }
  })
  E('E29', '打开旧修订、看差异、从旧版创建新修订', '不覆盖历史 rN', 'Store', { page: 'resource', params: { assetId: totalId }, label: '版本记录' }, '版本记录 → 查看 → 以此版本创建新修订', () => {
    const r1 = JSON.stringify(st().resources[totalId].revisions[0].def)
    const nr = st().saveRevision(totalId, clone(st().resources[totalId].revisions[0].def), '基于 r1 创建')
    const rec = st().resources[totalId]
    return { pass: JSON.stringify(rec.revisions[0].def) === r1 && JSON.stringify(rec.revisions.find((r) => r.revision === nr)!.def) === r1 && rec.revisions.length === nr, detail: `新修订 r${nr} 内容 = r1；r1 未被改写；版本链 ${rec.revisions.map((r) => 'r' + r.revision).join(' → ')}` }
  })
  E('E30', '查看 A39 / A40 验收', '未真实刷新/遍历时不显示 UI PASS', 'Store', { page: 'acceptance', label: '验收页' }, '本页 A39/A40 行', () => {
    const a = runAcceptance()
    const a39 = a.find((x) => x.id === 'A39')!
    const a40 = a.find((x) => x.id === 'A40')!
    return { pass: a40.status === 'NOT_VERIFIED' && a40.method === '页面交互' && a39.title.includes('不是刷新') && a39.method === 'Store', detail: `A39「${a39.title}」= ${a39.status}（${a39.method}）；A40「${a40.title}」= ${a40.status}（${a40.method}）` }
  })
  E('E31', '在报告实例中新增共享图表并保存', '新增图表及传递依赖进入实例快照；模板与其他实例不变', 'Store', { page: 'instances', label: '报告实例' }, '实例正文输入 /图表', () => {
    const tBefore = JSON.stringify(st().assets[tplB])
    const aBefore = JSON.stringify(st().instances[iA])
    const newChart = st().createAsset('chart', { ...chartE, title: 'QA 实例增补图表', measureBinding: { kind: 'expression', assetId: EXPR_IDS.inputTotal, revision: 1 } })
    st().addInstanceSnapshots(iB, newChart, 1)
    const d = clone(st().instances[iB].doc)
    d.content!.push({ type: 'chartAsset', attrs: { nodeId: 'NNEW', assetId: newChart, assetRevision: 1, overrides: {} } })
    st().saveInstanceDoc(iB, d)
    const i = st().instances[iB]
    const r = i.resolvedData.find((x) => x.nodeId === 'NNEW')
    const hasDeps = !!i.resourceSnapshots?.[`${EXPR_IDS.inputTotal}@1`] && !!i.resourceSnapshots?.[`${datasetIdFor('resourceInput')}@1`] && !!i.resourceSnapshots?.[`${CONNECTION_ID}@1`]
    return { pass: !!i.assetSnapshots[`${newChart}@1`] && hasDeps && r?.total === 30 && JSON.stringify(st().assets[tplB]) === tBefore && JSON.stringify(st().instances[iA]) === aBefore && collectRefs(i.doc).some((x) => x.assetId === newChart), detail: `实例乙快照含 ${newChart}@r1 及 ${EXPR_IDS.inputTotal}/数据集/连接；新节点值 ${r?.total}；模板乙与实例甲未变` }
  })
  return out.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
}
