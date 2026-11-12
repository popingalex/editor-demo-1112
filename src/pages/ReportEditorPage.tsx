import { useState } from "react";
import { Eye, EyeOff, Save, Wand2, RefreshCw, Undo2 } from "lucide-react";
import { useApp, useUI, latestDef, toast } from "../store/store";
import type { ReportDef } from "../data/types";
import { snapshotFor, collectRefs, collectInlineRefs } from "../data/reports";
import { envFromRecords } from "../data/registry";
import { PageHeader } from "../ui/PageHeader";
import { Badge, Button, Field, InlineEdit, Modal, SaveState, Select, TextInput } from "../ui/kit";
import { ReportWorkbench } from "../editor/ReportWorkbench";
import { useDraft } from "./useDraft";

export function ReportEditorPage() {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const assets = useApp((s) => s.assets);
  const list = Object.values(assets).filter((a) => a.kind === "report");
  const assetId =
    params.assetId && assets[params.assetId]?.kind === "report" ? params.assetId : list[0]?.assetId;
  const asset = assetId ? assets[assetId] : undefined;
  const {
    draft: def,
    setDraft,
    dirty,
    markSaved,
    load,
  } = useDraft<ReportDef>(latestDef<ReportDef>(asset), `综合报告模板 · ${assetId}`);
  const [preview, setPreview] = useState(false);
  const [save, setSave] = useState(false);
  const [note, setNote] = useState("");
  const [wbKey, setWbKey] = useState(0);
  const resources = useApp((s) => s.resources);
  if (!asset || !def) return <div className="p-10 text-center text-ink-3">暂无报告模板</div>;
  const varValues = def.variableValues ?? {};
  const ctx = {
    mode: "template" as const,
    params: def.parameters,
    env: envFromRecords(resources, { varValues, reportTitle: def.title }),
    resolveSnapshot: (id: string, rev: number) => snapshotFor(assets, id, rev),
    latestRevision: (id: string) => assets[id]?.latest,
  };
  const refs = collectRefs(def.doc);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "组件与资产中心", page: "assets" },
          { label: "综合报告编辑器" },
          { label: asset.assetId },
        ]}
        title={<InlineEdit value={def.title} onCommit={(v) => setDraft({ ...def, title: v })} />}
        meta={
          <>
            <Badge tone="brand">模板 r{asset.latest}</Badge>
            <SaveState dirty={dirty} />
          </>
        }
        actions={
          <>
            <Select
              className="w-60"
              value={assetId!}
              onChange={(v) => go("report", { assetId: v })}
              options={list.map((a) => ({ value: a.assetId, label: `${a.assetId} · ${a.title}` }))}
            />
            <Button
              variant="ghost"
              icon={<Undo2 className="size-3.5" />}
              disabled={!dirty}
              onClick={() => {
                load(latestDef<ReportDef>(assets[asset.assetId])!);
                setWbKey((k) => k + 1);
              }}
            >
              放弃修改
            </Button>
            <Button
              icon={<RefreshCw className="size-3.5" />}
              title="从已保存的最新版本重新打开（验证保存无损）"
              disabled={dirty}
              onClick={() => {
                load(latestDef<ReportDef>(useApp.getState().assets[asset.assetId])!);
                setWbKey((k) => k + 1);
                toast(
                  `已从 ${asset.assetId} r${useApp.getState().assets[asset.assetId].latest} 重新打开`,
                  "info",
                );
              }}
            >
              重新打开
            </Button>
            <Button
              icon={preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              active={preview}
              onClick={() => setPreview(!preview)}
            >
              {preview ? "返回编辑" : "预览"}
            </Button>
            <Button
              variant="primary"
              icon={<Save className="size-3.5" />}
              onClick={() => setSave(true)}
            >
              保存模板
            </Button>
            <Button
              icon={<Wand2 className="size-3.5" />}
              onClick={() => go("generate", { templateId: asset.assetId })}
            >
              生成实例
            </Button>
          </>
        }
      />
      <ReportWorkbench
        key={wbKey}
        initialDoc={def.doc}
        onDocChange={(d) => setDraft((cur) => (cur ? { ...cur, doc: d } : cur))}
        ctx={ctx}
        preview={preview}
        mode="template"
        onParamsChange={(p) => setDraft({ ...def, parameters: p })}
        onReady={(d) => {
          if (!dirty) load({ ...def, doc: d });
        }}
        insertAssetId={params.insertAssetId}
        docKey={asset.assetId}
        varValues={varValues}
        onVarValue={(id, v) =>
          setDraft((cur) => {
            if (!cur) return cur;
            const vv = { ...(cur.variableValues ?? {}) };
            if (v === null) delete vv[id];
            else vv[id] = v;
            return { ...cur, variableValues: vv };
          })
        }
      />
      <Modal
        open={save}
        title={`保存报告模板：${asset.assetId} r${asset.latest + 1}`}
        onClose={() => setSave(false)}
        footer={
          <>
            <Button onClick={() => setSave(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                const rev = useApp.getState().saveRevision(asset.assetId, def, note);
                markSaved();
                setSave(false);
                setNote("");
                toast(`已保存模板 r${rev}：正文、${refs.length} 个资源节点与覆盖配置已持久化`);
              }}
            >
              保存 r{asset.latest + 1}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-brand-50 border border-brand-100 p-3 text-[12.5px] space-y-1">
            <div>
              <b>作用范围：报告模板</b>。保存 Tiptap 文档 JSON（含 {refs.length} 个资源节点的
              assetId / assetRevision / overrides）、{collectInlineRefs(def.doc).length}{" "}
              个行内变量/表达式引用（含 ID 与修订）、模板变量值 {Object.keys(def.variableValues ?? {}).length} 项与默认参数。
            </div>
            <div>已生成的报告实例不受影响。</div>
          </div>
          <div className="text-[11.5px] font-mono text-ink-3 space-y-0.5">
            {refs.map((r) => (
              <div key={r.nodeId}>
                {r.nodeId} → {r.assetId} r{r.assetRevision}{" "}
                {Object.keys(r.overrides).length ? `overrides: ${JSON.stringify(r.overrides)}` : ""}
              </div>
            ))}
          </div>
          <Field label="版本说明">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：新增结论章节"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
