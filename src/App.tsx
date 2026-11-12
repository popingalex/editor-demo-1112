import { useEffect, useState } from "react";
import {
  LayoutGrid,
  BarChart3,
  Table2,
  FileSpreadsheet,
  FileText,
  Wand2,
  History,
  Activity,
  ShieldCheck,
  Layers,
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Database,
} from "lucide-react";
import { useApp, useUI, usePanel, storageStatus, unblockStorageWithSeed, type PageId } from "./store/store";
import { ResizeHandle } from "./ui/SidePanel";
import { ResourceEditor } from "./pages/ResourceEditor";
import { Button, Modal, cx } from "./ui/kit";
import { AssetCenter } from "./pages/AssetCenter";
import { ChartStudio } from "./pages/ChartStudio";
import { Workspace } from "./pages/Workspace";
import { TableStudio } from "./pages/TableStudio";
import { FixedStudio } from "./pages/FixedStudio";
import { ReportEditorPage } from "./pages/ReportEditorPage";
import { GeneratePage } from "./pages/GeneratePage";
import { InstancesPage } from "./pages/InstancesPage";
import { StatesPage } from "./pages/StatesPage";
import { AcceptancePage } from "./pages/AcceptancePage";

const NAV: { group: string; items: { id: PageId; label: string; icon: any; code: string }[] }[] = [
  {
    group: "资产",
    items: [
      { id: "assets", label: "共享资源与资产中心", icon: LayoutGrid, code: "P01" },
      { id: "resource", label: "数据集 / 变量 / 表达式", icon: Database, code: "R" },
    ],
  },
  {
    group: "分析",
    items: [
      { id: "workspace", label: "分析视图", icon: Layers, code: "P03" },
      { id: "chart", label: "图表设计器", icon: BarChart3, code: "P02" },
      { id: "table", label: "分析型表格设计器", icon: Table2, code: "P04" },
    ],
  },
  {
    group: "报表",
    items: [{ id: "fixed", label: "固定格式报表设计器", icon: FileSpreadsheet, code: "P05" }],
  },
  {
    group: "报告",
    items: [
      { id: "report", label: "综合报告编辑器", icon: FileText, code: "P06" },
      { id: "generate", label: "模拟报告生成", icon: Wand2, code: "P07" },
      { id: "instances", label: "报告实例与历史", icon: History, code: "P08" },
    ],
  },
  {
    group: "质量",
    items: [
      { id: "states", label: "组件状态展台", icon: Activity, code: "P09" },
      { id: "acceptance", label: "验收 A01–A40 / E01–E31", icon: ShieldCheck, code: "QA" },
    ],
  },
];

function Page() {
  const page = useUI((s) => s.page);
  const params = useUI((s) => s.params);
  const key = JSON.stringify(params);
  switch (page) {
    case "resource":
      return <ResourceEditor key={key} />;
    case "chart":
      return <ChartStudio key={key} />;
    case "workspace":
      return <Workspace key={key} />;
    case "table":
      return <TableStudio key={key} />;
    case "fixed":
      return <FixedStudio key={key} />;
    case "report":
      return <ReportEditorPage key={key} />;
    case "generate":
      return <GeneratePage key={key} />;
    case "instances":
      return <InstancesPage key={key} />;
    case "states":
      return <StatesPage />;
    case "acceptance":
      return <AcceptancePage />;
    default:
      return <AssetCenter key={key} />;
  }
}

