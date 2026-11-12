import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { AssetBlock } from "../components/AssetBlock";
import { useReportCtx } from "./context";
import { ASSET_NODE_TYPES } from "../data/reports";
import { KNOWN_VARIABLES } from "../data/engine";
import { cx } from "../ui/kit";

function AssetNodeView({ node, selected }: ReactNodeViewProps) {
  const ctx = useReportCtx();
  const kind = ASSET_NODE_TYPES[node.type.name];
  const { assetId, assetRevision, overrides, nodeId } = node.attrs;
  const snap = ctx.resolveSnapshot(assetId, assetRevision);
  return (
    <NodeViewWrapper data-drag-handle="" contentEditable={false} className="cursor-pointer">
      <AssetBlock
        kind={kind}
        snapshot={snap}
        assetId={assetId}
        revision={assetRevision}
        overrides={overrides ?? {}}
        params={ctx.params}
        selected={selected}
        latestRevision={ctx.mode === "template" ? ctx.latestRevision(assetId) : undefined}
        nodeId={nodeId}
        interactive={false}
      />
    </NodeViewWrapper>
  );
}

const objAttr = (name: string) => ({
  default: {},
  parseHTML: (el: HTMLElement) => {
    try {
      return JSON.parse(el.getAttribute(`data-${name}`) || "{}");
    } catch {
      return {};
    }
  },
  renderHTML: (attrs: any) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? {}) }),
});

function assetNode(name: string) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return {
        nodeId: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-node-id"),
          renderHTML: (a) => ({ "data-node-id": a.nodeId }),
        },
        assetId: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-asset-id"),
          renderHTML: (a) => ({ "data-asset-id": a.assetId }),
        },
        assetRevision: {
          default: 1,
          parseHTML: (el) => Number(el.getAttribute("data-asset-revision")),
          renderHTML: (a) => ({ "data-asset-revision": a.assetRevision }),
        },
        displayMode: { default: "inline" },
        overrides: objAttr("overrides"),
      };
    },
    parseHTML() {
      return [{ tag: `div[data-type="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-type": name })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(AssetNodeView);
    },
  });
}

export const ChartAssetNode = assetNode("chartAsset");
export const TableAssetNode = assetNode("tableAsset");
export const FixedTableAssetNode = assetNode("fixedTableAsset");

export function VarChip({ name, value, preview }: { name: string; value: any; preview: boolean }) {
  const known = KNOWN_VARIABLES.has(name);
  if (preview && known)
    return (
      <span
        className="px-0.5 rounded bg-amber-50 border-b border-amber-300 font-medium tabular-nums"
        title={`{{${name}}}`}
      >
        {value === null || value === undefined ? `［${name}: 无数据］` : String(value)}
      </span>
    );
  return (
    <span
      data-var-chip
      className={cx(
        "inline-flex items-center px-1 mx-px rounded font-mono text-[12px] align-baseline",
        known ? "bg-violet-100 text-violet-800" : "bg-red-100 text-red-700",
      )}
      title={known ? `变量：${name}` : `未定义变量 ${name}`}
    >
      {`{{${name}}}`}
    </span>
  );
}

function VariableView({ node }: ReactNodeViewProps) {
  const ctx = useReportCtx();
  return (
    <NodeViewWrapper as="span" data-var-node="" contentEditable={false}>
      <VarChip name={node.attrs.name} value={ctx.vars[node.attrs.name]} preview={ctx.preview} />
    </NodeViewWrapper>
  );
}

export const VariableNode = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      name: {
        default: "simulationId",
        parseHTML: (el) => el.getAttribute("data-name"),
        renderHTML: (a) => ({ "data-name": a.name }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="variable"]' }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "variable" }),
      `{{${node.attrs.name}}}`,
    ];
  },
  renderText({ node }) {
    return `{{${node.attrs.name}}}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(VariableView);
  },
});
