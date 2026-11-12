import raw from "./demo.json";
import type {
  Aggregation,
  DataContext,
  DataSetId,
  Filters,
  LabelMode,
  Rec,
  SortMode,
} from "./types";

export const DEMO = raw as any;

/* ---------- metadata ---------- */

export interface DataSetMeta {
  id: DataSetId;
  label: string;
  source: string;
  unit: string | null;
  dims: string[];
  measures: string[];
  contextKeys: ("simulationId" | "branch" | "tick")[];
  notForResourceAggregation?: boolean;
  note?: string;
}

const catalog: Record<string, any> = Object.fromEntries(
  DEMO.dataCatalog.map((c: any) => [c.id, c]),
);

export const DATASETS: Record<DataSetId, DataSetMeta> = {
  resourceInput: {
    id: "resourceInput",
    label: catalog.resourceInput.label,
    source: catalog.resourceInput.source,
    unit: catalog.resourceInput.unit,
    dims: ["simulationId", "branch", "tick", "unitId", "targetId"],
    measures: ["demo_amount"],
    contextKeys: ["simulationId", "branch", "tick"],
  },
  resourceSplit: {
    id: "resourceSplit",
    label: catalog.resourceSplit.label,
    source: catalog.resourceSplit.source,
    unit: catalog.resourceSplit.unit,
    dims: ["simulationId", "branch", "tick", "unitId", "targetId", "resourceCategory"],
    measures: ["demo_amount"],
    contextKeys: ["simulationId", "branch", "tick"],
    note: "由 resourceInput 确定性拆分，合计可还原；不可与 resourceInput 相加",
  },
  transferProgress: {
    id: "transferProgress",
    label: catalog.transferProgress.label,
    source: catalog.transferProgress.source,
    unit: catalog.transferProgress.unit,
    dims: ["simulationId", "branch", "tick", "targetId"],
    measures: ["transferredCount", "targetCount"],
    contextKeys: ["simulationId", "branch", "tick"],
    note: "累计值：同一时间点可跨目标相加，不可跨时间点相加",
  },
  dualMetric: {
    id: "dualMetric",
    label: catalog.dualMetric.label,
    source: catalog.dualMetric.source,
    unit: null,
    dims: ["simulationId", "branch", "tick"],
    measures: ["demo_amount", "completionPercent", "transferredCount", "targetCount"],
    contextKeys: ["simulationId", "branch", "tick"],
    note: catalog.dualMetric.notes,
  },
  taskSchedule: {
    id: "taskSchedule",
    label: catalog.taskSchedule.label,
    source: catalog.taskSchedule.source,
    unit: catalog.taskSchedule.unit,
    dims: ["simulationId", "taskId", "title", "unitId", "targetId", "status"],
    measures: ["progressPercent", "startMinute", "endMinute"],
    contextKeys: ["simulationId"],
  },
  componentSeries: {
    id: "componentSeries",
    label: catalog.componentSeries.label,
    source: catalog.componentSeries.source,
    unit: null,
    dims: ["simulationId", "branch", "tick", "entityId", "fieldId"],
    measures: ["value"],
    contextKeys: ["simulationId", "branch", "tick"],
  },
  printStressRows: {
    id: "printStressRows",
    label: catalog.printStressRows.label,
    source: catalog.printStressRows.source,
    unit: catalog.printStressRows.unit,
    dims: ["sequence", "itemName", "unitId", "targetId", "note"],
    measures: ["quantity"],
    contextKeys: [],
    notForResourceAggregation: true,
    note: "仅用于排版与分页演示，不进入投入统计",
  },
};
export const DATASET_IDS = Object.keys(DATASETS) as DataSetId[];

export const FIELD_LABELS: Record<string, string> = {
  simulationId: "演示运行",
  branch: "分支",
  tick: "时间点",
  unitId: "单位",
  targetId: "目标",
  resourceCategory: "资源类别",
  demo_amount: "投入量",
  transferredCount: "累计转移人数",
  targetCount: "目标人数",
  completionPercent: "完成率",
  taskId: "任务编号",
  title: "任务名称",
  status: "状态",
  progressPercent: "进度",
  startMinute: "开始分钟",
  endMinute: "结束分钟",
  entityId: "实体",
  fieldId: "属性字段",
  value: "值",
  itemName: "项目",
  note: "备注",
  quantity: "数量",
  sequence: "序号",
  recordId: "记录 ID",
  sourceRecordId: "源记录",
  provenance: "来源标识",
};
export const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;

const MEASURE_UNITS: Record<string, string | null> = {
  demo_amount: "演示量",
  transferredCount: "人（合成示例）",
  targetCount: "人（合成示例）",
  completionPercent: "%",
  progressPercent: "%",
  startMinute: "分钟",
  endMinute: "分钟",
  quantity: "演示量",
};

