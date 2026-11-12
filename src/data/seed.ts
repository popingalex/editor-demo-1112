import { DEMO } from "./engine";
import { DEFAULT_STYLE } from "./chartModel";
import { rcKey, refToRC } from "./grid";
import type {
  AssetRecord,
  ChartDef,
  DataContext,
  FixedCell,
  FixedDef,
  Merge,
  ReportDef,
  TableDef,
} from "./types";
import { normalizeDoc } from "./reports";

export const DEFAULT_CONTEXT: DataContext = { simulationId: "DEMO-RUN-A", branch: "main", tick: 2 };
export const SEED_TIME = "2025-01-01T08:00:00.000Z";

export function chartFromSeed(a: any): ChartDef {
  return {
    title: a.title,
    chartType: a.chartType,
    dataSetId: a.dataSetId,
    dimensions: [...a.dimensions],
    measure: a.measure,
    secondaryMeasure: a.series?.find((s: any) => s.axis === "right")?.field,
    aggregation: a.aggregation,
    viewParams: { ...DEFAULT_CONTEXT, ...(a.viewParams ?? {}) },
    filters: {},
    sort: "none",
    style: { ...DEFAULT_STYLE, height: a.chartType === "gantt" ? 280 : 300 },
  };
}

export function newTableDef(partial: Partial<TableDef> = {}): TableDef {
  return {
    title: "新建分析表",
    mode: "grouped",
    dataSetId: "resourceInput",
    columns: ["recordId", "simulationId", "tick", "unitId", "targetId", "demo_amount"],
    groupBy: ["unitId"],
    rowDimensions: ["unitId"],
    columnDimensions: ["targetId"],
    measure: "demo_amount",
    aggregation: "sum",
    viewParams: { ...DEFAULT_CONTEXT },
    filters: {},
    sort: "keyAsc",
    showTotals: true,
    showSubtotals: true,
    nullDisplay: "dash",
    labelMode: "id",
    pageSize: 20,
    ...partial,
  };
}

function tableFromSeed(a: any): TableDef {
  return newTableDef({
    title: a.title,
    mode: a.mode,
    dataSetId: a.dataSetId,
    ...(a.columns ? { columns: ["recordId", ...a.columns] } : {}),
    groupBy: a.groupBy ?? ["unitId"],
    rowDimensions: a.rowDimensions ?? ["unitId"],
    columnDimensions: a.columnDimensions ?? ["targetId"],
    measure: a.measure ?? "demo_amount",
    aggregation: a.aggregation ?? "sum",
  });
}

function mergesFrom(ranges: { start: string; end: string }[]): Merge[] {
  return ranges.map(({ start, end }) => {
    const s = refToRC(start);
    const e = refToRC(end);
    return { r: s.r, c: s.c, rs: e.r - s.r + 1, cs: e.c - s.c + 1 };
  });
}

function cellsFrom(cells: Record<string, any>): Record<string, FixedCell> {
  const out: Record<string, FixedCell> = {};
  for (const [ref, v] of Object.entries(cells)) {
    const { r, c } = refToRC(ref);
    out[rcKey(r, c)] = { text: v.text, binding: v.binding, style: v.style };
  }
  return out;
}

/**
 * DEMO-FIXED-01: the seed gridModel only defines the “按单位” region. To also cover the second
 * dynamicTable listed in `sections` (按目标汇总), rows 7–9 (empty in the seed) receive a second
 * region, and header/body/summary rows get A:C / D:F merges for a readable layout.
 */
