import { useMemo, useState } from "react";
import {
  Check,
  AlertOctagon,
  Wand2,
  ArrowLeft,
  FileText,
  ExternalLink,
  FlaskConical,
} from "lucide-react";
import { useApp, useUI, toast } from "../store/store";
import type { AssetRecord, DataContext, ReportDef, ReportInstance } from "../data/types";
import { computeVariables, fmt } from "../data/engine";
import {
  collectRefs,
  collectVariables,
  validateGeneration,
  snapshotFor,
  clone,
  normalizeDoc,
} from "../data/reports";
import { PageHeader } from "../ui/PageHeader";
import { Badge, Button, Card, Field, Kpi, Select, cx } from "../ui/kit";
import { DataContextBar } from "../components/DataControls";
import { KIND_ICON } from "../components/AssetBlock";
import { DEFAULT_CONTEXT } from "../data/seed";

export function GeneratePage() {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const assets = useApp((s) => s.assets);
  const instances = useApp((s) => s.instances);
  const templates = Object.values(assets).filter(
    (a) => a.kind === "report",
  ) as AssetRecord<ReportDef>[];
  const [tplId, setTplId] = useState(
    params.templateId && assets[params.templateId] ? params.templateId : "DEMO-REPORT-TEMPLATE-01",
  );
  const tpl = assets[tplId] as AssetRecord<ReportDef> | undefined;
  const [rev, setRev] = useState<number>(tpl?.latest ?? 1);
  const [sel, setSel] = useState<DataContext>({ ...DEFAULT_CONTEXT });
  const [result, setResult] = useState<string | null>(null);
  const def = tpl?.revisions.find((r) => r.revision === rev)?.def;
  const errors = useMemo(
    () => (def ? validateGeneration(normalizeDoc(def.doc), sel, assets) : []),
    [def, sel, assets],
  );
  const vars = useMemo(() => computeVariables(sel, { reportTitle: def?.title }), [sel, def]);
  const refs = def ? collectRefs(normalizeDoc(def.doc)) : [];
  const inst: ReportInstance | undefined = result ? instances[result] : undefined;

  const loadBrokenDemo = () => {
    const base = assets["DEMO-REPORT-TEMPLATE-01"] as AssetRecord<ReportDef>;
    const d = clone(base.revisions.find((r) => r.revision === base.latest)!.def);
    d.title = "异常演示模板（缺失引用 + 未定义变量）";
    d.doc.content = [
      ...(d.doc.content ?? []),
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "异常节点（QA 演示）" }],
      },
      {
        type: "chartAsset",
        attrs: { nodeId: "N99-MISSING", assetId: "DEMO-CHART-99", assetRevision: 1, overrides: {} },
      },
      {
        type: "tableAsset",
        attrs: { nodeId: "N98-BADREV", assetId: "DEMO-TABLE-01", assetRevision: 9, overrides: {} },
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "负责人：" },
          { type: "variable", attrs: { name: "ownerName" } },
        ],
      },
    ];
    const existing = templates.find((t) => t.title === d.title);
    const id = existing?.assetId ?? useApp.getState().createAsset("report", d);
    setTplId(id);
    setRev(useApp.getState().assets[id].latest);
    toast("已载入异常演示模板，可查看精确的节点/变量错误", "info");
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "综合报告", page: "report" }, { label: "模拟报告生成" }]}
        title="模拟报告生成"
      />
      <div className="flex-1 min-h-0 overflow-auto scroll-thin p-5">
        {inst ? (
          <div className="max-w-4xl mx-auto space-y-4">
            <Card>
              <div className="p-5 flex items-start gap-4">
                <div className="size-10 rounded-full bg-emerald-100 grid place-items-center">
                  <Check className="size-5 text-emerald-700" />
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-semibold">
                    已生成演示报告实例 {inst.instanceId}
                  </div>
                  <div className="text-[12.5px] text-ink-3 mt-0.5">
                    {inst.title} · 模板 {inst.templateRef.assetId} r{inst.templateRef.revision} ·{" "}
                    {new Date(inst.createdAt).toLocaleString("zh-CN")}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="primary"
                      icon={<ExternalLink className="size-3.5" />}
                      onClick={() => go("instances", { instanceId: inst.instanceId })}
                    >
                      打开实例（编辑 / 预览）
                    </Button>
                    <Button onClick={() => setResult(null)}>再生成一份</Button>
                  </div>
                </div>
                <Badge tone="amber">DEMO 草稿</Badge>
              </div>
            </Card>
            <div className="grid grid-cols-4 gap-3">
              <Kpi
                tone="brand"
                label="资源投入合计"
                value={fmt(inst.resolvedValues.resourceInputTotal as number)}
                unit="演示量"
              />
              <Kpi
                label="转移累计人数"
                value={fmt(inst.resolvedValues.transferredTotal as number)}
                unit="人（合成）"
              />
              <Kpi
                label="完成率"
                value={
                  inst.resolvedValues.completionPercent === null
                    ? "—"
                    : `${inst.resolvedValues.completionPercent}%`
                }
              />
              <Kpi
                label="资源节点"
                value={inst.resolvedData.length}
                unit="个"
                hint="已冻结资产快照"
              />
            </div>
            <Card title="生成概况：章节、引用与来源摘要">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[11px] text-ink-3 bg-gray-50">
                    {["节点", "资产 / 固定版本", "类型", "冻结结果摘要"].map((h) => (
                      <th key={h} className="text-left px-3.5 h-8 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inst.resolvedData.map((r) => (
                    <tr key={r.nodeId} className="border-t border-gray-100">
                      <td className="px-3.5 py-2 font-mono text-[11px]">{r.nodeId}</td>
                      <td className="px-3.5 py-2">
                        {r.title}
                        <div className="font-mono text-[11px] text-ink-3">
                          {r.assetId} r{r.revision}
                        </div>
                      </td>
                      <td className="px-3.5 py-2">{r.kind}</td>
                      <td className="px-3.5 py-2 text-ink-2">
                        {r.summary}
                        {r.rows.length > 0 && (
                          <div className="text-[11px] text-ink-3">
                            {r.rows
                              .slice(0, 4)
                              .map((x) => `${x.label}=${fmt(x.value)}`)
                              .join("，")}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3.5 py-2.5 border-t border-line text-[11.5px] text-ink-3">
                数据范围 {inst.selection.simulationId} / {inst.selection.branch} / Tick{" "}
                {inst.selection.tick} · 来源
                resourceInput（SEED_EXACT）、transferProgress（DEMO_EXTENDED_SYNTHETIC）等 ·{" "}
                {inst.provenance}
              </div>
            </Card>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto grid grid-cols-[1fr_340px] gap-4">
            <div className="space-y-4">
              <Card
                title={
                  <>
                    <Step n={1} />
                    选择报告模板
                  </>
                }
              >
                <div className="p-4 grid grid-cols-[1fr_140px] gap-3">
                  <Field label="模板">
                    <Select
                      value={tplId}
                      onChange={(v) => {
                        setTplId(v);
                        setRev((assets[v] as AssetRecord).latest);
                      }}
                      options={templates.map((t) => ({
                        value: t.assetId,
                        label: `${t.title}（${t.assetId}）`,
                      }))}
                    />
                  </Field>
                  <Field label="模板版本">
                    <Select<number>
                      value={rev}
                      onChange={setRev}
                      options={(tpl?.revisions ?? []).map((r) => ({
                        value: r.revision,
                        label: `r${r.revision}`,
                      }))}
                    />
                  </Field>
                </div>
              </Card>
              <Card
                title={
                  <>
                    <Step n={2} />
                    选择演示数据
                  </>
                }
              >
                <div className="p-4">
                  <DataContextBar value={sel} onChange={setSel} />
                  <div className="mt-2 text-[11.5px] text-ink-3">
                    推荐：DEMO-RUN-A / main / Tick 2。可选择 DEMO-LIVE-HEAD0 + Tick 2
                    或“未选择”验证错误提示。
                  </div>
                </div>
              </Card>
              <Card
                title={
                  <>
                    <Step n={3} />
                    预览参数、引用版本与关键数据
                  </>
                }
              >
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <Kpi
                      tone="brand"
                      label="资源投入合计"
                      value={fmt(vars.resourceInputTotal as number)}
                      unit="演示量"
                    />
                    <Kpi label="转移累计" value={fmt(vars.transferredTotal as number)} unit="人" />
                    <Kpi
                      label="完成率"
                      value={vars.completionPercent === null ? "—" : `${vars.completionPercent}%`}
                    />
                    <Kpi
                      label="变量"
                      value={def ? collectVariables(def.doc).length : 0}
                      unit="种"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-ink-2 mb-1.5">
                      将被固定的资产引用（生成时复制快照）
                    </div>
                    <div className="space-y-1">
                      {refs.map((r) => {
                        const s = snapshotFor(assets, r.assetId, r.assetRevision);
                        const I = KIND_ICON[r.kind];
                        return (
                          <div
                            key={r.nodeId}
                            className={cx(
                              "flex items-center gap-2 px-2.5 py-1.5 rounded border text-[12px]",
                              s ? "border-line" : "border-red-200 bg-red-50",
                            )}
                          >
                            <I className="size-3.5 text-brand-600" />
                            <span className="flex-1">{s?.title ?? "（缺失）"}</span>
                            <span className="font-mono text-[11px] text-ink-3">
                              {r.nodeId} · {r.assetId} r{r.assetRevision}
                            </span>
                            {Object.keys(r.overrides).length > 0 && (
                              <Badge tone="violet">覆盖</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
            <div className="space-y-4">
              <Card
                title={
                  <>
                    <Step n={4} />
                    校验与生成
                  </>
                }
              >
                <div className="p-4 space-y-3">
                  {errors.length === 0 ? (
                    <div className="flex items-start gap-2 text-[12.5px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-2.5">
                      <Check className="size-4 mt-0.5" />
                      校验通过：参数完整，{refs.length} 个引用均可解析
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-red-700">
                        <AlertOctagon className="size-4" />
                        发现 {errors.length} 个问题，无法生成
                      </div>
                      {errors.map((e, i) => (
                        <div
                          key={i}
                          className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded p-2"
                        >
                          <Badge tone="red" className="mr-1">
                            {
                              {
                                missingAsset: "缺失资产",
                                missingRevision: "版本不存在",
                                unknownVariable: "未定义变量",
                                invalidSelection: "数据范围无效",
                                missingParam: "缺少参数",
                                emptyDoc: "空文档",
                              expressionError: "表达式错误",
                              }[e.kind]
                            }
                          </Badge>
                          {e.message}
                        </div>
                      ))}
                      <Button
                        size="sm"
                        className="w-full"
                        icon={<ArrowLeft className="size-3.5" />}
                        onClick={() => go("report", { assetId: tplId })}
                      >
                        返回模板修改
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={errors.length > 0 || !tpl}
                    icon={<Wand2 className="size-3.5" />}
                    onClick={() => {
                      const id = useApp.getState().generateInstance(tplId, rev, sel);
                      setResult(id);
                      toast(`已生成 ${id}`);
                    }}
                  >
                    生成演示报告
                  </Button>
                  <div className="text-[11px] text-ink-3">
                    生成的实例保存模板版本、各资产当时的修订快照、数据范围与解析值；之后修改共享资产不会改变它。
                  </div>
                </div>
              </Card>
              <Card title="QA：异常场景">
                <div className="p-4 space-y-2 text-[12px] text-ink-2">
                  <p>
                    载入一个包含缺失资产（DEMO-CHART-99）、不存在版本（DEMO-TABLE-01
                    r9）和未定义变量的模板副本，验证错误定位。
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    icon={<FlaskConical className="size-3.5" />}
                    onClick={loadBrokenDemo}
                  >
                    载入异常演示模板
                  </Button>
                </div>
              </Card>
              <Card title="最近生成">
                <div className="divide-y divide-gray-100">
                  {Object.values(instances)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .slice(0, 5)
                    .map((i) => (
                      <button
                        key={i.instanceId}
                        onClick={() => go("instances", { instanceId: i.instanceId })}
                        className="w-full text-left px-3.5 py-2 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-1.5 text-[12px]">
                          <FileText className="size-3.5 text-ink-3" />
                          <span className="font-mono">{i.instanceId}</span>
                        </div>
                        <div className="text-[11px] text-ink-3 truncate">{i.title}</div>
                      </button>
                    ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="inline-grid place-items-center size-5 rounded-full bg-brand-600 text-white text-[11px] font-semibold">
      {n}
    </span>
  );
}
