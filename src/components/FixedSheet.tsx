import type { CellStyle, FixedDef } from "../data/types";
import { paginate, type ExpRow, type Expanded } from "../data/fixedModel";
import { cx } from "../ui/kit";

export const STYLE_CLS: Record<CellStyle, string> = {
  title: "text-[18px] font-bold text-ink",
  info: "text-[12px] text-ink-2",
  section: "bg-gray-100 text-[12.5px] font-semibold text-ink border border-gray-300",
  header: "bg-[#EEF2FF] text-[12px] font-semibold text-ink border border-gray-300",
  body: "text-[12px] text-ink border border-gray-300",
  summary: "bg-gray-50 text-[12px] font-semibold text-ink border border-gray-300",
  note: "text-[11px] text-ink-3",
};
export const STYLE_LABEL: Record<CellStyle, string> = {
  title: "标题",
  info: "信息",
  section: "分节",
  header: "表头",
  body: "正文",
  summary: "汇总",
  note: "备注",
};

export function SheetTable({
  rows,
  colWidths,
  onCell,
  selected,
}: {
  rows: ExpRow[];
  colWidths: number[];
  onCell?: (srcKey: string) => void;
  selected?: string | null;
}) {
  const coveredByOwner = new Set<string>();
  rows.forEach((row, i) =>
    row.cells.forEach((cell, c) => {
      if (!cell) return;
      for (let dr = 0; dr < cell.rs && i + dr < rows.length; dr++)
        for (let dc = 0; dc < cell.cs; dc++)
          if (dr || dc) coveredByOwner.add(`${i + dr}:${c + dc}`);
    }),
  );
  return (
    <table
      className="border-collapse table-fixed"
      style={{ width: colWidths.reduce((a, b) => a + b, 0) }}
    >
      <colgroup>
        {colWidths.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ height: row.height }} className={cx(row.repeated && "opacity-95")}>
            {row.cells.map((cell, c) => {
              if (cell === null) return coveredByOwner.has(`${i}:${c}`) ? null : <td key={c} />;
              if (cell === undefined) return <td key={c} />;
              const rs = Math.min(cell.rs, rows.length - i);
              return (
                <td
                  key={c}
                  rowSpan={rs}
                  colSpan={cell.cs}
                  onClick={() => onCell?.(cell.srcKey)}
                  className={cx(
                    "px-1.5 py-1 align-middle break-words whitespace-pre-wrap leading-[18px]",
                    STYLE_CLS[cell.style],
                    cell.isBinding && "tabular-nums",
                    cell.isEmptyMsg && "text-ink-3 italic",
                    cell.error && "text-red-700! bg-red-50!",
                    onCell && "cursor-pointer",
                    selected === cell.srcKey &&
                      "outline outline-2 outline-brand-500 -outline-offset-2",
                  )}
                  style={{ textAlign: cell.align, fontWeight: cell.bold ? 600 : undefined }}
                >
                  {cell.text}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PagedPreview({
  def,
  expanded,
  zoom,
  maxPages,
}: {
  def: FixedDef;
  expanded: Expanded;
  zoom: number;
  maxPages?: number;
}) {
  const pg = paginate(def, expanded);
  const total = pg.pages.length;
  const shown = maxPages ? pg.pages.slice(0, maxPages) : pg.pages;
  return (
    <div className="flex flex-col items-center gap-6">
      {pg.overflow && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          表格总宽 {Math.round(pg.tableW)}px 超出版心 {Math.round(pg.contentW)}px，预览已等比缩放至{" "}
          {Math.round(pg.scale * 100)}%
        </div>
      )}
      {shown.map((p) => (
        <div
          key={p.index}
          style={{ width: pg.pageW * zoom, height: pg.pageH * zoom }}
          className="relative shrink-0"
        >
          <div
            className="absolute top-0 left-0 bg-white shadow-[0_2px_8px_rgba(16,24,40,.12)] border border-gray-200 origin-top-left"
            style={{
              width: pg.pageW,
              height: pg.pageH,
              transform: `scale(${zoom})`,
              padding: pg.margin,
            }}
          >
            <div className="absolute top-2 right-3 text-[9px] font-semibold text-amber-700 tracking-wider">
              DEMO / 演示预览
            </div>
            <div
              className="absolute inset-0 pointer-events-none border-dashed border-sky-200"
              style={{ margin: pg.margin - 1, borderWidth: 1 }}
            />
            <div style={{ transform: `scale(${pg.scale})`, transformOrigin: "top left" }}>
              <SheetTable rows={p.rows} colWidths={def.colWidths} />
            </div>
            {def.pageNumbering.show && (
              <div
                className="absolute left-0 right-0 text-center text-[11px] text-ink-3"
                style={{ bottom: pg.margin / 2 }}
              >
                {def.pageNumbering.format
                  .replace("{page}", String(p.index))
                  .replace("{pages}", String(total))}{" "}
                · 共 {total} 页
              </div>
            )}
          </div>
        </div>
      ))}
      {maxPages && total > maxPages && (
        <div className="text-xs text-ink-3">其余 {total - maxPages} 页省略</div>
      )}
    </div>
  );
}
