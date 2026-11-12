import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Table2,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Search,
  Plus,
  Copy,
  Trash2,
  Pencil,
  FilePlus2,
  Database,
  History,
  RotateCcw,
  Eye,
  Bookmark,
  ExternalLink,
  Layers,
} from "lucide-react";
import {
  useApp,
  useUI,
  latestDef,
  findReferences,
  KIND_LABEL,
  toast,
  type PageId,
} from "../store/store";
import type {
  AssetKind,
  AssetRecord,
  ChartDef,
  FixedDef,
  ReportDef,
  TableDef,
} from "../data/types";
import { PageHeader } from "../ui/PageHeader";
import {
  Badge,
  Button,
  Card,
  Field,
  InlineEdit,
  Modal,
  StatusBlock,
  TextInput,
  cx,
} from "../ui/kit";
import { ChartView } from "../components/ChartView";
import { AnalysisTableView } from "../components/TableViews";
import { SheetTable } from "../components/FixedSheet";
import { expandFixed } from "../data/fixedModel";
import { DATASETS, DATASET_IDS, RUNS, getRecords, fieldLabel } from "../data/engine";
import { chartTypeLabel } from "../data/chartModel";
import { collectRefs, outline } from "../data/reports";
import { newChartDef, newFixedDef, newReportDef, newTableDef } from "../data/seed";

type TreeKey = "all" | AssetKind | "data" | "views" | "activity";
const KIND_ICON: Record<AssetKind, any> = {
  chart: BarChart3,
  table: Table2,
  fixed: FileSpreadsheet,
  report: FileText,
};
export const EDITOR_PAGE: Record<AssetKind, PageId> = {
  chart: "chart",
  table: "table",
  fixed: "fixed",
  report: "report",
};
const MODE_LABEL: Record<string, string> = {
  detail: "明细表",
  grouped: "分组汇总",
  pivot: "交叉透视",
};

function assetSubtitle(a: AssetRecord): string {
  const d = latestDef(a) as any;
  if (a.kind === "chart")
    return `${chartTypeLabel(d.chartType)} · ${DATASETS[d.dataSetId as keyof typeof DATASETS].label}`;
  if (a.kind === "table")
    return `${MODE_LABEL[d.mode]} · ${DATASETS[d.dataSetId as keyof typeof DATASETS].label}`;
  if (a.kind === "fixed")
    return `A4 ${d.page.orientation === "portrait" ? "纵向" : "横向"} · ${d.regions.length} 个动态区`;
  return `${outline(d.doc).length} 个标题 · ${collectRefs(d.doc).length} 个资源节点`;
}

function diffKeys(a: any, b: any): string[] {
  if (!a || !b) return [];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
}

