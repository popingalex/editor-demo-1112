import type { JSONContent } from "@tiptap/core";
import type {
  AnyDef,
  AssetKind,
  AssetRecord,
  AssetSnapshot,
  ChartDef,
  DataContext,
  FixedDef,
  ReportDef,
  ReportInstance,
  ResolvedNodeData,
  TableDef,
} from "./types";
import { KNOWN_VARIABLES, computeVariables, displayValue, fmt, validateContext } from "./engine";
import { computeChart } from "./chartModel";
import { computeTable } from "./tableModel";
import { expandFixed } from "./fixedModel";

export const ASSET_NODE_TYPES: Record<string, AssetKind> = {
  chartAsset: "chart",
  tableAsset: "table",
  fixedTableAsset: "fixed",
};
export const NODE_TYPE_FOR: Record<string, string> = {
  chart: "chartAsset",
  table: "tableAsset",
  fixed: "fixedTableAsset",
};

let seq = 0;
export const uid = (p: string) =>
  `${p}-${Date.now().toString(36).slice(-4).toUpperCase()}${(seq++).toString(36).toUpperCase().padStart(2, "0")}`;
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Convert `{{var}}` text into variable nodes and give each asset node a stable nodeId. */
export function normalizeDoc(doc: JSONContent): JSONContent {
  let n = 0;
  const walk = (node: JSONContent): JSONContent | JSONContent[] => {
    if (node.type === "text" && node.text && /\{\{\s*\w+\s*\}\}/.test(node.text)) {
      const parts: JSONContent[] = [];
      const re = /\{\{\s*(\w+)\s*\}\}/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(node.text))) {
        if (m.index > last) parts.push({ ...node, text: node.text.slice(last, m.index) });
        parts.push({ type: "variable", attrs: { name: m[1] } });
        last = m.index + m[0].length;
      }
      if (last < node.text.length) parts.push({ ...node, text: node.text.slice(last) });
      return parts;
    }
    const out: JSONContent = { ...node };
    if (node.type && ASSET_NODE_TYPES[node.type]) {
      n++;
      out.attrs = {
        overrides: {},
        displayMode: "inline",
        ...node.attrs,
        nodeId: node.attrs?.nodeId ?? `N${String(n).padStart(2, "0")}-${node.attrs?.assetId}`,
      };
    }
    if (node.content) out.content = node.content.flatMap((c) => walk(c));
    return out;
  };
  return walk(doc) as JSONContent;
}

export interface DocRef {
  nodeId: string;
  type: string;
  kind: AssetKind;
  assetId: string;
  assetRevision: number;
  overrides: Record<string, any>;
}

