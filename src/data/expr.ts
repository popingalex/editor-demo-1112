import type { DataContext, EvalResult, ExpressionDef, Filters, Rec, ResourceSnapshot, VariableDef, DatasetDef, BindingRef } from './types'
import { resolveSlice, fmt } from './engine'
import { type Env, applyVarContext } from './registry'

/* ================= tokenizer ================= */

type Tok =
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'ref'; kind: 'var' | 'expr'; id: string; rev: number; pos: number; raw: string }
  | { t: 'op'; v: string; pos: number }
  | { t: 'eof'; pos: number }

export class ExprError extends Error {
  constructor(
    public code: string,
    message: string,
    public pos?: number,
  ) {
    super(message)
  }
}

const OPS = ['>=', '<=', '==', '!=', '&&', '||', '+', '-', '*', '/', '(', ')', ',', '>', '<', '!']

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(src.slice(i))!
      out.push({ t: 'num', v: Number(m[0]), pos: i })
      i += m[0].length
      continue
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1)
      if (end < 0) throw new ExprError('SYNTAX', `第 ${i + 1} 个字符处的字符串缺少结束引号`, i)
      out.push({ t: 'str', v: src.slice(i + 1, end), pos: i })
      i = end + 1
      continue
    }
    if (src.startsWith('{{', i)) {
      const end = src.indexOf('}}', i)
      const raw = end < 0 ? src.slice(i) : src.slice(i, end + 2)
      const m = /^\{\{\s*(var|expr)\s*:\s*([A-Za-z0-9_-]+)\s*@\s*(\d+)\s*\}\}$/.exec(raw)
      if (!m) throw new ExprError('SYNTAX', `无法识别的引用标记 ${raw}（应为 {{expr:ID@修订}} 或 {{var:ID@修订}}）`, i)
      out.push({ t: 'ref', kind: m[1] as 'var' | 'expr', id: m[2], rev: Number(m[3]), pos: i, raw })
      i += raw.length
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      out.push({ t: 'id', v: m[0], pos: i })
      i += m[0].length
      continue
    }
    const op = OPS.find((o) => src.startsWith(o, i))
    if (!op) throw new ExprError('SYNTAX', `第 ${i + 1} 个字符“${c}”不是允许的符号`, i)
    out.push({ t: 'op', v: op, pos: i })
    i += op.length
  }
  out.push({ t: 'eof', pos: src.length })
  return out
}

/* ================= parser ================= */

export type Ast =
  | { k: 'num'; v: number; pos: number }
  | { k: 'str'; v: string; pos: number }
  | { k: 'bool'; v: boolean; pos: number }
  | { k: 'null'; pos: number }
  | { k: 'field'; name: string; pos: number }
  | { k: 'ref'; kind: 'var' | 'expr'; id: string; rev: number; pos: number }
  | { k: 'call'; fn: string; args: Ast[]; pos: number }
  | { k: 'bin'; op: string; l: Ast; r: Ast; pos: number }
  | { k: 'un'; op: string; e: Ast; pos: number }

export const AGG_FNS = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']
export const SCALAR_FNS = ['IF', 'ROUND', 'ABS']
const ARITY: Record<string, [number, number]> = { SUM: [1, 1], AVG: [1, 1], MIN: [1, 1], MAX: [1, 1], COUNT: [0, 1], IF: [3, 3], ROUND: [1, 2], ABS: [1, 1] }

