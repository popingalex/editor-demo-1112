import type { ChartDef, ChartType, DataSetId, Rec, PaletteId } from "./types";
import {
  DATASETS,
  DEMO,
  aggregate,
  displayValue,
  fieldLabel,
  fmt,
  measureValue,
  resolveSlice,
  sortGroups,
  unitOf,
  unitText,
  type Slice,
} from "./engine";
import { defaultEnv, type Env } from "./registry";
import { prepareMeasure, revalue } from "./measure";

export const CHART_TYPES: { id: ChartType; label: string; hint: string }[] = [
  { id: "bar", label: "柱状图", hint: "1–2 个维度 + 数值指标" },
  { id: "hbar", label: "横向条形", hint: "1–2 个维度 + 数值指标" },
  { id: "line", label: "折线图", hint: "时间点或分类 + 指标" },
  { id: "area", label: "面积图", hint: "时间点或分类 + 指标" },
  { id: "stacked", label: "堆叠柱状", hint: "恰好 2 个维度（X 轴 + 堆叠）" },
  { id: "dualAxis", label: "双轴图", hint: "1 个维度 + 2 个不同单位指标" },
  { id: "sankey", label: "桑基图", hint: "≥2 个分类维度，描述流向" },
  { id: "gantt", label: "任务甘特", hint: "需要开始/结束时间字段" },
];
export const chartTypeLabel = (t: ChartType) => CHART_TYPES.find((c) => c.id === t)?.label ?? t;

export const PALETTES: Record<PaletteId, { label: string; colors: string[] }> = {
  default: {
    label: "标准",
    colors: ["#3B5BDB", "#12B886", "#F08C00", "#E03131", "#7048E8", "#1098AD"],
  },
  ocean: {
    label: "海蓝",
    colors: ["#1864AB", "#4DABF7", "#0B7285", "#66D9E8", "#364FC7", "#91A7FF"],
  },
  warm: {
    label: "暖色",
    colors: ["#D9480F", "#F59F00", "#C2255C", "#FFA94D", "#E8590C", "#FAB005"],
  },
  mono: {
    label: "灰阶",
    colors: ["#343A40", "#868E96", "#495057", "#ADB5BD", "#212529", "#CED4DA"],
  },
};

export const DEFAULT_STYLE = {
  showLegend: true,
  showLabels: true,
  showUnit: true,
  palette: "default" as PaletteId,
  labelMode: "id" as const,
  smooth: false,
  height: 300,
  xAxisName: "",
  yAxisName: "",
};

export interface Fit {
  ok: boolean;
  message?: string;
  suggestions: ChartType[];
}

const categoricalDims = (ds: DataSetId) =>
  DATASETS[ds].dims.filter((d) => !["simulationId", "branch", "tick"].includes(d));

function typePossible(ds: DataSetId, t: ChartType): boolean {
  const m = DATASETS[ds];
  switch (t) {
    case "gantt":
      return ds === "taskSchedule";
    case "sankey":
      return (
        categoricalDims(ds).filter((d) => !["title", "taskId", "note", "sequence"].includes(d))
          .length >= 2
      );
    case "stacked":
      return m.dims.length >= 2 && categoricalDims(ds).length >= 1;
    case "dualAxis":
      return m.measures.length >= 2;
    default:
      return true;
  }
}

