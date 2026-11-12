import type { JSONContent } from "@tiptap/core";
import { Fragment, type ReactNode } from "react";
import { AssetBlock } from "../components/AssetBlock";
import { ASSET_NODE_TYPES } from "../data/reports";
import { useReportCtx } from "./context";
import { InlineChip } from "./extensions";

const KNOWN = new Set(["doc", "heading", "paragraph", "bulletList", "orderedList", "listItem", "blockquote", "horizontalRule", "hardBreak", "text", "variable", "expressionRef", "chartAsset", "tableAsset", "fixedTableAsset", "codeBlock"]);

function Marks({ marks, children }: { marks?: JSONContent["marks"]; children: ReactNode }) {
  let out = children;
  for (const m of marks ?? []) {
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "strike") out = <s>{out}</s>;
    else if (m.type === "underline") out = <u>{out}</u>;
    else if (m.type === "code")
      out = <code className="px-1 rounded bg-gray-100 text-[12.5px]">{out}</code>;
  }
  return <>{out}</>;
}

function RNode({ n, idx }: { n: JSONContent; idx: number }) {
  const ctx = useReportCtx();
  const kids = (n.content ?? []).map((c, i) => <RNode key={i} n={c} idx={i} />);
  switch (n.type) {
    case "doc":
      return <>{kids}</>;
    case "heading": {
      const L = `h${n.attrs?.level ?? 1}` as "h1";
      return <L data-heading-index={idx}>{kids}</L>;
    }
    case "paragraph":
      return <p>{kids.length ? kids : <br />}</p>;
    case "bulletList":
      return <ul>{kids}</ul>;
    case "orderedList":
      return <ol>{kids}</ol>;
    case "listItem":
      return <li>{kids}</li>;
    case "blockquote":
      return <blockquote>{kids}</blockquote>;
    case "horizontalRule":
      return <hr className="my-4 border-line" />;
    case "hardBreak":
      return <br />;
    case "text":
      return <Marks marks={n.marks}>{n.text}</Marks>;
    case "variable":
      return <InlineChip refAttrs={n.attrs ?? {}} type="variable" preview={ctx.preview} />;
    case "expressionRef":
      return <InlineChip refAttrs={n.attrs ?? {}} type="expressionRef" preview={ctx.preview} />;
    default:
      if (n.type && ASSET_NODE_TYPES[n.type]) {
        const a = n.attrs ?? {};
        return (
          <AssetBlock
            kind={ASSET_NODE_TYPES[n.type]}
            snapshot={ctx.resolveSnapshot(a.assetId, a.assetRevision)}
            assetId={a.assetId}
            revision={a.assetRevision}
            overrides={a.overrides ?? {}}
            params={ctx.params}
            env={ctx.env}
            nodeId={a.nodeId}
            latestRevision={ctx.mode === "template" ? ctx.latestRevision(a.assetId) : undefined}
          />
        );
      }
      if (n.type && !KNOWN.has(n.type))
        return (
          <div className="my-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            未知节点类型 “{n.type}”：已保留在 JSON 中，当前版本无法渲染
          </div>
        );
      return <Fragment>{kids}</Fragment>;
  }
}

export function DocRenderer({ doc }: { doc: JSONContent }) {
  return (
    <div className="report-doc">
      {(doc.content ?? []).map((n, i) => (
        <RNode key={i} n={n} idx={i} />
      ))}
    </div>
  );
}
