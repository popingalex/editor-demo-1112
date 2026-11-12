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

function regionRows(def: FixedDef, regionIdx: number) {
  const rg = def.regions[regionIdx];
  const slice = resolveSlice(rg.dataSetId, def.viewParams, def.filters);
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

export function expandFixed(def: FixedDef): Expanded {
  const nRows = def.rowHeights.length;
  const nCols = def.colWidths.length;
  const vars = computeVariables(def.viewParams, { filters: def.filters, reportTitle: def.title });
  const totalSlice = resolveSlice(def.totalDataSetId, def.viewParams, def.filters);
  let totalRecords = totalSlice.records;
  if (def.totalDataSetId === "printStressRows" && def.repeatFactor > 1)
    totalRecords = Array.from({ length: def.repeatFactor }, () => totalRecords).flat();
  const regionByRow = new Map(def.regions.map((r, i) => [r.row, i]));
  const regionData = def.regions.map((_, i) => regionRows(def, i));
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
        if (binding) {
          if (rg && data) {
            const dr = data.rows[k];
            text = isAggExpr(binding)
              ? fmt(evalExpression(binding, dr.records))
              : displayValue(binding, dr.values[binding], lm);
          } else if (isAggExpr(binding)) {
            text =
              totalSlice.status === "ok"
                ? fmt(evalExpression(binding, totalRecords))
                : totalSlice.status === "invalid"
                  ? "无效范围"
                  : "—";
          } else
            text =
              vars[binding] !== undefined && vars[binding] !== null ? String(vars[binding]) : "—";
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
