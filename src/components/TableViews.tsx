import { useEffect, useMemo, useState } from "react";
import type { Rec, TableDef } from "../data/types";
import { computeTable, type TableModel } from "../data/tableModel";
import { displayValue, fieldLabel, fmt, kj } from "../data/engine";
import { Button, StatusBlock, cx } from "../ui/kit";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CellPick {
  key: string;
  label: string;
  records: Rec[];
  value: number | null;
}

const th =
  "px-2.5 h-8 text-left text-[11px] font-semibold text-ink-3 bg-gray-50 border-b border-line whitespace-nowrap";
const td = "px-2.5 h-8 border-b border-gray-100 whitespace-nowrap";

export function nullText(def: Pick<TableDef, "nullDisplay">, v: number | null | undefined) {
  if (v === null || v === undefined)
    return def.nullDisplay === "zero" ? "0" : def.nullDisplay === "text" ? "（空）" : "—";
  return fmt(v);
}

export function AnalysisTableView({
  def,
  model: given,
  onPick,
  selectedKey,
  maxHeight,
  highlightRecordIds,
  onClearFilters,
}: {
  def: TableDef;
  model?: TableModel;
  onPick?: (p: CellPick) => void;
  selectedKey?: string | null;
  maxHeight?: number;
  highlightRecordIds?: string[];
  onClearFilters?: () => void;
}) {
  const model = useMemo(() => given ?? computeTable(def), [given, def]);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [def.dataSetId, def.mode, def.filters, def.viewParams]);
  if (model.status !== "ok")
    return (
      <StatusBlock
        status={model.status === "unfit" ? "unfit" : model.status}
        message={model.message}
        actions={
          onClearFilters &&
          Object.values(def.filters).some((v) => v?.length) && (
            <Button size="sm" onClick={onClearFilters}>
              清除筛选
            </Button>
          )
        }
      />
    );
  const lm = def.labelMode;
  const mLabel = def.aggregation === "count" ? "COUNT(记录数)" : `SUM(${fieldLabel(def.measure)})`;
  const sel = (k: string) => selectedKey === k;
  const cellCls = (k: string, clickable = true) =>
    cx(
      clickable && onPick && "cursor-pointer hover:bg-brand-50",
      sel(k) && "bg-brand-100! ring-1 ring-inset ring-brand-500",
    );

  if (def.mode === "detail" && model.detailRows) {
    const rows = model.detailRows;
    const ps = def.pageSize;
    const pages = Math.max(1, Math.ceil(rows.length / ps));
    const vis = rows.slice(page * ps, page * ps + ps);
    return (
      <div className="flex flex-col min-h-0">
        <div className="overflow-auto scroll-thin" style={{ maxHeight }}>
          <table className="w-full text-[12.5px] tabular-nums">
            <thead className="sticky top-0 z-[1]">
              <tr>
                {def.columns.map((c) => (
                  <th key={c} className={th}>
                    {fieldLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vis.map((r) => (
                <tr
                  key={r.recordId}
                  onClick={() =>
                    onPick?.({
                      key: r.recordId,
                      label: r.recordId,
                      records: [r],
                      value: r[def.measure] ?? null,
                    })
                  }
                  className={cx(
                    cellCls(r.recordId),
                    highlightRecordIds?.includes(r.recordId) && "bg-amber-50",
                  )}
                >
                  {def.columns.map((c) => (
                    <td key={c} className={cx(td, typeof r[c] === "number" && "text-right")}>
                      {typeof r[c] === "number" || r[c] === null ? (
                        nullText(def, r[c])
                      ) : c === "recordId" ? (
                        <span className="font-mono text-[11px] text-ink-3">{r[c]}</span>
                      ) : (
                        displayValue(c, r[c], lm)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-2.5 h-9 border-t border-line text-[11px] text-ink-3">
          <span>
            共 {rows.length} 条 · {mLabel} = <b className="text-ink">{fmt(model.total)}</b>
          </span>
          <span className="flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              icon={<ChevronLeft className="size-3" />}
            />
            {page + 1} / {pages}
            <Button
              size="xs"
              variant="ghost"
              disabled={page >= pages - 1}
              onClick={() => setPage(page + 1)}
              icon={<ChevronRight className="size-3" />}
            />
          </span>
        </div>
      </div>
    );
  }

  if (def.mode === "grouped" && model.groupedRows) {
    return (
      <div className="overflow-auto scroll-thin" style={{ maxHeight }}>
        <table className="w-full text-[12.5px] tabular-nums">
          <thead className="sticky top-0 z-[1]">
            <tr>
              {def.groupBy.map((g) => (
                <th key={g} className={th}>
                  {fieldLabel(g)}
                </th>
              ))}
              <th className={cx(th, "text-right")}>{mLabel}</th>
              <th className={cx(th, "text-right")}>记录数</th>
            </tr>
          </thead>
          <tbody>
            {model.groupedRows.map((r) => {
              const k = (r.isSubtotal ? "sub|" : "grp|") + kj(r.key);
              return (
                <tr
                  key={k}
                  onClick={() =>
                    onPick?.({ key: k, label: r.label, records: r.records, value: r.value })
                  }
                  className={cx(cellCls(k), r.isSubtotal && "bg-gray-50 font-semibold")}
                >
                  {def.groupBy.map((g, i) => (
                    <td key={g} className={td}>
                      {r.isSubtotal ? (i === 0 ? r.label : "") : displayValue(g, r.key[i], lm)}
                    </td>
                  ))}
                  <td className={cx(td, "text-right font-medium")} data-cell={k}>
                    {nullText(def, r.value)}
                  </td>
                  <td className={cx(td, "text-right text-ink-3")}>{r.count}</td>
                </tr>
              );
            })}
          </tbody>
          {def.showTotals && (
            <tfoot>
              <tr
                className={cx("bg-gray-100 font-semibold", cellCls("grand"))}
                onClick={() =>
                  onPick?.({
                    key: "grand",
                    label: "总计",
                    records: model.records,
                    value: model.total,
                  })
                }
              >
                <td className={td} colSpan={def.groupBy.length}>
                  总计
                </td>
                <td className={cx(td, "text-right")} data-testid="table-total">
                  {nullText(def, model.total)}
                </td>
                <td className={cx(td, "text-right text-ink-3")}>{model.records.length}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  const p = model.pivot!;
  const rd = def.rowDimensions;
  const cd = def.columnDimensions;
  return (
    <div className="overflow-auto scroll-thin" style={{ maxHeight }}>
      <table className="w-full text-[12.5px] tabular-nums border-collapse">
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className={cx(th, "border-r")} colSpan={rd.length}>
              <span className="text-brand-700">{rd.map(fieldLabel).join(" / ")}</span>
              <span className="text-gray-400"> ＼ </span>
              <span className="text-violet-700">{cd.map(fieldLabel).join(" / ")}</span>
            </th>
            {p.colKeys.map((ck) => (
              <th key={kj(ck)} className={cx(th, "text-right")}>
                {ck.map((k, i) => displayValue(cd[i], k, lm)).join(" / ")}
              </th>
            ))}
            {def.showTotals && <th className={cx(th, "text-right bg-gray-100")}>行合计</th>}
          </tr>
        </thead>
        <tbody>
          {p.rowKeys.map((rk) => (
            <tr key={kj(rk)}>
              {rk.map((k, i) => (
                <td
                  key={i}
                  className={cx(
                    td,
                    "font-medium bg-gray-50/60",
                    i === rk.length - 1 && "border-r border-line",
                  )}
                >
                  {displayValue(rd[i], k, lm)}
                </td>
              ))}
              {p.colKeys.map((ck) => {
                const key = kj(rk) + "|" + kj(ck);
                const g = p.cells.get(key);
                const label = `${rk.map((k, i) => displayValue(rd[i], k, lm)).join(" / ")} × ${ck.map((k, i) => displayValue(cd[i], k, lm)).join(" / ")}`;
                return (
                  <td
                    key={key}
                    data-cell={key}
                    onClick={() =>
                      onPick?.({ key, label, records: g?.records ?? [], value: g?.value ?? null })
                    }
                    className={cx(
                      td,
                      "text-right",
                      cellCls(key),
                      highlightRecordIds &&
                        g?.records.some((r) => highlightRecordIds.includes(r.recordId)) &&
                        "bg-amber-50",
                    )}
                  >
                    {nullText(def, g?.value)}
                  </td>
                );
              })}
              {def.showTotals && (
                <td
                  className={cx(
                    td,
                    "text-right font-semibold bg-gray-50",
                    cellCls("row|" + kj(rk)),
                  )}
                  onClick={() =>
                    onPick?.({
                      key: "row|" + kj(rk),
                      label: `${rk.join(" / ")} 行合计`,
                      records: p.rowRecords.get(kj(rk)) ?? [],
                      value: p.rowTotals.get(kj(rk)) ?? null,
                    })
                  }
                >
                  {nullText(def, p.rowTotals.get(kj(rk)))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {def.showTotals && (
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td className={cx(td, "border-r border-line")} colSpan={rd.length}>
                列合计
              </td>
              {p.colKeys.map((ck) => (
                <td
                  key={kj(ck)}
                  className={cx(td, "text-right", cellCls("col|" + kj(ck)))}
                  onClick={() =>
                    onPick?.({
                      key: "col|" + kj(ck),
                      label: `${ck.join(" / ")} 列合计`,
                      records: p.colRecords.get(kj(ck)) ?? [],
                      value: p.colTotals.get(kj(ck)) ?? null,
                    })
                  }
                >
                  {nullText(def, p.colTotals.get(kj(ck)))}
                </td>
              ))}
              <td
                className={cx(td, "text-right text-brand-700", cellCls("grand"))}
                data-testid="table-total"
                onClick={() =>
                  onPick?.({ key: "grand", label: "总计", records: p.records, value: p.grand })
                }
              >
                {nullText(def, p.grand)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const HIDDEN = new Set(["branch"]);
export function RecordsTable({
  records,
  highlightId,
  onRowClick,
  maxHeight,
  columns,
}: {
  records: Rec[];
  highlightId?: string | null;
  onRowClick?: (r: Rec) => void;
  maxHeight?: number;
  columns?: string[];
}) {
  if (!records.length)
    return <div className="text-xs text-ink-3 px-3 py-6 text-center">无源记录</div>;
  const cols =
    columns ??
    Object.keys(records[0]).filter((k) => !HIDDEN.has(k) && k !== "recordId" && k !== "provenance");
  return (
    <div className="overflow-auto scroll-thin" style={{ maxHeight }}>
      <table className="w-full text-[12px] tabular-nums">
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className={th}>记录 ID</th>
            {cols.map((c) => (
              <th key={c} className={th}>
                {fieldLabel(c)}
              </th>
            ))}
            <th className={th}>来源标识</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr
              key={r.recordId}
              onClick={() => onRowClick?.(r)}
              className={cx(
                onRowClick && "cursor-pointer hover:bg-brand-50",
                highlightId === r.recordId && "bg-brand-100",
              )}
            >
              <td className={cx(td, "font-mono text-[11px] text-ink-3")}>{r.recordId}</td>
              {cols.map((c) => (
                <td key={c} className={cx(td, typeof r[c] === "number" && "text-right")}>
                  {r[c] === null ? (
                    <span className="text-ink-3">null</span>
                  ) : typeof r[c] === "boolean" ? (
                    String(r[c])
                  ) : typeof r[c] === "number" ? (
                    fmt(r[c])
                  ) : (
                    String(r[c])
                  )}
                </td>
              ))}
              <td className={td}>
                <span className="font-mono text-[10.5px] text-amber-800 bg-amber-50 px-1 rounded">
                  {r.provenance}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
