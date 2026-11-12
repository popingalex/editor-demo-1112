import { useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  Eye,
  EyeOff,
  Save,
  GitCommitHorizontal,
  Send,
  FileText,
  History,
  Database,
  Lock,
  ExternalLink,
} from "lucide-react";
import { useApp, useUI, toast } from "../store/store";
import type { Publication, ReportInstance } from "../data/types";
import { fmt } from "../data/engine";
import { collectRefs, overrideKeys, OVERRIDE_LABELS } from "../data/reports";
import { PageHeader } from "../ui/PageHeader";
import { Badge, Button, Card, Field, Modal, SaveState, Tabs, TextInput, cx } from "../ui/kit";
import { ReportWorkbench } from "../editor/ReportWorkbench";
import { ReportCtx } from "../editor/context";
import { DocRenderer } from "../editor/DocRenderer";
import { useDraft } from "./useDraft";

export function FrozenViewer({
  title,
  doc,
  selection,
  vars,
  snapshots,
  badge,
}: {
  title: string;
  doc: JSONContent;
  selection: ReportInstance["selection"];
  vars: ReportInstance["resolvedValues"];
  snapshots: ReportInstance["assetSnapshots"];
  badge?: React.ReactNode;
}) {
  return (
    <ReportCtx.Provider
      value={{
        mode: "frozen",
        params: selection,
        vars,
        preview: true,
        resolveSnapshot: (id, rev) => snapshots[`${id}@${rev}`] ?? null,
        latestRevision: () => undefined,
      }}
    >
      <div className="bg-white rounded-sm shadow-[0_2px_10px_rgba(16,24,40,.08)] px-12 py-10 relative">
        <div className="absolute top-3 right-4 flex items-center gap-2 text-[10px] font-semibold text-amber-700 tracking-wider">
          {badge}
          DEMO / 演示数据
        </div>
        <div className="text-[11px] text-ink-3 mb-2">{title}</div>
        <DocRenderer doc={doc} />
      </div>
    </ReportCtx.Provider>
  );
}

export function InstancesPage() {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const instances = useApp((s) => s.instances);
  const pubs = useApp((s) => s.publications);
  const list = Object.values(instances).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const id =
    params.instanceId && instances[params.instanceId] ? params.instanceId : list[0]?.instanceId;
  const inst = id ? instances[id] : undefined;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "综合报告", page: "report" }, { label: "报告实例与历史" }]}
        title="报告实例与历史"
        actions={
          <Button icon={<FileText className="size-3.5" />} onClick={() => go("generate")}>
            生成新实例
          </Button>
        }
      />
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[248px] shrink-0 bg-white border-r border-line overflow-auto scroll-thin">
          <div className="px-3.5 h-10 flex items-center text-[12.5px] font-semibold border-b border-line">
            报告实例（{list.length}）
          </div>
          {list.map((i) => (
            <button
              key={i.instanceId}
              onClick={() => go("instances", { instanceId: i.instanceId })}
              className={cx(
                "w-full text-left px-3.5 py-2.5 border-b border-gray-100",
                i.instanceId === id ? "bg-brand-50" : "hover:bg-gray-50",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11.5px] font-medium">{i.instanceId}</span>
                <span className="flex-1" />
                <Badge tone={i.state === "demo-published" ? "green" : "amber"}>
                  {i.state === "demo-published" ? "已模拟发布" : "草稿"}
                </Badge>
              </div>
              <div className="text-[12px] text-ink-2 truncate mt-0.5">{i.templateRef.title}</div>
              <div className="text-[11px] text-ink-3">
                {i.selection.simulationId} · Tick {i.selection.tick} · 修订 {i.currentRevision} ·
                发布 {pubs.filter((p) => p.instanceId === i.instanceId).length}
              </div>
            </button>
          ))}
        </aside>
        {inst ? (
          <InstanceDetail key={inst.instanceId} inst={inst} />
        ) : (
          <div className="flex-1 p-10 text-center text-ink-3">暂无实例，请先生成。</div>
        )}
      </div>
    </>
  );
}

