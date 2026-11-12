import { useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  Save,
  GitBranchPlus,
  FilePlus2,
  Undo2,
  RotateCcw,
  Bookmark,
  Wand2,
  X,
} from "lucide-react";
import { useApp, useUI, latestDef, toast } from "../store/store";
import type { ChartDef, ChartType, DataSetId, Rec } from "../data/types";
import {
  CHART_TYPES,
  DEFAULT_STYLE,
  PALETTES,
  adaptDef,
  computeChart,
  sliceSourceSummary,
} from "../data/chartModel";
import { DATASETS, DATASET_IDS, displayValue, fieldLabel, fmt, unitText } from "../data/engine";
import { PageHeader } from "../ui/PageHeader";
import {
  Badge,
  Button,
  Card,
  Field,
  InlineEdit,
  Modal,
  NumberInput,
  SaveState,
  Section,
  Segmented,
  Select,
  TextInput,
  Toggle,
  cx,
} from "../ui/kit";
import { ChartView, type DatumClick } from "../components/ChartView";
import {
  DataContextBar,
  DimensionPicker,
  FilterBar,
  FilterEditor,
  toggleFilter,
} from "../components/DataControls";
import { RecordsTable } from "../components/TableViews";
import { InsertModal } from "./AssetCenter";
import { useDraft } from "./useDraft";
import { SidePanel } from "../ui/SidePanel";
import { SharedDatasetSelect, MeasureBindingEditor, VariableFilterEditor } from "../components/BindingControls";

const SORTS = [
  { value: "none", label: "默认（分类顺序）" },
  { value: "keyAsc", label: "分类 升序" },
  { value: "keyDesc", label: "分类 降序" },
  { value: "valueAsc", label: "数值 升序" },
  { value: "valueDesc", label: "数值 降序" },
] as const;

