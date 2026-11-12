import { useMemo } from "react";
import type { ChartDef, ChartType } from "../data/types";
import { buildOption, chartTypeLabel, computeChart, type ChartModel } from "../data/chartModel";
import { EChart } from "./EChart";
import { Button, StatusBlock } from "../ui/kit";

export interface DatumClick {
  dimension: string;
  value: string;
  series?: { dimension: string; value: string };
}

export function ChartView({
  def,
  model: given,
  height,
  highlightKey,
  onDatum,
  onTask,
  onAdapt,
  onClearFilters,
  onFixContext,
}: {
  def: ChartDef;
  model?: ChartModel;
  height?: number;
  highlightKey?: string | null;
  onDatum?: (d: DatumClick) => void;
  onTask?: (recordId: string) => void;
  onAdapt?: (t: ChartType) => void;
  onClearFilters?: () => void;
  onFixContext?: () => void;
}) {
  const model = useMemo(() => given ?? computeChart(def), [given, def]);
  const option = useMemo(
    () => (model.status === "ok" ? buildOption(def, model, { highlightKey }) : null),
    [def, model, highlightKey],
  );
  const h = height ?? def.style.height;

  if (model.status === "unfit")
    return (
      <StatusBlock
        status="unfit"
        message={
          <>
            {model.message}
            {onAdapt && model.fit.suggestions.length > 0 && <div className="mt-1">可用图型：</div>}
          </>
        }
        actions={
          onAdapt &&
          model.fit.suggestions.slice(0, 5).map((t) => (
            <Button key={t} size="sm" onClick={() => onAdapt(t)}>
              {chartTypeLabel(t)}
            </Button>
          ))
        }
      />
    );
  if (model.status === "invalid")
    return (
      <StatusBlock
        status="invalid"
        message={model.message}
        actions={
          onFixContext && (
            <Button size="sm" onClick={onFixContext}>
              返回有效区间
            </Button>
          )
        }
      />
    );
  if (model.status === "empty")
    return (
      <StatusBlock
        status="empty"
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

  const handle = (p: any) => {
    if (def.chartType === "gantt") {
      if (p.data?.[4]) onTask?.(p.data[4]);
      return;
    }
    if (def.chartType === "sankey") {
      if (p.dataType === "node" && p.data?.dim)
        onDatum?.({ dimension: p.data.dim, value: p.data.key });
      return;
    }
    if (p.componentType !== "series") return;
    const key = model.categories[p.dataIndex];
    if (key === undefined) return;
    const d: DatumClick = { dimension: def.dimensions[0], value: key };
    if (def.dimensions[1] && model.series[p.seriesIndex])
      d.series = { dimension: def.dimensions[1], value: model.series[p.seriesIndex].key };
    onDatum?.(d);
  };
  return <EChart option={option} height={h} onEvent={handle} />;
}
