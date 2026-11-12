import { useState } from "react";
import { useApp, useUI } from "../store/store";
import type { ChartDef } from "../data/types";
import { latestDef } from "../store/store";
import { computeChart } from "../data/chartModel";
import { getRecords, unitText, unitOf } from "../data/engine";
import { PageHeader } from "../ui/PageHeader";
import { Badge, Button, Card, SaveState, StatusBlock } from "../ui/kit";
import { ChartView } from "../components/ChartView";
import { AssetBlock } from "../components/AssetBlock";
import { RecordsTable } from "../components/TableViews";
import { DeleteModal } from "./AssetCenter";
import { DEFAULT_CONTEXT } from "../data/seed";
import { snapshotFor } from "../data/reports";

export function StatesPage() {
  const assets = useApp((s) => s.assets);
  const go = useUI((s) => s.go);
  const [del, setDel] = useState<string | null>(null);
  const c1 = latestDef<ChartDef>(assets["DEMO-CHART-01"]);
  if (!c1) return null;
  const base: ChartDef = {
    ...c1,
    viewParams: { ...DEFAULT_CONTEXT },
    filters: {},
    dimensions: ["unitId"],
    chartType: "bar",
  };
  const dose: ChartDef = {
    ...base,
    title: "威胁剂量",
    chartType: "line",
    dataSetId: "componentSeries",
    dimensions: ["tick"],
    measure: "value",
    filters: { fieldId: ["casualty/threat_dose"] },
  };
  const spray: ChartDef = { ...dose, filters: { fieldId: ["water_sprayer/is_spraying"] } };
  const dual = latestDef<ChartDef>(assets["DEMO-CHART-03"])!;
  const dualModel = computeChart(dual);
  const items: { title: string; tag: string; tone: any; body: React.ReactNode }[] = [
    { title: "正常", tag: "ok", tone: "green", body: <ChartView def={base} height={180} /> },
    {
      title: "无匹配数据（RUN-A Tick 0）",
      tag: "empty",
      tone: "gray",
      body: (
        <ChartView def={{ ...base, viewParams: { ...DEFAULT_CONTEXT, tick: 0 } }} height={180} />
      ),
    },
    {
      title: "无匹配数据（筛选）",
      tag: "empty",
      tone: "gray",
      body: (
        <ChartView
          def={{ ...base, filters: { unitId: ["U-A"], targetId: ["T-9"] } }}
          onClearFilters={() => go("chart", { assetId: "DEMO-CHART-01" })}
        />
      ),
    },
    {
      title: "数据范围无效（HEAD0 / Tick 2）",
      tag: "invalid",
      tone: "red",
      body: (
        <ChartView
          def={{
            ...base,
            viewParams: { simulationId: "DEMO-LIVE-HEAD0", branch: "main", tick: 2 },
          }}
        />
      ),
    },
    {
      title: "缺少必填参数（Tick 未选择）",
      tag: "invalid",
      tone: "red",
      body: <ChartView def={{ ...base, viewParams: { ...DEFAULT_CONTEXT, tick: null } }} />,
    },
    {
      title: "图型不适配（甘特 × 资源投入）",
      tag: "unfit",
      tone: "amber",
      body: (
        <ChartView
          def={{ ...base, chartType: "gantt" }}
          onAdapt={() => go("chart", { assetId: "DEMO-CHART-01" })}
        />
      ),
    },
    {
      title: "数据不完整：单位为 null",
      tag: "incomplete",
      tone: "amber",
      body: (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[12px]">
            casualty/threat_dose · 单位{" "}
            <Badge tone="amber">{unitText(unitOf("componentSeries", "value", dose.filters))}</Badge>
          </div>
          <ChartView def={dose} height={160} />
        </div>
      ),
    },
    {
      title: "布尔状态字段（不可求和）",
      tag: "unfit",
      tone: "amber",
      body: (
        <div className="space-y-2">
          <ChartView def={spray} />
          <RecordsTable
            records={getRecords("componentSeries").filter(
              (r) => r.fieldId === "water_sprayer/is_spraying",
            )}
            columns={["tick", "entityId", "value"]}
          />
          <div className="text-[11px] text-ink-3">
            值序列 false → true → true：连续为 true 的状态不是多次事件
          </div>
        </div>
      ),
    },
    {
      title: "null 不补零（双轴 Tick 0）",
      tag: "null",
      tone: "gray",
      body: (
        <div>
          <ChartView def={dual} model={dualModel} height={180} />
          <div className="text-[11.5px] text-ink-2 mt-1">
            Tick 0 投入 = {String(dualModel.series[0]?.data[0])}（显示为“无数据（null）”，柱缺失而非
            0）
          </div>
        </div>
      ),
    },
    {
      title: "加载中",
      tag: "loading",
      tone: "gray",
      body: <StatusBlock status="loading" message="正在计算演示数据切片…" />,
    },
    {
      title: "引用失效",
      tag: "missing",
      tone: "red",
      body: (
        <AssetBlock
          kind="chart"
          snapshot={null}
          assetId="DEMO-CHART-99"
          revision={1}
          overrides={{}}
          params={DEFAULT_CONTEXT}
        />
      ),
    },
    {
      title: "历史版本引用（只读快照）",
      tag: "readonly",
      tone: "violet",
      body: (
        <AssetBlock
          kind="chart"
          snapshot={snapshotFor(assets, "DEMO-CHART-01", 3)}
          assetId="DEMO-CHART-01"
          revision={3}
          overrides={{ height: 160 }}
          params={DEFAULT_CONTEXT}
          latestRevision={assets["DEMO-CHART-01"].latest > 3 ? assets["DEMO-CHART-01"].latest : 4}
        />
      ),
    },
    {
      title: "编辑但未保存 / 已保存",
      tag: "dirty",
      tone: "gray",
      body: (
        <div className="space-y-2 p-2">
          <SaveState dirty />
          <br />
          <SaveState dirty={false} />
          <div className="text-[11.5px] text-ink-3">离开带有未保存修改的编辑页时会弹出确认框。</div>
        </div>
      ),
    },
    {
      title: "资产已被引用（删除保护）",
      tag: "referenced",
      tone: "brand",
      body: (
        <div className="p-2 space-y-2">
          <div className="text-[12px] text-ink-2">
            DEMO-CHART-01 被报告模板引用，删除时会列出引用并只提供取消。
          </div>
          <Button size="sm" variant="danger" onClick={() => setDel("DEMO-CHART-01")}>
            尝试删除 DEMO-CHART-01
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader crumbs={[{ label: "组件状态展台" }]} title="组件状态展台（P09）" />
      <div className="flex-1 overflow-auto scroll-thin p-5">
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((it) => (
            <Card key={it.title} title={it.title} actions={<Badge tone={it.tone}>{it.tag}</Badge>}>
              <div className="p-3">{it.body}</div>
            </Card>
          ))}
        </div>
      </div>
      <DeleteModal assetId={del} onClose={() => setDel(null)} />
    </>
  );
}