export function checkFit(def: ChartDef): Fit {
  const m = DATASETS[def.dataSetId];
  const suggestions = CHART_TYPES.map((c) => c.id).filter(
    (t) => t !== def.chartType && typePossible(def.dataSetId, t),
  );
  const fail = (message: string): Fit => ({ ok: false, message, suggestions });
  const bad = def.dimensions.filter((d) => !m.dims.includes(d));
  if (bad.length) return fail(`数据集“${m.label}”中不存在维度：${bad.map(fieldLabel).join("、")}`);
  if (def.chartType !== "gantt" && def.aggregation !== "count" && !m.measures.includes(def.measure))
    return fail(`数据集“${m.label}”中不存在指标：${fieldLabel(def.measure)}`);
  if (def.dataSetId === "componentSeries" && def.chartType !== "gantt") {
    const fid = def.filters.fieldId ?? [];
    if (fid.length !== 1)
      return fail("属性状态样例包含不同字段，请先在筛选中选择单一“属性字段”，避免混合不同字段求和");
    const field = DEMO.fields.find((f: any) => f.id === fid[0]);
    if (field?.type === "boolean" && def.aggregation !== "count")
      return fail(
        "布尔字段（正在喷水）不能求和：连续为 true 的状态不是多次事件。请改用 COUNT 或明细表查看",
      );
  }
  switch (def.chartType) {
    case "bar":
    case "hbar":
    case "line":
    case "area":
      if (def.dimensions.length < 1 || def.dimensions.length > 2)
        return fail("该图型需要 1–2 个维度（第 2 个维度作为系列）");
      break;
    case "stacked":
      if (def.dimensions.length !== 2)
        return fail("堆叠柱状需要恰好 2 个维度：X 轴维度 + 堆叠维度（如 单位 + 资源类别）");
      break;
    case "dualAxis":
      if (m.measures.length < 2)
        return fail(`双轴图需要两个数值指标，数据集“${m.label}”只有一个指标`);
      if (
        !def.secondaryMeasure ||
        !m.measures.includes(def.secondaryMeasure) ||
        def.secondaryMeasure === def.measure
      )
        return fail("双轴图需要选择与主指标不同的“右轴指标”");
      if (def.dimensions.length !== 1) return fail("双轴图需要恰好 1 个维度（通常为时间点）");
      break;
    case "sankey":
      if (def.dimensions.length < 2)
        return fail("桑基图至少需要 2 个分类维度来描述流向（如 单位 → 资源类别 → 目标）");
      if (def.dimensions.includes("tick"))
        return fail("桑基图维度不应包含时间点：流向应在同一时间点内计算");
      break;
    case "gantt":
      if (def.dataSetId !== "taskSchedule")
        return fail(`甘特图需要开始/结束时间字段，数据集“${m.label}”不包含 startMinute/endMinute`);
      break;
  }
  return { ok: true, suggestions };
}

/** Produce a reasonable configuration of `type` for the dataset (used by “一键适配”). */
export function adaptDef(def: ChartDef, type: ChartType, ds: DataSetId = def.dataSetId): ChartDef {
  const m = DATASETS[ds];
  const cats = categoricalDims(ds).filter(
    (d) => !["title", "taskId", "note", "sequence"].includes(d),
  );
  const next: ChartDef = { ...def, chartType: type, dataSetId: ds };
  if (!m.measures.includes(next.measure)) next.measure = m.measures[0];
  if (next.aggregation === "none" && type !== "gantt") next.aggregation = "sum";
  next.dimensions = next.dimensions.filter((d) => m.dims.includes(d));
  switch (type) {
    case "gantt":
      next.dataSetId = "taskSchedule";
      next.dimensions = ["taskId"];
      next.measure = "progressPercent";
      next.aggregation = "none";
      break;
    case "sankey":
      next.dimensions = next.dimensions.filter((d) => d !== "tick" && cats.includes(d));
      for (const d of ds === "resourceSplit" ? ["unitId", "resourceCategory", "targetId"] : cats)
        if (
          next.dimensions.length < (ds === "resourceSplit" ? 3 : 2) &&
          !next.dimensions.includes(d)
        )
          next.dimensions.push(d);
      break;
    case "stacked": {
      const first = next.dimensions[0] ?? cats[0] ?? m.dims[0];
      const second =
        next.dimensions.find((d) => d !== first) ??
        (ds === "resourceSplit" ? "resourceCategory" : (cats.find((d) => d !== first) ?? "tick"));
      next.dimensions = [first, second];
      break;
    }
    case "dualAxis":
      next.dimensions = [m.dims.includes("tick") ? "tick" : (cats[0] ?? m.dims[0])];
      next.measure = m.measures[0];
      next.secondaryMeasure = m.measures.find((x) => x === "completionPercent") ?? m.measures[1];
      break;
    default:
      if (!next.dimensions.length) next.dimensions = [cats[0] ?? m.dims[0]];
      if (next.dimensions.length > 2) next.dimensions = next.dimensions.slice(0, 2);
  }
  if (ds === "componentSeries")
    next.filters = {
      ...next.filters,
      fieldId: next.filters.fieldId?.length === 1 ? next.filters.fieldId : ["casualty/threat_dose"],
    };
  return next;
}