function fixed01(a: any): FixedDef {
  const g = a.gridModel;
  const cells = cellsFrom(g.cells);
  cells[rcKey(2, 0)] = { text: "报表名称：{{reportTitle}}", style: "info" };
  cells[rcKey(6, 0)] = { text: "按目标投入统计", style: "section" };
  cells[rcKey(7, 0)] = { text: "目标", style: "header" };
  cells[rcKey(7, 3)] = { text: "投入量", style: "header" };
  cells[rcKey(5, 0)] = { binding: "unitId", style: "body" };
  cells[rcKey(5, 3)] = { binding: "sum(demo_amount)", style: "body", align: "right" };
  cells[rcKey(8, 0)] = { binding: "targetId", style: "body" };
  cells[rcKey(8, 3)] = { binding: "sum(demo_amount)", style: "body", align: "right" };
  cells[rcKey(10, 3)] = { ...cells[rcKey(10, 3)], align: "right" };
  const extra = [
    "A3:F3",
    "A5:C5",
    "D5:F5",
    "A6:C6",
    "D6:F6",
    "A7:F7",
    "A8:C8",
    "D8:F8",
    "A9:C9",
    "D9:F9",
    "A11:C11",
    "D11:F11",
    "A12:F12",
  ].map((s) => {
    const [start, end] = s.split(":");
    return { start, end };
  });
  return {
    title: a.title,
    page: { ...a.page },
    colWidths: [...g.columnWidthsPx],
    rowHeights: Array.from({ length: g.rowCount }, (_, i) => (i === 0 ? 44 : 30)),
    merges: mergesFrom([...g.mergedRanges, ...extra]),
    cells,
    regions: [
      {
        id: "RG-1",
        row: 5,
        dataSetId: "resourceInput",
        groupBy: ["unitId"],
        metric: "demo_amount",
        aggregation: "sum",
        columnBindings: { 0: "unitId", 3: "sum(demo_amount)" },
        repeatHeaderRow: 4,
        sort: "keyAsc",
      },
      {
        id: "RG-2",
        row: 8,
        dataSetId: "resourceInput",
        groupBy: ["targetId"],
        metric: "demo_amount",
        aggregation: "sum",
        columnBindings: { 0: "targetId", 3: "sum(demo_amount)" },
        repeatHeaderRow: 7,
        sort: "keyAsc",
      },
    ],
    viewParams: { ...DEFAULT_CONTEXT },
    filters: {},
    totalDataSetId: "resourceInput",
    pageNumbering: { show: g.demoPageNumbering.show, format: g.demoPageNumbering.format },
    repeatFactor: 1,
    labelMode: "id",
  };
}

function fixed02(a: any): FixedDef {
  const g = a.gridModel;
  const cells = cellsFrom(g.cells);
  cells[rcKey(1, 0)] = {
    text: "数据集：分页演示明细 printStressRows（DEMO_EXTENDED_PRINT_ONLY，不进入投入统计）",
    style: "info",
  };
  ["sequence", "itemName", "unitId", "targetId", "quantity", "note"].forEach((f, c) => {
    cells[rcKey(3, c)] = {
      binding: f,
      style: "body",
      align: f === "quantity" || f === "sequence" ? "center" : "left",
    };
  });
  cells[rcKey(4, 0)] = { text: "排版数量合计（仅本表）", style: "summary" };
  cells[rcKey(4, 4)] = { binding: "count()", style: "summary", align: "center" };
  cells[rcKey(4, 5)] = { text: "行 · 数据仅用于分页演示", style: "note" };
  return {
    title: a.title,
    page: { ...a.page },
    colWidths: [...g.columnWidthsPx],
    rowHeights: Array.from({ length: g.rowCount }, (_, i) => (i === 0 ? 44 : 28)),
    merges: mergesFrom([...g.mergedRanges, { start: "A2", end: "F2" }, { start: "A5", end: "D5" }]),
    cells,
    regions: [
      {
        id: "RG-1",
        row: 3,
        dataSetId: "printStressRows",
        groupBy: [],
        metric: "quantity",
        aggregation: "none",
        columnBindings: {
          0: "sequence",
          1: "itemName",
          2: "unitId",
          3: "targetId",
          4: "quantity",
          5: "note",
        },
        repeatHeaderRow: 2,
        sort: "none",
      },
    ],
    viewParams: { ...DEFAULT_CONTEXT },
    filters: {},
    totalDataSetId: "printStressRows",
    pageNumbering: { show: g.demoPageNumbering.show, format: g.demoPageNumbering.format },
    repeatFactor: 1,
    labelMode: "id",
  };
}