function GlobalNav() {
  const page = useUI((s) => s.page);
  const go = useUI((s) => s.go);
  const setPanel = useUI((s) => s.setPanel);
  const pref = usePanel("nav");
  const counts = {
    n: useApp((s) => Object.keys(s.assets).length + Object.keys(s.resources).length),
    i: useApp((s) => Object.keys(s.instances).length),
  };
  const collapsed = pref.collapsed;
  return (
    <aside
      data-panel="nav"
      data-collapsed={collapsed ? "true" : "false"}
      style={{ width: collapsed ? 56 : pref.width }}
      className="relative shrink-0 bg-white border-r border-line flex flex-col"
    >
      <div className={cx("h-14 flex items-center border-b border-line", collapsed ? "justify-center" : "px-4 gap-2.5")}>
        <div className="size-7 rounded-md bg-brand-600 grid place-items-center shrink-0">
          <BarChart3 className="size-4 text-white" />
        </div>
        {!collapsed && (
          <div className="leading-tight min-w-0">
            <div className="text-[13px] font-semibold truncate">报表与报告工作台</div>
            <div className="text-[10.5px] text-ink-3">Reporting Components · v6.0</div>
          </div>
        )}
      </div>
      <nav id="global-nav" className={cx("flex-1 overflow-auto scroll-thin py-3 space-y-4", collapsed ? "px-1.5" : "px-2")}>
        {NAV.map((g) => (
          <div key={g.group}>
            {!collapsed && <div className="px-2 mb-1 text-[10.5px] font-semibold text-gray-400 tracking-wider">{g.group}</div>}
            {g.items.map((it) => {
              const I = it.icon;
              const on = page === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => go(it.id)}
                  title={collapsed ? it.label : undefined}
                  aria-label={it.label}
                  className={cx(
                    "w-full flex items-center h-8 rounded-md text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    collapsed ? "justify-center" : "gap-2.5 px-2",
                    on ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-2 hover:bg-gray-100",
                  )}
                >
                  <I className={cx("size-4 shrink-0", on ? "text-brand-600" : "text-gray-400")} />
                  {!collapsed && <span className="flex-1 text-left truncate">{it.label}</span>}
                  {!collapsed && <span className="text-[10px] text-gray-400 font-mono">{it.code}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className={cx("border-t border-line text-[11px] text-ink-3", collapsed ? "p-1.5 flex flex-col items-center gap-1.5" : "p-3 space-y-1.5")}>
        {!collapsed && (
          <>
            <div className="inline-flex items-center h-5 px-1.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10.5px] font-semibold">DEMO / 演示数据</div>
            <div>
              {counts.n} 个共享定义 · {counts.i} 个报告实例
            </div>
          </>
        )}
        <button
          aria-expanded={!collapsed}
          aria-controls="global-nav"
          aria-label={collapsed ? "展开全局导航" : "收起全局导航"}
          title={collapsed ? "展开全局导航" : "收起全局导航"}
          data-toggle="nav"
          onClick={() => setPanel("nav", { collapsed: !collapsed })}
          className={cx("flex items-center gap-1.5 h-7 rounded-md text-ink-2 hover:bg-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-brand-500", collapsed ? "w-8 justify-center bg-brand-50 text-brand-700" : "px-2 w-full")}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && "收起导航"}
        </button>
      </div>
      {!collapsed && <ResizeHandle id="nav" side="left" />}
    </aside>
  );
}

function StorageBanner() {
  const [, force] = useState(0);
  if (!storageStatus.blocked && storageStatus.boot !== "migrated") return null;
  if (!storageStatus.blocked) return null;
  const download = () => {
    const raw = storageStatus.backupKey ? localStorage.getItem(storageStatus.backupKey) : localStorage.getItem("rr-workbench-v3");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw ?? ""], { type: "application/json" }));
    a.download = "rr-workbench-original-backup.json";
    a.click();
  };
  return (
    <div role="alert" className="shrink-0 bg-red-50 border-b border-red-200 px-5 py-2.5 text-[12.5px] text-red-900 flex items-start gap-3">
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <b>本地存储无法迁移</b>：{storageStatus.error}
        {storageStatus.issues.length > 0 && <span>（{storageStatus.issues.slice(0, 3).join("；")}）</span>}
        。原始数据未被覆盖，写入已暂停{storageStatus.backupKey ? `，备份键 ${storageStatus.backupKey}` : ""}。
      </div>
      <Button size="sm" onClick={download}>下载原始数据</Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => {
          unblockStorageWithSeed();
          force((x) => x + 1);
        }}
      >
        以 DEMO 种子继续（原数据保留在备份中）
      </Button>
    </div>
  );
}

export default function App() {
  const pending = useUI((s) => s.pending);
  const dirty = useUI((s) => s.dirty);
  const confirmLeave = useUI((s) => s.confirmLeave);
  const cancelLeave = useUI((s) => s.cancelLeave);
  const toasts = useUI((s) => s.toasts);
  useEffect(() => {
    document.title = "报表与报告工作台 · DEMO";
    const h = (e: BeforeUnloadEvent) => {
      if (useUI.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);
  return (
    <div className="h-full flex min-w-[1024px]">
      <GlobalNav />
      <main className="flex-1 min-w-0 flex flex-col">
        <StorageBanner />
        <Page />
      </main>

      <Modal
        open={!!pending}
        title="放弃未保存的修改？"
        onClose={cancelLeave}
        footer={
          <>
            <Button onClick={cancelLeave}>继续编辑</Button>
            <Button variant="danger" onClick={confirmLeave}>
              放弃修改并离开
            </Button>
          </>
        }
      >
        当前页面「{dirty}
        」有未保存的修改。离开后这些修改将丢失；如需保留，请先选择对应的保存操作（个人视图 /
        共享新版本 / 实例修改）。
      </Modal>

      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 items-end">
        {toasts.map((t) => {
          const I = { success: CheckCircle2, info: Info, warn: AlertTriangle, error: XCircle }[
            t.tone
          ];
          return (
            <div
              key={t.id}
              className={cx(
                "flex items-start gap-2 max-w-sm px-3.5 py-2.5 rounded-lg shadow-lg border text-[13px] bg-white",
                t.tone === "success" && "border-emerald-200",
                t.tone === "warn" && "border-amber-200",
                t.tone === "error" && "border-red-200",
              )}
            >
              <I
                className={cx(
                  "size-4 mt-0.5 shrink-0",
                  t.tone === "success"
                    ? "text-emerald-600"
                    : t.tone === "warn"
                      ? "text-amber-600"
                      : t.tone === "error"
                        ? "text-red-600"
                        : "text-brand-600",
                )}
              />
              <span className="text-ink-2">{t.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