export interface SummaryRow {
  dim: string;
  key: string;
  label: string;
  value: number | null;
  count: number;
  records: Rec[];
}
export interface ChartModel {
  status: "ok" | "empty" | "invalid" | "unfit";
  message?: string;
  fit: Fit;
  slice: Slice;
  timeMode: "snapshot" | "series";
  unit: string | null;
  unit2: string | null;
  categories: string[];
  series: {
    key: string;
    name: string;
    data: (number | null)[];
    axis?: "left" | "right";
    kind?: "bar" | "line";
  }[];
  total: number | null;
  totalLabel: string;
  summary: SummaryRow[];
  summary2: SummaryRow[];
  sankey?: {
    nodes: { name: string; dim: string; key: string; value: number }[];
    links: { source: string; target: string; value: number }[];
    stageTotals: number[];
  };
  tasks?: Rec[];
  extra?: { label: string; value: string }[];
}

export function computeChart(def: ChartDef, env: Env = defaultEnv()): ChartModel {
  const fit = checkFit(def);
  const timeMode: "snapshot" | "series" = def.dimensions.includes("tick") ? "series" : "snapshot";
  const M = prepareMeasure(def, env);
  const ctxTick = M.params.tick;
  const slice = resolveSlice(def.dataSetId, M.params, M.filters, timeMode, env.data);
  const unit = M.unit;
  const base: ChartModel = {
    status: "ok",
    fit,
    slice,
    timeMode,
    unit,
    unit2: def.secondaryMeasure ? unitOf(def.dataSetId, def.secondaryMeasure) : null,
    categories: [],
    series: [],
    total: null,
    totalLabel: "合计",
    summary: [],
    summary2: [],
  };
  if (!fit.ok) return { ...base, status: "unfit", message: fit.message };
  if (M.setupError) return { ...base, status: "invalid", message: M.setupError.message };
  if (slice.status !== "ok") return { ...base, status: slice.status, message: slice.message };
  const recs = slice.records;
  // A formula error in any group surfaces as an explicit invalid state, never as a blank value.
  const done = (m: ChartModel): ChartModel => {
    const e = M.error();
    return e ? { ...base, status: "invalid", message: `表达式求值错误（${e.code}）：${e.message}` } : m;
  };
  const lm = def.style.labelMode;
  const agg = def.aggregation;

  if (def.chartType === "gantt") {
    const tasks = [...recs].sort((a, b) => a.startMinute - b.startMinute);
    const avg = tasks.length
      ? Math.round(tasks.reduce((s, t) => s + t.progressPercent, 0) / tasks.length)
      : null;
    return {
      ...base,
      tasks,
      total: avg,
      totalLabel: "平均进度 %",
      unit: "%",
      extra: [
        { label: "任务数", value: String(tasks.length) },
        { label: "已完成", value: String(tasks.filter((t) => t.status === "done").length) },
        {
          label: "时间跨度",
          value: tasks.length
            ? `${Math.min(...tasks.map((t) => t.startMinute))}–${Math.max(...tasks.map((t) => t.endMinute))} 分钟`
            : "—",
        },
      ],
    };
  }

  // In series mode, totals are taken at the selected tick only (snapshot values are not summed across ticks).
  const snapshotRecs =
    timeMode === "series" ? recs.filter((r) => r.tick === ctxTick) : recs;
  const total = M.value(snapshotRecs);
  const totalLabel = timeMode === "series" ? `Tick ${ctxTick} 当前值` : "合计";
  const toRows = (dim: string, sort = def.sort): SummaryRow[] =>
    sortGroups(
      revalue(
        aggregate(
          timeMode === "series" && dim !== "tick" ? snapshotRecs : recs,
          [dim],
          def.measure,
          agg,
        ),
        M,
      ),
      sort,
    ).map((g) => ({
      dim,
      key: g.key[0],
      label: displayValue(dim, g.key[0], lm),
      value: g.value,
      count: g.count,
      records: g.records,
    }));

  const summary = toRows(def.dimensions[0]);
  const summary2 = def.dimensions[1] ? toRows(def.dimensions[1], "keyAsc") : [];
  let extra: { label: string; value: string }[] | undefined;
  if (def.dataSetId === "transferProgress") {
    const t = measureValue(snapshotRecs, "transferredCount", "sum");
    const g = measureValue(snapshotRecs, "targetCount", "sum");
    extra = [
      { label: `Tick ${ctxTick} 累计转移`, value: `${fmt(t)} / ${fmt(g)}` },
      { label: "完成率", value: t !== null && g ? `${Math.round((t / g) * 1000) / 10}%` : "—" },
    ];
  }

  if (def.chartType === "sankey") {
    const dims = def.dimensions;
    const nodes = new Map<string, { name: string; dim: string; key: string; value: number }>();
    const links: { source: string; target: string; value: number }[] = [];
    const stageTotals: number[] = [];
    dims.forEach((d) => {
      const gs = revalue(aggregate(recs, [d], def.measure, agg), M);
      stageTotals.push(gs.reduce((s, g) => s + (g.value ?? 0), 0));
      gs.forEach((g) =>
        nodes.set(`${d}:${g.key[0]}`, {
          name: `${d}:${g.key[0]}`,
          dim: d,
          key: g.key[0],
          value: g.value ?? 0,
        }),
      );
    });
    for (let i = 0; i < dims.length - 1; i++) {
      revalue(aggregate(recs, [dims[i], dims[i + 1]], def.measure, agg), M).forEach((g) => {
        if ((g.value ?? 0) > 0)
          links.push({
            source: `${dims[i]}:${g.key[0]}`,
            target: `${dims[i + 1]}:${g.key[1]}`,
            value: g.value ?? 0,
          });
      });
    }
    return done({
      ...base,
      summary,
      summary2,
      total,
      totalLabel,
      extra,
      sankey: { nodes: [...nodes.values()], links, stageTotals },
    });
  }

  const xDim = def.dimensions[0];
  const categories = summary.map((s) => s.key);
  let series: ChartModel["series"] = [];
  if (def.chartType === "dualAxis") {
    const secondary = def.secondaryMeasure!;
    const g1 = new Map(revalue(aggregate(recs, [xDim], def.measure, agg), M).map((g) => [g.key[0], g.value]));
    const g2 = new Map(aggregate(recs, [xDim], secondary, "sum").map((g) => [g.key[0], g.value]));
    series = [
      {
        key: def.measure,
        name: `${fieldLabel(def.measure)}（${unitText(base.unit)}）`,
        data: categories.map((c) => g1.get(c) ?? null),
        axis: "left",
        kind: "bar",
      },
      {
        key: secondary,
        name: `${fieldLabel(secondary)}（${unitText(base.unit2)}）`,
        data: categories.map((c) => g2.get(c) ?? null),
        axis: "right",
        kind: "line",
      },
    ];
  } else if (def.dimensions.length === 2) {
    const sDim = def.dimensions[1];
    const cells = new Map(
      revalue(aggregate(recs, [xDim, sDim], def.measure, agg), M).map((g) => [g.key.join("|"), g.value]),
    );
    series = summary2.map((s) => ({
      key: s.key,
      name: s.label,
      data: categories.map((c) => cells.get(`${c}|${s.key}`) ?? null),
    }));
  } else {
    series = [
      {
        key: def.measure,
        name: M.isExpression ? M.label.replace(/（.*）$/, "") : `${agg === "count" ? "记录数" : fieldLabel(def.measure)}`,
        data: summary.map((s) => s.value),
      },
    ];
  }
  return done({ ...base, categories, series, summary, summary2, total, totalLabel, extra });
}

