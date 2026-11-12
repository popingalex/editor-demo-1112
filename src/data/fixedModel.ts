import type { CellStyle, FixedDef, Rec } from "./types";
import {
  aggregate,
  computeVariables,
  displayValue,
  evalExpression,
  fmt,
  isAggExpr,
  resolveSlice,
  resolveText,
  sortGroups,
} from "./engine";
import { rcKey } from "./grid";
import { applyVarContext, defaultEnv, type Env } from "./registry";
import { evaluateExpression, evaluateVariable, formatResult } from "./expr";
import type { DataContext, EvalResult } from "./types";

/** `expr:ID@rev` / `var:ID@rev` structured bindings (legacy sum()/count()/field strings stay valid). */
export const parseRefBinding = (b: string) => {
  const m = /^(expr|var):([A-Za-z0-9_-]+)@(\d+)$/.exec(b.trim());
  return m ? { kind: m[1] as "expr" | "var", assetId: m[2], revision: Number(m[3]) } : null;
};

export interface ExpCell {
  text: string;
  style: CellStyle;
  align: "left" | "center" | "right";
  bold: boolean;
  rs: number;
  cs: number;
  srcKey: string;
  isBinding: boolean;
  isEmptyMsg?: boolean;
  error?: string;
}
export interface ExpRow {
  srcRow: number;
  regionId?: string;
  dataIndex?: number;
  height: number;
  /** undefined = blank cell, null = covered by a merge */
  cells: (ExpCell | null | undefined)[];
  repeated?: boolean;
}
export interface Expanded {
  status: "ok" | "empty" | "invalid";
  message?: string;
  rows: ExpRow[];
  colWidths: number[];
  grandTotal: number | null;
  vars: Record<string, any>;
  regionStats: { id: string; count: number; status: string; message?: string }[];
  outStart: number[];
}

const DEFAULT_ALIGN: Record<CellStyle, "left" | "center" | "right"> = {
  title: "center",
  info: "left",
  section: "left",
  header: "center",
  body: "left",
  summary: "left",
  note: "left",
};

function regionRows(def: FixedDef, regionIdx: number, params: DataContext, env: Env) {
  const rg = def.regions[regionIdx];
  const slice = resolveSlice(rg.dataSetId, params, def.filters, "snapshot", env.data);
  if (slice.status !== "ok")
    return { slice, rows: [] as { records: Rec[]; values: Record<string, any> }[] };
  if (rg.groupBy.length) {
    const gs = sortGroups(
      aggregate(
        slice.records,
        rg.groupBy,
        rg.metric,
        rg.aggregation === "none" ? "sum" : rg.aggregation,
      ),
      rg.sort,
    );
    return { slice, rows: gs.map((g) => ({ records: g.records, values: g.keyObj })) };
  }
  const rep = rg.dataSetId === "printStressRows" ? Math.max(1, def.repeatFactor) : 1;
  const rows: { records: Rec[]; values: Record<string, any> }[] = [];
  for (let k = 0; k < rep; k++)
    for (const r of slice.records) {
      const v =
        k === 0
          ? r
          : {
              ...r,
              sequence: r.sequence + k * slice.records.length,
              rowId: `${r.recordId}-x${k + 1}`,
            };
      rows.push({ records: [v as Rec], values: v });
    }
  return { slice, rows };
}

const charW = (ch: string) => (ch.charCodeAt(0) > 255 ? 12.5 : 6.8);
export function estimateLines(text: string, widthPx: number) {
  const usable = Math.max(20, widthPx - 14);
  let lines = 1;
  let cur = 0;
  for (const ch of text) {
    const w = charW(ch);
    if (cur + w > usable) {
      lines++;
      cur = w;
    } else cur += w;
  }
  return lines;
}