/** Unit of a measure. componentSeries values take the unit of the selected field (null → 未定义单位). */
export function unitOf(ds: DataSetId, measure: string, filters?: Filters): string | null {
  if (ds === "componentSeries") {
    const fid = filters?.fieldId?.length === 1 ? filters.fieldId[0] : null;
    const f = DEMO.fields.find((x: any) => x.id === fid);
    return f ? f.unit : null;
  }
  return measure in MEASURE_UNITS ? MEASURE_UNITS[measure] : DATASETS[ds].unit;
}
export const unitText = (u: string | null) => (u == null ? "未定义单位" : u);

const dimLookup: Record<string, Record<string, string>> = {
  unitId: Object.fromEntries(DEMO.dimensions.units.map((u: any) => [u.id, u.displayName])),
  targetId: Object.fromEntries(DEMO.dimensions.targets.map((u: any) => [u.id, u.displayName])),
  resourceCategory: Object.fromEntries(
    DEMO.dimensions.resourceCategories.map((u: any) => [u.id, u.displayName]),
  ),
  status: Object.fromEntries(DEMO.dimensions.taskStatuses.map((u: any) => [u.id, u.displayName])),
  fieldId: Object.fromEntries(DEMO.fields.map((u: any) => [u.id, u.displayName])),
  simulationId: Object.fromEntries(DEMO.runs.map((u: any) => [u.simulationId, u.label])),
};

export const NULL_KEY = "∅";

export function displayValue(field: string, value: any, mode: LabelMode = "id"): string {
  if (value === null || value === undefined || value === NULL_KEY) return "（空值）";
  if (field === "tick") return `Tick ${value}`;
  if (field === "resourceCategory" || field === "status") {
    const n = dimLookup[field]?.[String(value)];
    return n ? n.replace("（演示）", "") : String(value);
  }
  const name = dimLookup[field]?.[String(value)];
  if (!name || mode === "id") return String(value);
  if (mode === "name") return name;
  return `${value} ${name.replace("（演示）", "")}`;
}

/* ---------- records ---------- */

const ID_PREFIX: Record<DataSetId, string> = {
  resourceInput: "R",
  resourceSplit: "RS",
  transferProgress: "TP",
  dualMetric: "DM",
  taskSchedule: "TK",
  componentSeries: "CS",
  printStressRows: "PRINT",
};
const recordCache: Partial<Record<DataSetId, Rec[]>> = {};
export function getRecords(ds: DataSetId): Rec[] {
  if (!recordCache[ds]) {
    recordCache[ds] = (DEMO.datasets[ds] as any[]).map((r, i) => ({
      ...r,
      recordId:
        r.recordId ?? r.taskId ?? r.rowId ?? `${ID_PREFIX[ds]}-${String(i + 1).padStart(3, "0")}`,
      provenance: r.provenance ?? catalog[ds]?.source,
    }));
  }
  return recordCache[ds]!;
}

export const RUNS: {
  simulationId: string;
  label: string;
  branchNames: string[];
  headByBranch: Record<string, number>;
}[] = DEMO.runs;

export function ticksFor(simulationId: string, branch: string): number[] {
  const run = RUNS.find((r) => r.simulationId === simulationId);
  if (!run) return [];
  const head = run.headByBranch[branch] ?? 0;
  return Array.from({ length: head + 1 }, (_, i) => i);
}

export type SliceStatus = "ok" | "empty" | "invalid";
export interface ContextCheck {
  ok: boolean;
  code?: "missingParam" | "invalidRun" | "invalidTick";
  message?: string;
}

export function validateContext(ds: DataSetId, ctx: DataContext): ContextCheck {
  const keys = DATASETS[ds].contextKeys;
  if (keys.length === 0) return { ok: true };
  if (!ctx.simulationId)
    return { ok: false, code: "missingParam", message: "必填参数“演示运行”未选择" };
  const run = RUNS.find((r) => r.simulationId === ctx.simulationId);
  if (!run)
    return { ok: false, code: "invalidRun", message: `演示运行 ${ctx.simulationId} 不存在` };
  if (keys.includes("branch") && !run.branchNames.includes(ctx.branch))
    return { ok: false, code: "invalidRun", message: `${ctx.simulationId} 无分支 ${ctx.branch}` };
  if (keys.includes("tick")) {
    if (ctx.tick === null || ctx.tick === undefined)
      return { ok: false, code: "missingParam", message: "必填参数“时间点 Tick”未选择" };
    const head = run.headByBranch[ctx.branch] ?? 0;
    if (ctx.tick > head)
      return {
        ok: false,
        code: "invalidTick",
        message: `无此数据时间点：${ctx.simulationId} / ${ctx.branch} 仅有 Tick 0–${head}，不存在 Tick ${ctx.tick}`,
      };
  }
  return { ok: true };
}

