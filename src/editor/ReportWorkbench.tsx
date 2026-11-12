import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection } from "@tiptap/pm/state";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  BarChart3,
  Table2,
  FileSpreadsheet,
  Braces,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  ExternalLink,
  Eraser,
  ArrowUpCircle,
} from "lucide-react";
import { ChartAssetNode, FixedTableAssetNode, TableAssetNode, VariableNode } from "./extensions";
import { ReportCtx, type ReportCtxValue } from "./context";
import { DocRenderer } from "./DocRenderer";
import { addSection, deleteSection, moveSection } from "./sections";
import type { AssetKind, ChartDef, DataContext, TableDef } from "../data/types";
import {
  ASSET_NODE_TYPES,
  NODE_TYPE_FOR,
  OVERRIDE_LABELS,
  collectRefs,
  docText,
  overrideKeys,
  uid,
} from "../data/reports";
import { CHART_TYPES, PALETTES } from "../data/chartModel";
import { DATASETS, VARIABLES, KNOWN_VARIABLES, fieldLabel } from "../data/engine";
import { useApp, useUI, KIND_LABEL } from "../store/store";
import {
  Badge,
  Button,
  Field,
  Modal,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextInput,
  Toggle,
  cx,
} from "../ui/kit";
import { DataContextBar, FilterEditor } from "../components/DataControls";
import { KIND_ICON } from "../components/AssetBlock";

interface OutlineItem {
  index: number;
  kind: "h" | "a";
  level: number;
  text: string;
  assetKind?: AssetKind;
  rev?: number;
}

interface Selected {
  pos: number;
  type: string;
  attrs: Record<string, any>;
}

export interface WorkbenchProps {
  initialDoc: JSONContent;
  onDocChange: (d: JSONContent) => void;
  ctx: Omit<ReportCtxValue, "preview">;
  preview: boolean;
  mode: "template" | "instance";
  onParamsChange?: (p: DataContext) => void;
  insertAssetId?: string;
  headerSlot?: React.ReactNode;
  /** Called once with the editor-normalized document so callers can rebase their dirty baseline. */
  onReady?: (d: JSONContent) => void;
}