export function expandFixed(def: FixedDef, env: Env = defaultEnv()): Expanded {
  const nRows = def.rowHeights.length;
  const nCols = def.colWidths.length;
  const params = applyVarContext(def.viewParams, env);
  const vars = computeVariables(params, { filters: def.filters, reportTitle: def.title });
  const totalSlice = resolveSlice(def.totalDataSetId, params, def.filters, "snapshot", env.data);
  let totalRecords = totalSlice.records;
  if (def.totalDataSetId === "printStressRows" && def.repeatFactor > 1)
    totalRecords = Array.from({ length: def.repeatFactor }, () => totalRecords).flat();
  const regionByRow = new Map(def.regions.map((r, i) => [r.row, i]));
  const regionData = def.regions.map((_, i) => regionRows(def, i, params, env));
  const fieldsOf = (ds: string) => new Set(Object.keys(env.data(ds as any)[0] ?? {}));
  /** Resolve one binding; errors are returned explicitly instead of a silent “—”. */
  const evalBinding = (binding: string, region?: { ds: string; records: Rec[]; values: Record<string, any>; detail: boolean }): { text: string; error?: string } => {
    const ref = parseRefBinding(binding);
    const show = (r: EvalResult) => (r.status === "invalid" ? { text: `⚠ ${r.message}`, error: r.message } : { text: formatResult(r) });
    if (ref?.kind === "expr")
      return show(
        evaluateExpression(ref, region ? { params, filters: def.filters, records: region.records, recordsSource: region.ds, row: region.detail ? region.records[0] : undefined } : { params, filters: def.filters }, env),
      );
    if (ref?.kind === "var") return show(evaluateVariable(ref, { params, filters: def.filters }, env));
    if (isAggExpr(binding)) {
      const field = /\(\s*(\w*)\s*\)/.exec(binding)?.[1];
      const ds = region?.ds ?? def.totalDataSetId;
      if (field && !fieldsOf(ds).has(field)) return { text: `⚠ 未知字段 ${field}`, error: `数据集 ${ds} 没有字段 ${field}` };
      if (region) return { text: fmt(evalExpression(binding, region.records)) };
      if (totalSlice.status === "invalid") return { text: `⚠ ${totalSlice.message}`, error: totalSlice.message };
      return { text: totalSlice.status === "ok" ? fmt(evalExpression(binding, totalRecords)) : "无数据" };
    }
    if (/\w+\s*\(/.test(binding)) return { text: `⚠ 无法解析公式 ${binding}`, error: `仅支持 sum(字段) / count() 或共享表达式` };
    if (region) {
      if (!(binding in region.values) && !fieldsOf(region.ds).has(binding)) return { text: `⚠ 未知字段 ${binding}`, error: `数据集 ${region.ds} 没有字段 ${binding}` };
      return { text: displayValue(binding, region.values[binding], lm) };
    }
    if (binding in vars) return { text: vars[binding] !== null && vars[binding] !== undefined ? String(vars[binding]) : "无数据" };
    return { text: `⚠ 未知变量 ${binding}`, error: `未定义的变量绑定 ${binding}` };
  };
  const lm = def.labelMode;

  const mergeAt = new Map(def.merges.map((m) => [rcKey(m.r, m.c), m]));
  const covered = new Set<string>();
  for (const m of def.merges)
    for (let r = m.r; r < m.r + m.rs; r++)
      for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(rcKey(r, c));

  const outStart: number[] = [];
  const outCount: number[] = [];
  let acc = 0;
  for (let r = 0; r < nRows; r++) {
    outStart[r] = acc;
    const ri = regionByRow.get(r);
    outCount[r] = ri !== undefined ? Math.max(1, regionData[ri].rows.length) : 1;
    acc += outCount[r];
  }

  const rows: ExpRow[] = [];
  for (let r = 0; r < nRows; r++) {
    const ri = regionByRow.get(r);
    const rg = ri !== undefined ? def.regions[ri] : undefined;
    const data = ri !== undefined ? regionData[ri] : undefined;
    const count = outCount[r];
    for (let k = 0; k < count; k++) {
      const row: ExpRow = {
        srcRow: r,
        regionId: rg?.id,
        dataIndex: rg ? k : undefined,
        height: def.rowHeights[r],
        cells: [],
      };
      if (rg && data && !data.rows.length) {
        row.cells = Array.from({ length: nCols }, (_, c) => (c === 0 ? undefined : null));
        row.cells[0] = {
          text:
            data.slice.status === "invalid"
              ? `数据范围无效：${data.slice.message}`
              : (data.slice.message ?? "当前条件下无数据"),
          style: "body",
          align: "center",
          bold: false,
          rs: 1,
          cs: nCols,
          srcKey: rcKey(r, 0),
          isBinding: false,
          isEmptyMsg: true,
        };
        rows.push(row);
        continue;
      }
      for (let c = 0; c < nCols; c++) {
        const key = rcKey(r, c);
        if (covered.has(key)) {
          row.cells[c] = null;
          continue;
        }
        const cell = def.cells[key];
        const m = mergeAt.get(key);
        let rs = m?.rs ?? 1;
        const cs = m?.cs ?? 1;
        if (rs > 1) {
          const endR = r + rs - 1;
          rs = outStart[endR] + outCount[endR] - (outStart[r] + k);
          if (rg) rs = 1;
        }
        const binding = rg ? (rg.columnBindings[c] ?? cell?.binding) : cell?.binding;
        if (!cell && !binding) {
          row.cells[c] = m
            ? {
                text: "",
                style: "body",
                align: "left",
                bold: false,
                rs,
                cs,
                srcKey: key,
                isBinding: false,
              }
            : undefined;
          continue;
        }
        let text = "";
        let error: string | undefined;
        if (binding) {
          const dr = rg && data ? data.rows[k] : undefined;
          const r = evalBinding(binding, rg && dr ? { ds: rg.dataSetId, records: dr.records, values: dr.values, detail: rg.groupBy.length === 0 } : undefined);
          text = r.text;
          error = r.error;
        } else text = resolveText(cell?.text ?? "", vars);
        const style = cell?.style ?? "body";
        row.cells[c] = {
          text,
          style,
          align: cell?.align ?? DEFAULT_ALIGN[style],
          bold: cell?.bold ?? ["title", "header", "summary", "section"].includes(style),
          rs,
          cs,
          srcKey: key,
          isBinding: !!binding,
          error,
        };
      }
      // covered cells by a multi-row merge from a previous output row inside this same template row are handled by `covered`
      rows.push(row);
    }
  }
  // estimate wrapped heights
  for (const row of rows) {
    let h = row.height;
    row.cells.forEach((cell, c) => {
      if (!cell || cell.rs > 1) return;
      const w = def.colWidths.slice(c, c + cell.cs).reduce((a, b) => a + b, 0);
      const fs = cell.style === "title" ? 1.5 : 1;
      h = Math.max(h, estimateLines(cell.text, w / fs) * 18 * fs + 10);
    });
    row.height = h;
  }
  const grandTotal =
    totalSlice.status === "ok"
      ? evalExpression(
          def.totalDataSetId === "printStressRows" ? "count()" : "sum(demo_amount)",
          totalRecords,
        )
      : null;
  const regionStats = def.regions.map((rg, i) => ({
    id: rg.id,
    count: regionData[i].rows.length,
    status: regionData[i].slice.status,
    message: regionData[i].slice.message,
  }));
  const ctxStatus =
    totalSlice.status === "invalid"
      ? "invalid"
      : regionStats.some((s) => s.status === "invalid")
        ? "invalid"
        : "ok";
  return {
    status: ctxStatus === "invalid" ? "invalid" : "ok",
    message:
      ctxStatus === "invalid"
        ? (totalSlice.message ?? regionStats.find((s) => s.message)?.message)
        : undefined,
    rows,
    colWidths: def.colWidths,
    grandTotal,
    vars,
    regionStats,
    outStart,
  };
}

export const MM = 96 / 25.4;

export interface Page {
  index: number;
  rows: ExpRow[];
}
export interface Paged {
  pages: Page[];
  pageW: number;
  pageH: number;
  margin: number;
  scale: number;
  contentW: number;
  tableW: number;
  overflow: boolean;
}

export function paginate(def: FixedDef, ex: Expanded): Paged {
  const portrait = def.page.orientation === "portrait";
  const pageW = (portrait ? 210 : 297) * MM;
  const pageH = (portrait ? 297 : 210) * MM;
  const margin = def.page.marginMm * MM;
  const contentW = pageW - 2 * margin;
  const contentH = pageH - 2 * margin - 30;
  const tableW = def.colWidths.reduce((a, b) => a + b, 0);
  const scale = Math.min(1, contentW / tableW);
  const headerOut = new Map<string, number>();
  for (const rg of def.regions)
    if (rg.repeatHeaderRow !== null && rg.repeatHeaderRow < def.rowHeights.length)
      headerOut.set(rg.id, ex.outStart[rg.repeatHeaderRow]);
  const pages: Page[] = [];
  let cur: ExpRow[] = [];
  let used = 0;
  for (const row of ex.rows) {
    const h = row.height * scale;
    if (used + h > contentH && cur.length) {
      pages.push({ index: pages.length + 1, rows: cur });
      cur = [];
      used = 0;
      if (row.regionId && headerOut.has(row.regionId)) {
        const hdr = ex.rows[headerOut.get(row.regionId)!];
        cur.push({ ...hdr, repeated: true });
        used += hdr.height * scale;
      }
    }
    cur.push(row);
    used += h;
  }
  if (cur.length) pages.push({ index: pages.length + 1, rows: cur });
  return { pages, pageW, pageH, margin, scale, contentW, tableW, overflow: tableW > contentW + 1 };
}