export function newFixedDef(): FixedDef {
  const cells: Record<string, FixedCell> = {
    [rcKey(0, 0)]: { text: "新建固定格式报表", style: "title" },
    [rcKey(1, 0)]: { text: "演示运行：{{simulationId}} · Tick {{tick}}", style: "info" },
    [rcKey(2, 0)]: { text: "单位", style: "header" },
    [rcKey(2, 2)]: { text: "投入量", style: "header" },
    [rcKey(3, 0)]: { binding: "unitId", style: "body" },
    [rcKey(3, 2)]: { binding: "sum(demo_amount)", style: "body", align: "right" },
    [rcKey(4, 0)]: { text: "合计", style: "summary" },
    [rcKey(4, 2)]: { binding: "sum(demo_amount)", style: "summary", align: "right" },
  };
  return {
    title: "新建固定格式报表",
    page: { size: "A4", orientation: "portrait", marginMm: 18 },
    colWidths: [160, 160, 160, 160],
    rowHeights: [44, 30, 30, 30, 30],
    merges: [
      { r: 0, c: 0, rs: 1, cs: 4 },
      { r: 1, c: 0, rs: 1, cs: 4 },
      { r: 2, c: 0, rs: 1, cs: 2 },
      { r: 2, c: 2, rs: 1, cs: 2 },
      { r: 3, c: 0, rs: 1, cs: 2 },
      { r: 3, c: 2, rs: 1, cs: 2 },
      { r: 4, c: 0, rs: 1, cs: 2 },
      { r: 4, c: 2, rs: 1, cs: 2 },
    ],
    cells,
    regions: [
      {
        id: "RG-1",
        row: 3,
        dataSetId: "resourceInput",
        groupBy: ["unitId"],
        metric: "demo_amount",
        aggregation: "sum",
        columnBindings: { 0: "unitId", 2: "sum(demo_amount)" },
        repeatHeaderRow: 2,
        sort: "keyAsc",
      },
    ],
    viewParams: { ...DEFAULT_CONTEXT },
    filters: {},
    totalDataSetId: "resourceInput",
    pageNumbering: { show: true, format: "第 {page} 页" },
    repeatFactor: 1,
    labelMode: "id",
  };
}

export function newChartDef(): ChartDef {
  return {
    title: "新建图表",
    chartType: "bar",
    dataSetId: "resourceInput",
    dimensions: ["unitId"],
    measure: "demo_amount",
    aggregation: "sum",
    viewParams: { ...DEFAULT_CONTEXT },
    filters: {},
    sort: "none",
    style: { ...DEFAULT_STYLE },
  };
}

export function newReportDef(): ReportDef {
  return {
    title: "新建综合报告模板",
    parameters: { ...DEFAULT_CONTEXT },
    doc: normalizeDoc({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "新建综合报告模板" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "本报告基于 {{simulationId}} / Tick {{tick}} 的演示数据生成。" },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "1. 概述" }] },
        { type: "paragraph", content: [{ type: "text", text: "在此输入正文……" }] },
      ],
    }),
  };
}

function rec<D>(
  kind: AssetRecord["kind"],
  assetId: string,
  title: string,
  revision: number,
  def: D,
): AssetRecord<D> {
  return {
    assetId,
    kind,
    title,
    seed: true,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    latest: revision,
    revisions: [
      {
        revision,
        def,
        savedAt: SEED_TIME,
        note: `预置种子版本 r${revision}${revision > 1 ? `（r1–r${revision - 1} 未包含在演示种子中）` : ""}`,
      },
    ],
    provenance: "DEMO_ASSET",
  };
}

export function seedAssets(): Record<string, AssetRecord> {
  const out: Record<string, AssetRecord> = {};
  for (const a of DEMO.assets.charts)
    out[a.assetId] = rec("chart", a.assetId, a.title, a.revision, chartFromSeed(a));
  for (const a of DEMO.assets.tables)
    out[a.assetId] = rec("table", a.assetId, a.title, a.revision, tableFromSeed(a));
  const f = DEMO.assets.fixedTemplates;
  out[f[0].assetId] = rec("fixed", f[0].assetId, f[0].title, f[0].revision, fixed01(f[0]));
  out[f[1].assetId] = rec("fixed", f[1].assetId, f[1].title, f[1].revision, fixed02(f[1]));
  for (const a of DEMO.assets.reportTemplates) {
    const def: ReportDef = {
      title: a.title,
      doc: normalizeDoc(a.doc),
      parameters: { ...DEFAULT_CONTEXT },
    };
    out[a.assetId] = rec("report", a.assetId, a.title, a.revision, def);
  }
  return out as Record<string, AssetRecord>;
}