export function parseFormula(src: string): Ast {
  if (!src.trim()) throw new ExprError('SYNTAX', '公式为空', 0)
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => {
    const t = toks[p]
    return t.t === 'op' && t.v === v
  }
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError('SYNTAX', `第 ${peek().pos + 1} 个字符处缺少“${v}”`, peek().pos)
    p++
  }
  const bin = (next: () => Ast, ops: string[]) => () => {
    let l = next()
    while (true) {
      const t = peek()
      if (t.t === 'op' && ops.includes(t.v)) {
        p++
        l = { k: 'bin', op: t.v, l, r: next(), pos: t.pos }
      } else return l
    }
  }
  const primary = (): Ast => {
    const t = peek()
    if (t.t === 'num') return p++, { k: 'num', v: t.v, pos: t.pos }
    if (t.t === 'str') return p++, { k: 'str', v: t.v, pos: t.pos }
    if (t.t === 'ref') return p++, { k: 'ref', kind: t.kind, id: t.id, rev: t.rev, pos: t.pos }
    if (t.t === 'op' && t.v === '(') {
      p++
      const e = orE()
      expect(')')
      return e
    }
    if (t.t === 'id') {
      p++
      const up = t.v.toUpperCase()
      if (isOp('(')) {
        if (!ARITY[up]) throw new ExprError('UNKNOWN_FUNCTION', `不支持的函数 ${t.v}（允许：${[...AGG_FNS, ...SCALAR_FNS].join('、')}）`, t.pos)
        p++
        const args: Ast[] = []
        if (!isOp(')')) {
          args.push(orE())
          while (isOp(',')) {
            p++
            args.push(orE())
          }
        }
        expect(')')
        const [lo, hi] = ARITY[up]
        if (args.length < lo || args.length > hi) throw new ExprError('SYNTAX', `${up} 需要 ${lo === hi ? lo : `${lo}–${hi}`} 个参数，实际 ${args.length} 个`, t.pos)
        return { k: 'call', fn: up, args, pos: t.pos }
      }
      if (up === 'TRUE' || up === 'FALSE') return { k: 'bool', v: up === 'TRUE', pos: t.pos }
      if (up === 'NULL') return { k: 'null', pos: t.pos }
      return { k: 'field', name: t.v, pos: t.pos }
    }
    if (t.t === 'eof') throw new ExprError('SYNTAX', '公式意外结束', t.pos)
    throw new ExprError('SYNTAX', `第 ${t.pos + 1} 个字符处出现意外的“${(t as any).v}”`, t.pos)
  }
  const unary = (): Ast => {
    const t = peek()
    if (t.t === 'op' && (t.v === '-' || t.v === '!')) {
      p++
      return { k: 'un', op: t.v, e: unary(), pos: t.pos }
    }
    return primary()
  }
  const mul = bin(unary, ['*', '/'])
  const add = bin(mul, ['+', '-'])
  const cmp = bin(add, ['>', '<', '>=', '<=', '==', '!='])
  const andE = bin(cmp, ['&&'])
  const orE = bin(andE, ['||'])
  const ast = orE()
  if (peek().t !== 'eof') throw new ExprError('SYNTAX', `第 ${peek().pos + 1} 个字符处有多余内容`, peek().pos)
  return ast
}

/* ================= static analysis ================= */

export interface Issue {
  code: string
  message: string
  pos?: number
}
export interface Analysis {
  ok: boolean
  issues: Issue[]
  fields: string[]
  refs: { kind: 'var' | 'expr'; assetId: string; revision: number }[]
  ast?: Ast
}

const datasetOf = (def: ExpressionDef, env: Env): DatasetDef | null => {
  const s = env.resource(def.datasetRef.assetId, def.datasetRef.revision)
  return s?.kind === 'dataset' ? (s.def as DatasetDef) : null
}

