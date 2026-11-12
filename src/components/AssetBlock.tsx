import { useMemo, useState } from "react";
import { BarChart3, Table2, FileSpreadsheet, AlertTriangle, ChevronDown } from "lucide-react";
import type {
  AssetKind,
  AssetSnapshot,
  ChartDef,
  DataContext,
  FixedDef,
  TableDef,
} from "../data/types";
import { effectiveDef, overrideKeys } from "../data/reports";
import { ChartView } from "./ChartView";
import { AnalysisTableView, RecordsTable, type CellPick } from "./TableViews";
import { SheetTable } from "./FixedSheet";
import { expandFixed } from "../data/fixedModel";
import { Badge, StatusBlock, cx } from "../ui/kit";
import { chartTypeLabel, computeChart } from "../data/chartModel";
import { fmt } from "../data/engine";

export const KIND_ICON: Record<AssetKind, any> = {
  chart: BarChart3,
  table: Table2,
  fixed: FileSpreadsheet,
  report: FileSpreadsheet,
};
export const KIND_SHORT: Record<string, string> = {
  chart: "共享图表",
  table: "分析表",
  fixed: "固定表",
  report: "报告模板",
};

export function AssetBlock({
  kind,
  snapshot,
  assetId,
  revision,
  overrides,
  params,
  selected,
  latestRevision,
  chrome = true,
  nodeId,
  interactive = true,
}: {
  kind: AssetKind;
  snapshot: AssetSnapshot | null;
  assetId: string;
  revision: number;
  overrides: Record<string, any>;
  params: DataContext;
  selected?: boolean;
  latestRevision?: number;
  chrome?: boolean;
  nodeId?: string;
  interactive?: boolean;
}) {
  const Icon = KIND_ICON[kind];
  const ov = overrideKeys(overrides).filter((k) => k !== "caption");
  const eff = useMemo(
    () => (snapshot ? effectiveDef(kind, snapshot.def, overrides, params) : null),
    [snapshot, kind, overrides, params],
  );
  const [pick, setPick] = useState<CellPick | null>(null);
  const align = overrides?.align ?? "center";
  const width = overrides?.width ?? 100;

  let body: React.ReactNode;
  let foot: string | null = null;
  if (!snapshot || !eff) {
    body = (
      <StatusBlock
        status="missing"
        compact
        message={`缺失资产 ${assetId} r${revision}：该资产或版本不存在。可在右侧面板替换引用。`}
      />
    );
  } else if (kind === "chart") {
    const d = eff as ChartDef;
    const m = computeChart(d);
    body = (
      <ChartView def={d} model={m} height={overrides?.height ?? Math.min(d.style.height, 280)} />
    );
    if (m.status === "ok")
      foot = `${chartTypeLabel(d.chartType)} · ${m.totalLabel} ${fmt(m.total)}${m.extra ? " · " + m.extra.map((e) => `${e.label} ${e.value}`).join(" · ") : ""}`;
  } else if (kind === "table") {
    const d = eff as TableDef;
    body = (
      <div>
        <AnalysisTableView
          def={d}
          maxHeight={overrides?.height ?? 260}
          onPick={interactive ? setPick : undefined}
          selectedKey={pick?.key}
        />
        {pick && (
          <div className="mt-2 border border-line rounded-md">
            <div className="flex justify-between items-center px-2.5 h-7 text-[11px] bg-gray-50 border-b border-line">
              <span>
                下钻：{pick.label} = <b>{fmt(pick.value)}</b>（{pick.records.length} 条源记录）
              </span>
              <button className="text-brand-600" onClick={() => setPick(null)}>
                收起
              </button>
            </div>
            <RecordsTable records={pick.records} maxHeight={140} />
          </div>
        )}
      </div>
    );
  } else {
    const d = eff as FixedDef;
    const ex = expandFixed(d);
    const scale = Math.min(1, 640 / d.colWidths.reduce((a, b) => a + b, 0));
    const rows = ex.rows.slice(0, overrides?.maxRows ?? 18);
    body = (
      <div className="overflow-hidden flex justify-center">
        <div style={{ zoom: scale } as any}>
          <SheetTable rows={rows} colWidths={d.colWidths} />
        </div>
      </div>
    );
    foot = `固定表填数预览 · ${ex.rows.length} 行${ex.rows.length > rows.length ? `（显示前 ${rows.length} 行）` : ""}`;
  }

  return (
    <div
      data-asset-node={nodeId}
      className={cx(
        "my-3 rounded-lg bg-white not-prose",
        chrome ? "border border-line" : "",
        selected && "ring-2 ring-brand-500",
      )}
      style={{
        width: `${width}%`,
        marginLeft: align === "left" ? 0 : "auto",
        marginRight: align === "right" ? 0 : "auto",
      }}
    >
      {chrome && (
        <div className="flex items-center gap-2 px-3 h-9 border-b border-line bg-gray-50/70 rounded-t-lg">
          <Icon className="size-3.5 text-brand-600" />
          <span className="text-[12.5px] font-semibold text-ink truncate">
            {snapshot?.title ?? assetId}
          </span>
          <Badge tone="brand">{KIND_SHORT[kind]}</Badge>
          <span className="font-mono text-[10.5px] text-ink-3">
            {assetId} · r{revision}
          </span>
          {latestRevision !== undefined && latestRevision > revision && (
            <Badge tone="amber" title="共享资产已有更新版本，此处仍固定引用旧版本">
              <AlertTriangle className="size-3" />
              最新 r{latestRevision}
            </Badge>
          )}
          <span className="flex-1" />
          {ov.length > 0 && <Badge tone="violet">仅此处覆盖：{ov.length} 项</Badge>}
          <ChevronDown className="size-3.5 text-ink-3 hidden" />
        </div>
      )}
      <div className="p-3">{body}</div>
      {(foot || overrides?.caption) && (
        <div className="px-3 pb-2.5 -mt-1 text-[11.5px] text-ink-3 text-center">
          {overrides?.caption ? <span className="text-ink-2">{overrides.caption}</span> : null}
          {overrides?.caption && foot ? " · " : ""}
          {foot}
        </div>
      )}
    </div>
  );
}
