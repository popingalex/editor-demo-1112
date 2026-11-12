import type { Rec, TableDef } from "./types";
import {
  aggregate,
  compareKeys,
  displayValue,
  measureValue,
  pivot,
  resolveSlice,
  sortGroups,
  unitOf,
  type PivotResult,
} from "./engine";

export interface GroupedRow {
  key: string[];
  label: string;
  value: number | null;
  count: number;
  records: Rec[];
  isSubtotal: boolean;
  level: number;
}

export interface TableModel {
  status: "ok" | "empty" | "invalid" | "unfit";
  message?: string;
  records: Rec[];
  total: number | null;
  unit: string | null;
  detailRows?: Rec[];
  groupedRows?: GroupedRow[];
  pivot?: PivotResult;
}

export function computeTable(def: TableDef): TableModel {
  const dims =
    def.mode === "grouped"
      ? def.groupBy
      : def.mode === "pivot"
        ? [...def.rowDimensions, ...def.columnDimensions]
        : [];
  const timeMode = dims.includes("tick") ? "series" : "snapshot";
  const unit = def.aggregation === "count" ? "条" : unitOf(def.dataSetId, def.measure, def.filters);
  const base: TableModel = { status: "ok", records: [], total: null, unit };
  if (def.mode === "grouped" && !def.groupBy.length)
    return { ...base, status: "unfit", message: "分组汇总需要至少 1 个分组维度" };
  if (def.mode === "pivot" && (!def.rowDimensions.length || !def.columnDimensions.length))
    return { ...base, status: "unfit", message: "交叉透视需要至少 1 个行维度和 1 个列维度" };
  if (def.mode === "pivot" && def.rowDimensions.some((d) => def.columnDimensions.includes(d)))
    return { ...base, status: "unfit", message: "同一维度不能同时作为行和列" };
  if (def.mode === "detail" && !def.columns.length)
    return { ...base, status: "unfit", message: "明细表至少需要选择 1 个字段" };
  const slice = resolveSlice(def.dataSetId, def.viewParams, def.filters, timeMode);
  if (slice.status !== "ok") return { ...base, status: slice.status, message: slice.message };
  const records = slice.records;
  const total = measureValue(records, def.measure, def.aggregation);

  if (def.mode === "detail") {
    const rows = [...records];
    const v = (r: Rec) => (typeof r[def.measure] === "number" ? r[def.measure] : -Infinity);
    if (def.sort === "valueAsc") rows.sort((a, b) => v(a) - v(b));
    else if (def.sort === "valueDesc") rows.sort((a, b) => v(b) - v(a));
    else if (def.sort === "keyDesc") rows.sort((a, b) => compareKeys(b.recordId, a.recordId));
    return { ...base, records, total, detailRows: rows };
  }

  if (def.mode === "grouped") {
    const lm = def.labelMode;
    const groups = sortGroups(
      aggregate(records, def.groupBy, def.measure, def.aggregation),
      def.sort,
    );
    const rows: GroupedRow[] = [];
    if (def.groupBy.length > 1 && def.showSubtotals) {
      const first = sortGroups(
        aggregate(records, [def.groupBy[0]], def.measure, def.aggregation),
        def.sort,
      );
      for (const f of first) {
        for (const g of groups.filter((x) => x.key[0] === f.key[0]))
          rows.push({
            key: g.key,
            label: g.key.map((k, i) => displayValue(def.groupBy[i], k, lm)).join(" / "),
            value: g.value,
            count: g.count,
            records: g.records,
            isSubtotal: false,
            level: 1,
          });
        rows.push({
          key: f.key,
          label: `${displayValue(def.groupBy[0], f.key[0], lm)} 小计`,
          value: f.value,
          count: f.count,
          records: f.records,
          isSubtotal: true,
          level: 0,
        });
      }
    } else {
      for (const g of groups)
        rows.push({
          key: g.key,
          label: g.key.map((k, i) => displayValue(def.groupBy[i], k, lm)).join(" / "),
          value: g.value,
          count: g.count,
          records: g.records,
          isSubtotal: false,
          level: 0,
        });
    }
    return { ...base, records, total, groupedRows: rows };
  }

  const p = pivot(
    records,
    def.rowDimensions,
    def.columnDimensions,
    def.measure,
    def.aggregation,
    def.sort,
  );
  return { ...base, records, total, pivot: p };
}