export function analyzeExpression(def: ExpressionDef, env: Env, stack: string[] = []): Analysis {
  const issues: Issue[] = []
  const fields = new Set<string>()
  const refs: Analysis['refs'] = []
  const ds = datasetOf(def, env)
  if (!ds) issues.push({ code: 'UNKNOWN_REF', message: `数据集 ${def.datasetRef.assetId} r${def.datasetRef.revision} 不存在` })
  let ast: Ast | undefined
  try {
    ast = parseFormula(def.formula)
  } catch (e) {
    const er = e as ExprError
    return { ok: false, issues: [...issues, { code: er.code ?? 'SYNTAX', message: er.message, pos: er.pos }], fields: [], refs: [] }
  }
  const walk = (n: Ast, inAgg: boolean) => {
    switch (n.k) {
      case 'field': {
        fields.add(n.name)
        const f = ds?.fields.find((x) => x.id === n.name)
        if (ds && !f) issues.push({ code: 'UNKNOWN_FIELD', message: `未知字段 ${n.name}（数据集 ${ds.sourceKey} 可用：${ds.fields.map((x) => x.id).join('、')}）`, pos: n.pos })
        if (def.evaluationMode === 'aggregate' && !inAgg) issues.push({ code: 'LEVEL_MIX', message: `聚合模式下字段 ${n.name} 必须放在 SUM/AVG/MIN/MAX/COUNT 中`, pos: n.pos })
        return
      }
      case 'call': {
        if (AGG_FNS.includes(n.fn)) {
          if (def.evaluationMode === 'row') issues.push({ code: 'LEVEL_MIX', message: `行级表达式不能使用聚合函数 ${n.fn}`, pos: n.pos })
          if (inAgg) issues.push({ code: 'LEVEL_MIX', message: `聚合函数 ${n.fn} 不能嵌套在另一个聚合函数中`, pos: n.pos })
          const a = n.args[0]
          if (a && n.fn !== 'COUNT' && a.k === 'field' && ds) {
            const f = ds.fields.find((x) => x.id === a.name)
            if (f && f.type !== 'number') issues.push({ code: 'TYPE_MISMATCH', message: `${n.fn}(${a.name}) 需要数值字段，${a.name} 为 ${f.type}`, pos: a.pos })
          }
          if (a && (a.k === 'str' || a.k === 'bool')) issues.push({ code: 'TYPE_MISMATCH', message: `${n.fn} 的参数必须是字段或数值表达式`, pos: a.pos })
          n.args.forEach((x) => walk(x, true))
        } else n.args.forEach((x) => walk(x, inAgg))
        return
      }
      case 'ref': {
        refs.push({ kind: n.kind, assetId: n.id, revision: n.rev })
        const s = env.resource(n.id, n.rev)
        if (!s) {
          issues.push({ code: env.latest(n.id) !== undefined ? 'MISSING_REVISION' : 'UNKNOWN_REF', message: env.latest(n.id) !== undefined ? `引用 ${n.id} 的修订 r${n.rev} 不存在` : `未知引用 ${n.id}`, pos: n.pos })
          return
        }
        if (s.kind !== (n.kind === 'var' ? 'variable' : 'expression')) {
          issues.push({ code: 'TYPE_MISMATCH', message: `${n.id} 是 ${s.kind}，不能作为 ${n.kind} 引用`, pos: n.pos })
          return
        }
        const target = n.kind === 'expr' ? (s.def as ExpressionDef) : null
        const chainId = n.kind === 'expr' ? n.id : (s.def as VariableDef).source.kind === 'expression' ? ((s.def as VariableDef).source as any).ref.assetId : null
        if (chainId && stack.includes(chainId)) {
          issues.push({ code: 'CYCLE', message: `表达式循环引用：${[...stack, chainId].join(' → ')}`, pos: n.pos })
          return
        }
        let sub: ExpressionDef | null = target
        if (n.kind === 'var' && (s.def as VariableDef).source.kind === 'expression') {
          const r = ((s.def as VariableDef).source as any).ref
          sub = (env.resource(r.assetId, r.revision)?.def as ExpressionDef) ?? null
        }
        if (sub && chainId) {
          const a = analyzeExpression(sub, env, [...stack, chainId])
          for (const i of a.issues) if (i.code === 'CYCLE') issues.push({ ...i, pos: n.pos })
          if (a.issues.some((i) => i.code !== 'CYCLE')) issues.push({ code: 'DEPENDENCY_ERROR', message: `引用的 ${chainId} 自身有错误：${a.issues[0].message}`, pos: n.pos })
        }
        return
      }
      case 'bin':
        walk(n.l, inAgg)
        walk(n.r, inAgg)
        return
      case 'un':
        walk(n.e, inAgg)
        return
    }
  }
  walk(ast, false)
  return { ok: issues.length === 0, issues, fields: [...fields], refs, ast }
}

/* ================= evaluation ================= */

export interface EvalCtx {
  params: DataContext
  filters?: Filters
  /** explicit record set (cell / group granularity); must belong to the expression's dataset */
  records?: Rec[]
  recordsSource?: string
  row?: Rec
}

type Val = number | string | boolean | null