export function ChartStudio() {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const assets = useApp((s) => s.assets);
  const views = useApp((s) => s.views);
  const charts = Object.values(assets).filter((a) => a.kind === "chart");
  const assetId =
    params.assetId && assets[params.assetId]?.kind === "chart"
      ? params.assetId
      : charts[0]?.assetId;
  const asset = assetId ? assets[assetId] : undefined;
  const loadedView = params.viewId
    ? views.find((v) => v.id === params.viewId && v.assetId === assetId)
    : undefined;
  const shared = latestDef<ChartDef>(asset);
  const {
    draft: def,
    setDraft,
    dirty,
    markSaved,
    revert,
    load,
  } = useDraft<ChartDef>(loadedView?.state ?? shared, `图表设计器 · ${assetId}`);
  const [preview, setPreview] = useState(false);
  const [publish, setPublish] = useState(false);
  const [note, setNote] = useState("");
  const [viewModal, setViewModal] = useState(false);
  const [viewName, setViewName] = useState(loadedView?.name ?? "我的视图");
  const [insert, setInsert] = useState(false);
  const [focus, setFocus] = useState<{ label: string; records: Rec[] } | null>(null);
  const [task, setTask] = useState<Rec | null>(null);
  const [showRecords, setShowRecords] = useState(true);

  const model = useMemo(() => (def ? computeChart(def) : null), [def]);
  if (!asset || !def || !model)
    return (
      <>
        <PageHeader crumbs={[{ label: "图表设计器" }]} title="图表设计器" />
        <div className="p-10 text-center text-ink-3">暂无图表资产，请在资产中心新建。</div>
      </>
    );
  const set = (p: Partial<ChartDef>) => setDraft({ ...def, ...p });
  const setStyle = (p: Partial<ChartDef["style"]>) =>
    setDraft({ ...def, style: { ...def.style, ...p } });
  const assetViews = views.filter((v) => v.scope === "chart" && v.assetId === assetId);

  const onDatum = (d: DatumClick) => {
    if (d.dimension === "tick") {
      const row = model.summary.find((s) => s.key === d.value);
      setFocus({ label: `${displayValue("tick", d.value)} 数据点`, records: row?.records ?? [] });
      return;
    }
    set({ filters: toggleFilter(def.filters, d.dimension, d.value) });
    setFocus(null);
  };
  const changedDataset = (ds: DataSetId): ChartDef => {
    const m = DATASETS[ds];
    const dims = def.dimensions.filter((d) => m.dims.includes(d));
    return {
      ...def,
      dataSetId: ds,
      dimensions: dims.length
        ? dims
        : [m.dims.find((d) => !["simulationId", "branch"].includes(d)) ?? m.dims[0]],
      measure: m.measures.includes(def.measure) ? def.measure : m.measures[0],
      secondaryMeasure: undefined,
      filters: {},
      measureBinding: undefined,
      variableFilters: undefined,
      datasetRef: undefined,
    };
  };
  const changeDataset = (ds: DataSetId) => setDraft(changedDataset(ds));
  const tasks = model.tasks;
  const pct = (v: number | null) =>
    model.total && v !== null && model.timeMode === "snapshot" && def.aggregation !== "none"
      ? `${Math.round((v / model.total) * 1000) / 10}%`
      : "";

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "组件与资产中心", page: "assets" },
          { label: "图表设计器" },
          { label: asset.assetId },
        ]}
        title={<InlineEdit value={def.title} onCommit={(v) => set({ title: v })} />}
        meta={
          <>
            <Badge tone="brand">共享 r{asset.latest}</Badge>
            {loadedView && <Badge tone="violet">个人视图：{loadedView.name}</Badge>}
            <SaveState dirty={dirty} />
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Undo2 className="size-3.5" />}
              disabled={!dirty}
              onClick={revert}
            >
              撤销修改
            </Button>
            <Button
              icon={preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              onClick={() => setPreview(!preview)}
              active={preview}
            >
              {preview ? "退出预览" : "预览"}
            </Button>
            <Button icon={<Bookmark className="size-3.5" />} onClick={() => setViewModal(true)}>
              保存个人视图
            </Button>
            <Button
              variant="primary"
              icon={<GitBranchPlus className="size-3.5" />}
              onClick={() => setPublish(true)}
            >
              发布共享新版本
            </Button>
            <Button icon={<FilePlus2 className="size-3.5" />} onClick={() => setInsert(true)}>
              使用于报告
            </Button>
          </>
        }
      />
      <div className="flex-1 min-h-0 flex">
        {!preview && (
          <SidePanel id="studioLeft" side="left" title="数据与字段">
            <Section title="图表资产">
              <Select
                value={assetId!}
                onChange={(v) => go("chart", { assetId: v })}
                options={charts.map((c) => ({
                  value: c.assetId,
                  label: `${c.assetId} · ${c.title}`,
                }))}
              />
              {assetViews.length > 0 && (
                <Field label="我的个人视图">
                  <Select
                    placeholder="选择以载入…"
                    value={loadedView?.id ?? null}
                    onChange={(v) => go("chart", { assetId, viewId: v })}
                    options={assetViews.map((v) => ({
                      value: v.id,
                      label: `${v.name}（基于 r${v.baseRevision}）`,
                    }))}
                  />
                </Field>
              )}
            </Section>
            <Section title="数据与范围">
              <SharedDatasetSelect
                value={def.datasetRef}
                sourceKey={def.dataSetId}
                onChange={(ref, src) => (src !== def.dataSetId ? setDraft({ ...changedDataset(src), datasetRef: ref }) : set({ datasetRef: ref }))}
              />
              <Field
                label="演示数据集"
                hint={<span className="font-mono">{sliceSourceSummary(def)}</span>}
              >
                <Select
                  value={def.dataSetId}
                  onChange={changeDataset}
                  options={DATASET_IDS.map((d) => ({
                    value: d,
                    label: `${DATASETS[d].label}（${d}）`,
                  }))}
                />
              </Field>
              <Field label="运行 / 分支 / 时间点">
                <DataContextBar
                  value={def.viewParams}
                  dataSetId={def.dataSetId}
                  onChange={(v) => set({ viewParams: v })}
                />
              </Field>
            </Section>
            <Section title="维度与指标">
              <Field
                label={
                  def.chartType === "sankey"
                    ? "流向维度（按顺序）"
                    : def.chartType === "stacked"
                      ? "维度（X 轴 → 堆叠）"
                      : "维度（第 2 个为系列）"
                }
              >
                <DimensionPicker
                  dataSetId={def.dataSetId}
                  value={def.dimensions}
                  onChange={(v) => set({ dimensions: v })}
                  max={def.chartType === "sankey" ? 3 : 2}
                  exclude={["simulationId", "branch"]}
                />
              </Field>
              <MeasureBindingEditor
                dataSetId={def.dataSetId}
                binding={def.measureBinding}
                onChange={(b) => set({ measureBinding: b })}
                fieldEditor={
                  <>
              <Field label={def.chartType === "dualAxis" ? "左轴指标" : "指标"}>
                <Select
                  value={def.measure}
                  onChange={(v) => set({ measure: v })}
                  options={DATASETS[def.dataSetId].measures.map((m) => ({
                    value: m,
                    label: `${fieldLabel(m)}（${m}）`,
                  }))}
                />
              </Field>
              {def.chartType === "dualAxis" && (
                <Field label="右轴指标">
                  <Select
                    placeholder="选择右轴指标"
                    value={def.secondaryMeasure ?? null}
                    onChange={(v) => set({ secondaryMeasure: v })}
                    options={DATASETS[def.dataSetId].measures
                      .filter((m) => m !== def.measure)
                      .map((m) => ({ value: m, label: fieldLabel(m) }))}
                  />
                </Field>
              )}
              <Field label="聚合方式">
                <Segmented
                  value={def.aggregation}
                  onChange={(v) => set({ aggregation: v })}
                  options={[
                    { value: "sum", label: "SUM 求和" },
                    { value: "count", label: "COUNT 计数" },
                    ...(def.chartType === "gantt"
                      ? [{ value: "none" as const, label: "不聚合" }]
                      : []),
                  ]}
                />
              </Field>
                  </>
                }
              />
              <Field label="排序">
                <Select
                  value={def.sort}
                  onChange={(v) => set({ sort: v })}
                  options={SORTS.map((s) => ({ ...s }))}
                />
              </Field>
            </Section>
            <Section title="筛选条件">
              <VariableFilterEditor dataSetId={def.dataSetId} value={def.variableFilters ?? []} onChange={(v) => set({ variableFilters: v.length ? v : undefined })} />
              <FilterEditor
                dataSetId={def.dataSetId}
                ctx={def.viewParams}
                filters={def.filters}
                onChange={(f) => set({ filters: f })}
                labelMode={def.style.labelMode}
              />
            </Section>
          </SidePanel>
        )}

        <div className="flex-1 min-w-0 overflow-auto scroll-thin p-4 space-y-3">
          <FilterBar
            filters={def.filters}
            onChange={(f) => set({ filters: f })}
            labelMode={def.style.labelMode}
            empty="无筛选条件 · 点击图中柱/节点可添加筛选"
          />
          <Card
            title={
              <>
                {def.title}
                <span className="text-[11px] font-normal text-ink-3">
                  {def.viewParams.simulationId} · Tick {def.viewParams.tick ?? "未选择"} ·{" "}
                  {model.timeMode === "series"
                    ? `趋势（Tick ≤ ${def.viewParams.tick}）`
                    : "时间点快照"}
                </span>
              </>
            }
            actions={
              model.status === "ok" &&
              model.unit !== undefined && (
                <Badge tone={model.unit === null ? "amber" : "gray"}>
                  单位：{unitText(model.unit)}
                </Badge>
              )
            }
          >
            <div className="p-3">
              <ChartView
                def={def}
                model={model}
                highlightKey={def.chartType === "gantt" ? task?.recordId : null}
                onDatum={onDatum}
                onTask={(id) => setTask(tasks?.find((t) => t.recordId === id) ?? null)}
                onAdapt={(t) => setDraft(adaptDef(def, t))}
                onClearFilters={() => set({ filters: {} })}
                onFixContext={() =>
                  set({ viewParams: { simulationId: "DEMO-RUN-A", branch: "main", tick: 2 } })
                }
              />
            </div>
          </Card>

          {model.status === "ok" && (
            <div className="grid grid-cols-[1fr_300px] gap-3">
              <Card
                title={tasks ? "任务明细" : `汇总 · 按${fieldLabel(def.dimensions[0])}`}
                actions={<span className="text-[11px] text-ink-3">点击行添加筛选</span>}
              >
                {tasks ? (
                  <RecordsTable
                    records={tasks}
                    onRowClick={(r) => setTask(r)}
                    highlightId={task?.recordId}
                    columns={[
                      "title",
                      "unitId",
                      "targetId",
                      "startMinute",
                      "endMinute",
                      "progressPercent",
                      "status",
                    ]}
                    maxHeight={260}
                  />
                ) : (
                  <table className="w-full text-[12.5px] tabular-nums">
                    <thead>
                      <tr className="text-[11px] text-ink-3 bg-gray-50">
                        <th className="text-left px-3 h-8 font-semibold">
                          {fieldLabel(def.dimensions[0])}
                        </th>
                        <th className="text-right px-3 font-semibold">
                          {def.aggregation === "count"
                            ? "COUNT"
                            : def.measureBinding?.kind === "expression"
                              ? `ƒ ${def.measureBinding.assetId}@r${def.measureBinding.revision}`
                              : `SUM(${fieldLabel(def.measure)})`}
                        </th>
                        <th className="text-right px-3 font-semibold">占比</th>
                        <th className="text-right px-3 font-semibold">记录数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.summary.map((s) => (
                        <tr
                          key={s.key}
                          className="border-t border-gray-100 hover:bg-brand-50 cursor-pointer"
                          onClick={() => onDatum({ dimension: s.dim, value: s.key })}
                          data-summary={`${s.dim}:${s.key}`}
                        >
                          <td className="px-3 h-8">{s.label}</td>
                          <td className="px-3 text-right font-semibold">
                            {fmt(s.value, "无数据（null）")}
                          </td>
                          <td className="px-3 text-right text-ink-3">{pct(s.value)}</td>
                          <td className="px-3 text-right text-ink-3">{s.count}</td>
                        </tr>
                      ))}
                      {model.summary2.length > 0 &&
                        model.summary2.map((s) => (
                          <tr
                            key={"s2" + s.key}
                            className="border-t border-gray-100 bg-gray-50/50 hover:bg-brand-50 cursor-pointer"
                            onClick={() => onDatum({ dimension: s.dim, value: s.key })}
                          >
                            <td className="px-3 h-8 text-ink-2">
                              <span className="text-[10.5px] text-ink-3 mr-1">
                                {fieldLabel(s.dim)}
                              </span>
                              {s.label}
                            </td>
                            <td className="px-3 text-right font-semibold">{fmt(s.value)}</td>
                            <td className="px-3 text-right text-ink-3">{pct(s.value)}</td>
                            <td className="px-3 text-right text-ink-3">{s.count}</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line bg-gray-100 font-semibold">
                        <td className="px-3 h-8">{model.totalLabel}</td>
                        <td className="px-3 text-right" data-testid="chart-total">
                          {fmt(model.total)}
                        </td>
                        <td className="px-3 text-right text-ink-3">
                          {model.timeMode === "snapshot" ? "100%" : ""}
                        </td>
                        <td className="px-3 text-right text-ink-3">{model.slice.records.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </Card>
              <div className="space-y-3">
                <Card title="指标与来源摘要">
                  <div className="p-3.5 space-y-2.5 text-[12.5px]">
                    <div className="flex justify-between">
                      <span className="text-ink-3">{model.totalLabel}</span>
                      <b className="text-lg tabular-nums">
                        {fmt(model.total)}{" "}
                        <span className="text-[11px] font-normal text-ink-3">
                          {unitText(model.unit)}
                        </span>
                      </b>
                    </div>
                    {model.extra?.map((e) => (
                      <div key={e.label} className="flex justify-between">
                        <span className="text-ink-3">{e.label}</span>
                        <b className="tabular-nums">{e.value}</b>
                      </div>
                    ))}
                    {model.sankey && (
                      <div className="flex justify-between">
                        <span className="text-ink-3">各层流量合计</span>
                        <b className="tabular-nums">
                          {model.sankey.stageTotals.map((t) => fmt(t)).join(" / ")}
                        </b>
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-100 text-[11.5px] text-ink-3 space-y-1">
                      <div>数据集：{sliceSourceSummary(def)}</div>
                      <div>
                        范围：{def.viewParams.simulationId} / {def.viewParams.branch} /{" "}
                        {model.timeMode === "series"
                          ? `Tick ≤ ${def.viewParams.tick}`
                          : `Tick ${def.viewParams.tick}`}
                      </div>
                      <div>
                        源记录：{model.slice.records.length} 条（上下文内 {model.slice.contextCount}{" "}
                        条）
                      </div>
                      {DATASETS[def.dataSetId].note && (
                        <div className="text-amber-800">{DATASETS[def.dataSetId].note}</div>
                      )}
                    </div>
                  </div>
                </Card>
                {task && (
                  <Card
                    title="任务详情"
                    actions={
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<X className="size-3" />}
                        onClick={() => setTask(null)}
                      />
                    }
                  >
                    <div className="p-3.5 text-[12.5px] space-y-1.5">
                      <div className="font-semibold">
                        {task.taskId} {task.title}
                      </div>
                      <div className="text-ink-2">
                        {displayValue("unitId", task.unitId, "both")} →{" "}
                        {displayValue("targetId", task.targetId, "both")}
                      </div>
                      <div>
                        时间：{task.startMinute}–{task.endMinute} 分钟（
                        {task.endMinute - task.startMinute} 分钟）
                      </div>
                      <div className="flex items-center gap-2">
                        进度
                        <div className="flex-1 h-1.5 bg-gray-100 rounded">
                          <div
                            className="h-full bg-brand-600 rounded"
                            style={{ width: `${task.progressPercent}%` }}
                          />
                        </div>
                        <b>{task.progressPercent}%</b>
                      </div>
                      <div>状态：{displayValue("status", task.status)}</div>
                      <div className="font-mono text-[10.5px] text-amber-800">
                        {task.provenance}
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {model.status === "ok" && !tasks && (
            <Card
              title={
                focus ? `源记录 · ${focus.label}` : `源记录（${model.slice.records.length} 条）`
              }
              actions={
                <>
                  {focus && (
                    <Button size="xs" variant="ghost" onClick={() => setFocus(null)}>
                      显示全部
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => setShowRecords(!showRecords)}>
                    {showRecords ? "收起" : "展开"}
                  </Button>
                </>
              }
            >
              {showRecords && (
                <RecordsTable records={focus?.records ?? model.slice.records} maxHeight={240} />
              )}
            </Card>
          )}
        </div>

        {!preview && (
          <SidePanel id="studioRight" side="right" title="图表属性">
            <Section title="图型">
              <div className="grid grid-cols-2 gap-1.5">
                {CHART_TYPES.map((t) => (
                  <button
                    key={t.id}
                    title={t.hint}
                    onClick={() =>
                      set({
                        chartType: t.id as ChartType,
                        aggregation:
                          t.id === "gantt"
                            ? def.aggregation
                            : def.aggregation === "none"
                              ? "sum"
                              : def.aggregation,
                      })
                    }
                    className={cx(
                      "h-8 rounded-md border text-xs font-medium",
                      def.chartType === t.id
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-line text-ink-2 hover:bg-gray-50",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {model.status === "unfit" && (
                <Button
                  size="sm"
                  variant="subtle"
                  className="w-full"
                  icon={<Wand2 className="size-3.5" />}
                  onClick={() => setDraft(adaptDef(def, def.chartType))}
                >
                  按当前图型自动适配字段
                </Button>
              )}
              <div className="text-[11px] text-ink-3">
                {CHART_TYPES.find((t) => t.id === def.chartType)?.hint}
              </div>
            </Section>
            <Section title="图例与标签">
              <Toggle
                label="显示图例"
                checked={def.style.showLegend}
                onChange={(v) => setStyle({ showLegend: v })}
              />
              <Toggle
                label="数据标签"
                checked={def.style.showLabels}
                onChange={(v) => setStyle({ showLabels: v })}
              />
              <Toggle
                label="显示单位"
                checked={def.style.showUnit}
                onChange={(v) => setStyle({ showUnit: v })}
              />
              {(def.chartType === "line" ||
                def.chartType === "area" ||
                def.chartType === "dualAxis") && (
                <Toggle
                  label="平滑曲线"
                  checked={def.style.smooth}
                  onChange={(v) => setStyle({ smooth: v })}
                />
              )}
              <Field label="分类显示">
                <Segmented
                  size="sm"
                  value={def.style.labelMode}
                  onChange={(v) => setStyle({ labelMode: v })}
                  options={[
                    { value: "id", label: "ID" },
                    { value: "name", label: "名称" },
                    { value: "both", label: "ID+名称" },
                  ]}
                />
              </Field>
            </Section>
            <Section title="坐标轴与格式">
              <Field label="X 轴名称">
                <TextInput
                  value={def.style.xAxisName}
                  onChange={(e) => setStyle({ xAxisName: e.target.value })}
                  placeholder="（无）"
                />
              </Field>
              <Field label="数值轴名称">
                <TextInput
                  value={def.style.yAxisName}
                  onChange={(e) => setStyle({ yAxisName: e.target.value })}
                  placeholder="默认使用单位"
                />
              </Field>
              <Field label="图表高度">
                <NumberInput
                  value={def.style.height}
                  min={180}
                  max={560}
                  step={20}
                  onChange={(v) => setStyle({ height: v })}
                  suffix="px"
                />
              </Field>
            </Section>
            <Section title="配色">
              <div className="space-y-1.5">
                {Object.entries(PALETTES).map(([id, p]) => (
                  <button
                    key={id}
                    onClick={() => setStyle({ palette: id as any })}
                    className={cx(
                      "w-full flex items-center gap-2 p-1.5 rounded-md border",
                      def.style.palette === id
                        ? "border-brand-500 bg-brand-50"
                        : "border-line hover:bg-gray-50",
                    )}
                  >
                    <span className="flex">
                      {p.colors.slice(0, 5).map((c) => (
                        <span
                          key={c}
                          className="size-3.5 first:rounded-l last:rounded-r"
                          style={{ background: c }}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-ink-2">{p.label}</span>
                  </button>
                ))}
              </div>
            </Section>
            <div className="p-3.5">
              <Button
                size="sm"
                className="w-full"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => setStyle({ ...DEFAULT_STYLE })}
              >
                恢复默认样式设置
              </Button>
            </div>
          </SidePanel>
        )}
      </div>

      <Modal
        open={publish}
        title={`发布共享新版本：${asset.assetId} r${asset.latest + 1}`}
        onClose={() => setPublish(false)}
        footer={
          <>
            <Button onClick={() => setPublish(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                const rev = useApp.getState().saveRevision(asset.assetId, def, note);
                markSaved();
                setPublish(false);
                setNote("");
                toast(`已发布 ${asset.assetId} r${rev}，资产中心已更新版本`);
              }}
            >
              发布 r{asset.latest + 1}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-brand-50 border border-brand-100 p-3 text-[12.5px] space-y-1">
            <div>
              <b>作用范围：共享资产定义</b>（AssetRevision +1）
            </div>
            <div>· 新插入报告的引用默认使用 r{asset.latest + 1}</div>
            <div>· 现有报告模板节点仍固定引用原版本，可在报告编辑器中手动升级</div>
            <div>· 已生成的报告实例与发布记录保存了资产快照，内容不变</div>
          </div>
          <Field label="版本说明">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：改为按目标汇总"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={viewModal}
        title="保存个人视图"
        onClose={() => setViewModal(false)}
        footer={
          <>
            <Button onClick={() => setViewModal(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!viewName.trim()}
              onClick={() => {
                const v = useApp
                  .getState()
                  .saveView({
                    name: viewName.trim(),
                    scope: "chart",
                    assetId: asset.assetId,
                    baseRevision: asset.latest,
                    state: def,
                  });
                markSaved();
                setViewModal(false);
                toast(`已保存个人视图「${v.name}」，共享资产 r${asset.latest} 未改变`);
                load(def);
              }}
            >
              保存视图
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-violet-50 border border-violet-100 p-3 text-[12.5px]">
            <b>作用范围：仅本地个人视图（ViewState）</b>
            。保存数据范围、维度、筛选和样式；不会创建共享版本，也不影响报告。
          </div>
          <Field label="视图名称">
            <TextInput value={viewName} onChange={(e) => setViewName(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <InsertModal assetId={insert ? asset.assetId : null} onClose={() => setInsert(false)} />
    </>
  );
}
