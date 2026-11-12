import type { JSONContent } from "@tiptap/core";

export type DataSetId =
  | "resourceInput"
  | "resourceSplit"
  | "transferProgress"
  | "dualMetric"
  | "taskSchedule"
  | "componentSeries"
  | "printStressRows";

export type Rec = Record<string, any> & { recordId: string; provenance: string };
export type Aggregation = "sum" | "count" | "none";
export type DataContext = { simulationId: string; branch: string; tick: number | null };
export type Filters = Record<string, string[]>;
export type SortMode = "none" | "keyAsc" | "keyDesc" | "valueAsc" | "valueDesc";
export type LabelMode = "id" | "name" | "both";
export type ChartType =
  | "bar"
  | "hbar"
  | "line"
  | "area"
  | "stacked"
  | "dualAxis"
  | "sankey"
  | "gantt";
export type PaletteId = "default" | "ocean" | "warm" | "mono";

export interface ChartStyle {
  showLegend: boolean;
  showLabels: boolean;
  showUnit: boolean;
  palette: PaletteId;
  labelMode: LabelMode;
  smooth: boolean;
  height: number;
  xAxisName: string;
  yAxisName: string;
}

export interface ChartDef {
  title: string;
  chartType: ChartType;
  dataSetId: DataSetId;
  dimensions: string[];
  measure: string;
  secondaryMeasure?: string;
  aggregation: Aggregation;
  viewParams: DataContext;
  filters: Filters;
  sort: SortMode;
  style: ChartStyle;
}

export type TableMode = "detail" | "grouped" | "pivot";
export interface TableDef {
  title: string;
  mode: TableMode;
  dataSetId: DataSetId;
  columns: string[];
  groupBy: string[];
  rowDimensions: string[];
  columnDimensions: string[];
  measure: string;
  aggregation: "sum" | "count";
  viewParams: DataContext;
  filters: Filters;
  sort: SortMode;
  showTotals: boolean;
  showSubtotals: boolean;
  nullDisplay: "dash" | "zero" | "text";
  labelMode: LabelMode;
  pageSize: number;
}

export type CellStyle = "title" | "info" | "section" | "header" | "body" | "summary" | "note";
export interface FixedCell {
  text?: string;
  binding?: string;
  style?: CellStyle;
  align?: "left" | "center" | "right";
  bold?: boolean;
}
export interface Merge {
  r: number;
  c: number;
  rs: number;
  cs: number;
}
export interface DynamicRegion {
  id: string;
  row: number;
  dataSetId: DataSetId;
  groupBy: string[];
  metric: string;
  aggregation: "sum" | "count" | "none";
  columnBindings: Record<string, string>;
  repeatHeaderRow: number | null;
  sort: SortMode;
}
export interface FixedDef {
  title: string;
  page: { size: "A4"; orientation: "portrait" | "landscape"; marginMm: number };
  colWidths: number[];
  rowHeights: number[];
  merges: Merge[];
  cells: Record<string, FixedCell>;
  regions: DynamicRegion[];
  viewParams: DataContext;
  filters: Filters;
  totalDataSetId: DataSetId;
  pageNumbering: { show: boolean; format: string };
  repeatFactor: number;
  labelMode: LabelMode;
}

export interface ReportDef {
  title: string;
  doc: JSONContent;
  parameters: DataContext;
}

export type AssetKind = "chart" | "table" | "fixed" | "report";
export type AssetDefOf<K extends AssetKind> = K extends "chart"
  ? ChartDef
  : K extends "table"
    ? TableDef
    : K extends "fixed"
      ? FixedDef
      : ReportDef;
export type AnyDef = ChartDef | TableDef | FixedDef | ReportDef;

export interface AssetRevision<D = AnyDef> {
  revision: number;
  def: D;
  savedAt: string;
  note: string;
}
export interface AssetRecord<D = AnyDef> {
  assetId: string;
  kind: AssetKind;
  title: string;
  seed: boolean;
  createdAt: string;
  updatedAt: string;
  latest: number;
  revisions: AssetRevision<D>[];
  provenance: string;
}

export interface PersonalView {
  id: string;
  name: string;
  scope: "chart" | "table" | "workspace";
  assetId?: string;
  baseRevision?: number;
  state: any;
  savedAt: string;
}

export interface AssetSnapshot {
  assetId: string;
  kind: AssetKind;
  revision: number;
  title: string;
  def: AnyDef;
}

export interface ResolvedNodeData {
  nodeId: string;
  assetId: string;
  revision: number;
  kind: AssetKind;
  title: string;
  summary: string;
  total: number | null;
  rows: { label: string; value: number | null }[];
  overrides: Record<string, any>;
}

export interface InstanceRevision {
  revision: number;
  doc: JSONContent;
  savedAt: string;
  note: string;
}

export interface ReportInstance {
  instanceId: string;
  title: string;
  state: "draft" | "demo-published";
  templateRef: { assetId: string; revision: number; title: string };
  selection: DataContext;
  resolvedValues: Record<string, string | number | null>;
  assetSnapshots: Record<string, AssetSnapshot>;
  resolvedData: ResolvedNodeData[];
  doc: JSONContent;
  revisions: InstanceRevision[];
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
  provenance: string;
}

export interface Publication {
  publicationId: string;
  instanceId: string;
  instanceRevision: number;
  createdAt: string;
  state: "demo-published";
  frozenContent: {
    title: string;
    doc: JSONContent;
    selection: DataContext;
    resolvedValues: Record<string, string | number | null>;
    assetSnapshots: Record<string, AssetSnapshot>;
    resolvedData: ResolvedNodeData[];
    templateRef: { assetId: string; revision: number; title: string };
  };
}