function evalAst(n: Ast, scope: { rows: Rec[] | null; row: Rec | null }, refVal: (n: Extract<Ast, { k: 'ref' }>, row: Rec | null) => Val): Val {
  switch (n.k) {
    case 'num':
    case 'str':
    case 'bool':
      return n.v
    case 'null':
      return null
    case 'field':
      if (!scope.row) throw new ExprError('LEVEL_MIX', `字段 ${n.name} 只能在行级上下文或聚合函数内使用`, n.pos)
      return scope.row[n.name] ?? null
    case 'ref':
      return refVal(n, scope.row)
    case 'un': {
      const v = evalAst(n.e, scope, refVal)
      if (n.op === '!') return !v
      if (v === null) return null
      if (typeof v !== 'number') throw new ExprError('TYPE_MISMATCH', '负号只能用于数值', n.pos)
      return -v
    }
    case 'bin': {
      const l = evalAst(n.l, scope, refVal)
      if (n.op === '&&') return !!l && !!evalAst(n.r, scope, refVal)
      if (n.op === '||') return !!l || !!evalAst(n.r, scope, refVal)
      const r = evalAst(n.r, scope, refVal)
      if (n.op === '==') return l === r
      if (n.op === '!=') return l !== r
      if (l === null || r === null) return null
      if (typeof l !== 'number' || typeof r !== 'number') throw new ExprError('TYPE_MISMATCH', `运算 ${n.op} 需要数值，得到 ${typeof l} 与 ${typeof r}`, n.pos)
      switch (n.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          if (r === 0) throw new ExprError('DIV_ZERO', '除数为 0', n.pos)
          return l / r
        case '>':
          return l > r
        case '<':
          return l < r
        case '>=':
          return l >= r
        case '<=':
          return l <= r
      }
      throw new ExprError('SYNTAX', `未知运算 ${n.op}`, n.pos)
    }
    case 'call': {
      if (AGG_FNS.includes(n.fn)) {
        const rows = scope.rows
        if (!rows) throw new ExprError('LEVEL_MIX', `聚合函数 ${n.fn} 不能在行级表达式中使用`, n.pos)
        if (n.fn === 'COUNT' && n.args.length === 0) return rows.length
        const vals = rows.map((row) => evalAst(n.args[0], { rows: null, row }, refVal))
        if (n.fn === 'COUNT') return vals.filter((v) => v !== null && v !== undefined).length
        const nums = vals.filter((v): v is number => typeof v === 'number')
        if (vals.some((v) => v !== null && typeof v !== 'number')) throw new ExprError('TYPE_MISMATCH', `${n.fn} 只能作用于数值`, n.pos)
        if (!nums.length) return null
        if (n.fn === 'SUM') return nums.reduce((a, b) => a + b, 0)
        if (n.fn === 'AVG') return nums.reduce((a, b) => a + b, 0) / nums.length
        if (n.fn === 'MIN') return Math.min(...nums)
        return Math.max(...nums)
      }
      if (n.fn === 'IF') return evalAst(n.args[0], scope, refVal) ? evalAst(n.args[1], scope, refVal) : evalAst(n.args[2], scope, refVal)
      const v = evalAst(n.args[0], scope, refVal)
      if (v === null) return null
      if (typeof v !== 'number') throw new ExprError('TYPE_MISMATCH', `${n.fn} 需要数值`, n.pos)
      if (n.fn === 'ABS') return Math.abs(v)
      const d = n.args[1] ? Number(evalAst(n.args[1], scope, refVal)) : 0
      const f = 10 ** d
      return Math.round(v * f) / f
    }
  }
}

const clean = (v: Val): Val => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v)

export function evaluateExpression(ref: { assetId: string; revision: number }, ctx: EvalCtx, env: Env, stack: string[] = []): EvalResult {
  const s = env.resource(ref.assetId, ref.revision)
  if (!s) return { status: 'invalid', code: env.latest(ref.assetId) !== undefined ? 'MISSING_REVISION' : 'UNKNOWN_REF', message: env.latest(ref.assetId) !== undefined ? `表达式 ${ref.assetId} 的修订 r${ref.revision} 不存在` : `未知表达式 ${ref.assetId}` }
  if (s.kind !== 'expression') return { status: 'invalid', code: 'TYPE_MISMATCH', message: `${ref.assetId} 不是表达式` }
  return evaluateDef(s.def as ExpressionDef, ctx, env, [...stack, ref.assetId], ref.assetId)
}

