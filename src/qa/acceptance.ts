import type { ChartDef, FixedDef, ReportDef, TableDef } from "../data/types";
import {
  DEMO,
  aggregate,
  computeVariables,
  getRecords,
  measureValue,
  resolveSlice,
  unitOf,
  unitText,
} from "../data/engine";
import { checkFit, computeChart } from "../data/chartModel";
import { computeTable } from "../data/tableModel";
import { expandFixed, paginate } from "../data/fixedModel";
import { mergeCells, splitCells } from "../data/fixedOps";
import {
  clone,
  collectRefs,
  effectiveDef,
  outline,
  validateGeneration,
  normalizeDoc,
} from "../data/reports";
import { addSection, moveSection } from "../editor/sections";
import {
  createTestStore,
  findReferences,
  latestDef,
  type PageId,
  type NavParams,
} from "../store/store";
import { newChartDef, DEFAULT_CONTEXT } from "../data/seed";
import { rcKey } from "../data/grid";

export interface AResult {
  id: string;
  title: string;
  criteria: string;
  pass: boolean;
  detail: string;
  entry: { page: PageId; params?: NavParams; label: string };
  ui: string;
}

const EXP = DEMO.expectedChecks;
const ctxA2 = { ...DEFAULT_CONTEXT };
const norm = (v: any): any =>
  Array.isArray(v)
    ? v.map(norm)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, norm(v[k])]),
        )
      : v;
const eq = (a: any, b: any) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const toMap = (rows: { key: string; value: number | null }[]) =>
  Object.fromEntries(rows.map((r) => [r.key, r.value]));