export function collectRefs(doc: JSONContent | undefined): DocRef[] {
  const out: DocRef[] = [];
  const walk = (n: JSONContent) => {
    if (n.type && ASSET_NODE_TYPES[n.type])
      out.push({
        nodeId: n.attrs?.nodeId,
        type: n.type,
        kind: ASSET_NODE_TYPES[n.type],
        assetId: n.attrs?.assetId,
        assetRevision: n.attrs?.assetRevision,
        overrides: n.attrs?.overrides ?? {},
      });
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return out;
}

export function collectVariables(doc: JSONContent | undefined): string[] {
  const s = new Set<string>();
  const walk = (n: JSONContent) => {
    if (n.type === "variable") s.add(n.attrs?.name);
    if (n.type === "text")
      for (const m of n.text?.matchAll(/\{\{\s*(\w+)\s*\}\}/g) ?? []) s.add(m[1]);
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return [...s];
}

export function docText(n: JSONContent | undefined): string {
  if (!n) return "";
  if (n.type === "text") return n.text ?? "";
  if (n.type === "variable") return `{{${n.attrs?.name}}}`;
  return (n.content ?? []).map(docText).join("");
}

export interface Heading {
  index: number;
  level: number;
  text: string;
}
export function outline(doc: JSONContent | undefined): Heading[] {
  return (doc?.content ?? []).flatMap((n, index) =>
    n.type === "heading" ? [{ index, level: n.attrs?.level ?? 1, text: docText(n) }] : [],
  );
}

/* ---------- effective definitions (asset def + report params + node overrides) ---------- */

export function effectiveDef(
  kind: AssetKind,
  def: AnyDef,
  overrides: Record<string, any>,
  params: DataContext,
): AnyDef {
  const o = overrides ?? {};
  if (kind === "chart") {
    const d = def as ChartDef;
    return {
      ...d,
      viewParams: { ...params },
      chartType: o.chartType ?? d.chartType,
      dimensions: o.dimensions ?? d.dimensions,
      sort: o.sort ?? d.sort,
      filters: { ...d.filters, ...(o.filters ?? {}) },
      style: {
        ...d.style,
        ...(o.height ? { height: o.height } : {}),
        ...(o.showLabels !== undefined ? { showLabels: o.showLabels } : {}),
        ...(o.palette ? { palette: o.palette } : {}),
      },
    } as ChartDef;
  }
  if (kind === "table") {
    const d = def as TableDef;
    const swap = !!o.swap;
    return {
      ...d,
      viewParams: { ...params },
      sort: o.sort ?? d.sort,
      showTotals: o.showTotals ?? d.showTotals,
      filters: { ...d.filters, ...(o.filters ?? {}) },
      rowDimensions: swap ? d.columnDimensions : d.rowDimensions,
      columnDimensions: swap ? d.rowDimensions : d.columnDimensions,
    } as TableDef;
  }
  if (kind === "fixed") {
    const d = def as FixedDef;
    return {
      ...d,
      viewParams: { ...params },
      filters: { ...d.filters, ...(o.filters ?? {}) },
    } as FixedDef;
  }
  return def;
}

export const OVERRIDE_LABELS: Record<string, string> = {
  chartType: "图型",
  dimensions: "维度",
  sort: "排序",
  filters: "筛选",
  height: "高度",
  showLabels: "数据标签",
  palette: "配色",
  swap: "行列交换",
  showTotals: "合计",
  caption: "图注",
  align: "对齐",
  width: "宽度",
};
export const overrideKeys = (o: Record<string, any> | undefined) =>
  Object.entries(o ?? {})
    .filter(
      ([, v]) =>
        v !== undefined &&
        !(typeof v === "object" && v && !Array.isArray(v) && Object.keys(v).length === 0),
    )
    .map(([k]) => k);

export function summarizeNode(
  ref: DocRef,
  snap: AssetSnapshot,
  params: DataContext,
): ResolvedNodeData {
  const eff = effectiveDef(snap.kind, snap.def, ref.overrides, params);
  const base = {
    nodeId: ref.nodeId,
    assetId: ref.assetId,
    revision: snap.revision,
    kind: snap.kind,
    title: snap.title,
    overrides: clone(ref.overrides ?? {}),
  };
  if (snap.kind === "chart") {
    const m = computeChart(eff as ChartDef);
    if (m.status !== "ok")
      return { ...base, summary: m.message ?? "无数据", total: null, rows: [] };
    const rows = m.tasks
      ? m.tasks.map((t) => ({ label: `${t.taskId} ${t.title}`, value: t.progressPercent }))
      : m.summary.map((s) => ({ label: s.label, value: s.value }));
    const d = eff as ChartDef;
    return {
      ...base,
      summary: `${m.totalLabel} ${fmt(m.total)} · 按${d.dimensions.map((x) => displayValue("x", x)).join("/")}`,
      total: m.total,
      rows,
    };
  }
  if (snap.kind === "table") {
    const t = computeTable(eff as TableDef);
    if (t.status !== "ok")
      return { ...base, summary: t.message ?? "无数据", total: null, rows: [] };
    const rows =
      t.groupedRows
        ?.filter((r) => !r.isSubtotal)
        .map((r) => ({ label: r.label, value: r.value })) ??
      t.pivot?.rowKeys.map((k) => ({
        label: k.join(" / "),
        value: t.pivot!.rowTotals.get(k.join("\u0001")) ?? null,
      })) ??
      [];
    return { ...base, summary: `总计 ${fmt(t.total)}`, total: t.total, rows };
  }
  const f = expandFixed(eff as FixedDef);
  return {
    ...base,
    summary: `填数行 ${f.rows.length}${f.status !== "ok" ? ` · ${f.message}` : ""}`,
    total: f.grandTotal,
    rows: [],
  };
}

/* ---------- generation ---------- */

export interface GenError {
  kind:
    | "missingAsset"
    | "missingRevision"
    | "unknownVariable"
    | "invalidSelection"
    | "missingParam"
    | "emptyDoc";
  nodeId?: string;
  assetId?: string;
  message: string;
}

export function snapshotFor(
  assets: Record<string, AssetRecord>,
  assetId: string,
  revision: number,
): AssetSnapshot | null {
  const a = assets[assetId];
  const r = a?.revisions.find((x) => x.revision === revision);
  if (!a || !r) return null;
  return {
    assetId,
    kind: a.kind,
    revision,
    title: (r.def as any).title ?? a.title,
    def: clone(r.def),
  };
}

export function validateGeneration(
  doc: JSONContent,
  selection: DataContext,
  assets: Record<string, AssetRecord>,
): GenError[] {
  const errors: GenError[] = [];
  if (!selection.simulationId)
    errors.push({ kind: "missingParam", message: "必填参数“演示运行 simulationId”未选择" });
  if (selection.tick === null || selection.tick === undefined)
    errors.push({ kind: "missingParam", message: "必填参数“时间点 tick”未选择" });
  if (!errors.length) {
    const c = validateContext("resourceInput", selection);
    if (!c.ok) errors.push({ kind: "invalidSelection", message: c.message! });
  }
  const refs = collectRefs(doc);
  if (!refs.length && !(doc.content ?? []).length)
    errors.push({ kind: "emptyDoc", message: "模板正文为空" });
  for (const r of refs) {
    const a = assets[r.assetId];
    if (!a)
      errors.push({
        kind: "missingAsset",
        nodeId: r.nodeId,
        assetId: r.assetId,
        message: `节点 ${r.nodeId} 引用的资产 ${r.assetId} 不存在（可能已删除）`,
      });
    else if (!a.revisions.some((x) => x.revision === r.assetRevision))
      errors.push({
        kind: "missingRevision",
        nodeId: r.nodeId,
        assetId: r.assetId,
        message: `节点 ${r.nodeId} 引用 ${r.assetId} r${r.assetRevision}，该版本不存在（可用：${a.revisions.map((x) => "r" + x.revision).join("、")}）`,
      });
  }
  for (const v of collectVariables(doc))
    if (!KNOWN_VARIABLES.has(v))
      errors.push({ kind: "unknownVariable", message: `变量 {{${v}}} 未定义，无法绑定演示数据` });
  return errors;
}

export function buildInstance(
  instanceId: string,
  template: AssetRecord<ReportDef>,
  revision: number,
  selection: DataContext,
  assets: Record<string, AssetRecord>,
  now: string,
): ReportInstance {
  const def = template.revisions.find((r) => r.revision === revision)!.def;
  const doc = normalizeDoc(clone(def.doc));
  const refs = collectRefs(doc);
  const assetSnapshots: Record<string, AssetSnapshot> = {};
  for (const r of refs) {
    const s = snapshotFor(assets, r.assetId, r.assetRevision);
    if (s) assetSnapshots[`${r.assetId}@${r.assetRevision}`] = s;
  }
  const resolvedValues = computeVariables(selection, { reportTitle: def.title });
  const resolvedData = refs.flatMap((r) => {
    const s = assetSnapshots[`${r.assetId}@${r.assetRevision}`];
    return s ? [summarizeNode(r, s, selection)] : [];
  });
  return {
    instanceId,
    title: `${def.title}（${selection.simulationId} · Tick ${selection.tick}）`,
    state: "draft",
    templateRef: { assetId: template.assetId, revision, title: def.title },
    selection: { ...selection },
    resolvedValues,
    assetSnapshots,
    resolvedData,
    doc,
    revisions: [{ revision: 1, doc: clone(doc), savedAt: now, note: "由模板生成" }],
    currentRevision: 1,
    createdAt: now,
    updatedAt: now,
    provenance: "DEMO_SYNTHETIC",
  };
}

export function resummarize(inst: ReportInstance, doc: JSONContent): ResolvedNodeData[] {
  return collectRefs(doc).flatMap((r) => {
    const s = inst.assetSnapshots[`${r.assetId}@${r.assetRevision}`];
    return s ? [summarizeNode(r, s, inst.selection)] : [];
  });
}
