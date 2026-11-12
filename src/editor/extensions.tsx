import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { AssetBlock } from "../components/AssetBlock";
import { useReportCtx, useInlineValue } from "./context";
import { formatResult } from "../data/expr";
import { ASSET_NODE_TYPES } from "../data/reports";
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
        env={ctx.env}
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

/** Inline chip for shared variables / expressions — identical in editor and preview, except styling. */
export function InlineChip({ refAttrs, type, preview, selected }: { refAttrs: Record<string, any>; type: 'variable' | 'expressionRef'; preview: boolean; selected?: boolean }) {
  const { result, snap, frozen } = useInlineValue({ type, name: refAttrs.name, assetId: refAttrs.assetId ?? undefined, revision: refAttrs.revision ?? undefined })
  const decimals = type === 'expressionRef' ? ((snap?.def as any)?.decimals ?? null) : null
  const text = formatResult(result, decimals)
  const label = type === 'expressionRef' ? (snap?.title ?? refAttrs.assetId) : ((snap?.def as any)?.name ?? refAttrs.name)
  const idText = refAttrs.assetId ? `${refAttrs.assetId}@r${refAttrs.revision}` : `旧变量名 ${refAttrs.name}（按别名解析${snap ? ` → ${snap.assetId}@r${snap.revision}` : ''}）`
  const title = `${type === 'expressionRef' ? '共享表达式' : '共享变量'} ${label} · ${idText} · ${result.status === 'invalid' ? '错误：' + result.message : '值 ' + text}${frozen ? ' · 发布时冻结' : ''}`
  const invalid = result.status === 'invalid'
  if (preview)
    return (
      <span data-inline-value={type} data-status={result.status} className={cx('px-0.5 rounded font-medium tabular-nums', invalid ? 'bg-red-50 text-red-700 border-b border-red-300' : 'bg-amber-50 border-b border-amber-300')} title={title}>
        {invalid ? `⚠ ${label}：${result.message}` : text}
      </span>
    )
  return (
    <span
      data-var-chip
      data-inline-value={type}
      data-status={result.status}
      title={title}
      className={cx(
        'inline-flex items-center gap-1 px-1 mx-px rounded text-[12px] align-baseline',
        invalid ? 'bg-red-100 text-red-700' : type === 'expressionRef' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-violet-100 text-violet-800',
        selected && 'ring-2 ring-brand-500',
      )}
    >
      <span className="font-mono text-[10.5px] opacity-70">{type === 'expressionRef' ? 'ƒ' : '{x}'}</span>
      <span>{label}</span>
      <span className="font-semibold tabular-nums">= {invalid ? '错误' : text}</span>
      {!refAttrs.assetId && type === 'variable' && <span className="text-[9.5px] opacity-60">旧</span>}
    </span>
  )
}

function VariableView({ node, selected }: ReactNodeViewProps) {
  const ctx = useReportCtx()
  return (
    <NodeViewWrapper as="span" data-var-node="" contentEditable={false}>
      <InlineChip refAttrs={node.attrs} type="variable" preview={ctx.preview} selected={selected} />
    </NodeViewWrapper>
  )
}

function ExpressionView({ node, selected }: ReactNodeViewProps) {
  const ctx = useReportCtx()
  return (
    <NodeViewWrapper as="span" data-expr-node="" contentEditable={false}>
      <InlineChip refAttrs={node.attrs} type="expressionRef" preview={ctx.preview} selected={selected} />
    </NodeViewWrapper>
  )
}

const plainAttr = (name: string, def: any = null, num = false) => ({
  default: def,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(`data-${name}`)
    return v === null ? def : num ? Number(v) : v
  },
  renderHTML: (a: any) => (a[name] === null || a[name] === undefined ? {} : { [`data-${name}`]: a[name] }),
})

/** Variable: legacy `{name}` nodes keep working; new nodes also carry assetId + revision. */
export const VariableNode = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { name: plainAttr('name', 'simulationId'), assetId: plainAttr('assetId'), revision: plainAttr('revision', null, true) }
  },
  parseHTML() {
    return [{ tag: 'span[data-type="variable"]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'variable' }), `{{${node.attrs.name}}}`]
  },
  renderText({ node }) {
    return `{{${node.attrs.name}}}`
  },
  addNodeView() {
    return ReactNodeViewRenderer(VariableView)
  },
})

/** Inline shared expression reference (assetId + revision). */
export const ExpressionRefNode = Node.create({
  name: 'expressionRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { assetId: plainAttr('assetId'), revision: plainAttr('revision', 1, true), name: plainAttr('name') }
  },
  parseHTML() {
    return [{ tag: 'span[data-type="expressionRef"]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'expressionRef' }), `{{expr:${node.attrs.assetId}@${node.attrs.revision}}}`]
  },
  renderText({ node }) {
    return `{{expr:${node.attrs.assetId}@${node.attrs.revision}}}`
  },
  addNodeView() {
    return ReactNodeViewRenderer(ExpressionView)
  },
})
