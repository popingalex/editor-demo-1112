import { useMemo, useState } from 'react'
import { RefreshCw, CheckCircle2, XCircle, ArrowRight, CircleDashed } from 'lucide-react'
import { useUI } from '../store/store'
import { runAcceptance, type AResult } from '../qa/acceptance'
import { runExtended } from '../qa/extended'
import { PageHeader } from '../ui/PageHeader'
import { Badge, Button, Card, Tabs, cx } from '../ui/kit'

function ResultTable({ results }: { results: AResult[] }) {
  const go = useUI((s) => s.go)
  return (
    <Card>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[11px] text-ink-3 bg-gray-50">
            {['编号', '测试动作', '通过标准', '方式', '实际结果 / 证据', '结果', '界面入口'].map((h) => (
              <th key={h} className="text-left px-3 h-9 font-semibold border-b border-line">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 align-top" data-result={r.id} data-status={r.status}>
              <td className="px-3 py-2.5 font-mono font-semibold">{r.id}</td>
              <td className="px-3 py-2.5 w-48">{r.title}</td>
              <td className="px-3 py-2.5 w-52 text-ink-3">{r.criteria}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <Badge tone={r.method === '页面交互' ? 'amber' : r.method === 'Store' ? 'violet' : 'gray'}>{r.method}</Badge>
              </td>
              <td className="px-3 py-2.5 text-ink-2 text-[12px] leading-relaxed">{r.detail}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <span className={cx('inline-flex items-center gap-1 font-semibold', r.status === 'PASS' ? 'text-emerald-700' : r.status === 'FAIL' ? 'text-red-700' : 'text-amber-700')}>
                  {r.status === 'PASS' ? <CheckCircle2 className="size-4" /> : r.status === 'FAIL' ? <XCircle className="size-4" /> : <CircleDashed className="size-4" />}
                  {r.status}
                </span>
              </td>
              <td className="px-3 py-2.5 w-48">
                <button onClick={() => go(r.entry.page, r.entry.params)} className="inline-flex items-center gap-1 text-brand-600 font-medium hover:underline">
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
  )
}

export function AcceptancePage() {
  const [n, setN] = useState(0)
  const [tab, setTab] = useState<'E' | 'A'>('E')
  const a = useMemo(() => runAcceptance(), [n])
  const e = useMemo(() => runExtended(), [n])
  const cnt = (rs: AResult[]) => ({ pass: rs.filter((r) => r.status === 'PASS').length, fail: rs.filter((r) => r.status === 'FAIL').length, nv: rs.filter((r) => r.status === 'NOT_VERIFIED').length })
  const ca = cnt(a)
  const ce = cnt(e)
  return (
    <>
      <PageHeader
        crumbs={[{ label: '验收测试' }]}
        title="验收测试"
        meta={
          <>
            <Badge tone="green">E：{ce.pass} PASS</Badge>
            {ce.fail > 0 && <Badge tone="red">{ce.fail} FAIL</Badge>}
            <Badge tone="amber">{ce.nv} NOT_VERIFIED</Badge>
            <Badge tone="gray">
              A：{ca.pass} PASS / {ca.nv} NOT_VERIFIED
            </Badge>
          </>
        }
        actions={
          <Button icon={<RefreshCw className="size-3.5" />} onClick={() => setN(n + 1)}>
            重新执行
          </Button>
        }
      />
      <div className="flex-1 overflow-auto scroll-thin p-5 space-y-3">
        <div className="text-[12.5px] text-ink-2 bg-white border border-line rounded-lg p-3.5 leading-relaxed">
          应用内只执行<b>纯函数</b>与<b>隔离 Store</b> 测试（在独立内存 store 中真实执行创建资源、发布版本、生成实例、保存覆盖、模拟发布、迁移旧夹具等，不修改你的本地数据）。<b>页面交互</b>类用例（面板折叠/拖宽、/ 菜单键盘操作、刷新恢复、控件遍历）应用内无法自动点击，一律显示 NOT_VERIFIED，不以计算测试冒充 UI 通过；其浏览器自动化结果在交付报告中单独给出。
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'E', label: `v6.0 验收 E01–E31（${e.length}）` },
            { value: 'A', label: `原计算回归 A01–A40（${a.length}）` },
          ]}
        />
        <ResultTable results={tab === 'E' ? e : a} />
      </div>
    </>
  )
}