export function evaluateDef(def: ExpressionDef, ctx: EvalCtx, env: Env, stack: string[] = [], selfId?: string): EvalResult {
  const a = analyzeExpression(def, env, stack.length ? stack : selfId ? [selfId] : [])
  if (!a.ok) {
    const i = a.issues[0]
    return { status: 'invalid', code: i.code, message: i.message, expression: def.formula }
  }
  const ds = datasetOf(def, env)!
  const params = applyVarContext(ctx.params, env)
  let rows: Rec[] | null = null
  let row: Rec | null = ctx.row ?? null
  if (def.evaluationMode === 'aggregate') {
    if (ctx.records && (!ctx.recordsSource || ctx.recordsSource === ds.sourceKey)) rows = ctx.records
    else {
      const filters = { ...ds.defaultFilters, ...(ctx.filters ?? {}) }
      const slice = resolveSlice(ds.sourceKey, params, filters, 'snapshot', env.data)
      if (slice.status === 'invalid') return { status: 'invalid', code: slice.code ?? 'INVALID_CONTEXT', message: slice.message ?? '数据范围无效' }
      rows = slice.records
    }
    if (!rows.length) return { status: 'empty', message: '当前条件下无数据（参与计算 0 条记录）' }
    row = null
  } else if (!row) {
    return { status: 'invalid', code: 'LEVEL_MIX', message: '行级表达式需要在明细行（单条记录）上求值，不能用于合计' }
  }
  const refVal = (n: Extract<Ast, { k: 'ref' }>, curRow: Rec | null): Val => {
    let r: EvalResult
    if (n.kind === 'expr') {
      const sub = env.resource(n.id, n.rev)?.def as ExpressionDef
      const subDs = datasetOf(sub, env)
      const same = subDs?.sourceKey === ds.sourceKey
      // Same dataset → inherit the current record set (cell granularity); other dataset → own slice,
      // keeping only filters that apply to that dataset.
      const subFilters = Object.fromEntries(Object.entries(ctx.filters ?? {}).filter(([f]) => subDs?.fields.some((x) => x.id === f)))
      r = evaluateExpression({ assetId: n.id, revision: n.rev }, { params, filters: subFilters, records: same && rows ? rows : undefined, recordsSource: subDs?.sourceKey, row: same ? (curRow ?? undefined) : undefined }, env, [...stack])
    } else r = evaluateVariable({ assetId: n.id, revision: n.rev }, { params, filters: ctx.filters }, env, stack)
    if (r.status === 'invalid') throw new ExprError(r.code, `${n.id}：${r.message}`, n.pos)
    if (r.status === 'empty') return null
    return r.value
  }
  try {
    const v = clean(evalAst(a.ast!, { rows, row }, refVal))
    return { status: 'ok', value: v, unit: def.unit }
  } catch (e) {
    const er = e as ExprError
    return { status: 'invalid', code: er.code ?? 'EVAL_ERROR', message: er.message, expression: def.formula }
  }
}

export function evaluateVariable(ref: { assetId: string; revision: number }, ctx: EvalCtx, env: Env, stack: string[] = []): EvalResult {
  const s = env.resource(ref.assetId, ref.revision)
  if (!s) return { status: 'invalid', code: env.latest(ref.assetId) !== undefined ? 'MISSING_REVISION' : 'UNKNOWN_REF', message: `未知变量 ${ref.assetId} r${ref.revision}` }
  return evaluateVariableSnap(s, ctx, env, stack)
}

export function evaluateVariableSnap(s: ResourceSnapshot, ctx: EvalCtx, env: Env, stack: string[] = []): EvalResult {
  const def = s.def as VariableDef
  const ov = env.varValues[s.assetId]
  if (ov !== undefined && ov !== null && ov !== '') return { status: 'ok', value: def.type === 'number' ? Number(ov) : ov }
  const params = applyVarContext(ctx.params, env)
  switch (def.source.kind) {
    case 'constant':
      return { status: 'ok', value: def.defaultValue }
    case 'context': {
      const p = def.source.path
      const v = p === 'reportTitle' ? (env.reportTitle ?? def.defaultValue) : (params[p] ?? def.defaultValue)
      return v === null || v === undefined ? { status: 'empty', message: `上下文中没有 ${p}` } : { status: 'ok', value: v }
    }
    case 'expression': {
      const r = def.source.ref
      if (stack.includes(r.assetId)) return { status: 'invalid', code: 'CYCLE', message: `变量与表达式循环：${[...stack, r.assetId].join(' → ')}` }
      return evaluateExpression(r, { params, filters: ctx.filters }, env, stack)
    }
  }
}

export function evaluateBinding(b: BindingRef, ctx: EvalCtx, env: Env): EvalResult {
  if (b.kind === 'expression') return evaluateExpression(b, ctx, env)
  if (b.kind === 'variable') return evaluateVariable(b, ctx, env)
  const recs = ctx.records ?? []
  if (ctx.row) return { status: 'ok', value: ctx.row[b.fieldId] ?? null }
  return recs.length ? { status: 'ok', value: recs[0][b.fieldId] ?? null } : { status: 'empty', message: '无记录' }
}

export function formatResult(r: EvalResult, decimals?: number | null, withUnit = false): string {
  if (r.status === 'invalid') return `⚠ ${r.message}`
  if (r.status === 'empty') return '无数据'
  const v = r.value
  if (v === null) return '无数据（null）'
  if (typeof v === 'number') {
    const s = decimals !== null && decimals !== undefined ? String(Math.round(v * 10 ** decimals) / 10 ** decimals) : fmt(v)
    return withUnit && r.unit ? `${s} ${r.unit}` : s
  }
  return String(v)
}

export const resultNumber = (r: EvalResult): number | null => (r.status === 'ok' && typeof r.value === 'number' ? r.value : null)

export const refToken = (kind: 'var' | 'expr', id: string, rev: number) => `{{${kind}:${id}@${rev}}}`