export function AssetPreview({ a }: { a: AssetRecord }) {
  const d = latestDef(a) as any;
  if (a.kind === "chart") return <ChartView def={d as ChartDef} height={190} />;
  if (a.kind === "table") return <AnalysisTableView def={d as TableDef} maxHeight={200} />;
  if (a.kind === "fixed") {
    const fd = d as FixedDef;
    const ex = expandFixed(fd);
    const w = fd.colWidths.reduce((x, y) => x + y, 0);
    return (
      <div className="overflow-hidden bg-white border border-line rounded p-2 h-[200px]">
        <div style={{ zoom: 300 / w } as any}>
          <SheetTable rows={ex.rows.slice(0, 14)} colWidths={fd.colWidths} />
        </div>
      </div>
    );
  }
  const rd = d as ReportDef;
  return (
    <div className="text-xs space-y-1">
      {outline(rd.doc).map((h) => (
        <div
          key={h.index}
          style={{ paddingLeft: (h.level - 1) * 12 }}
          className={cx(h.level === 1 ? "font-semibold text-ink" : "text-ink-2")}
        >
          {h.text}
        </div>
      ))}
      <div className="pt-2 flex flex-wrap gap-1">
        {collectRefs(rd.doc).map((r) => (
          <Badge key={r.nodeId} tone="brand">
            {r.assetId} r{r.assetRevision}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function AssetCenter() {
  const assets = useApp((s) => s.assets);
  const instances = useApp((s) => s.instances);
  const views = useApp((s) => s.views);
  const activity = useApp((s) => s.activity);
  const app = useApp.getState;
  const { go, params } = useUI();
  const [tree, setTree] = useState<TreeKey>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(params.assetId ?? "DEMO-CHART-01");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState<AssetKind>("chart");
  const [newName, setNewName] = useState("");
  const [del, setDel] = useState<string | null>(null);
  const [insertFor, setInsertFor] = useState<string | null>(null);
  const [reset, setReset] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  const list = useMemo(() => {
    const all = Object.values(assets).sort((a, b) =>
      a.kind === b.kind
        ? a.assetId.localeCompare(b.assetId)
        : ["chart", "table", "fixed", "report"].indexOf(a.kind) -
          ["chart", "table", "fixed", "report"].indexOf(b.kind),
    );
    const k = q.trim().toLowerCase();
    return all.filter(
      (a) =>
        (tree === "all" || a.kind === tree) &&
        (!k || a.title.toLowerCase().includes(k) || a.assetId.toLowerCase().includes(k)),
    );
  }, [assets, tree, q]);

  const selected = sel ? assets[sel] : undefined;
  const refs = selected ? findReferences({ assets, instances }, selected.assetId) : [];
  const count = (k: AssetKind) => Object.values(assets).filter((a) => a.kind === k).length;
  const dup = Object.values(assets).some((a) => a.kind === newKind && a.title === newName.trim());

  const create = () => {
    const def: any = {
      chart: newChartDef,
      table: newTableDef,
      fixed: newFixedDef,
      report: newReportDef,
    }[newKind]();
    if (newName.trim()) def.title = newName.trim();
    const id = app().createAsset(newKind, def);
    setCreating(false);
    setNewName("");
    toast(`已创建${KIND_LABEL[newKind]} ${id}（r1），正在打开编辑器`);
    go(EDITOR_PAGE[newKind], { assetId: id });
  };

  const tree0: { k: TreeKey; label: string; icon: any; n?: number }[] = [
    { k: "all", label: "全部资产", icon: LayoutGrid, n: Object.keys(assets).length },
    { k: "chart", label: "图表资产", icon: BarChart3, n: count("chart") },
    { k: "table", label: "分析型表格", icon: Table2, n: count("table") },
    { k: "fixed", label: "固定格式模板", icon: FileSpreadsheet, n: count("fixed") },
    { k: "report", label: "综合报告模板", icon: FileText, n: count("report") },
  ];
  const tree1: { k: TreeKey; label: string; icon: any; n?: number }[] = [
    { k: "data", label: "演示数据源", icon: Database, n: DATASET_IDS.length },
    { k: "views", label: "个人视图", icon: Bookmark, n: views.length },
    { k: "activity", label: "操作记录", icon: History },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "组件与资产中心" }]}
        title="组件与资产中心"
        actions={
          <>
            <Button icon={<RotateCcw className="size-3.5" />} onClick={() => setReset(true)}>
              重置演示数据
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => setCreating(true)}
            >
              新建资产
            </Button>
          </>
        }
      />
      <div className="flex-1 min-h-0 flex">
        <div className="w-[208px] shrink-0 border-r border-line bg-white p-2 space-y-0.5 overflow-auto scroll-thin">
          {[tree0, tree1].map((grp, gi) => (
            <div key={gi} className={cx(gi > 0 && "pt-3 mt-3 border-t border-line")}>
              {grp.map((t) => {
                const I = t.icon;
                return (
                  <button
                    key={t.k}
                    onClick={() => setTree(t.k)}
                    className={cx(
                      "w-full flex items-center gap-2 h-8 px-2 rounded-md text-[13px]",
                      tree === t.k
                        ? "bg-gray-100 font-medium text-ink"
                        : "text-ink-2 hover:bg-gray-50",
                    )}
                  >
                    <I className="size-4 text-gray-400" />
                    <span className="flex-1 text-left">{t.label}</span>
                    {t.n !== undefined && (
                      <span className="text-[11px] text-ink-3 tabular-nums">{t.n}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="pt-3 mt-3 border-t border-line">
            <button
              onClick={() => go("instances")}
              className="w-full flex items-center gap-2 h-8 px-2 rounded-md text-[13px] text-ink-2 hover:bg-gray-50"
            >
              <Layers className="size-4 text-gray-400" />
              <span className="flex-1 text-left">报告实例</span>
              <span className="text-[11px] text-ink-3">{Object.keys(instances).length}</span>
            </button>
          </div>
        </div>

        {tree === "data" ? (
          <DataCatalog />
        ) : tree === "views" ? (
          <ViewsList />
        ) : tree === "activity" ? (
          <div className="flex-1 overflow-auto scroll-thin p-5">
            <Card title="操作记录（本地）">
              <div className="divide-y divide-gray-100">
                {activity.map((a) => (
                  <div key={a.id} className="px-3.5 py-2 flex gap-3 text-[12.5px]">
                    <span className="text-ink-3 tabular-nums w-36 shrink-0">
                      {new Date(a.at).toLocaleString("zh-CN")}
                    </span>
                    <span className="text-ink-2">{a.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="px-5 py-3 flex items-center gap-2 border-b border-line bg-white">
                <div className="relative w-80">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
                  <TextInput
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="搜索名称或资产 ID"
                    className="pl-8"
                  />
                </div>
                <span className="text-xs text-ink-3">{list.length} 项</span>
              </div>
              <div className="flex-1 overflow-auto scroll-thin p-5">
                {loading ? (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[104px] rounded-lg bg-white border border-line animate-pulse p-3.5 space-y-2"
                      >
                        <div className="h-3 w-24 bg-gray-100 rounded" />
                        <div className="h-4 w-40 bg-gray-100 rounded" />
                        <div className="h-3 w-32 bg-gray-100 rounded" />
                      </div>
                    ))}
                  </div>
                ) : list.length === 0 ? (
                  q ? (
                    <StatusBlock
                      status="empty"
                      message={`没有与“${q}”匹配的资产`}
                      actions={
                        <Button size="sm" onClick={() => setQ("")}>
                          清除搜索
                        </Button>
                      }
                    />
                  ) : (
                    <StatusBlock
                      status="empty"
                      message="该分类下暂无资产"
                      actions={
                        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                          新建资产
                        </Button>
                      }
                    />
                  )
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {list.map((a) => {
                      const I = KIND_ICON[a.kind];
                      const n = findReferences({ assets, instances }, a.assetId).length;
                      return (
                        <div
                          key={a.assetId}
                          onClick={() => setSel(a.assetId)}
                          onDoubleClick={() => go(EDITOR_PAGE[a.kind], { assetId: a.assetId })}
                          className={cx(
                            "group text-left rounded-lg bg-white border p-3.5 transition-shadow cursor-pointer",
                            sel === a.assetId
                              ? "border-brand-500 ring-2 ring-brand-100"
                              : "border-line hover:shadow-md hover:border-gray-300",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-md bg-brand-50 grid place-items-center">
                              <I className="size-4 text-brand-600" />
                            </div>
                            <span className="font-mono text-[10.5px] text-ink-3 truncate">
                              {a.assetId}
                            </span>
                            <span className="flex-1" />
                            <Badge tone="gray">r{a.latest}</Badge>
                          </div>
                          <div className="mt-2 text-[13.5px] font-semibold text-ink truncate">
                            {a.title}
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-ink-3 truncate">
                            {assetSubtitle(a)}
                          </div>
                          <div className="mt-2.5 flex items-center gap-1.5">
                            <Badge tone={a.seed ? "amber" : "green"}>
                              {a.seed ? "预置" : "新增"}
                            </Badge>
                            {n > 0 && <Badge tone="brand">被引用 {n}</Badge>}
                            <span className="flex-1" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                go(EDITOR_PAGE[a.kind], { assetId: a.assetId });
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[11.5px] text-brand-600 font-medium"
                            >
                              编辑
                            </button>
                            {a.kind !== "report" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInsertFor(a.assetId);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-[11.5px] text-brand-600 font-medium"
                              >
                                插入到报告
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <aside className="w-[380px] shrink-0 border-l border-line bg-white overflow-auto scroll-thin">
              {!selected ? (
                <div className="p-6 text-center text-xs text-ink-3">选择左侧资产以查看详情</div>
              ) : (
                <div>
                  <div className="p-4 border-b border-line">
                    <div className="flex items-center gap-2 text-[11px] text-ink-3">
                      <Badge tone="brand">{KIND_LABEL[selected.kind]}</Badge>
                      <span className="font-mono">{selected.assetId}</span>
                    </div>
                    <InlineEdit
                      value={selected.title}
                      className="mt-1.5 text-[15px] font-semibold block max-w-full"
                      onCommit={(v) => {
                        const r = app().renameAsset(selected.assetId, v);
                        toast(r.ok ? "已重命名" : r.message!, r.ok ? "success" : "error");
                      }}
                    />
                    <div className="mt-1 text-[11.5px] text-ink-3">
                      当前版本 r{selected.latest} · 共 {selected.revisions.length} 个已存版本 · 来源{" "}
                      {selected.provenance}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Pencil className="size-3" />}
                        onClick={() =>
                          go(EDITOR_PAGE[selected.kind], { assetId: selected.assetId })
                        }
                      >
                        打开编辑
                      </Button>
                      <Button
                        size="sm"
                        icon={<Copy className="size-3" />}
                        onClick={() => {
                          const id = app().duplicateAsset(selected.assetId);
                          setSel(id);
                          toast(`已复制为 ${id}`);
                        }}
                      >
                        复制
                      </Button>
                      {selected.kind !== "report" ? (
                        <Button
                          size="sm"
                          icon={<FilePlus2 className="size-3" />}
                          onClick={() => setInsertFor(selected.assetId)}
                        >
                          插入到报告
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<FilePlus2 className="size-3" />}
                          onClick={() => go("generate", { templateId: selected.assetId })}
                        >
                          生成实例
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 className="size-3" />}
                        onClick={() => setDel(selected.assetId)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 border-b border-line">
                    <div className="text-xs font-semibold text-ink-2 mb-2 flex items-center gap-1.5">
                      <Eye className="size-3.5" />
                      当前版本预览（r{selected.latest}，按资产默认参数计算）
                    </div>
                    <AssetPreview a={selected} />
                  </div>
                  <div className="p-4 border-b border-line">
                    <div className="text-xs font-semibold text-ink-2 mb-2">版本记录</div>
                    <div className="space-y-1.5">
                      {[...selected.revisions].reverse().map((r, i, arr) => {
                        const prev = arr[i + 1];
                        const ch = prev ? diffKeys(prev.def, r.def) : [];
                        return (
                          <div key={r.revision} className="flex gap-2.5 text-[12px]">
                            <Badge tone={r.revision === selected.latest ? "brand" : "gray"}>
                              r{r.revision}
                            </Badge>
                            <div className="min-w-0">
                              <div className="text-ink-2">{r.note}</div>
                              <div className="text-[11px] text-ink-3">
                                {new Date(r.savedAt).toLocaleString("zh-CN")}
                                {ch.length > 0 && ` · 变更：${ch.map(fieldKeyLabel).join("、")}`}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-semibold text-ink-2 mb-2">使用位置</div>
                    {refs.length === 0 ? (
                      <div className="text-[12px] text-ink-3">未被任何报告模板或实例引用</div>
                    ) : (
                      <div className="space-y-1.5">
                        {refs.map((r) => (
                          <button
                            key={r.id}
                            onClick={() =>
                              go(
                                r.type === "template" ? "report" : "instances",
                                r.type === "template" ? { assetId: r.id } : { instanceId: r.id },
                              )
                            }
                            className="w-full text-left flex items-start gap-2 p-2 rounded-md border border-line hover:bg-gray-50"
                          >
                            <Badge tone={r.type === "template" ? "brand" : "gray"}>
                              {r.type === "template" ? "模板" : "实例"}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] text-ink truncate">{r.title}</div>
                              <div className="text-[11px] text-ink-3 font-mono">
                                {r.id} · 固定引用{" "}
                                {[...new Set(r.pinnedRevision)].map((x) => "r" + x).join("/")}
                              </div>
                            </div>
                            <ExternalLink className="size-3 text-ink-3 mt-1" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      <Modal
        open={creating}
        title="新建资产"
        onClose={() => setCreating(false)}
        width={560}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>取消</Button>
            <Button variant="primary" disabled={dup} onClick={create}>
              创建并打开编辑器
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(["chart", "table", "fixed", "report"] as AssetKind[]).map((k) => {
            const I = KIND_ICON[k];
            return (
              <button
                key={k}
                onClick={() => setNewKind(k)}
                className={cx(
                  "flex items-start gap-2.5 p-3 rounded-lg border text-left",
                  newKind === k ? "border-brand-500 bg-brand-50" : "border-line hover:bg-gray-50",
                )}
              >
                <I className="size-5 text-brand-600 mt-0.5" />
                <div>
                  <div className="text-[13px] font-semibold text-ink">{KIND_LABEL[k]}</div>
                  <div className="text-[11.5px] text-ink-3">
                    {
                      {
                        chart: "柱/线/堆叠/双轴/桑基/甘特",
                        table: "明细 / 分组 / 交叉透视",
                        fixed: "A4 版式、合并、动态行",
                        report: "Tiptap 文档 + 资源节点",
                      }[k]
                    }
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <Field
          label="名称"
          hint={
            dup ? (
              <span className="text-red-600">已存在同名{KIND_LABEL[newKind]}，请换一个名称</span>
            ) : (
              "留空则使用默认名称"
            )
          }
        >
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`新建${KIND_LABEL[newKind]}`}
          />
        </Field>
      </Modal>

      <DeleteModal assetId={del} onClose={() => setDel(null)} onDeleted={() => setSel(null)} />
      <InsertModal assetId={insertFor} onClose={() => setInsertFor(null)} />

      <Modal
        open={reset}
        title="重置演示数据？"
        onClose={() => setReset(false)}
        footer={
          <>
            <Button onClick={() => setReset(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                app().resetDemo();
                setReset(false);
                setSel("DEMO-CHART-01");
                toast("已从 JSON 种子恢复全部演示资产与实例", "info");
              }}
            >
              确认重置
            </Button>
          </>
        }
      >
        将删除所有新增资产、共享新版本、个人视图、报告实例修订与模拟发布记录，恢复为 JSON
        种子状态。此操作不可撤销。
      </Modal>
    </>
  );
}

const KEY_LABELS: Record<string, string> = {
  title: "标题",
  chartType: "图型",
  dimensions: "维度",
  measure: "指标",
  aggregation: "聚合",
  viewParams: "数据参数",
  filters: "筛选",
  sort: "排序",
  style: "样式",
  mode: "模式",
  groupBy: "分组",
  rowDimensions: "行维度",
  columnDimensions: "列维度",
  colWidths: "列宽",
  rowHeights: "行高",
  merges: "合并",
  cells: "单元格",
  regions: "动态区",
  page: "纸张",
  doc: "正文",
  parameters: "参数",
};
const fieldKeyLabel = (k: string) => KEY_LABELS[k] ?? fieldLabel(k);

export function DeleteModal({
  assetId,
  onClose,
  onDeleted,
}: {
  assetId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const assets = useApp((s) => s.assets);
  const instances = useApp((s) => s.instances);
  const go = useUI((s) => s.go);
  if (!assetId || !assets[assetId]) return null;
  const a = assets[assetId];
  const refs = findReferences({ assets, instances }, assetId);
  const tpl = refs.filter((r) => r.type === "template");
  const inst = refs.filter((r) => r.type === "instance");
  const blocked = tpl.length > 0;
  return (
    <Modal
      open
      title={blocked ? "资产已被引用，无法直接删除" : `删除「${a.title}」？`}
      onClose={onClose}
      footer={
        blocked ? (
          <Button variant="primary" onClick={onClose}>
            取消删除
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                useApp.getState().deleteAsset(assetId);
                onClose();
                onDeleted?.();
                toast(`已删除 ${assetId}`);
              }}
            >
              确认删除
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <div className="space-y-3">
          <p>
            <b className="font-mono">{assetId}</b>{" "}
            正被以下报告模板引用。删除会使这些模板出现“引用失效”。请先在模板中移除或替换该节点后再删除。
          </p>
          <div className="space-y-1.5">
            {tpl.map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded border border-line">
                <Badge tone="brand">模板</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-ink truncate">{r.title}</div>
                  <div className="text-[11px] font-mono text-ink-3">
                    {r.id} r{r.revision} · 节点 {r.nodeIds.join("、")}
                  </div>
                </div>
                <Button
                  size="xs"
                  onClick={() => {
                    onClose();
                    go("report", { assetId: r.id });
                  }}
                >
                  查看引用
                </Button>
              </div>
            ))}
          </div>
          {inst.length > 0 && (
            <p className="text-[12px] text-ink-3">
              另有 {inst.length} 个报告实例引用（实例已保存资产快照，不受删除影响）。
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p>删除后该资产的所有版本与相关个人视图将被移除。</p>
          {inst.length > 0 && (
            <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              有 {inst.length} 个历史报告实例引用此资产；实例生成时已保存资产快照，内容不会改变。
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function InsertModal({ assetId, onClose }: { assetId: string | null; onClose: () => void }) {
  const assets = useApp((s) => s.assets);
  const go = useUI((s) => s.go);
  if (!assetId) return null;
  const a = assets[assetId];
  const tpls = Object.values(assets).filter((x) => x.kind === "report");
  return (
    <Modal
      open
      title={`插入「${a?.title}」到报告模板`}
      onClose={onClose}
      footer={<Button onClick={onClose}>取消</Button>}
    >
      <p className="mb-3">
        将以<b>引用</b>方式插入（保留 {assetId} r{a?.latest}{" "}
        的资产身份与版本），而不是静态图片。请选择目标模板：
      </p>
      <div className="space-y-1.5">
        {tpls.map((t) => (
          <button
            key={t.assetId}
            onClick={() => {
              onClose();
              go("report", { assetId: t.assetId, insertAssetId: assetId });
            }}
            className="w-full flex items-center gap-2 p-2.5 rounded-md border border-line hover:bg-brand-50 hover:border-brand-200 text-left"
          >
            <FileText className="size-4 text-brand-600" />
            <span className="flex-1 text-ink">{t.title}</span>
            <span className="font-mono text-[11px] text-ink-3">
              {t.assetId} r{t.latest}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DataCatalog() {
  return (
    <div className="flex-1 overflow-auto scroll-thin p-5 space-y-4">
      <Card
        title="演示数据集（只读 JSON 种子）"
        actions={<Badge tone="amber">SYNTHETIC_DEMO</Badge>}
      >
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[11px] text-ink-3 bg-gray-50">
              {["数据集 ID", "名称", "来源标识", "记录数", "维度", "指标", "单位", "说明"].map(
                (h) => (
                  <th key={h} className="text-left px-3 h-8 font-semibold border-b border-line">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {DATASET_IDS.map((id) => {
              const m = DATASETS[id];
              return (
                <tr key={id} className="border-b border-gray-100 align-top">
                  <td className="px-3 py-2 font-mono text-[11.5px]">{id}</td>
                  <td className="px-3 py-2">{m.label}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[10.5px] text-amber-800 bg-amber-50 px-1 rounded">
                      {m.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{getRecords(id).length}</td>
                  <td className="px-3 py-2 text-ink-2">{m.dims.map(fieldLabel).join("、")}</td>
                  <td className="px-3 py-2 text-ink-2">{m.measures.map(fieldLabel).join("、")}</td>
                  <td className="px-3 py-2">
                    {m.unit ?? <span className="text-ink-3">未定义单位</span>}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-3 max-w-[260px]">
                    {m.notForResourceAggregation && (
                      <Badge tone="red" className="mb-1">
                        不进入投入统计
                      </Badge>
                    )}
                    <div>{m.note}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card title="演示运行">
        <div className="p-3.5 grid grid-cols-3 gap-3">
          {RUNS.map((r) => (
            <div key={r.simulationId} className="rounded-md border border-line p-3">
              <div className="font-mono text-[12px] font-semibold">{r.simulationId}</div>
              <div className="text-[12px] text-ink-2">{r.label}</div>
              <div className="text-[11px] text-ink-3 mt-1">
                分支 {r.branchNames.join("/")} · Head Tick {Object.values(r.headByBranch).join("/")}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ViewsList() {
  const views = useApp((s) => s.views);
  const go = useUI((s) => s.go);
  return (
    <div className="flex-1 overflow-auto scroll-thin p-5">
      <Card title="个人视图（仅本地 ViewState，不改变共享资产）">
        {views.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink-3">
            暂无个人视图。在图表设计器、分析视图或分析表格中点击“保存个人视图”。
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {views.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Badge tone="violet">
                  {{ chart: "图表", table: "分析表", workspace: "分析视图" }[v.scope]}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink">{v.name}</div>
                  <div className="text-[11px] text-ink-3">
                    {v.assetId ? `${v.assetId} 基于 r${v.baseRevision} · ` : ""}
                    {new Date(v.savedAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    go(
                      v.scope === "workspace"
                        ? "workspace"
                        : v.scope === "chart"
                          ? "chart"
                          : "table",
                      { assetId: v.assetId, viewId: v.id },
                    )
                  }
                >
                  打开
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => useApp.getState().deleteView(v.id)}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