/** series mode keeps ticks ≤ ctx.tick (trend); snapshot keeps tick === ctx.tick. */
export function contextRecords(
  ds: DataSetId,
  ctx: DataContext,
  timeMode: "snapshot" | "series" = "snapshot",
): Rec[] {
  const keys = DATASETS[ds].contextKeys;
  return getRecords(ds).filter((r) => {
    if (keys.includes("simulationId") && r.simulationId !== ctx.simulationId) return false;
    if (keys.includes("branch") && r.branch !== ctx.branch) return false;
    if (keys.includes("tick") && ctx.tick !== null) {
      if (timeMode === "snapshot" && r.tick !== ctx.tick) return false;
      if (timeMode === "series" && r.tick > ctx.tick) return false;
    }
    return true;
  });
}

export const keyOf = (v: any) => (v === null || v === undefined ? NULL_KEY : String(v));

export function applyFilters(records: Rec[], filters: Filters | undefined): Rec[] {
  if (!filters) return records;
  const active = Object.entries(filters).filter(([, v]) => v && v.length > 0);
  if (!active.length) return records;
  return records.filter((r) =>
    active.every(([f, vals]) => (f in r ? vals.includes(keyOf(r[f])) : true)),
  );
}

/** Filters that reference fields the dataset does not have (reported, not silently applied). */
export function inapplicableFilters(ds: DataSetId, filters: Filters | undefined): string[] {
  if (!filters) return [];
  const sample = getRecords(ds)[0] ?? {};
  return Object.entries(filters)
    .filter(([f, v]) => v?.length && !(f in sample))
    .map(([f]) => f);
}

export interface Slice {
  status: SliceStatus;
  message?: string;
  records: Rec[];
  contextCount: number;
}

export function resolveSlice(
  ds: DataSetId,
  ctx: DataContext,
  filters: Filters | undefined,
  timeMode: "snapshot" | "series" = "snapshot",
): Slice {
  const check = validateContext(ds, ctx);
  if (!check.ok) return { status: "invalid", message: check.message, records: [], contextCount: 0 };
  const base = contextRecords(ds, ctx, timeMode);
  const records = applyFilters(base, filters);
  if (!records.length) {
    let message = "当前条件下无数据";
    if (!base.length && ds === "resourceInput" && ctx.tick === 0)
      message = "当前条件下无数据：原始数据没有 Tick 0 投入记录";
    else if (base.length && !records.length) message = "当前筛选条件下无匹配数据";
    return { status: "empty", message, records, contextCount: base.length };
  }
  return { status: "ok", records, contextCount: base.length };
}

/* ---------- aggregation ---------- */

export interface Group {
  key: string[];
  keyObj: Record<string, string>;
  value: number | null;
  count: number;
  records: Rec[];
}

export function measureValue(records: Rec[], measure: string, agg: Aggregation): number | null {
  if (agg === "count") return records.length;
  const nums = records.map((r) => r[measure]).filter((v) => typeof v === "number") as number[];
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return Math.round(s * 1000) / 1000;
}

export function aggregate(
  records: Rec[],
  groupBy: string[],
  measure: string,
  agg: Aggregation,
): Group[] {
  const map = new Map<string, Group>();
  for (const r of records) {
    const key = groupBy.map((g) => keyOf(r[g]));
    const k = key.join("\u0001");
    let g = map.get(k);
    if (!g) {
      g = {
        key,
        keyObj: Object.fromEntries(groupBy.map((d, i) => [d, key[i]])),
        value: null,
        count: 0,
        records: [],
      };
      map.set(k, g);
    }
    g.records.push(r);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.count = g.records.length;
    g.value =
      agg === "none"
        ? measureValue(g.records, measure, "sum")
        : measureValue(g.records, measure, agg);
  }
  return sortGroups(groups, "keyAsc");
}

export function compareKeys(a: string, b: string) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, "zh-CN");
}

export function sortGroups(groups: Group[], sort: SortMode): Group[] {
  const out = [...groups];
  const keyCmp = (a: Group, b: Group) => {
    for (let i = 0; i < a.key.length; i++) {
      const c = compareKeys(a.key[i], b.key[i]);
      if (c) return c;
    }
    return 0;
  };
  const val = (g: Group) => g.value ?? -Infinity;
  switch (sort) {
    case "keyDesc":
      return out.sort((a, b) => -keyCmp(a, b));
    case "valueAsc":
      return out.sort((a, b) => val(a) - val(b) || keyCmp(a, b));
    case "valueDesc":
      return out.sort((a, b) => val(b) - val(a) || keyCmp(a, b));
    default:
      return out.sort(keyCmp);
  }
}

