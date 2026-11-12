import { useMemo, useState } from "react";
import { Bookmark, BarChart3, Table2, X, Filter } from "lucide-react";
import { useApp, useUI, latestDef, toast } from "../store/store";
import type { ChartDef, DataContext, Filters, TableDef } from "../data/types";
import { computeChart } from "../data/chartModel";
import { computeTable } from "../data/tableModel";
import { computeVariables, displayValue, fieldLabel, fmt, resolveSlice } from "../data/engine";
import { PageHeader } from "../ui/PageHeader";
import { Badge, Button, Card, Field, Kpi, Modal, Segmented, Select, TextInput } from "../ui/kit";
import { ChartView } from "../components/ChartView";
import { AnalysisTableView, RecordsTable, type CellPick } from "../components/TableViews";
import { DataContextBar, FilterBar, toggleFilter } from "../components/DataControls";
import { DEFAULT_CONTEXT } from "../data/seed";

interface WSState {
  ctx: DataContext;
  viewMode: "unitId" | "targetId";
  filters: Filters;
  chartType: "bar" | "hbar";
}
const DEFAULT_WS: WSState = {
  ctx: { ...DEFAULT_CONTEXT },
  viewMode: "unitId",
  filters: {},
  chartType: "bar",
};

export function Workspace() {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const assets = useApp((s) => s.assets);
  const views = useApp((s) => s.views).filter((v) => v.scope === "workspace");
  const loaded = params.viewId ? views.find((v) => v.id === params.viewId) : undefined;
  const [st, setSt] = useState<WSState>(loaded?.state ?? DEFAULT_WS);
  const [pick, setPick] = useState<CellPick | null>(null);
  const [hlRecord, setHlRecord] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState(loaded?.name ?? "分析视图 · RUN-A Tick 2");

  const chartBase = latestDef<ChartDef>(assets["DEMO-CHART-01"]);
  const tableBase = latestDef<TableDef>(assets["DEMO-TABLE-02"]);
  const chartDef = useMemo<ChartDef | null>(
    () =>
      chartBase
        ? {
            ...chartBase,
            chartType: st.chartType,
            dataSetId: "resourceInput",
            measure: "demo_amount",
            aggregation: "sum",
            viewParams: st.ctx,
            dimensions: [st.viewMode],
            filters: st.filters,
            title: `资源投入 · 按${fieldLabel(st.viewMode)}`,
          }
        : null,
    [chartBase, st],
  );
  const tableDef = useMemo<TableDef | null>(
    () =>
      tableBase ? { ...tableBase, mode: "pivot", viewParams: st.ctx, filters: st.filters } : null,
    [tableBase, st],
  );
  const chartModel = useMemo(() => (chartDef ? computeChart(chartDef) : null), [chartDef]);
  const tableModel = useMemo(() => (tableDef ? computeTable(tableDef) : null), [tableDef]);
  const slice = useMemo(() => resolveSlice("resourceInput", st.ctx, st.filters), [st]);
  const vars = useMemo(() => computeVariables(st.ctx, { filters: st.filters }), [st]);
  const set = (p: Partial<WSState>) => {
    setSt({ ...st, ...p });
    setPick(null);
  };
  const hlRec = slice.records.find((r) => r.recordId === hlRecord);
  const unitFiltered = (st.filters.unitId?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "分析视图" }]}
        title="分析视图 · 资源投入"
        meta={loaded && <Badge tone="violet">个人视图：{loaded.name}</Badge>}
        actions={
          <>
            {views.length > 0 && (
              <Select
                className="w-56"
                placeholder="载入个人视图…"
                value={loaded?.id ?? null}
                onChange={(v) => go("workspace", { viewId: v })}
                options={views.map((v) => ({ value: v.id, label: v.name }))}
              />
            )}
            <Button
              icon={<Bookmark className="size-3.5" />}
              variant="primary"
              onClick={() => setSaveOpen(true)}
            >
              保存个人视图
            </Button>
          </>
        }
      />
      <div className="shrink-0 bg-white border-b border-line px-5 h-12 flex items-center gap-4">
        <span className="text-[11px] text-ink-3 font-medium">数据范围</span>
        <DataContextBar compact value={st.ctx} onChange={(ctx) => set({ ctx })} />
        <span className="w-px h-6 bg-line" />
        <span className="text-[11px] text-ink-3 font-medium">统计视角</span>
        <Segmented
          value={st.viewMode}
          onChange={(v) => set({ viewMode: v })}
          options={[
            { value: "unitId", label: "按单位" },
            { value: "targetId", label: "按目标" },
          ]}
        />
        <Segmented
          size="sm"
          value={st.chartType}
          onChange={(v) => set({ chartType: v })}
          options={[
            { value: "bar", label: "柱状" },
            { value: "hbar", label: "条形" },
          ]}
        />
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={<BarChart3 className="size-3.5" />}
          onClick={() => go("chart", { assetId: "DEMO-CHART-01" })}
        >
          编辑图表定义
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Table2 className="size-3.5" />}
          onClick={() => go("table", { assetId: "DEMO-TABLE-02" })}
        >
          编辑透视表定义
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto scroll-thin p-4 space-y-3">
        <FilterBar
          filters={st.filters}
          onChange={(f) => set({ filters: f })}
          empty="无筛选 · 点击图中的柱可生成筛选条件"
        />
        <div className="grid grid-cols-4 gap-3">
          <Kpi
            tone="brand"
            label="资源投入合计"
            value={slice.status === "ok" ? fmt(vars.resourceInputTotal as number) : "—"}
            unit="演示量"
            hint={`${st.ctx.simulationId} · Tick ${st.ctx.tick ?? "—"}${Object.keys(st.filters).length ? " · 已筛选" : ""}`}
          />
          <Kpi
            label="源记录条数"
            value={slice.records.length}
            unit="条"
            hint="resourceInput · SEED_EXACT"
          />
          <Kpi
            label="累计转移人数"
            value={
              vars.transferredTotal === null
                ? "—"
                : `${vars.transferredTotal} / ${vars.transferTarget}`
            }
            unit="人（合成）"
            hint={unitFiltered ? "单位筛选不适用于转移数据" : "按目标筛选生效"}
          />
          <Kpi
            label="转移完成率"
            value={vars.completionPercent === null ? "—" : `${vars.completionPercent}%`}
            hint="同一时间点累计值，不跨 Tick 相加"
          />
        </div>
        <div className="grid grid-cols-[1.15fr_1fr] gap-3">
          <Card
            title={chartDef?.title}
            actions={
              <span className="text-[11px] text-ink-3">
                DEMO-CHART-01 r{assets["DEMO-CHART-01"]?.latest} · 点击图元筛选
              </span>
            }
          >
            <div className="p-3">
              {chartDef && chartModel && (
                <ChartView
                  def={chartDef}
                  model={chartModel}
                  height={260}
                  highlightKey={hlRec ? String(hlRec[st.viewMode]) : null}
                  onDatum={(d) => set({ filters: toggleFilter(st.filters, d.dimension, d.value) })}
                  onClearFilters={() => set({ filters: {} })}
                  onFixContext={() => set({ ctx: { ...DEFAULT_CONTEXT } })}
                />
              )}
              {chartModel?.status === "ok" && (
                <div
                  className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2"
                  data-testid="ws-chart-values"
                >
                  {chartModel.summary.map((s) => (
                    <span key={s.key}>
                      {s.label} = <b className="tabular-nums">{fmt(s.value)}</b>
                    </span>
                  ))}
                  <span>
                    合计 = <b className="tabular-nums">{fmt(chartModel.total)}</b>
                  </span>
                </div>
              )}
            </div>
          </Card>
          <Card
            title="单位 × 目标 透视"
            actions={
              <span className="text-[11px] text-ink-3">
                DEMO-TABLE-02 r{assets["DEMO-TABLE-02"]?.latest} · 点击单元格下钻
              </span>
            }
          >
            <div className="p-3 space-y-2">
              {tableDef && tableModel && (
                <AnalysisTableView
                  def={tableDef}
                  model={tableModel}
                  onPick={setPick}
                  selectedKey={pick?.key}
                  highlightRecordIds={hlRecord ? [hlRecord] : undefined}
                  onClearFilters={() => set({ filters: {} })}
                />
              )}
              {pick && (
                <div className="flex items-center gap-2 text-[12px] bg-brand-50 border border-brand-100 rounded-md px-2.5 py-1.5">
                  <span className="flex-1">
                    下钻：<b>{pick.label}</b> = {fmt(pick.value)}（{pick.records.length}{" "}
                    条源记录，已在明细中高亮）
                  </span>
                  {pick.records.length > 0 &&
                    pick.key.includes("|") &&
                    !pick.key.startsWith("row") &&
                    !pick.key.startsWith("col") && (
                      <Button
                        size="xs"
                        icon={<Filter className="size-3" />}
                        onClick={() => {
                          const r = pick.records[0];
                          set({
                            filters: { ...st.filters, unitId: [r.unitId], targetId: [r.targetId] },
                          });
                        }}
                      >
                        设为筛选
                      </Button>
                    )}
                  <button onClick={() => setPick(null)}>
                    <X className="size-3.5 text-ink-3" />
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
        <Card
          title={`来源明细（${slice.records.length} 条）`}
          actions={
            <span className="text-[11px] text-ink-3">
              点击明细行高亮对应图元{" "}
              {hlRecord && (
                <button className="text-brand-600 ml-2" onClick={() => setHlRecord(null)}>
                  取消高亮
                </button>
              )}
            </span>
          }
        >
          {slice.status === "ok" ? (
            <RecordsTable
              records={
                pick
                  ? slice.records
                      .filter((r) => pick.records.some((p) => p.recordId === r.recordId))
                      .concat(
                        slice.records.filter(
                          (r) => !pick.records.some((p) => p.recordId === r.recordId),
                        ),
                      )
                  : slice.records
              }
              highlightId={
                hlRecord ?? (pick?.records.length === 1 ? pick.records[0].recordId : null)
              }
              onRowClick={(r) => setHlRecord(r.recordId === hlRecord ? null : r.recordId)}
              maxHeight={260}
            />
          ) : (
            <div className="p-6 text-center text-xs text-ink-3">{slice.message}</div>
          )}
          {hlRec && (
            <div className="px-3.5 py-2 border-t border-line text-[12px] text-ink-2">
              已高亮：{hlRec.recordId} · {displayValue("unitId", hlRec.unitId)} →{" "}
              {displayValue("targetId", hlRec.targetId)} = {fmt(hlRec.demo_amount)}（图中对应「
              {displayValue(st.viewMode, hlRec[st.viewMode])}」）
            </div>
          )}
        </Card>
      </div>
      <Modal
        open={saveOpen}
        title="保存个人视图"
        onClose={() => setSaveOpen(false)}
        footer={
          <>
            <Button onClick={() => setSaveOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                const v = useApp
                  .getState()
                  .saveView({ name: name.trim(), scope: "workspace", state: st });
                setSaveOpen(false);
                toast(`已保存个人视图「${v.name}」`);
                go("workspace", { viewId: v.id });
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-violet-50 border border-violet-100 p-3 text-[12.5px]">
            保存：数据范围 {st.ctx.simulationId} / Tick {st.ctx.tick}、统计视角「
            {fieldLabel(st.viewMode)}」、{Object.keys(st.filters).length} 个筛选条件与图型。
            <b>不改变共享图表或表格。</b>
          </div>
          <Field label="视图名称">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