/* ---------- ECharts option ---------- */

const AXIS = {
  axisLine: { lineStyle: { color: "#D0D5DD" } },
  axisTick: { show: false },
  axisLabel: { color: "#475467", fontSize: 11 },
  splitLine: { lineStyle: { color: "#EEF0F3" } },
  nameTextStyle: { color: "#667085", fontSize: 11 },
};

export interface OptionOpts {
  highlightKey?: string | null;
  compact?: boolean;
}

export function buildOption(def: ChartDef, model: ChartModel, opts: OptionOpts = {}): any {
  const colors = PALETTES[def.style.palette]?.colors ?? PALETTES.default.colors;
  const lm = def.style.labelMode;
  const st = def.style;
  const unitSuffix = st.showUnit ? `（${unitText(model.unit)}）` : "";
  const baseOpt = {
    color: colors,
    animationDuration: 300,
    textStyle: { fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif' },
    grid: {
      left: 12,
      right: def.chartType === "dualAxis" ? 16 : 20,
      top: st.showLegend ? 40 : 20,
      bottom: 12,
      containLabel: true,
    },
    legend: st.showLegend
      ? {
          top: 4,
          right: 0,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: "#475467", fontSize: 11 },
        }
      : { show: false },
  };

  if (def.chartType === "gantt" && model.tasks) {
    const tasks = model.tasks;
    const statusColor: Record<string, string> = {
      done: colors[1],
      in_progress: colors[0],
      planned: "#98A2B3",
    };
    return {
      ...baseOpt,
      legend: { show: false },
      grid: { left: 12, right: 24, top: 16, bottom: 12, containLabel: true },
      tooltip: {
        formatter: (p: any) => {
          const t = tasks[p.data[0]];
          return `<b>${t.taskId} ${t.title}</b><br/>${t.unitId} → ${t.targetId}<br/>${t.startMinute}–${t.endMinute} 分钟 · 进度 ${t.progressPercent}%<br/>状态：${displayValue("status", t.status)}`;
        },
      },
      xAxis: {
        type: "value",
        min: 0,
        name: "分钟",
        ...AXIS,
        splitLine: { lineStyle: { color: "#EEF0F3", type: "dashed" } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: tasks.map((t) => `${t.taskId} ${t.title}`),
        ...AXIS,
      },
      series: [
        {
          type: "custom",
          encode: { x: [1, 2], y: 0 },
          data: tasks.map((t, i) => [i, t.startMinute, t.endMinute, t.progressPercent, t.recordId]),
          renderItem: (_params: any, api: any) => {
            const idx = api.value(0);
            const start = api.coord([api.value(1), idx]);
            const end = api.coord([api.value(2), idx]);
            const h = api.size([0, 1])[1] * 0.5;
            const w = end[0] - start[0];
            const prog = api.value(3) / 100;
            const t = tasks[idx];
            const dim = opts.highlightKey && opts.highlightKey !== t.recordId;
            const c = statusColor[t.status] ?? colors[0];
            return {
              type: "group",
              children: [
                {
                  type: "rect",
                  shape: { x: start[0], y: start[1] - h / 2, width: w, height: h, r: 3 },
                  style: { fill: c, opacity: dim ? 0.12 : 0.22 },
                },
                {
                  type: "rect",
                  shape: { x: start[0], y: start[1] - h / 2, width: w * prog, height: h, r: 3 },
                  style: { fill: c, opacity: dim ? 0.3 : 1 },
                },
                ...(st.showLabels
                  ? [
                      {
                        type: "text",
                        style: {
                          x: end[0] + 6,
                          y: start[1],
                          text: `${t.progressPercent}%`,
                          fill: "#475467",
                          fontSize: 11,
                          verticalAlign: "middle",
                        },
                      },
                    ]
                  : []),
              ],
            };
          },
        },
      ],
    };
  }

  if (def.chartType === "sankey" && model.sankey) {
    const sk = model.sankey;
    return {
      ...baseOpt,
      legend: { show: false },
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const lab = (n: string) => {
            const [d, ...k] = n.split(":");
            return displayValue(d, k.join(":"), lm);
          };
          if (p.dataType === "edge")
            return `${lab(p.data.source)} → ${lab(p.data.target)}<br/><b>${fmt(p.data.value)}</b> ${unitText(model.unit)}`;
          return `${fieldLabel(p.data.dim)}：${lab(p.data.name)}<br/><b>${fmt(p.data.value)}</b> ${unitText(model.unit)}`;
        },
      },
      series: [
        {
          type: "sankey",
          left: 8,
          right: 110,
          top: 12,
          bottom: 12,
          nodeWidth: 14,
          nodeGap: 14,
          emphasis: { focus: "adjacency" },
          data: sk.nodes.map((n, i) => ({ ...n, itemStyle: { color: colors[i % colors.length] } })),
          links: sk.links,
          lineStyle: { color: "gradient", opacity: 0.35, curveness: 0.5 },
          label: {
            color: "#344054",
            fontSize: 11,
            formatter: (p: any) =>
              `${displayValue(p.data.dim, p.data.key, lm)}${st.showLabels ? `  ${fmt(p.data.value)}` : ""}`,
          },
        },
      ],
    };
  }

  const xDim = def.dimensions[0];
  const catLabels = model.categories.map((c) => displayValue(xDim, c, lm));
  const hl = opts.highlightKey;
  const horizontal = def.chartType === "hbar";
  const isLine = def.chartType === "line" || def.chartType === "area";
  const labelCfg = (pos: string) => ({
    show: st.showLabels,
    position: pos,
    fontSize: 11,
    color: "#344054",
    formatter: (p: any) =>
      p.value === null || p.value === undefined || (Array.isArray(p.value) && p.value[1] == null)
        ? ""
        : fmt(Array.isArray(p.value) ? p.value[1] : p.value),
  });
  const dataItems = (data: (number | null)[]) =>
    data.map((v, i) => ({
      value: v,
      itemStyle:
        hl && model.categories[i] !== hl
          ? { opacity: 0.25 }
          : hl
            ? { borderColor: "#101828", borderWidth: 1.5 }
            : undefined,
    }));

  const catAxis = {
    type: "category",
    data: catLabels,
    name: st.xAxisName || "",
    ...AXIS,
    axisLine: { lineStyle: { color: "#D0D5DD" } },
    splitLine: { show: false },
  };
  const valAxis = (name: string, extra: any = {}) => ({ type: "value", name, ...AXIS, ...extra });
  const tooltip = {
    trigger: "axis",
    axisPointer: { type: isLine ? "line" : "shadow" },
    valueFormatter: (v: any) => (v === null || v === undefined ? "无数据（null）" : fmt(v)),
  };

  if (def.chartType === "dualAxis") {
    return {
      ...baseOpt,
      tooltip,
      xAxis: catAxis,
      yAxis: [
        valAxis(st.showUnit ? unitText(model.unit) : "", { position: "left" }),
        valAxis(st.showUnit ? unitText(model.unit2) : "", {
          position: "right",
          splitLine: { show: false },
          max: model.unit2 === "%" ? 100 : undefined,
        }),
      ],
      series: model.series.map((s, i) => ({
        name: s.name,
        type: s.kind,
        yAxisIndex: s.axis === "right" ? 1 : 0,
        data: dataItems(s.data),
        barMaxWidth: 36,
        smooth: st.smooth,
        connectNulls: false,
        symbolSize: 7,
        label: {
          ...labelCfg("top"),
          formatter: (p: any) =>
            p.value == null
              ? ""
              : `${fmt(p.value)}${s.axis === "right" && model.unit2 === "%" ? "%" : ""}`,
        },
        itemStyle: { color: colors[i], borderRadius: s.kind === "bar" ? [3, 3, 0, 0] : undefined },
      })),
    };
  }

  const yName = st.yAxisName || (st.showUnit ? unitText(model.unit) : "");
  return {
    ...baseOpt,
    tooltip,
    xAxis: horizontal ? valAxis(yName) : catAxis,
    yAxis: horizontal ? { ...catAxis, inverse: true } : valAxis(yName),
    series: model.series.map((s) => ({
      name: model.series.length > 1 ? s.name : `${s.name}${unitSuffix}`,
      type: isLine ? "line" : "bar",
      stack: def.chartType === "stacked" ? "total" : undefined,
      data: dataItems(s.data),
      smooth: st.smooth,
      connectNulls: false,
      symbolSize: 7,
      areaStyle: def.chartType === "area" ? { opacity: 0.18 } : undefined,
      barMaxWidth: 44,
      itemStyle: {
        borderRadius: def.chartType === "stacked" ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
      },
      label: labelCfg(def.chartType === "stacked" ? "inside" : horizontal ? "right" : "top"),
      emphasis: { focus: "series" },
    })),
  };
}

export const sliceSourceSummary = (def: ChartDef) => {
  const m = DATASETS[def.dataSetId];
  return `${m.label}（${def.dataSetId} · ${m.source}）`;
};