export function ReportWorkbench({
  initialDoc,
  onDocChange,
  ctx,
  preview,
  mode,
  onParamsChange,
  insertAssetId,
  headerSlot,
  onReady,
}: WorkbenchProps) {
  const [doc, setDoc] = useState<JSONContent>(initialDoc);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [insertKind, setInsertKind] = useState<AssetKind | null>(null);
  const [varOpen, setVarOpen] = useState(false);
  const [customVar, setCustomVar] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onDocChange);
  onChangeRef.current = onDocChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const assets = useApp((s) => s.assets);
  const go = useUI((s) => s.go);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      ChartAssetNode,
      TableAssetNode,
      FixedTableAssetNode,
      VariableNode,
    ],
    content: initialDoc,
    editorProps: { attributes: { class: "report-doc min-h-[560px]" } },
    onCreate: ({ editor }) => {
      const j = editor.getJSON();
      setDoc(j);
      onReadyRef.current?.(j);
    },
    onUpdate: ({ editor }) => {
      const j = editor.getJSON();
      setDoc(j);
      onChangeRef.current(j);
    },
  });

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      strike: e?.isActive("strike") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      p: e?.isActive("paragraph") ?? false,
      ul: e?.isActive("bulletList") ?? false,
      ol: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  useEffect(() => {
    if (!editor) return;
    const h = () => {
      const s = editor.state.selection;
      if (s instanceof NodeSelection && ASSET_NODE_TYPES[s.node.type.name])
        setSelected({ pos: s.from, type: s.node.type.name, attrs: s.node.attrs });
      else setSelected(null);
    };
    editor.on("selectionUpdate", h);
    editor.on("transaction", h);
    return () => {
      editor.off("selectionUpdate", h);
      editor.off("transaction", h);
    };
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(!preview, false);
  }, [editor, preview]);

  // “插入到报告” from asset pages
  const inserted = useRef(false);
  useEffect(() => {
    if (!editor || !insertAssetId || inserted.current) return;
    const a = assets[insertAssetId];
    if (!a || a.kind === "report") return;
    inserted.current = true;
    setTimeout(() => {
      const end = editor.state.doc.content.size;
      editor
        .chain()
        .insertContentAt(end, {
          type: NODE_TYPE_FOR[a.kind],
          attrs: { assetId: a.assetId, assetRevision: a.latest, overrides: {}, nodeId: uid("N") },
        })
        .setNodeSelection(end)
        .run();
      setTimeout(
        () =>
          (editor.view.nodeDOM(end) as HTMLElement | null)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          }),
        60,
      );
    }, 50);
  }, [editor, insertAssetId, assets]);

  const topPos = (index: number) => {
    let pos = 0;
    editor?.state.doc.forEach((_, offset, i) => {
      if (i === index) pos = offset;
    });
    return pos;
  };
  const scrollToIndex = (index: number) => {
    if (!editor) return;
    if (preview) {
      scrollRef.current
        ?.querySelector(`[data-heading-index="${index}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const pos = topPos(index);
    const n = editor.state.doc.child(index);
    if (ASSET_NODE_TYPES[n.type.name]) editor.chain().focus().setNodeSelection(pos).run();
    else
      editor
        .chain()
        .focus()
        .setTextSelection(pos + 1)
        .run();
    (editor.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };
  const replaceDoc = (d: JSONContent | null) => {
    if (!d || !editor) return;
    editor.commands.setContent(d, { emitUpdate: true });
  };
  const updateAttrs = (patch: Record<string, any>) => {
    if (!editor || !selected) return;
    const node = editor.state.doc.nodeAt(selected.pos);
    if (!node) return;
    const tr = editor.state.tr.setNodeMarkup(selected.pos, undefined, { ...node.attrs, ...patch });
    tr.setSelection(NodeSelection.create(tr.doc, selected.pos));
    editor.view.dispatch(tr);
  };
  const setOverride = (k: string, v: any) => {
    const cur = { ...(selected?.attrs.overrides ?? {}) };
    if (
      v === undefined ||
      v === null ||
      v === "" ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0)
    )
      delete cur[k];
    else cur[k] = v;
    updateAttrs({ overrides: cur });
  };

  const outlineItems = useMemo(
    () =>
      (doc.content ?? []).flatMap((n, index): OutlineItem[] => {
        if (n.type === "heading")
          return [
            { index, kind: "h", level: n.attrs?.level ?? 1, text: docText(n) || "（空标题）" },
          ];
        if (n.type && ASSET_NODE_TYPES[n.type])
          return [
            {
              index,
              kind: "a",
              level: 9,
              text: n.attrs?.assetId,
              assetKind: ASSET_NODE_TYPES[n.type],
              rev: n.attrs?.assetRevision,
            },
          ];
        return [];
      }),
    [doc],
  );
  const refs = collectRefs(doc);
  const ctxValue: ReportCtxValue = { ...ctx, preview };
  const vars = collectVarsInDoc(doc);

  const TB = ({
    on,
    onClick,
    icon,
    label,
    disabled,
  }: {
    on?: boolean;
    onClick: () => void;
    icon: any;
    label: string;
    disabled?: boolean;
  }) => {
    const I = icon;
    return (
      <button
        title={label}
        aria-label={label}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cx(
          "size-7 grid place-items-center rounded text-ink-2 hover:bg-gray-100 disabled:opacity-30",
          on && "bg-brand-50 text-brand-700",
        )}
      >
        <I className="size-4" />
      </button>
    );
  };

  return (
    <ReportCtx.Provider value={ctxValue}>
      <div className="flex-1 min-h-0 flex">
        {/* outline */}
        <aside className="w-[216px] shrink-0 bg-white border-r border-line flex flex-col">
          <div className="flex items-center justify-between px-3.5 h-10 border-b border-line">
            <span className="text-[12.5px] font-semibold">章节目录</span>
            {!preview && (
              <Button
                size="xs"
                variant="ghost"
                icon={<Plus className="size-3" />}
                onClick={() =>
                  replaceDoc(
                    addSection(
                      doc,
                      null,
                      `${outlineItems.filter((o) => o.kind === "h" && o.level === 2).length + 1}. 新章节`,
                    ),
                  )
                }
              >
                章节
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-auto scroll-thin p-2 space-y-px">
            {outlineItems.map((o) =>
              o.kind === "h" ? (
                <div
                  key={o.index}
                  className="group flex items-center rounded hover:bg-gray-50"
                  style={{ paddingLeft: (o.level - 1) * 10 }}
                >
                  <button
                    onClick={() => scrollToIndex(o.index)}
                    className={cx(
                      "flex-1 text-left truncate py-1.5 px-1.5 text-[12.5px]",
                      o.level === 1
                        ? "font-semibold text-ink"
                        : o.level === 2
                          ? "text-ink-2 font-medium"
                          : "text-ink-3",
                    )}
                  >
                    {o.text}
                  </button>
                  {!preview && o.level >= 2 && (
                    <span className="hidden group-hover:flex items-center pr-1">
                      <button
                        title="上移章节"
                        onClick={() => replaceDoc(moveSection(doc, o.index, -1))}
                        className="size-5 grid place-items-center rounded hover:bg-gray-200"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        title="下移章节"
                        onClick={() => replaceDoc(moveSection(doc, o.index, 1))}
                        className="size-5 grid place-items-center rounded hover:bg-gray-200"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                      <button
                        title="在此后插入章节"
                        onClick={() => replaceDoc(addSection(doc, o.index, "新章节"))}
                        className="size-5 grid place-items-center rounded hover:bg-gray-200"
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        title="删除整个章节"
                        onClick={() => replaceDoc(deleteSection(doc, o.index))}
                        className="size-5 grid place-items-center rounded hover:bg-red-100 text-red-600"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  )}
                </div>
              ) : (
                <button
                  key={o.index}
                  onClick={() => scrollToIndex(o.index)}
                  className={cx(
                    "w-full flex items-center gap-1.5 pl-6 pr-1.5 py-1 rounded text-[11.5px] text-ink-3 hover:bg-gray-50",
                    selected &&
                      editor &&
                      topPos(o.index) === selected.pos &&
                      "bg-brand-50 text-brand-700",
                  )}
                >
                  {(() => {
                    const I = KIND_ICON[o.assetKind!];
                    return <I className="size-3 shrink-0" />;
                  })()}
                  <span className="font-mono truncate">
                    {o.text} r{o.rev}
                  </span>
                </button>
              ),
            )}
          </div>
          <div className="p-3 border-t border-line text-[11px] text-ink-3">
            {refs.length} 个资源节点 · {vars.length} 种变量
          </div>
        </aside>

        {/* canvas */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#EEF0F3]">
          {!preview && (
            <div className="shrink-0 h-11 bg-white border-b border-line px-3 flex items-center gap-0.5">
              <TB
                icon={Undo2}
                label="撤销"
                disabled={!st?.canUndo}
                onClick={() => editor?.chain().focus().undo().run()}
              />
              <TB
                icon={Redo2}
                label="恢复"
                disabled={!st?.canRedo}
                onClick={() => editor?.chain().focus().redo().run()}
              />
              <span className="w-px h-5 bg-line mx-1" />
              <TB
                icon={Heading1}
                label="一级标题"
                on={st?.h1}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              />
              <TB
                icon={Heading2}
                label="二级标题（章节）"
                on={st?.h2}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              />
              <TB
                icon={Heading3}
                label="三级标题"
                on={st?.h3}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              />
              <TB
                icon={Pilcrow}
                label="正文段落"
                on={st?.p}
                onClick={() => editor?.chain().focus().setParagraph().run()}
              />
              <span className="w-px h-5 bg-line mx-1" />
              <TB
                icon={Bold}
                label="加粗"
                on={st?.bold}
                onClick={() => editor?.chain().focus().toggleBold().run()}
              />
              <TB
                icon={Italic}
                label="斜体"
                on={st?.italic}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              />
              <TB
                icon={Strikethrough}
                label="删除线"
                on={st?.strike}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
              />
              <TB
                icon={List}
                label="无序列表"
                on={st?.ul}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
              />
              <TB
                icon={ListOrdered}
                label="有序列表"
                on={st?.ol}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              />
              <TB
                icon={Quote}
                label="引用"
                on={st?.quote}
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              />
              <span className="w-px h-5 bg-line mx-1" />
              {mode === "template" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<BarChart3 className="size-3.5" />}
                    onClick={() => setInsertKind("chart")}
                  >
                    图表
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Table2 className="size-3.5" />}
                    onClick={() => setInsertKind("table")}
                  >
                    分析表
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<FileSpreadsheet className="size-3.5" />}
                    onClick={() => setInsertKind("fixed")}
                  >
                    固定表
                  </Button>
                </>
              )}
              <div className="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Braces className="size-3.5" />}
                  onClick={() => setVarOpen(!varOpen)}
                >
                  变量
                </Button>
                {varOpen && (
                  <div className="absolute z-30 top-8 left-0 w-72 bg-white border border-line rounded-lg shadow-xl p-1.5">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.name}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          editor
                            ?.chain()
                            .focus()
                            .insertContent({ type: "variable", attrs: { name: v.name } })
                            .run();
                          setVarOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 text-[12.5px]"
                      >
                        <span>{v.label}</span>
                        <span className="font-mono text-[11px] text-violet-700">{`{{${v.name}}}`}</span>
                      </button>
                    ))}
                    <div className="flex gap-1 p-1 border-t border-line mt-1">
                      <TextInput
                        value={customVar}
                        onChange={(e) => setCustomVar(e.target.value.replace(/\W/g, ""))}
                        placeholder="自定义变量名"
                        className="h-7 text-xs"
                      />
                      <Button
                        size="sm"
                        disabled={!customVar}
                        onClick={() => {
                          editor
                            ?.chain()
                            .focus()
                            .insertContent({ type: "variable", attrs: { name: customVar } })
                            .run();
                          setCustomVar("");
                          setVarOpen(false);
                        }}
                      >
                        插入
                      </Button>
                    </div>
                    <div className="px-2 pb-1 text-[10.5px] text-ink-3">
                      未定义的变量会在生成时报错
                    </div>
                  </div>
                )}
              </div>
              <span className="flex-1" />
              {headerSlot}
            </div>
          )}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto scroll-thin py-8 px-6"
            onClick={() => varOpen && setVarOpen(false)}
          >
            <div className="mx-auto w-full max-w-[820px] bg-white rounded-sm shadow-[0_2px_10px_rgba(16,24,40,.08)] px-10 py-12 relative">
              <div className="absolute top-3 right-4 text-[10px] font-semibold text-amber-700 tracking-wider">
                DEMO / 演示数据 ·{" "}
                {mode === "template"
                  ? preview
                    ? "模板预览（变量已替换）"
                    : "模板编辑"
                  : preview
                    ? "实例预览"
                    : "实例编辑"}
              </div>
              <div className={cx(preview && "hidden")}>
                <EditorContent editor={editor} />
              </div>
              {preview && <DocRenderer doc={doc} />}
            </div>
          </div>
        </div>

        {/* right panel */}
        <aside className="w-[320px] shrink-0 bg-white border-l border-line overflow-auto scroll-thin">
          {selected && !preview ? (
            <NodePanel
              sel={selected}
              mode={mode}
              ctx={ctx}
              onOverride={setOverride}
              onAttrs={updateAttrs}
              onClear={() => updateAttrs({ overrides: {} })}
              onDelete={() => editor?.chain().focus().deleteSelection().run()}
              onEditShared={(kind, id) =>
                go(kind === "chart" ? "chart" : kind === "table" ? "table" : "fixed", {
                  assetId: id,
                })
              }
              assets={assets}
            />
          ) : (
            <>
              <Section title="数据参数">
                {mode === "template" ? (
                  <>
                    <DataContextBar value={ctx.params} onChange={(p) => onParamsChange?.(p)} />
                    <div className="text-[11px] text-ink-3">
                      模板默认参数，用于编辑时的演示填数和预览；生成实例时可重新选择。
                    </div>
                  </>
                ) : (
                  <div className="text-[12.5px] space-y-1">
                    <div>
                      冻结范围：<b>{ctx.params.simulationId}</b> / {ctx.params.branch} / Tick{" "}
                      {ctx.params.tick}
                    </div>
                    <div className="text-[11px] text-ink-3">
                      实例的数据范围在生成时固定，不随共享资产变化。
                    </div>
                  </div>
                )}
              </Section>
              <Section title="变量（点击插入）">
                <div className="space-y-1">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.name}
                      disabled={preview}
                      onClick={() =>
                        editor
                          ?.chain()
                          .focus()
                          .insertContent({ type: "variable", attrs: { name: v.name } })
                          .run()
                      }
                      className="w-full flex items-center justify-between text-[12px] px-2 py-1 rounded hover:bg-gray-50 disabled:hover:bg-transparent"
                    >
                      <span className="font-mono text-violet-700">{`{{${v.name}}}`}</span>
                      <span className="tabular-nums text-ink">
                        {ctx.vars[v.name] === null || ctx.vars[v.name] === undefined
                          ? "—"
                          : String(ctx.vars[v.name])}
                      </span>
                    </button>
                  ))}
                </div>
                {vars.filter((v) => !KNOWN_VARIABLES.has(v)).length > 0 && (
                  <div className="text-[11.5px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    文档中存在未定义变量：
                    {vars
                      .filter((v) => !KNOWN_VARIABLES.has(v))
                      .map((v) => `{{${v}}}`)
                      .join("、")}
                  </div>
                )}
              </Section>
              <Section title={`资源引用（${refs.length}）`}>
                {refs.length === 0 && (
                  <div className="text-[12px] text-ink-3">尚未插入共享资产节点</div>
                )}
                {refs.map((r) => {
                  const snap = ctx.resolveSnapshot(r.assetId, r.assetRevision);
                  const latest = ctx.latestRevision(r.assetId);
                  const I = KIND_ICON[r.kind];
                  return (
                    <button
                      key={r.nodeId}
                      onClick={() => {
                        const idx = (doc.content ?? []).findIndex(
                          (n) => n.attrs?.nodeId === r.nodeId,
                        );
                        if (idx >= 0) {
                          if (preview) return;
                          scrollToIndex(idx);
                        }
                      }}
                      className="w-full text-left p-2 rounded-md border border-line hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-1.5">
                        <I className="size-3.5 text-brand-600" />
                        <span className="text-[12px] text-ink truncate flex-1">
                          {snap?.title ?? "（缺失资产）"}
                        </span>
                        {!snap && <Badge tone="red">引用失效</Badge>}
                        {overrideKeys(r.overrides).length > 0 && <Badge tone="violet">覆盖</Badge>}
                      </div>
                      <div className="text-[10.5px] font-mono text-ink-3 mt-0.5">
                        {r.nodeId} · {r.assetId} r{r.assetRevision}
                        {mode === "template" && latest && latest > r.assetRevision
                          ? ` · 最新 r${latest}`
                          : ""}
                      </div>
                    </button>
                  );
                })}
              </Section>
            </>
          )}
        </aside>
      </div>

      <Modal
        open={!!insertKind}
        title={`插入共享${insertKind ? KIND_LABEL[insertKind] : ""}（引用）`}
        onClose={() => setInsertKind(null)}
        width={560}
        footer={<Button onClick={() => setInsertKind(null)}>取消</Button>}
      >
        <p className="mb-3 text-[12.5px]">
          节点将保存 assetId、assetRevision（当前最新）与空的
          overrides；后续共享版本更新不会自动改变此节点。
        </p>
        <div className="space-y-1.5">
          {Object.values(assets)
            .filter((a) => a.kind === insertKind)
            .map((a) => {
              const I = KIND_ICON[a.kind];
              return (
                <button
                  key={a.assetId}
                  onClick={() => {
                    editor
                      ?.chain()
                      .focus()
                      .insertContent({
                        type: NODE_TYPE_FOR[a.kind],
                        attrs: {
                          assetId: a.assetId,
                          assetRevision: a.latest,
                          overrides: {},
                          nodeId: uid("N"),
                        },
                      })
                      .run();
                    setInsertKind(null);
                  }}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-md border border-line hover:bg-brand-50 hover:border-brand-200 text-left"
                >
                  <I className="size-4 text-brand-600" />
                  <span className="flex-1 text-ink">{a.title}</span>
                  <span className="font-mono text-[11px] text-ink-3">
                    {a.assetId} r{a.latest}
                  </span>
                </button>
              );
            })}
        </div>
      </Modal>
    </ReportCtx.Provider>
  );
}

function collectVarsInDoc(doc: JSONContent): string[] {
  const s = new Set<string>();
  const walk = (n: JSONContent) => {
    if (n.type === "variable") s.add(n.attrs?.name);
    n.content?.forEach(walk);
  };
  walk(doc);
  return [...s];
}

function NodePanel({
  sel,
  mode,
  ctx,
  onOverride,
  onAttrs,
  onClear,
  onDelete,
  onEditShared,
  assets,
}: {
  sel: Selected;
  mode: "template" | "instance";
  ctx: Omit<ReportCtxValue, "preview">;
  onOverride: (k: string, v: any) => void;
  onAttrs: (p: Record<string, any>) => void;
  onClear: () => void;
  onDelete: () => void;
  onEditShared: (kind: AssetKind, id: string) => void;
  assets: ReturnType<typeof useApp.getState>["assets"];
}) {
  const kind = ASSET_NODE_TYPES[sel.type];
  const { assetId, assetRevision, nodeId } = sel.attrs;
  const ov: Record<string, any> = sel.attrs.overrides ?? {};
  const snap = ctx.resolveSnapshot(assetId, assetRevision);
  const asset = assets[assetId];
  const latest = ctx.latestRevision(assetId);
  const scopeText =
    mode === "template"
      ? "仅此节点生效：写入模板节点 overrides，不修改共享资产"
      : "仅本报告生效：写入实例节点 overrides，不修改共享资产或模板";
  const ovKeys = overrideKeys(ov);
  const ds = snap ? (snap.def as any).dataSetId : null;
  const I = KIND_ICON[kind];
  return (
    <div>
      <div className="p-3.5 border-b border-line">
        <div className="flex items-center gap-2">
          <I className="size-4 text-brand-600" />
          <span className="text-[13px] font-semibold truncate">{snap?.title ?? assetId}</span>
        </div>
        <div className="mt-2 grid grid-cols-[72px_1fr] gap-y-1 text-[11.5px]">
          <span className="text-ink-3">节点 ID</span>
          <span className="font-mono">{nodeId}</span>
          <span className="text-ink-3">节点类型</span>
          <span className="font-mono">{sel.type}</span>
          <span className="text-ink-3">资产 ID</span>
          <span className="font-mono">{assetId}</span>
          <span className="text-ink-3">引用版本</span>
          <span className="font-mono">
            r{assetRevision}
            {latest && latest > assetRevision ? (
              <span className="text-amber-700">（共享最新 r{latest}）</span>
            ) : latest ? (
              "（最新）"
            ) : (
              ""
            )}
          </span>
          <span className="text-ink-3">数据范围</span>
          <span>
            {ctx.params.simulationId} · Tick {ctx.params.tick ?? "—"}
          </span>
        </div>
        {!snap && (
          <div className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
            引用失效：{assetId} r{assetRevision} 不存在。请替换引用。
          </div>
        )}
      </div>

      {mode === "template" && (
        <Section title="引用版本">
          {asset ? (
            <>
              <Select<number>
                value={assetRevision}
                onChange={(v) => onAttrs({ assetRevision: v })}
                options={asset.revisions.map((r) => ({
                  value: r.revision,
                  label: `r${r.revision} · ${r.note}`,
                }))}
              />
              {latest && latest > assetRevision && (
                <Button
                  size="sm"
                  variant="subtle"
                  className="w-full"
                  icon={<ArrowUpCircle className="size-3.5" />}
                  onClick={() => onAttrs({ assetRevision: latest })}
                >
                  升级到最新 r{latest}
                </Button>
              )}
            </>
          ) : (
            <div className="text-[12px] text-ink-3">资产不存在</div>
          )}
          <Field label="替换为其它资产">
            <Select
              placeholder="选择同类资产…"
              value={null}
              onChange={(id: string) =>
                onAttrs({ assetId: id, assetRevision: assets[id].latest, overrides: {} })
              }
              options={Object.values(assets)
                .filter((a) => a.kind === kind && a.assetId !== assetId)
                .map((a) => ({ value: a.assetId, label: `${a.assetId} · ${a.title}` }))}
            />
          </Field>
        </Section>
      )}

      {snap && (
        <Section
          title="仅调整这一处"
          actions={
            ovKeys.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                icon={<Eraser className="size-3" />}
                onClick={onClear}
              >
                清除覆盖
              </Button>
            )
          }
        >
          <div className="text-[11.5px] text-violet-800 bg-violet-50 border border-violet-100 rounded p-2">
            {scopeText}
          </div>
          {kind === "chart" && (
            <>
              <Field label="图型">
                <Select<string>
                  value={ov.chartType ?? ""}
                  onChange={(v) => onOverride("chartType", v || undefined)}
                  options={[
                    {
                      value: "",
                      label: `继承（${CHART_TYPES.find((t) => t.id === (snap.def as ChartDef).chartType)?.label}）`,
                    },
                    ...CHART_TYPES.map((t) => ({ value: t.id, label: t.label })),
                  ]}
                />
              </Field>
              <Field label="维度">
                <Select<string>
                  value={ov.dimensions ? JSON.stringify(ov.dimensions) : ""}
                  onChange={(v) => onOverride("dimensions", v ? JSON.parse(v) : undefined)}
                  options={[
                    {
                      value: "",
                      label: `继承（${(snap.def as ChartDef).dimensions.map(fieldLabel).join(" → ")}）`,
                    },
                    ...DATASETS[ds as keyof typeof DATASETS].dims
                      .filter((d) => !["simulationId", "branch"].includes(d))
                      .map((d) => ({ value: JSON.stringify([d]), label: `按${fieldLabel(d)}` })),
                  ]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="排序">
                  <Select<string>
                    value={ov.sort ?? ""}
                    onChange={(v) => onOverride("sort", v || undefined)}
                    options={[
                      { value: "", label: "继承" },
                      { value: "valueDesc", label: "数值降序" },
                      { value: "valueAsc", label: "数值升序" },
                      { value: "keyAsc", label: "分类升序" },
                    ]}
                  />
                </Field>
                <Field label="高度">
                  <NumberInput
                    value={ov.height ?? Math.min((snap.def as ChartDef).style.height, 280)}
                    min={160}
                    max={480}
                    step={20}
                    onChange={(v) => onOverride("height", v)}
                    suffix="px"
                  />
                </Field>
              </div>
              <Field label="配色">
                <Select<string>
                  value={ov.palette ?? ""}
                  onChange={(v) => onOverride("palette", v || undefined)}
                  options={[
                    { value: "", label: "继承" },
                    ...Object.entries(PALETTES).map(([k, p]) => ({ value: k, label: p.label })),
                  ]}
                />
              </Field>
              <Toggle
                label="数据标签"
                checked={ov.showLabels ?? (snap.def as ChartDef).style.showLabels}
                onChange={(v) => onOverride("showLabels", v)}
              />
            </>
          )}
          {kind === "table" && (
            <>
              {(snap.def as TableDef).mode === "pivot" && (
                <Toggle
                  label="行列交换"
                  checked={!!ov.swap}
                  onChange={(v) => onOverride("swap", v || undefined)}
                />
              )}
              <Toggle
                label="显示合计"
                checked={ov.showTotals ?? (snap.def as TableDef).showTotals}
                onChange={(v) => onOverride("showTotals", v)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label="排序">
                  <Select<string>
                    value={ov.sort ?? ""}
                    onChange={(v) => onOverride("sort", v || undefined)}
                    options={[
                      { value: "", label: "继承" },
                      { value: "valueDesc", label: "数值降序" },
                      { value: "valueAsc", label: "数值升序" },
                      { value: "keyDesc", label: "分类降序" },
                    ]}
                  />
                </Field>
                <Field label="最大高度">
                  <NumberInput
                    value={ov.height ?? 260}
                    min={120}
                    max={600}
                    step={20}
                    onChange={(v) => onOverride("height", v)}
                    suffix="px"
                  />
                </Field>
              </div>
            </>
          )}
          {kind === "fixed" && (
            <Field label="最多显示行数">
              <NumberInput
                value={ov.maxRows ?? 18}
                min={4}
                max={80}
                onChange={(v) => onOverride("maxRows", v)}
              />
            </Field>
          )}
          {ds && ds !== "taskSchedule" && ds !== "printStressRows" && (
            <Field label="节点筛选（仅此处）">
              <FilterEditor
                dataSetId={ds}
                ctx={ctx.params}
                filters={ov.filters ?? {}}
                onChange={(f) => onOverride("filters", Object.keys(f).length ? f : undefined)}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="宽度">
              <Select<number>
                value={ov.width ?? 100}
                onChange={(v) => onOverride("width", v === 100 ? undefined : v)}
                options={[
                  { value: 100, label: "100%" },
                  { value: 75, label: "75%" },
                  { value: 50, label: "50%" },
                ]}
              />
            </Field>
            <Field label="对齐">
              <Segmented
                size="sm"
                value={(ov.align ?? "center") as "left" | "center" | "right"}
                onChange={(v) => onOverride("align", v === "center" ? undefined : v)}
                options={[
                  { value: "left", label: "左" },
                  { value: "center", label: "中" },
                  { value: "right", label: "右" },
                ]}
              />
            </Field>
          </div>
          <Field label="图注 / 注释">
            <TextInput
              value={ov.caption ?? ""}
              onChange={(e) => onOverride("caption", e.target.value || undefined)}
              placeholder="例如：图 1 资源投入（演示）"
            />
          </Field>
          <div>
            <div className="text-[11px] text-ink-3 mb-1">
              当前 overrides（{ovKeys.length} 项
              {ovKeys.length ? "：" + ovKeys.map((k) => OVERRIDE_LABELS[k] ?? k).join("、") : ""}）
            </div>
            <pre className="text-[10.5px] font-mono bg-gray-50 border border-line rounded p-2 overflow-auto max-h-32">
              {JSON.stringify(ov, null, 1)}
            </pre>
          </div>
        </Section>
      )}
      <Section title="操作">
        {asset && (
          <Button
            size="sm"
            className="w-full"
            icon={<ExternalLink className="size-3.5" />}
            onClick={() => onEditShared(kind, assetId)}
          >
            编辑共享{KIND_LABEL[kind]}（保存将产生新版本）
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          className="w-full"
          icon={<Trash2 className="size-3.5" />}
          onClick={onDelete}
        >
          从文档删除此节点
        </Button>
      </Section>
    </div>
  );
}
