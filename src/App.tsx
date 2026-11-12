import { useEffect } from "react";
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
} from "lucide-react";
import { useApp, useUI, type PageId } from "./store/store";
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
    items: [{ id: "assets", label: "组件与资产中心", icon: LayoutGrid, code: "P01" }],
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
      { id: "acceptance", label: "验收测试 A01–A40", icon: ShieldCheck, code: "QA" },
    ],
  },
];

function Page() {
  const page = useUI((s) => s.page);
  const params = useUI((s) => s.params);
  const key = JSON.stringify(params);
  switch (page) {
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

export default function App() {
  const page = useUI((s) => s.page);
  const go = useUI((s) => s.go);
  const pending = useUI((s) => s.pending);
  const dirty = useUI((s) => s.dirty);
  const confirmLeave = useUI((s) => s.confirmLeave);
  const cancelLeave = useUI((s) => s.cancelLeave);
  const toasts = useUI((s) => s.toasts);
  const counts = {
    n: useApp((s) => Object.keys(s.assets).length),
    i: useApp((s) => Object.keys(s.instances).length),
  };
  useEffect(() => {
    document.title = "报表与报告工作台 · DEMO";
    const h = (e: BeforeUnloadEvent) => {
      if (useUI.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);
  return (
    <div className="h-full flex min-w-[1200px]">
      <aside className="w-[220px] shrink-0 bg-white border-r border-line flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-line">
          <div className="size-7 rounded-md bg-brand-600 grid place-items-center">
            <BarChart3 className="size-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">报表与报告工作台</div>
            <div className="text-[10.5px] text-ink-3">Reporting Components · v3.0</div>
          </div>
        </div>
        <nav className="flex-1 overflow-auto scroll-thin px-2 py-3 space-y-4">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-2 mb-1 text-[10.5px] font-semibold text-gray-400 tracking-wider">
                {g.group}
              </div>
              {g.items.map((it) => {
                const I = it.icon;
                const on = page === it.id;
                return (
                  <button
                    key={it.id}
                    onClick={() => go(it.id)}
                    className={cx(
                      "w-full flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] transition-colors",
                      on
                        ? "bg-brand-50 text-brand-700 font-medium"
                        : "text-ink-2 hover:bg-gray-100",
                    )}
                  >
                    <I className={cx("size-4", on ? "text-brand-600" : "text-gray-400")} />
                    <span className="flex-1 text-left truncate">{it.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{it.code}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-line text-[11px] text-ink-3 space-y-1.5">
          <div className="inline-flex items-center h-5 px-1.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10.5px] font-semibold">
            DEMO / 演示数据
          </div>
          <div>
            {counts.n} 个资产 · {counts.i} 个报告实例
          </div>
          <div>所有数据为合成样例，状态保存在本浏览器</div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
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