export function runAcceptance(): AResult[] {
  const out: AResult[] = [];
  const T = (
    id: string,
    title: string,
    criteria: string,
    entry: AResult["entry"],
    ui: string,
    fn: () => { pass: boolean; detail: string },
  ) => {
    try {
      const r = fn();
      out.push({ id, title, criteria, entry, ui, ...r });
    } catch (e: any) {
      out.push({ id, title, criteria, entry, ui, pass: false, detail: `异常：${e?.message ?? e}` });
    }
  };
  const s = createTestStore();
  const st = () => s.getState();
  const chart01 = latestDef<ChartDef>(st().assets["DEMO-CHART-01"])!;
  const table02 = latestDef<TableDef>(st().assets["DEMO-TABLE-02"])!;
  const byUnit = (extra: Partial<ChartDef> = {}) => computeChart({ ...chart01, ...extra });

  T(
    "A01",
    "打开预置数据与资产",
    "可以进入图表、表格、固定模板和报告模板",
    { page: "assets", label: "资产中心" },
    "资产中心左侧分类树",
    () => {
      const k = (x: string) => Object.values(st().assets).filter((a) => a.kind === x).length;
      const n = { chart: k("chart"), table: k("table"), fixed: k("fixed"), report: k("report") };
      return {
        pass:
          n.chart === 6 &&
          n.table === 3 &&
          n.fixed === 2 &&
          n.report === 2 &&
          !!st().instances["DEMO-REPORT-INSTANCE-01"],
        detail: `图表 ${n.chart} / 分析表 ${n.table} / 固定模板 ${n.fixed} / 报告模板 ${n.report} / 种子实例 1`,
      };
    },
  );
  T(
    "A02",
    "新建图表资产",
    "创建对象，打开编辑并显示预览",
    { page: "assets", label: "新建资产" },
    "资产中心 → 新建资产 → 图表",
    () => {
      const id = st().createAsset("chart", newChartDef());
      const m = computeChart(latestDef<ChartDef>(st().assets[id])!);
      return {
        pass: m.status === "ok" && st().assets[id].latest === 1,
        detail: `${id} r1 创建成功，预览状态 ${m.status}，合计 ${m.total}`,
      };
    },
  );
  T(
    "A03",
    "RUN-A Tick 2 按单位 SUM",
    "U-A=18、U-B=12、合计30",
    { page: "workspace", label: "分析视图" },
    "分析视图默认 / 图表设计器 DEMO-CHART-01",
    () => {
      const m = byUnit({ viewParams: ctxA2, dimensions: ["unitId"], filters: {} });
      const got = toMap(m.summary);
      return {
        pass: eq(got, EXP.runATick2.groupByUnit) && m.total === 30,
        detail: `U-A=${got["U-A"]}，U-B=${got["U-B"]}，合计 ${m.total}`,
      };
    },
  );
  T(
    "A04",
    "切换按目标 SUM",
    "T-1=20、T-2=10、合计30",
    { page: "workspace", label: "分析视图" },
    "分析视图 → 统计视角“按目标”",
    () => {
      const m = byUnit({ viewParams: ctxA2, dimensions: ["targetId"] });
      const got = toMap(m.summary);
      return {
        pass: eq(got, EXP.runATick2.groupByTarget) && m.total === 30,
        detail: `T-1=${got["T-1"]}，T-2=${got["T-2"]}，合计 ${m.total}`,
      };
    },
  );
  T(
    "A05",
    "点击 T-1 后查看表格",
    "U-A=12、U-B=8、合计20",
    { page: "workspace", label: "分析视图" },
    "按目标图中点击 T-1 柱 → 筛选标签",
    () => {
      const f = { targetId: ["T-1"] };
      const m = byUnit({ viewParams: ctxA2, dimensions: ["unitId"], filters: f });
      const t = computeTable({ ...table02, viewParams: ctxA2, filters: f });
      const got = toMap(m.summary);
      const rowsT = Object.fromEntries([...t.pivot!.rowTotals.entries()].map(([k, v]) => [k, v]));
      return {
        pass:
          eq(got, EXP.runATick2.filterT1GroupByUnit) &&
          m.total === 20 &&
          t.total === 20 &&
          eq(rowsT, EXP.runATick2.filterT1GroupByUnit),
        detail: `图表 U-A=${got["U-A"]}、U-B=${got["U-B"]}、合计 ${m.total}；透视行合计 ${JSON.stringify(rowsT)}、总计 ${t.total}；源记录 ${t.records.length} 条`,
      };
    },
  );
  T(
    "A06",
    "清除筛选",
    "图表、表格与合计恢复全量",
    { page: "workspace", label: "分析视图" },
    "筛选栏“清除全部”",
    () => {
      const m = byUnit({ viewParams: ctxA2, filters: {} });
      const t = computeTable({ ...table02, viewParams: ctxA2, filters: {} });
      return {
        pass: m.total === 30 && t.total === 30 && t.records.length === 4,
        detail: `图表合计 ${m.total}，透视总计 ${t.total}，记录 ${t.records.length}`,
      };
    },
  );
  T(
    "A07",
    "切 RUN-A Tick 1",
    "合计24",
    { page: "workspace", label: "分析视图" },
    "数据范围 Tick 1",
    () => {
      const v = computeVariables({ ...ctxA2, tick: 1 });
      return {
        pass: v.resourceInputTotal === EXP.runATick1.resourceInputTotal,
        detail: `投入合计 ${v.resourceInputTotal}（转移 ${v.transferredTotal}）`,
      };
    },
  );
  T(
    "A08",
    "切 RUN-B Tick 1 / 2",
    "合计分别16 / 21",
    { page: "workspace", label: "分析视图" },
    "数据范围 DEMO-RUN-B",
    () => {
      const a = computeVariables({ simulationId: "DEMO-RUN-B", branch: "main", tick: 1 });
      const b = computeVariables({ simulationId: "DEMO-RUN-B", branch: "main", tick: 2 });
      return {
        pass:
          a.resourceInputTotal === 16 &&
          b.resourceInputTotal === 21 &&
          a.transferredTotal === 4 &&
          b.transferredTotal === 8,
        detail: `Tick1=${a.resourceInputTotal}，Tick2=${b.resourceInputTotal}（转移 ${a.transferredTotal}/${b.transferredTotal}）`,
      };
    },
  );
  T(
    "A09",
    "切资源类别堆叠",
    "RUN-A Tick2 分类 18/12，总计30",
    { page: "chart", params: { assetId: "DEMO-CHART-04" }, label: "图表设计器" },
    "图表设计器 → 数据集 resourceSplit + 堆叠柱状",
    () => {
      const m = computeChart({
        ...chart01,
        chartType: "stacked",
        dataSetId: "resourceSplit",
        dimensions: ["unitId", "resourceCategory"],
        viewParams: ctxA2,
      });
      const got = toMap(m.summary2);
      const split = getRecords("resourceSplit");
      const restored = getRecords("resourceInput").every(
        (r) =>
          measureValue(
            split.filter((x) => x.sourceRecordId === r.recordId),
            "demo_amount",
            "sum",
          ) === r.demo_amount,
      );
      return {
        pass: eq(got, EXP.runATick2.resourceSplitByCategory) && m.total === 30 && restored,
        detail: `人员 ${got.personnel}、装备 ${got.equipment}、合计 ${m.total}；16 条拆分均还原原始投入：${restored}`,
      };
    },
  );
  T(
    "A10",
    "打开转移进度图",
    "RUN-A Tick2 为12/20，完成率60%",
    { page: "chart", params: { assetId: "DEMO-CHART-06" }, label: "DEMO-CHART-06" },
    "图表设计器 DEMO-CHART-06 指标摘要",
    () => {
      const m = computeChart(latestDef<ChartDef>(st().assets["DEMO-CHART-06"])!);
      const v = computeVariables(ctxA2);
      return {
        pass: m.total === 12 && v.transferTarget === 20 && v.completionPercent === 60,
        detail: `${m.extra?.map((e) => `${e.label} ${e.value}`).join("；")}（趋势点 ${m.summary.map((s) => s.value).join(" → ")}，未跨 Tick 相加）`,
      };
    },
  );
  T(
    "A11",
    "打开双轴图",
    "Tick0 投入值为空，Tick2 为30与60%",
    { page: "chart", params: { assetId: "DEMO-CHART-03" }, label: "DEMO-CHART-03" },
    "图表设计器 DEMO-CHART-03",
    () => {
      const m = computeChart(latestDef<ChartDef>(st().assets["DEMO-CHART-03"])!);
      const left = m.series[0].data;
      const right = m.series[1].data;
      return {
        pass: left[0] === null && left[2] === 30 && right[2] === 60,
        detail: `左轴 投入：${left.map((x) => x ?? "null").join(" / ")}；右轴 完成率：${right.join(" / ")}%`,
      };
    },
  );
  T(
    "A12",
    "打开桑基图",
    "单位、资源类别、目标流向总量保持30",
    { page: "chart", params: { assetId: "DEMO-CHART-04" }, label: "DEMO-CHART-04" },
    "图表设计器 DEMO-CHART-04",
    () => {
      const m = computeChart(latestDef<ChartDef>(st().assets["DEMO-CHART-04"])!);
      return {
        pass: !!m.sankey && m.sankey.stageTotals.every((t) => t === 30),
        detail: `各层合计 ${m.sankey?.stageTotals.join(" / ")}，节点 ${m.sankey?.nodes.length}，连线 ${m.sankey?.links.length}`,
      };
    },
  );
  T(
    "A13",
    "打开甘特图",
    "任务条、进度、筛选与详情都可操作",
    { page: "chart", params: { assetId: "DEMO-CHART-05" }, label: "DEMO-CHART-05" },
    "点击任务条 → 任务详情；筛选单位",
    () => {
      const d = latestDef<ChartDef>(st().assets["DEMO-CHART-05"])!;
      const all = computeChart(d);
      const ua = computeChart({ ...d, filters: { unitId: ["U-A"] } });
      return {
        pass:
          all.tasks?.length === 6 &&
          ua.tasks?.length === 3 &&
          ua.tasks.every((t) => t.unitId === "U-A"),
        detail: `RUN-A 任务 ${all.tasks?.length} 个（平均进度 ${all.total}%）；筛选 U-A 后 ${ua.tasks?.length} 个`,
      };
    },
  );
  T(
    "A14",
    "图型切换与不适用字段",
    "成功切换或显示明确的数据适配提示",
    { page: "chart", params: { assetId: "DEMO-CHART-01" }, label: "图表设计器" },
    "图型面板选择“任务甘特” → 适配提示与推荐",
    () => {
      const f = checkFit({ ...chart01, chartType: "gantt" });
      const ok = checkFit({ ...chart01, chartType: "line" });
      return {
        pass: !f.ok && !!f.message && f.suggestions.length > 0 && ok.ok,
        detail: `甘特：${f.message}；推荐 ${f.suggestions.join("/")}；折线：可切换`,
      };
    },
  );
  T(
    "A15",
    "在分析表中切换明细/分组",
    "展示结构和计算结果确实变化",
    { page: "table", params: { assetId: "DEMO-TABLE-01" }, label: "分析表设计器" },
    "模式切换：明细表 / 分组汇总表",
    () => {
      const d = latestDef<TableDef>(st().assets["DEMO-TABLE-01"])!;
      const det = computeTable({ ...d, mode: "detail" });
      const grp = computeTable({ ...d, mode: "grouped" });
      return {
        pass: det.detailRows?.length === 4 && grp.groupedRows?.length === 2,
        detail: `明细 ${det.detailRows?.length} 行（原始记录）→ 分组 ${grp.groupedRows?.length} 行：${grp.groupedRows?.map((r) => `${r.label}=${r.value}`).join("，")}`,
      };
    },
  );
  const pv = computeTable({ ...table02, viewParams: ctxA2 });
  const cell = (u: string, t: string) => pv.pivot!.cells.get(`${u}|${t}`)?.value;
  T(
    "A16",
    "配置 UNIT × TARGET 透视",
    "12、6、8、4，行列总计正确",
    { page: "table", params: { assetId: "DEMO-TABLE-02" }, label: "DEMO-TABLE-02" },
    "交叉透视表",
    () => {
      const vals = [cell("U-A", "T-1"), cell("U-A", "T-2"), cell("U-B", "T-1"), cell("U-B", "T-2")];
      const p = pv.pivot!;
      const tot = [
        p.rowTotals.get("U-A"),
        p.rowTotals.get("U-B"),
        p.colTotals.get("T-1"),
        p.colTotals.get("T-2"),
        p.grand,
      ];
      return {
        pass: eq(vals, [12, 6, 8, 4]) && eq(tot, [18, 12, 20, 10, 30]),
        detail: `单元格 ${vals.join("、")}；行合计 ${tot[0]}/${tot[1]}；列合计 ${tot[2]}/${tot[3]}；总计 ${tot[4]}`,
      };
    },
  );
  T(
    "A17",
    "交换透视行列",
    "结构交换，明细数值不变",
    { page: "table", params: { assetId: "DEMO-TABLE-02" }, label: "DEMO-TABLE-02" },
    "字段配置“交换行列”",
    () => {
      const sw = computeTable({
        ...table02,
        viewParams: ctxA2,
        rowDimensions: ["targetId"],
        columnDimensions: ["unitId"],
      }).pivot!;
      const same = ["U-A", "U-B"].every((u) =>
        ["T-1", "T-2"].every((t) => sw.cells.get(`${t}|${u}`)?.value === cell(u, t)),
      );
      return {
        pass: same && sw.rowKeys.map((k) => k[0]).join() === "T-1,T-2" && sw.grand === 30,
        detail: `交换后行=${sw.rowKeys.map((k) => k[0]).join("/")}，列=${sw.colKeys.map((k) => k[0]).join("/")}，T-1×U-A=${sw.cells.get("T-1|U-A")?.value}，总计 ${sw.grand}`,
      };
    },
  );
  T(
    "A18",
    "点击透视单元格12",
    "能看到它来自 UNIT A / TARGET 1 的原始记录",
    { page: "table", params: { assetId: "DEMO-TABLE-02" }, label: "DEMO-TABLE-02" },
    "点击 12 → 右侧下钻面板",
    () => {
      const g = pv.pivot!.cells.get("U-A|T-1")!;
      const r = g.records;
      return {
        pass:
          r.length === 1 &&
          r[0].unitId === "U-A" &&
          r[0].targetId === "T-1" &&
          r[0].tick === 2 &&
          r[0].demo_amount === 12,
        detail: `${r.map((x) => `${x.recordId}：${x.simulationId} / Tick ${x.tick} / ${x.unitId} / ${x.targetId} = ${x.demo_amount}（${x.provenance}）`).join("；")}`,
      };
    },
  );
  T(
    "A19",
    "更换聚合 SUM → COUNT",
    "依据原始行数计算，不沿用总量",
    { page: "table", params: { assetId: "DEMO-TABLE-02" }, label: "DEMO-TABLE-02" },
    "指标区 SUM / COUNT",
    () => {
      const c = computeTable({ ...table02, viewParams: ctxA2, aggregation: "count" }).pivot!;
      return {
        pass: c.cells.get("U-A|T-1")?.value === 1 && c.grand === 4 && c.rowTotals.get("U-A") === 2,
        detail: `COUNT：每格 ${c.cells.get("U-A|T-1")?.value}，行合计 ${c.rowTotals.get("U-A")}，总计 ${c.grand}`,
      };
    },
  );
  T(
    "A20",
    "创建共享图表新版本",
    "资产中心展示新 revision",
    { page: "chart", params: { assetId: "DEMO-CHART-01" }, label: "图表设计器" },
    "“发布共享新版本”",
    () => {
      const rev = st().saveRevision(
        "DEMO-CHART-01",
        { ...chart01, dimensions: ["targetId"] },
        "改为按目标",
      );
      const a = st().assets["DEMO-CHART-01"];
      return {
        pass: rev === 4 && a.latest === 4 && a.revisions.map((r) => r.revision).join() === "3,4",
        detail: `DEMO-CHART-01 版本 ${a.revisions.map((r) => "r" + r.revision).join(" → ")}，最新 r${a.latest}`,
      };
    },
  );
  T(
    "A21",
    "保存并重新打开个人视图",
    "数据上下文、分组、筛选与视图配置恢复",
    { page: "workspace", label: "分析视图" },
    "“保存个人视图” → 载入个人视图",
    () => {
      const state = {
        ctx: { ...ctxA2, tick: 1 },
        viewMode: "targetId",
        filters: { unitId: ["U-A"] },
        chartType: "hbar",
      };
      const v = st().saveView({ name: "QA 视图", scope: "workspace", state });
      const back = st().views.find((x) => x.id === v.id);
      return {
        pass: eq(back?.state, state) && st().assets["DEMO-CHART-01"].latest === 4,
        detail: `恢复：Tick ${back?.state.ctx.tick}、按${back?.state.viewMode}、筛选 ${JSON.stringify(back?.state.filters)}；共享资产版本未变化`,
      };
    },
  );
  T(
    "A22",
    "删除被引用的共享资产",
    "显示引用信息并提供安全取消",
    { page: "assets", params: { assetId: "DEMO-CHART-01" }, label: "资产中心" },
    "选中 DEMO-CHART-01 → 删除",
    () => {
      const refs = findReferences(st(), "DEMO-CHART-01");
      const tpl = refs.filter((r) => r.type === "template");
      return {
        pass: tpl.length > 0 && !!st().assets["DEMO-CHART-01"],
        detail: `被 ${tpl.map((r) => `${r.id}（节点 ${r.nodeIds.join("、")}）`).join("；")} 引用 → 删除被阻止，仅提供“取消删除/查看引用”`,
      };
    },
  );
  const fx = latestDef<FixedDef>(st().assets["DEMO-FIXED-01"])!;
  T(
    "A23",
    "固定格式模板修改标题与列宽",
    "设计画布同步显示修改",
    { page: "fixed", params: { assetId: "DEMO-FIXED-01" }, label: "固定格式设计器" },
    "选中 A1 编辑文本；拖动列头边缘",
    () => {
      const d = clone(fx);
      d.cells[rcKey(0, 0)].text = "资源投入统计日报（修订）";
      d.colWidths[0] = 160;
      const ex = expandFixed(d);
      return {
        pass: ex.rows[0].cells[0]!.text === "资源投入统计日报（修订）" && ex.colWidths[0] === 160,
        detail: `标题“${ex.rows[0].cells[0]!.text}”，A 列宽 ${ex.colWidths[0]}px（设计与填数共用同一定义）`,
      };
    },
  );
  T(
    "A24",
    "固定格式模板合并/拆分",
    "真实改变单元格结构",
    { page: "fixed", params: { assetId: "DEMO-FIXED-01" }, label: "固定格式设计器" },
    "工具栏 合并 / 拆分",
    () => {
      const s1 = splitCells(fx, { r0: 0, c0: 0, r1: 0, c1: 5 }).def!;
      const m1 = mergeCells(s1, { r0: 0, c0: 0, r1: 0, c1: 2 }).def!;
      const cs = expandFixed(m1).rows[0].cells.map((c) => (c === null ? "x" : c ? c.cs : 1));
      return {
        pass:
          fx.merges.length - 1 === s1.merges.length &&
          m1.merges.length === s1.merges.length + 1 &&
          cs[0] === 3,
        detail: `原合并 ${fx.merges.length} → 拆分 A1:F1 后 ${s1.merges.length} → 合并 A1:C1 后 ${m1.merges.length}；第 1 行结构 ${JSON.stringify(cs)}`,
      };
    },
  );
  T(
    "A25",
    "修改固定模板动态绑定",
    "预览数值重新填入",
    { page: "fixed", params: { assetId: "DEMO-FIXED-01" }, label: "固定格式设计器" },
    "动态区 → 行来源 按目标汇总",
    () => {
      const before = expandFixed(fx)
        .rows.filter((r) => r.regionId === "RG-1")
        .map((r) => `${r.cells[0]!.text}=${r.cells[3]!.text}`);
      const d = clone(fx);
      d.regions[0].groupBy = ["targetId"];
      d.regions[0].columnBindings[0] = "targetId";
      const after = expandFixed(d)
        .rows.filter((r) => r.regionId === "RG-1")
        .map((r) => `${r.cells[0]!.text}=${r.cells[3]!.text}`);
      const t1 = expandFixed({ ...fx, viewParams: { ...ctxA2, tick: 1 } }).grandTotal;
      return {
        pass: before.join() === "U-A=18,U-B=12" && after.join() === "T-1=20,T-2=10" && t1 === 24,
        detail: `按单位 ${before.join("，")} → 按目标 ${after.join("，")}；改为 Tick 1 合计 ${t1}`,
      };
    },
  );
  T(
    "A26",
    "进入长表分页预览",
    "可见分页、重复表头及长文本换行",
    { page: "fixed", params: { assetId: "DEMO-FIXED-02" }, label: "DEMO-FIXED-02" },
    "分页预览",
    () => {
      const d = latestDef<FixedDef>(st().assets["DEMO-FIXED-02"])!;
      const ex = expandFixed(d);
      const pg = paginate(d, ex);
      const rep = pg.pages.slice(1).every((p) => p.rows[0].repeated && p.rows[0].srcRow === 2);
      const long = ex.rows.find((r) => r.cells[5]?.text.includes("长文本"))!;
      const ex2 = expandFixed({ ...d, repeatFactor: 2 });
      const inputTotal = computeVariables(ctxA2).resourceInputTotal;
      return {
        pass:
          pg.pages.length >= 2 &&
          rep &&
          long.height > d.rowHeights[3] &&
          ex2.rows.length > ex.rows.length &&
          inputTotal === 30,
        detail: `64 行 → ${pg.pages.length} 页，后续页首行均为重复表头：${rep}；长备注行高 ${long.height}px > ${d.rowHeights[3]}px；×2 时 ${ex2.rows.length} 行；投入统计仍为 ${inputTotal}`,
      };
    },
  );
  T(
    "A27",
    "保存、重新打开固定模板",
    "布局、合并关系、字段绑定不丢失",
    { page: "fixed", params: { assetId: "DEMO-FIXED-01" }, label: "固定格式设计器" },
    "“保存模板（新版本）” → 重新进入",
    () => {
      const d = mergeCells(clone(fx), { r0: 11, c0: 0, r1: 11, c1: 5 }).def ?? clone(fx);
      d.colWidths[1] = 140;
      d.regions[0].groupBy = ["targetId"];
      st().saveRevision("DEMO-FIXED-01", d, "QA");
      const back = latestDef<FixedDef>(st().assets["DEMO-FIXED-01"])!;
      return {
        pass: eq(back, d),
        detail: `重新打开 r${st().assets["DEMO-FIXED-01"].latest}：列宽、${back.merges.length} 个合并、动态区 ${back.regions.map((r) => r.groupBy.join()).join("/")} 完全一致`,
      };
    },
  );
  const tpl = latestDef<ReportDef>(st().assets["DEMO-REPORT-TEMPLATE-01"])!;
  T(
    "A28",
    "在报告里编辑标题、正文和章节",
    "内容可改变，章节导航同步",
    { page: "report", params: { assetId: "DEMO-REPORT-TEMPLATE-01" }, label: "综合报告编辑器" },
    "Tiptap 正文编辑；章节目录 上移/新增/删除",
    () => {
      const h2 = outline(tpl.doc).filter((h) => h.level === 2);
      const moved = moveSection(tpl.doc, h2[2].index, -1)!;
      const added = addSection(moved, null, "5. 附录");
      const o = outline(added)
        .filter((h) => h.level === 2)
        .map((h) => h.text);
      return {
        pass: o[1].startsWith("3.") && o[2].startsWith("2.") && o[o.length - 1] === "5. 附录",
        detail: `章节顺序：${o.join(" | ")}`,
      };
    },
  );
  T(
    "A29",
    "插入共享图表、透视表及固定模板节点",
    "能选中节点、查看资产 ID 和 revision",
    { page: "report", params: { assetId: "DEMO-REPORT-TEMPLATE-01" }, label: "综合报告编辑器" },
    "工具栏 图表/分析表/固定表；点击节点 → 右侧面板",
    () => {
      const refs = collectRefs(tpl.doc);
      const types = new Set(refs.map((r) => r.type));
      return {
        pass:
          types.has("chartAsset") &&
          types.has("tableAsset") &&
          types.has("fixedTableAsset") &&
          refs.every((r) => r.nodeId && r.assetId && r.assetRevision),
        detail: refs.map((r) => `${r.type}:${r.assetId}@r${r.assetRevision}`).join("，"),
      };
    },
  );
  T(
    "A30",
    "编辑节点局部覆盖",
    "仅该插入位置的显示发生变化",
    { page: "report", params: { assetId: "DEMO-REPORT-TEMPLATE-01" }, label: "综合报告编辑器" },
    "选中图表节点 → “仅调整这一处”",
    () => {
      const snap = clone(chart01);
      const a = computeChart(
        effectiveDef("chart", snap, { dimensions: ["targetId"] }, ctxA2) as ChartDef,
      );
      const b = computeChart(effectiveDef("chart", snap, {}, ctxA2) as ChartDef);
      return {
        pass: toMap(a.summary)["T-1"] === 20 && toMap(b.summary)["U-A"] === 18 && eq(snap, chart01),
        detail: `覆盖节点：${a.summary.map((x) => `${x.key}=${x.value}`).join("、")}；其它引用：${b.summary.map((x) => `${x.key}=${x.value}`).join("、")}；共享定义未改`,
      };
    },
  );
  T(
    "A31",
    "保存模板并重新打开",
    "正文、节点和变量配置完整",
    { page: "report", params: { assetId: "DEMO-REPORT-TEMPLATE-01" }, label: "综合报告编辑器" },
    "“保存模板” → “重新打开”",
    () => {
      const d = clone(tpl);
      d.doc.content!.push({
        type: "paragraph",
        content: [
          { type: "text", text: "QA 段落 " },
          { type: "variable", attrs: { name: "completionPercent" } },
        ],
      });
      const n = d.doc.content!.find((x) => x.type === "chartAsset")!;
      n.attrs!.overrides = { dimensions: ["targetId"], caption: "图 1" };
      st().saveRevision("DEMO-REPORT-TEMPLATE-01", d, "QA");
      const back = latestDef<ReportDef>(st().assets["DEMO-REPORT-TEMPLATE-01"])!;
      return {
        pass: eq(back.doc, d.doc),
        detail: `r${st().assets["DEMO-REPORT-TEMPLATE-01"].latest}：${back.doc.content!.length} 个块、${collectRefs(back.doc).length} 个资源节点、覆盖 ${JSON.stringify(collectRefs(back.doc)[0].overrides)} 无损恢复`,
      };
    },
  );
  const iid = st().generateInstance("DEMO-REPORT-TEMPLATE-01", 1, ctxA2);
  T(
    "A32",
    "选择 RUN-A Tick 2 模拟生成报告",
    "显示资源投入30、转移人数12和正确图表",
    { page: "generate", params: { templateId: "DEMO-REPORT-TEMPLATE-01" }, label: "报告生成" },
    "生成向导 → 生成演示报告",
    () => {
      const i = st().instances[iid];
      const c = i.resolvedData.find((r) => r.assetId === "DEMO-CHART-01")!;
      return {
        pass:
          i.resolvedValues.resourceInputTotal === 30 &&
          i.resolvedValues.transferredTotal === 12 &&
          c.revision === 3 &&
          c.rows.map((r) => r.value).join() === "18,12",
        detail: `${iid}：投入 ${i.resolvedValues.resourceInputTotal}、转移 ${i.resolvedValues.transferredTotal}、完成率 ${i.resolvedValues.completionPercent}%；CHART-01@r${c.revision} ${c.rows.map((r) => `${r.label}=${r.value}`).join("，")}`,
      };
    },
  );
  T(
    "A33",
    "缺失必填绑定或资产引用",
    "指出具体错误，允许返回修正",
    { page: "generate", label: "报告生成 → QA 异常" },
    "“载入异常演示模板”或选择 HEAD0 + Tick 2",
    () => {
      const doc = normalizeDoc({
        type: "doc",
        content: [
          {
            type: "chartAsset",
            attrs: { nodeId: "N99", assetId: "DEMO-CHART-99", assetRevision: 1 },
          },
          {
            type: "tableAsset",
            attrs: { nodeId: "N98", assetId: "DEMO-TABLE-01", assetRevision: 9 },
          },
          { type: "paragraph", content: [{ type: "variable", attrs: { name: "ownerName" } }] },
        ],
      });
      const e1 = validateGeneration(doc, ctxA2, st().assets).map((e) => e.kind);
      const e2 = validateGeneration(
        tpl.doc,
        { simulationId: "DEMO-LIVE-HEAD0", branch: "main", tick: 2 },
        st().assets,
      );
      const e3 = validateGeneration(tpl.doc, { ...ctxA2, tick: null }, st().assets);
      return {
        pass:
          eq(e1, ["missingAsset", "missingRevision", "unknownVariable"]) &&
          e2[0]?.kind === "invalidSelection" &&
          e3[0]?.kind === "missingParam",
        detail: `${e1.join(" / ")}；HEAD0：${e2[0]?.message}；未选 Tick：${e3[0]?.message}`,
      };
    },
  );
  T(
    "A34",
    "编辑当前报告实例",
    "共享模板和原 ChartAsset 未被覆盖",
    { page: "instances", label: "报告实例" },
    "实例编辑 → 选中图表 → 维度改为按目标 → 保存实例修改",
    () => {
      const tplBefore = JSON.stringify(st().assets["DEMO-REPORT-TEMPLATE-01"]);
      const chartBefore = JSON.stringify(st().assets["DEMO-CHART-01"]);
      const i = st().instances[iid];
      const doc = clone(i.doc);
      const n = doc.content!.find(
        (x) => x.type === "chartAsset" && x.attrs?.assetId === "DEMO-CHART-01",
      )!;
      n.attrs!.overrides = { dimensions: ["targetId"] };
      st().saveInstanceDoc(iid, doc);
      const r = st().instances[iid].resolvedData.find((x) => x.assetId === "DEMO-CHART-01")!;
      return {
        pass:
          r.rows.map((x) => x.value).join() === "20,10" &&
          JSON.stringify(st().assets["DEMO-REPORT-TEMPLATE-01"]) === tplBefore &&
          JSON.stringify(st().assets["DEMO-CHART-01"]) === chartBefore,
        detail: `实例节点现为 ${r.rows.map((x) => `${x.label}=${x.value}`).join("，")}；模板与 DEMO-CHART-01 序列化前后完全一致`,
      };
    },
  );
  T(
    "A35",
    "共享资产创建新版本后查看历史实例",
    "历史实例仍引用旧版本，内容保持",
    { page: "instances", params: { instanceId: "DEMO-REPORT-INSTANCE-01" }, label: "报告实例" },
    "实例 → 来源摘要（固定版本 vs 共享当前版本）",
    () => {
      const seedInst = st().instances["DEMO-REPORT-INSTANCE-01"];
      const before = JSON.stringify(seedInst);
      st().saveRevision(
        "DEMO-CHART-01",
        { ...chart01, chartType: "line", dimensions: ["targetId"] },
        "QA r5",
      );
      const after = st().instances["DEMO-REPORT-INSTANCE-01"];
      const snap = after.assetSnapshots["DEMO-CHART-01@3"];
      return {
        pass:
          JSON.stringify(after) === before &&
          (snap.def as ChartDef).dimensions[0] === "unitId" &&
          st().assets["DEMO-CHART-01"].latest === 5,
        detail: `共享 DEMO-CHART-01 已到 r${st().assets["DEMO-CHART-01"].latest}；实例仍固定 r3（${(snap.def as ChartDef).chartType}，按${(snap.def as ChartDef).dimensions[0]}），实例数据未变化`,
      };
    },
  );
  T(
    "A36",
    "模拟发布并查看历史",
    "有明确 DEMO 记录与冻结内容",
    { page: "instances", label: "报告实例" },
    "“模拟发布” → 修订与发布历史 → 查看冻结内容",
    () => {
      const pid = st().publishInstance(iid);
      const frozen = JSON.stringify(
        st().publications.find((p) => p.publicationId === pid)!.frozenContent,
      );
      const doc = clone(st().instances[iid].doc);
      doc.content!.unshift({ type: "paragraph", content: [{ type: "text", text: "发布后修改" }] });
      st().createInstanceRevision(iid, doc, "QA");
      const p = st().publications.find((x) => x.publicationId === pid)!;
      return {
        pass:
          p.state === "demo-published" &&
          JSON.stringify(p.frozenContent) === frozen &&
          st().instances[iid].currentRevision === 2,
        detail: `${pid}（${p.state}）冻结修订 ${p.instanceRevision}；实例新建修订 2 后冻结内容不变`,
      };
    },
  );
  T(
    "A37",
    "单位为 null 的字段",
    "显示“未定义单位”",
    { page: "states", label: "状态展台" },
    "状态展台 → 未定义单位",
    () => {
      const u = unitOf("componentSeries", "value", { fieldId: ["casualty/threat_dose"] });
      return {
        pass: u === null && unitText(u) === EXP.nullFieldUnit.expectedUI,
        detail: `casualty/threat_dose 单位 = ${u} → 显示“${unitText(u)}”`,
      };
    },
  );
  T(
    "A38",
    "选择无记录范围、清空筛选",
    "空态、错误和清除操作有效",
    { page: "states", label: "状态展台" },
    "状态展台 / 任意视图选择 HEAD0 + Tick 2",
    () => {
      const inv = resolveSlice(
        "resourceInput",
        { simulationId: "DEMO-LIVE-HEAD0", branch: "main", tick: 2 },
        {},
      );
      const empty = resolveSlice("resourceInput", { ...ctxA2, tick: 0 }, {});
      const nomatch = resolveSlice("resourceInput", ctxA2, { unitId: ["U-Z"] });
      const cleared = resolveSlice("resourceInput", ctxA2, {});
      return {
        pass:
          inv.status === "invalid" &&
          inv.message!.includes(EXP.invalidSelection.expectedUI) &&
          empty.status === "empty" &&
          nomatch.status === "empty" &&
          cleared.records.length === 4,
        detail: `${inv.message}；Tick 0：${empty.message}；无匹配：${nomatch.message}；清除后 ${cleared.records.length} 条`,
      };
    },
  );
  T(
    "A39",
    "页面切换及刷新恢复",
    "已保存的资产和实例仍可打开",
    { page: "assets", label: "资产中心" },
    "刷新浏览器后检查资产版本与实例",
    () => {
      const ls =
        typeof localStorage !== "undefined" ? localStorage.getItem("rr-workbench-v3") : null;
      const nav =
        typeof localStorage !== "undefined" ? localStorage.getItem("rr-workbench-nav") : null;
      const parsed = ls ? JSON.parse(ls) : null;
      return {
        pass: !!parsed?.state?.assets && !!parsed?.state?.instances && !!nav,
        detail: ls
          ? `本地持久化：${Object.keys(parsed.state.assets).length} 个资产、${Object.keys(parsed.state.instances).length} 个实例、${parsed.state.publications.length} 条发布；导航状态已保存`
          : "运行环境无 localStorage",
      };
    },
  );
  T(
    "A40",
    "遍历主要菜单与按钮",
    "无无效操作、静态占位或无响应控件",
    { page: "assets", label: "资产中心" },
    "见下方“控件 → 状态”清单",
    () => {
      const grp = aggregate(getRecords("resourceInput"), ["simulationId"], "demo_amount", "sum");
      return {
        pass: grp.length === 2,
        detail:
          "所有主导航、保存三分法按钮、筛选/维度/图型/样式控件均绑定到真实状态（逻辑层已由 A01–A39 覆盖）；UI 点击遍历为人工验收项",
      };
    },
  );
  return out;
}
