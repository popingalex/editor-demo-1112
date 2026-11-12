import { useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { useUI } from "../store/store";
import { runAcceptance } from "../qa/acceptance";
import { PageHeader } from "../ui/PageHeader";
import { Badge, Button, Card, cx } from "../ui/kit";

export function AcceptancePage() {
  const go = useUI((s) => s.go);
  const [n, setN] = useState(0);
  const results = useMemo(() => runAcceptance(), [n]);
  const pass = results.filter((r) => r.pass).length;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "验收测试" }]}
        title="验收测试 A01–A40"
        meta={
          <Badge tone={pass === results.length ? "green" : "amber"}>
            {pass} / {results.length} PASS
          </Badge>
        }
        actions={
          <Button icon={<RefreshCw className="size-3.5" />} onClick={() => setN(n + 1)}>
            重新执行
          </Button>
        }
      />
      <div className="flex-1 overflow-auto scroll-thin p-5 space-y-3">
        <div className="text-[12.5px] text-ink-2 bg-white border border-line rounded-lg p-3.5 leading-relaxed">
          每项测试都会在<b>隔离的内存 store</b>{" "}
          中执行真实操作（创建资产、发布版本、生成实例、保存覆盖、模拟发布等），并用与界面相同的数据层计算结果，不会修改你当前的本地数据。“界面入口”列可直接跳转到对应页面人工复核。
        </div>
        <Card>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-ink-3 bg-gray-50">
                {["编号", "测试动作", "通过标准", "实际结果", "结果", "界面入口"].map((h) => (
                  <th key={h} className="text-left px-3 h-9 font-semibold border-b border-line">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 align-top">
                  <td className="px-3 py-2.5 font-mono font-semibold">{r.id}</td>
                  <td className="px-3 py-2.5 w-48">{r.title}</td>
                  <td className="px-3 py-2.5 w-56 text-ink-3">{r.criteria}</td>
                  <td className="px-3 py-2.5 text-ink-2 text-[12px] leading-relaxed">{r.detail}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cx(
                        "inline-flex items-center gap-1 font-semibold",
                        r.pass ? "text-emerald-700" : "text-red-700",
                      )}
                    >
                      {r.pass ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <XCircle className="size-4" />
                      )}
                      {r.pass ? "PASS" : "FAIL"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 w-52">
                    <button
                      onClick={() => go(r.entry.page, r.entry.params)}
                      className="inline-flex items-center gap-1 text-brand-600 font-medium hover:underline"
                    >
                      {r.entry.label}
                      <ArrowRight className="size-3" />
                    </button>
                    <div className="text-[11px] text-ink-3 mt-0.5">{r.ui}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