export interface PivotResult {
  rowKeys: string[][];
  colKeys: string[][];
  cells: Map<string, Group>;
  rowTotals: Map<string, number | null>;
  colTotals: Map<string, number | null>;
  rowRecords: Map<string, Rec[]>;
  colRecords: Map<string, Rec[]>;
  grand: number | null;
  records: Rec[];
}
export const kj = (k: string[]) => k.join("\u0001");

export function pivot(
  records: Rec[],
  rowDims: string[],
  colDims: string[],
  measure: string,
  agg: "sum" | "count",
  sort: SortMode = "keyAsc",
): PivotResult {
  const cellGroups = aggregate(records, [...rowDims, ...colDims], measure, agg);
  const cells = new Map<string, Group>();
  for (const g of cellGroups) {
    const rk = g.key.slice(0, rowDims.length);
    const ck = g.key.slice(rowDims.length);
    cells.set(kj(rk) + "|" + kj(ck), g);
  }
  const rowGroups = sortGroups(aggregate(records, rowDims, measure, agg), sort);
  const colGroups = sortGroups(aggregate(records, colDims, measure, agg), "keyAsc");
  return {
    rowKeys: rowGroups.map((g) => g.key),
    colKeys: colGroups.map((g) => g.key),
    cells,
    rowTotals: new Map(rowGroups.map((g) => [kj(g.key), g.value])),
    colTotals: new Map(colGroups.map((g) => [kj(g.key), g.value])),
    rowRecords: new Map(rowGroups.map((g) => [kj(g.key), g.records])),
    colRecords: new Map(colGroups.map((g) => [kj(g.key), g.records])),
    grand: measureValue(records, measure, agg),
    records,
  };
}

export function distinctValues(ds: DataSetId, field: string, ctx?: DataContext): string[] {
  const recs = ctx ? contextRecords(ds, ctx, "series") : getRecords(ds);
  const base = recs.length ? recs : getRecords(ds);
  return [...new Set(base.filter((r) => field in r).map((r) => keyOf(r[field])))].sort(compareKeys);
}

export function fmt(v: number | null | undefined, nullText = "—"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return nullText;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

/* ---------- report variables ---------- */

export const VARIABLES: { name: string; label: string }[] = [
  { name: "simulationId", label: "演示运行 ID" },
  { name: "branch", label: "分支" },
  { name: "tick", label: "时间点 Tick" },
  { name: "reportTitle", label: "报告标题" },
  { name: "resourceInputTotal", label: "资源投入合计" },
  { name: "transferredTotal", label: "转移累计人数" },
  { name: "transferTarget", label: "转移目标人数" },
  { name: "completionPercent", label: "转移完成率 %" },
  { name: "recordCount", label: "投入记录条数" },
];
export const KNOWN_VARIABLES = new Set(VARIABLES.map((v) => v.name));

export function computeVariables(
  ctx: DataContext,
  opts: { filters?: Filters; reportTitle?: string } = {},
): Record<string, string | number | null> {
  const input = resolveSlice("resourceInput", ctx, opts.filters);
  const tf: Filters = opts.filters?.targetId ? { targetId: opts.filters.targetId } : {};
  const transfer = resolveSlice("transferProgress", ctx, tf);
  const transferred =
    transfer.status === "ok" ? measureValue(transfer.records, "transferredCount", "sum") : null;
  const target =
    transfer.status === "ok" ? measureValue(transfer.records, "targetCount", "sum") : null;
  return {
    simulationId: ctx.simulationId,
    branch: ctx.branch,
    tick: ctx.tick,
    reportTitle: opts.reportTitle ?? DEMO.demoReportGeneration.exampleResolvedValues.reportTitle,
    resourceInputTotal:
      input.status === "ok" ? measureValue(input.records, "demo_amount", "sum") : null,
    transferredTotal: transferred,
    transferTarget: target,
    completionPercent:
      transferred !== null && target ? Math.round((transferred / target) * 1000) / 10 : null,
    recordCount: input.records.length,
  };
}

export function resolveText(text: string, vars: Record<string, any>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name) => {
    const v = vars[name];
    return v === null || v === undefined ? `［${name}: 无数据］` : String(v);
  });
}

/* ---------- binding expressions: sum(field) / count() / field ---------- */

export function evalExpression(expr: string, records: Rec[]): number | null {
  const m = /^\s*(sum|count)\(\s*([\w]*)\s*\)\s*$/i.exec(expr);
  if (!m) return null;
  return m[1].toLowerCase() === "count" ? records.length : measureValue(records, m[2], "sum");
}
export const isAggExpr = (expr: string) => /^\s*(sum|count)\(/i.test(expr);