function InstanceDetail({ inst }: { inst: ReportInstance }) {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const assets = useApp((s) => s.assets);
  const pubs = useApp((s) => s.publications).filter((p) => p.instanceId === inst.instanceId);
  const { draft, setDraft, dirty, markSaved, load } = useDraft<JSONContent>(
    inst.doc,
    `报告实例 · ${inst.instanceId}`,
  );
  const [tab, setTab] = useState<"edit" | "source" | "history">("edit");
  const [preview, setPreview] = useState(false);
  const [revModal, setRevModal] = useState(false);
  const [note, setNote] = useState("");
  const [viewPub, setViewPub] = useState<Publication | null>(
    params.publicationId
      ? (useApp.getState().publications.find((p) => p.publicationId === params.publicationId) ??
          null)
      : null,
  );
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [wbKey, setWbKey] = useState(0);
  const ctx = useMemo(
    () => ({
      mode: "instance" as const,
      params: inst.selection,
      vars: inst.resolvedValues,
      resolveSnapshot: (aid: string, rev: number) => inst.assetSnapshots[`${aid}@${rev}`] ?? null,
      latestRevision: (aid: string) => assets[aid]?.latest,
    }),
    [inst, assets],
  );
  const refs = collectRefs(draft);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="shrink-0 bg-white border-b border-line px-5 pt-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold truncate">{inst.title}</span>
          <Badge tone="gray">修订 {inst.currentRevision}</Badge>
          <Badge tone={inst.state === "demo-published" ? "green" : "amber"}>
            {inst.state === "demo-published" ? "已模拟发布" : "草稿"}
          </Badge>
          <SaveState dirty={dirty} label="实例有未保存修改" />
          <span className="flex-1" />
          <Button
            size="sm"
            icon={preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            active={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? "返回编辑" : "预览"}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Save className="size-3.5" />}
            disabled={!dirty}
            onClick={() => {
              useApp.getState().saveInstanceDoc(inst.instanceId, draft!);
              markSaved();
              toast("已保存实例修改：仅本报告生效，共享模板与资产未改变");
            }}
          >
            保存实例修改
          </Button>
          <Button
            size="sm"
            icon={<GitCommitHorizontal className="size-3.5" />}
            onClick={() => setRevModal(true)}
          >
            新建修订
          </Button>
          <Button
            size="sm"
            icon={<Send className="size-3.5" />}
            onClick={() => {
              if (dirty) return toast("请先保存实例修改，再进行模拟发布", "warn");
              const pid = useApp.getState().publishInstance(inst.instanceId);
              toast(`已模拟发布 ${pid}，内容已冻结`);
              setTab("history");
            }}
          >
            模拟发布
          </Button>
        </div>
        <div className="text-[11.5px] text-ink-3 mt-1">
          {inst.instanceId} · 模板 {inst.templateRef.assetId} r{inst.templateRef.revision} · 数据{" "}
          {inst.selection.simulationId} / {inst.selection.branch} / Tick {inst.selection.tick} ·
          生成于 {new Date(inst.createdAt).toLocaleString("zh-CN")} · {inst.provenance}
        </div>
        <Tabs
          className="mt-1 border-b-0"
          value={tab}
          onChange={setTab}
          items={[
            {
              value: "edit",
              label: (
                <>
                  <FileText className="size-3.5" />
                  编辑与预览
                </>
              ),
            },
            {
              value: "source",
              label: (
                <>
                  <Database className="size-3.5" />
                  来源摘要
                </>
              ),
            },
            {
              value: "history",
              label: (
                <>
                  <History className="size-3.5" />
                  修订与发布历史（{inst.revisions.length} / {pubs.length}）
                </>
              ),
            },
          ]}
        />
      </div>

      {tab === "edit" && (
        <>
          <div className="shrink-0 px-5 py-1.5 bg-violet-50 border-b border-violet-100 text-[12px] text-violet-900">
            实例编辑：正文与节点覆盖<b>仅本报告生效</b>，不会修改报告模板 {inst.templateRef.assetId}{" "}
            或任何共享资产。资产节点固定使用生成时的快照版本。
          </div>
          <ReportWorkbench
            key={wbKey}
            initialDoc={draft!}
            onDocChange={(d) => setDraft(d)}
            ctx={ctx}
            preview={preview}
            mode="instance"
            onReady={(d) => !dirty && load(d)}
          />
        </>
      )}

      {tab === "source" && (
        <div className="flex-1 overflow-auto scroll-thin p-5 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              ["资源投入合计", fmt(inst.resolvedValues.resourceInputTotal as number), "演示量"],
              ["转移累计人数", fmt(inst.resolvedValues.transferredTotal as number), "人（合成）"],
              ["转移目标", fmt(inst.resolvedValues.transferTarget as number), "人"],
              [
                "完成率",
                inst.resolvedValues.completionPercent === null
                  ? "—"
                  : `${inst.resolvedValues.completionPercent}%`,
                "",
              ],
            ].map(([l, v, u]) => (
              <div key={l} className="bg-white border border-line rounded-lg px-3.5 py-2.5">
                <div className="text-[11px] text-ink-3">{l}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {v} <span className="text-[11px] font-normal text-ink-3">{u}</span>
                </div>
              </div>
            ))}
          </div>
          <Card title="资产引用：实例固定版本 vs 共享当前版本">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-ink-3 bg-gray-50">
                  {["资产", "实例固定版本（快照）", "共享当前版本", "状态"].map((h) => (
                    <th key={h} className="text-left px-3.5 h-8 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(inst.assetSnapshots).map((s) => {
                  const latest = assets[s.assetId]?.latest;
                  return (
                    <tr key={s.assetId + s.revision} className="border-t border-gray-100">
                      <td className="px-3.5 py-2">
                        {s.title}
                        <div className="font-mono text-[11px] text-ink-3">{s.assetId}</div>
                      </td>
                      <td className="px-3.5 py-2 font-mono">r{s.revision}</td>
                      <td className="px-3.5 py-2 font-mono">{latest ? `r${latest}` : "已删除"}</td>
                      <td className="px-3.5 py-2">
                        {latest === s.revision ? (
                          <Badge tone="green">一致</Badge>
                        ) : (
                          <Badge tone="amber">
                            <Lock className="size-3" />
                            保持旧版本快照
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <Card title="节点解析结果与实例覆盖（最近保存）">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-ink-3 bg-gray-50">
                  {["节点", "资产", "结果摘要", "仅本报告覆盖"].map((h) => (
                    <th key={h} className="text-left px-3.5 h-8 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inst.resolvedData.map((r) => (
                  <tr key={r.nodeId} className="border-t border-gray-100 align-top">
                    <td className="px-3.5 py-2 font-mono text-[11px]">{r.nodeId}</td>
                    <td className="px-3.5 py-2">
                      {r.title}
                      <div className="font-mono text-[11px] text-ink-3">
                        {r.assetId} r{r.revision}
                      </div>
                    </td>
                    <td className="px-3.5 py-2 text-ink-2">
                      {r.summary}
                      {r.rows.length > 0 && (
                        <div className="text-[11px] text-ink-3">
                          {r.rows
                            .slice(0, 6)
                            .map((x) => `${x.label}=${fmt(x.value)}`)
                            .join("，")}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-2">
                      {overrideKeys(r.overrides).length ? (
                        overrideKeys(r.overrides).map((k) => (
                          <Badge key={k} tone="violet" className="mr-1">
                            {OVERRIDE_LABELS[k] ?? k}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-ink-3">无</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3.5 py-2 border-t border-line text-[11.5px] text-ink-3">
              当前编辑中的节点：{refs.length} 个 · 已保存的解析结果会在“保存实例修改”后更新
            </div>
          </Card>
        </div>
      )}

      {tab === "history" && (
        <div className="flex-1 overflow-auto scroll-thin p-5 grid grid-cols-2 gap-4 content-start">
          <Card title="实例修订">
            <div className="divide-y divide-gray-100">
              {[...inst.revisions].reverse().map((r) => (
                <div key={r.revision} className="px-3.5 py-2.5 flex items-center gap-3">
                  <Badge tone={r.revision === inst.currentRevision ? "brand" : "gray"}>
                    修订 {r.revision}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px]">{r.note}</div>
                    <div className="text-[11px] text-ink-3">
                      {new Date(r.savedAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <Button size="xs" onClick={() => setViewRev(r.revision)}>
                    查看
                  </Button>
                </div>
              ))}
            </div>
          </Card>
          <Card title="模拟发布记录（冻结内容）">
            {pubs.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-3">尚未模拟发布</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pubs.map((p) => (
                  <div key={p.publicationId} className="px-3.5 py-2.5 flex items-center gap-3">
                    <Badge tone="green">DEMO 发布</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-mono">{p.publicationId}</div>
                      <div className="text-[11px] text-ink-3">
                        修订 {p.instanceRevision} · {new Date(p.createdAt).toLocaleString("zh-CN")}{" "}
                        · {Object.keys(p.frozenContent.assetSnapshots).length} 个资产快照
                      </div>
                    </div>
                    <Button
                      size="xs"
                      icon={<ExternalLink className="size-3" />}
                      onClick={() => setViewPub(p)}
                    >
                      查看冻结内容
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={revModal}
        title={`从实例创建新修订（修订 ${Math.max(...inst.revisions.map((r) => r.revision)) + 1}）`}
        onClose={() => setRevModal(false)}
        footer={
          <>
            <Button onClick={() => setRevModal(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                const rev = useApp.getState().createInstanceRevision(inst.instanceId, draft!, note);
                markSaved();
                setRevModal(false);
                setNote("");
                setWbKey((k) => k + 1);
                toast(`已创建修订 ${rev}；实例状态回到草稿，旧发布记录保持不变`);
              }}
            >
              创建修订
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>以当前编辑内容创建新的实例修订。既有修订与发布记录保持原样。</p>
          <Field label="修订说明">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：图表改为按目标"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!viewPub}
        title={`冻结内容：${viewPub?.publicationId ?? ""}`}
        onClose={() => setViewPub(null)}
        width={920}
      >
        {viewPub && (
          <div className="bg-[#EEF0F3] -mx-5 -my-4 p-5">
            <div className="mb-3 text-[12px] text-ink-2">
              {viewPub.frozenContent.title} · 修订 {viewPub.instanceRevision} ·{" "}
              {new Date(viewPub.createdAt).toLocaleString("zh-CN")} · 状态 {viewPub.state} · 模板{" "}
              {viewPub.frozenContent.templateRef.assetId} r
              {viewPub.frozenContent.templateRef.revision}
            </div>
            <FrozenViewer
              title={`${viewPub.publicationId} · 冻结发布`}
              doc={viewPub.frozenContent.doc}
              selection={viewPub.frozenContent.selection}
              vars={viewPub.frozenContent.resolvedValues}
              snapshots={viewPub.frozenContent.assetSnapshots}
              badge={<Badge tone="green">已冻结</Badge>}
            />
          </div>
        )}
      </Modal>
      <Modal
        open={viewRev !== null}
        title={`实例修订 ${viewRev}`}
        onClose={() => setViewRev(null)}
        width={920}
      >
        {viewRev !== null && (
          <div className="bg-[#EEF0F3] -mx-5 -my-4 p-5">
            <FrozenViewer
              title={`${inst.instanceId} · 修订 ${viewRev}`}
              doc={inst.revisions.find((r) => r.revision === viewRev)!.doc}
              selection={inst.selection}
              vars={inst.resolvedValues}
              snapshots={inst.assetSnapshots}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
