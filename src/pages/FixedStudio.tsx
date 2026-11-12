import { useEffect, useMemo, useRef, useState } from "react";
import {
  Merge as MergeIcon,
  Split,
  Rows3,
  Columns3,
  Trash2,
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  GitBranchPlus,
  Undo2,
  Repeat,
  ZoomIn,
  ZoomOut,
  FilePlus2,
} from "lucide-react";
import { useApp, useUI, latestDef, toast } from "../store/store";
import type { CellStyle, DynamicRegion, FixedCell, FixedDef } from "../data/types";
import { expandFixed, paginate } from "../data/fixedModel";
import { colName, rcKey, rcRef } from "../data/grid";
import {
  deleteCol,
  deleteRow,
  expandRect,
  insertCol,
  insertRow,
  mergeAt,
  mergeCells,
  normRect,
  splitCells,
  type Rect,
} from "../data/fixedOps";
import { DATASETS, VARIABLES, fieldLabel, fmt } from "../data/engine";
import { PageHeader } from "../ui/PageHeader";
import {
  Badge,
  Button,
  Card,
  Field,
  InlineEdit,
  Modal,
  NumberInput,
  SaveState,
  Section,
  Segmented,
  Select,
  TextInput,
  Toggle,
  cx,
  type Opt,
} from "../ui/kit";
import { PagedPreview, STYLE_CLS, STYLE_LABEL, SheetTable } from "../components/FixedSheet";
import { DataContextBar, FilterBar, FilterEditor } from "../components/DataControls";
import { InsertModal } from "./AssetCenter";
import { useDraft } from "./useDraft";
import { SidePanel } from "../ui/SidePanel";
import { ResourcePicker } from "../components/Catalog";
import { parseRefBinding } from "../data/fixedModel";

type Mode = "design" | "fill" | "paged";

function bindingOptions(def: FixedDef, region?: DynamicRegion): Opt<string>[] {
  const none = { value: "", label: "（无绑定，使用文本）" };
  if (region) {
    const m = DATASETS[region.dataSetId];
    const fields = region.groupBy.length ? region.groupBy : [...m.dims, ...m.measures];
    return [
      none,
      ...fields.map((f) => ({ value: f, label: `字段 · ${fieldLabel(f)}（${f}）` })),
      ...m.measures.map((x) => ({ value: `sum(${x})`, label: `汇总 · sum(${x})` })),
      { value: "count()", label: "汇总 · count()" },
    ];
  }
  const tm = DATASETS[def.totalDataSetId];
  return [
    none,
    ...VARIABLES.map((v) => ({ value: v.name, label: `变量 · ${v.label}（${v.name}）` })),
    ...tm.measures.map((x) => ({ value: `sum(${x})`, label: `合计 · sum(${x})` })),
    { value: "count()", label: "合计 · count()" },
  ];
}

function TextWithVars({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*\w+\s*\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{/.test(p) ? (
          <span
            key={i}
            className="px-1 rounded bg-violet-100 text-violet-800 font-mono text-[11px]"
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function FixedStudio() {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const assets = useApp((s) => s.assets);
  const list = Object.values(assets).filter((a) => a.kind === "fixed");
  const assetId =
    params.assetId && assets[params.assetId]?.kind === "fixed" ? params.assetId : list[0]?.assetId;
  const asset = assetId ? assets[assetId] : undefined;
  const {
    draft: def,
    setDraft,
    dirty,
    markSaved,
    revert,
  } = useDraft<FixedDef>(latestDef<FixedDef>(asset), `固定格式报表 · ${assetId}`);
  const [mode, setMode] = useState<Mode>("design");
  const [anchor, setAnchor] = useState({ r: 0, c: 0 });
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [tab, setTab] = useState<"cell" | "region" | "page">("cell");
  const [zoom, setZoom] = useState(0.62);
  const [publish, setPublish] = useState(false);
  const [note, setNote] = useState("");
  const [insert, setInsert] = useState(false);
  const [bindPicker, setBindPicker] = useState<"variable" | "expression" | null>(null);
  const resources = useApp((s) => s.resources);
  const dragging = useRef(false);
  const ex = useMemo(() => (def ? expandFixed(def) : null), [def]);
  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  if (!asset || !def || !ex)
    return <div className="p-10 text-center text-ink-3">暂无固定格式模板</div>;

  const nRows = def.rowHeights.length;
  const nCols = def.colWidths.length;
  const rect: Rect = expandRect(def, normRect(anchor, focus));
  const single = rect.r0 === rect.r1 && rect.c0 === rect.c1;
  const ownerMerge = mergeAt(def, rect.r0, rect.c0);
  const isSingleCell =
    single ||
    (ownerMerge &&
      ownerMerge.r === rect.r0 &&
      ownerMerge.c === rect.c0 &&
      ownerMerge.rs - 1 === rect.r1 - rect.r0 &&
      ownerMerge.cs - 1 === rect.c1 - rect.c0);
  const key = rcKey(rect.r0, rect.c0);
  const cell: FixedCell = def.cells[key] ?? {};
  const region = def.regions.find((g) => g.row === rect.r0);
  const binding = region
    ? (region.columnBindings[rect.c0] ?? cell.binding ?? "")
    : (cell.binding ?? "");

  const refB = binding ? parseRefBinding(binding) : null;
  const bindKind: "text" | "field" | "variable" | "expression" = !binding ? "text" : refB ? (refB.kind === "expr" ? "expression" : "variable") : "field";
  const refRec = refB ? resources[refB.assetId] : undefined;
  const previewCell = ex.rows.flatMap((r) => r.cells).find((c) => c && c.srcKey === key) ?? undefined;
  const update = (fn: (d: FixedDef) => FixedDef) => setDraft((d) => (d ? fn(d) : d));
  const setCell = (p: Partial<FixedCell>) =>
    update((d) => ({ ...d, cells: { ...d.cells, [key]: { ...d.cells[key], ...p } } }));
  const setRangeCells = (p: Partial<FixedCell>) =>
    update((d) => {
      const cells = { ...d.cells };
      for (let r = rect.r0; r <= rect.r1; r++)
        for (let c = rect.c0; c <= rect.c1; c++)
          if (
            !d.merges.some(
              (m) =>
                (r !== m.r || c !== m.c) &&
                r >= m.r &&
                r < m.r + m.rs &&
                c >= m.c &&
                c < m.c + m.cs,
            )
          )
            cells[rcKey(r, c)] = { ...cells[rcKey(r, c)], ...p };
      return { ...d, cells };
    });
  const setBinding = (b: string) => {
    if (region)
      update((d) => ({
        ...d,
        regions: d.regions.map((g) =>
          g.id === region.id
            ? {
                ...g,
                columnBindings: Object.fromEntries(
                  Object.entries({ ...g.columnBindings, [rect.c0]: b }).filter(([, v]) => v),
                ) as Record<string, string>,
              }
            : g,
        ),
        cells: { ...d.cells, [key]: { ...d.cells[key], binding: undefined } },
      }));
    else setCell({ binding: b || undefined });
  };
  const setRegion = (p: Partial<DynamicRegion>) =>
    region &&
    update((d) => ({
      ...d,
      regions: d.regions.map((g) => (g.id === region.id ? { ...g, ...p } : g)),
    }));
  const select = (r: number, c: number, shift: boolean) => {
    if (shift) setFocus({ r, c });
    else {
      setAnchor({ r, c });
      setFocus({ r, c });
    }
  };
  const startResize = (e: React.MouseEvent, kind: "col" | "row", idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const start = kind === "col" ? e.clientX : e.clientY;
    const orig = kind === "col" ? def.colWidths[idx] : def.rowHeights[idx];
    const move = (ev: MouseEvent) => {
      const v = Math.max(
        kind === "col" ? 36 : 20,
        Math.round(orig + ((kind === "col" ? ev.clientX : ev.clientY) - start)),
      );
      update((d) =>
        kind === "col"
          ? { ...d, colWidths: d.colWidths.map((w, i) => (i === idx ? v : w)) }
          : { ...d, rowHeights: d.rowHeights.map((h, i) => (i === idx ? v : h)) },
      );
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const doMerge = () => {
    const r = mergeCells(def, rect);
    if (r.error) return toast(r.error, "warn");
    setDraft(r.def);
    toast(
      `已合并 ${rcRef(rect.r0, rect.c0)}:${rcRef(rect.r1, rect.c1)}${r.lost ? `（${r.lost} 个单元格内容被移除，可撤销修改恢复）` : ""}`,
    );
  };
  const doSplit = () => {
    const r = splitCells(def, rect);
    if (r.error) return toast(r.error, "warn");
    setDraft(r.def);
    toast("已拆分合并单元格");
  };
  const toggleRegion = () => {
    if (region) {
      update((d) => ({ ...d, regions: d.regions.filter((g) => g.id !== region.id) }));
      toast(`第 ${rect.r0 + 1} 行已恢复为普通行`);
    } else {
      update((d) => ({
        ...d,
        regions: [
          ...d.regions,
          {
            id: `RG-${Date.now().toString(36).slice(-4)}`,
            row: rect.r0,
            dataSetId: "resourceInput",
            groupBy: ["unitId"],
            metric: "demo_amount",
            aggregation: "sum",
            columnBindings: { 0: "unitId", [Math.min(nCols - 1, 3)]: "sum(demo_amount)" },
            repeatHeaderRow: rect.r0 > 0 ? rect.r0 - 1 : null,
            sort: "keyAsc",
          },
        ],
      }));
      setTab("region");
      toast(`第 ${rect.r0 + 1} 行已设为动态行（按单位汇总）`);
    }
  };
  const paged = mode === "paged" ? paginate(def, ex) : null;

  // covered cells for design grid
  const covered = new Set<string>();
  for (const m of def.merges)
    for (let r = m.r; r < m.r + m.rs; r++)
      for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(rcKey(r, c));
  const inSel = (r: number, c: number) =>
    r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "组件与资产中心", page: "assets" },
          { label: "固定格式报表设计器" },
          { label: asset.assetId },
        ]}
        title={<InlineEdit value={def.title} onCommit={(v) => setDraft({ ...def, title: v })} />}
        meta={
          <>
            <Badge tone="brand">r{asset.latest}</Badge>
            <SaveState dirty={dirty} />
          </>
        }
        actions={
          <>
            <Select
              className="w-64"
              value={assetId!}
              onChange={(v) => go("fixed", { assetId: v })}
              options={list.map((a) => ({ value: a.assetId, label: `${a.assetId} · ${a.title}` }))}
            />
            <Button
              variant="ghost"
              icon={<Undo2 className="size-3.5" />}
              disabled={!dirty}
              onClick={revert}
            >
              撤销修改
            </Button>
            <Button icon={<FilePlus2 className="size-3.5" />} onClick={() => setInsert(true)}>
              插入到报告
            </Button>
            <Button
              variant="primary"
              icon={<GitBranchPlus className="size-3.5" />}
              onClick={() => setPublish(true)}
            >
              保存模板（新版本）
            </Button>
          </>
        }
      />
      <div className="shrink-0 bg-white border-b border-line px-4 h-11 flex items-center gap-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "design", label: "设计" },
            { value: "fill", label: "填数预览" },
            { value: "paged", label: "分页预览" },
          ]}
        />
        <span className="w-px h-5 bg-line mx-1" />
        {mode === "design" ? (
          <>
            <Button
              size="sm"
              icon={<MergeIcon className="size-3.5" />}
              onClick={doMerge}
              disabled={!!isSingleCell}
            >
              合并
            </Button>
            <Button
              size="sm"
              icon={<Split className="size-3.5" />}
              onClick={doSplit}
              disabled={
                !def.merges.some(
                  (m) =>
                    m.r <= rect.r1 &&
                    m.r + m.rs - 1 >= rect.r0 &&
                    m.c <= rect.c1 &&
                    m.c + m.cs - 1 >= rect.c0,
                )
              }
            >
              拆分
            </Button>
            <span className="w-px h-5 bg-line mx-1" />
            <Button
              size="sm"
              variant="ghost"
              icon={<Rows3 className="size-3.5" />}
              onClick={() => setDraft(insertRow(def, rect.r1 + 1))}
            >
              下方插入行
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Columns3 className="size-3.5" />}
              onClick={() => setDraft(insertCol(def, rect.c1 + 1))}
            >
              右侧插入列
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setDraft(deleteRow(def, rect.r0))}
              disabled={nRows <= 1}
            >
              删除行
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setDraft(deleteCol(def, rect.c0))}
              disabled={nCols <= 1}
            >
              删除列
            </Button>
            <span className="w-px h-5 bg-line mx-1" />
            <Button
              size="sm"
              variant="ghost"
              active={!!cell.bold}
              icon={<Bold className="size-3.5" />}
              onClick={() => setRangeCells({ bold: !cell.bold })}
              aria-label="加粗"
            />
            <Button
              size="sm"
              variant="ghost"
              active={cell.align === "left"}
              icon={<AlignLeft className="size-3.5" />}
              onClick={() => setRangeCells({ align: "left" })}
              aria-label="左对齐"
            />
            <Button
              size="sm"
              variant="ghost"
              active={cell.align === "center"}
              icon={<AlignCenter className="size-3.5" />}
              onClick={() => setRangeCells({ align: "center" })}
              aria-label="居中"
            />
            <Button
              size="sm"
              variant="ghost"
              active={cell.align === "right"}
              icon={<AlignRight className="size-3.5" />}
              onClick={() => setRangeCells({ align: "right" })}
              aria-label="右对齐"
            />
            <span className="w-px h-5 bg-line mx-1" />
            <Button
              size="sm"
              variant={region ? "subtle" : "secondary"}
              icon={<Repeat className="size-3.5" />}
              onClick={toggleRegion}
            >
              {region ? "取消动态行" : "设为动态行"}
            </Button>
          </>
        ) : mode === "paged" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={<ZoomOut className="size-3.5" />}
              onClick={() => setZoom(Math.max(0.3, zoom - 0.1))}
            />
            <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<ZoomIn className="size-3.5" />}
              onClick={() => setZoom(Math.min(1.2, zoom + 0.1))}
            />
            <span className="text-xs text-ink-3 ml-2">
              A4 {def.page.orientation === "portrait" ? "纵向" : "横向"} · 页边距{" "}
              {def.page.marginMm}mm · 共 {paged?.pages.length} 页 · 填数 {ex.rows.length} 行
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-3">
            使用与设计视图相同的模板定义自动填数 · {def.viewParams.simulationId} / Tick{" "}
            {def.viewParams.tick ?? "—"} · 点击单元格可定位到模板单元格
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[11px] text-ink-3 font-mono">
          {isSingleCell
            ? rcRef(rect.r0, rect.c0)
            : `${rcRef(rect.r0, rect.c0)}:${rcRef(rect.r1, rect.c1)}`}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-auto scroll-thin bg-[#E9EBEF] p-6">
          {mode === "design" && (
            <div className="inline-block bg-white shadow-[0_2px_8px_rgba(16,24,40,.1)] p-4 select-none">
              <table className="border-collapse table-fixed">
                <colgroup>
                  <col style={{ width: 34 }} />
                  {def.colWidths.map((w, i) => (
                    <col key={i} style={{ width: w }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="h-6">
                    <th className="bg-gray-100 border border-gray-200" />
                    {def.colWidths.map((w, c) => (
                      <th
                        key={c}
                        className={cx(
                          "relative bg-gray-100 border border-gray-200 text-[10.5px] font-medium text-ink-3",
                          c >= rect.c0 && c <= rect.c1 && "bg-brand-100 text-brand-700",
                        )}
                      >
                        {colName(c)} <span className="text-gray-400">{w}</span>
                        <span
                          onMouseDown={(e) => startResize(e, "col", c)}
                          className="absolute right-[-3px] top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 z-10"
                          title="拖动调整列宽"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {def.rowHeights.map((h, r) => {
                    const rg = def.regions.find((g) => g.row === r);
                    const isHdr = def.regions.some((g) => g.repeatHeaderRow === r);
                    return (
                      <tr key={r} style={{ height: h }}>
                        <th
                          className={cx(
                            "relative bg-gray-100 border border-gray-200 text-[10.5px] font-medium text-ink-3",
                            r >= rect.r0 && r <= rect.r1 && "bg-brand-100 text-brand-700",
                            rg && "bg-emerald-100! text-emerald-800!",
                          )}
                        >
                          {r + 1}
                          {rg && <div className="text-[9px] leading-none">动态</div>}
                          {isHdr && (
                            <div className="text-[9px] leading-none text-violet-700">表头</div>
                          )}
                          <span
                            onMouseDown={(e) => startResize(e, "row", r)}
                            className="absolute left-0 right-0 bottom-[-3px] h-1.5 cursor-row-resize hover:bg-brand-500 z-10"
                            title="拖动调整行高"
                          />
                        </th>
                        {def.colWidths.map((_, c) => {
                          const k = rcKey(r, c);
                          if (covered.has(k)) return null;
                          const m = def.merges.find((x) => x.r === r && x.c === c);
                          const ce = def.cells[k];
                          const b = rg ? (rg.columnBindings[c] ?? ce?.binding) : ce?.binding;
                          const style: CellStyle = ce?.style ?? "body";
                          return (
                            <td
                              key={c}
                              rowSpan={m?.rs}
                              colSpan={m?.cs}
                              onMouseDown={(e) => {
                                dragging.current = true;
                                select(r, c, e.shiftKey);
                              }}
                              onMouseEnter={() => dragging.current && setFocus({ r, c })}
                              className={cx(
                                "relative px-1.5 py-0.5 border border-dashed border-gray-300 text-[12px] cursor-cell leading-[18px] break-words",
                                STYLE_CLS[style].replace(/border(-gray-300)?/g, ""),
                                rg && "bg-emerald-50/60",
                                inSel(r, c) &&
                                  "bg-brand-50! outline outline-2 outline-brand-500 -outline-offset-2",
                              )}
                              style={{
                                textAlign:
                                  ce?.align ??
                                  (style === "title" || style === "header" ? "center" : "left"),
                                fontWeight: ce?.bold ? 600 : undefined,
                              }}
                            >
                              {b ? (
                                <span
                                  className="inline-flex items-center px-1 rounded bg-brand-100 text-brand-700 font-mono text-[11px]"
                                  title="数据绑定"
                                >
                                  ⟨{b}⟩
                                </span>
                              ) : ce?.text ? (
                                <TextWithVars text={ce.text} />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-3">
                <span>
                  <span className="inline-block size-2.5 bg-emerald-100 border border-emerald-300 mr-1" />
                  动态行（按数据重复）
                </span>
                <span>
                  <span className="inline-block px-1 rounded bg-brand-100 text-brand-700 font-mono mr-1">
                    ⟨…⟩
                  </span>
                  数据绑定
                </span>
                <span>
                  <span className="inline-block px-1 rounded bg-violet-100 text-violet-800 font-mono mr-1">
                    {"{{…}}"}
                  </span>
                  文本变量
                </span>
                <span>Shift+点击 / 拖动 选择区域 · 拖动列头/行号边缘调整尺寸</span>
              </div>
            </div>
          )}
          {mode === "fill" && (
            <div className="inline-block bg-white shadow-[0_2px_8px_rgba(16,24,40,.1)] p-6">
              <div className="flex items-center justify-between mb-2 text-[10px] font-semibold text-amber-700 tracking-wider">
                <span>DEMO / 演示数据 · 填数预览</span>
                <span className="text-ink-3 font-normal">合计 {fmt(ex.grandTotal)}</span>
              </div>
              {ex.status === "invalid" && (
                <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                  数据范围无效：{ex.message}
                </div>
              )}
              <SheetTable
                rows={ex.rows}
                colWidths={def.colWidths}
                selected={key}
                onCell={(k) => {
                  const [r, c] = k.split(":").map(Number);
                  select(r, c, false);
                  setTab("cell");
                }}
              />
            </div>
          )}
          {mode === "paged" && <PagedPreview def={def} expanded={ex} zoom={zoom} />}
        </div>

        <SidePanel id="studioRight" side="right" title="单元格 · 绑定 · 纸张">
          <div className="flex border-b border-line">
            {(
              [
                ["cell", "单元格"],
                ["region", "动态区 / 绑定"],
                ["page", "纸张与数据"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cx(
                  "flex-1 h-10 text-[12.5px] font-medium border-b-2 -mb-px",
                  tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-ink-3",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto scroll-thin">
            {tab === "cell" && (
              <>
                <Section
                  title={`单元格 ${isSingleCell ? rcRef(rect.r0, rect.c0) : `${rcRef(rect.r0, rect.c0)}:${rcRef(rect.r1, rect.c1)}（多选）`}`}
                >
                  {ownerMerge && (
                    <div className="text-[11px] text-ink-3">
                      合并范围：{rcRef(ownerMerge.r, ownerMerge.c)}:
                      {rcRef(ownerMerge.r + ownerMerge.rs - 1, ownerMerge.c + ownerMerge.cs - 1)}
                    </div>
                  )}
                  {region && <Badge tone="green">动态行 {region.id}：绑定写入动态区列配置</Badge>}
                  <Field label="绑定类型">
                    <Segmented
                      size="sm"
                      value={bindKind}
                      onChange={(v) => {
                        if (v === "text") setBinding("");
                        else if (v === "variable" || v === "expression") setBindPicker(v);
                        else if (!binding || parseRefBinding(binding)) setBinding(bindingOptions(def, region)[1]?.value ?? "");
                      }}
                      options={[
                        { value: "text", label: "纯文本" },
                        { value: "field", label: "数据字段" },
                        { value: "variable", label: "变量" },
                        { value: "expression", label: "表达式" },
                      ]}
                    />
                  </Field>
                  {bindKind === "field" && (
                    <Field label={region ? "字段 / 行级汇总（兼容 sum()/count()）" : "合计 / 旧变量名（兼容）"}>
                      <Select value={binding} onChange={setBinding} options={bindingOptions(def, region)} disabled={!isSingleCell} />
                    </Field>
                  )}
                  {(bindKind === "variable" || bindKind === "expression") && refB && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-[12px] space-y-1" data-cell-binding={binding}>
                      <div className="flex items-center gap-1.5">
                        <b className="truncate">{refRec?.title ?? "（缺失）"}</b>
                        <span className="font-mono text-[10.5px] text-ink-3">
                          {refB.assetId}@r{refB.revision}
                        </span>
                      </div>
                      {refRec && refRec.latest > refB.revision && (
                        <div className="flex items-center gap-1.5 text-amber-800 text-[11.5px]">
                          有新版本 r{refRec.latest}，当前仍固定 r{refB.revision}
                          <Button size="xs" variant="subtle" onClick={() => setBinding(`${refB.kind}:${refB.assetId}@${refRec.latest}`)}>
                            显式升级
                          </Button>
                        </div>
                      )}
                      <Button size="xs" onClick={() => setBindPicker(bindKind)}>
                        更换…
                      </Button>
                    </div>
                  )}
                  {binding && (
                    <div className={cx("rounded px-2 py-1.5 text-[12px] border", previewCell?.error ? "bg-red-50 border-red-200 text-red-800" : "bg-gray-50 border-line")} data-cell-preview="">
                      当前上下文结果（{def.viewParams.simulationId} · Tick {def.viewParams.tick ?? "—"}）：<b className="tabular-nums">{previewCell?.text ?? "—"}</b>
                      {region && <span className="text-ink-3">（动态行：每行按该行记录集合求值{region.groupBy.length ? "，聚合" : "，行级"}）</span>}
                    </div>
                  )}
                  <Field label="文本内容" hint="无绑定时显示；可包含 {{变量}}">
                    <textarea
                      value={cell.text ?? ""}
                      disabled={!isSingleCell || !!binding}
                      onChange={(e) => setCell({ text: e.target.value })}
                      rows={3}
                      className="w-full bg-white border border-line rounded-md px-2.5 py-1.5 text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none disabled:bg-gray-50 disabled:text-ink-3"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-1">
                    {["simulationId", "tick", "reportTitle", "resourceInputTotal"].map((v) => (
                      <Button
                        key={v}
                        size="xs"
                        disabled={!isSingleCell || !!binding}
                        onClick={() => setCell({ text: `${cell.text ?? ""}{{${v}}}` })}
                      >
                        +{`{{${v}}}`}
                      </Button>
                    ))}
                  </div>
                  <Field label="单元格样式">
                    <Select
                      value={cell.style ?? "body"}
                      onChange={(v) => setRangeCells({ style: v })}
                      options={(Object.keys(STYLE_LABEL) as CellStyle[]).map((s) => ({
                        value: s,
                        label: STYLE_LABEL[s],
                      }))}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="对齐">
                      <Select
                        value={cell.align ?? "left"}
                        onChange={(v) => setRangeCells({ align: v })}
                        options={[
                          { value: "left", label: "左" },
                          { value: "center", label: "中" },
                          { value: "right", label: "右" },
                        ]}
                      />
                    </Field>
                    <Field label="字重">
                      <Select
                        value={cell.bold ? "b" : "n"}
                        onChange={(v) => setRangeCells({ bold: v === "b" })}
                        options={[
                          { value: "n", label: "常规" },
                          { value: "b", label: "加粗" },
                        ]}
                      />
                    </Field>
                  </div>
                </Section>
                <Section title="尺寸">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={`列宽 ${colName(rect.c0)}`}>
                      <NumberInput
                        value={def.colWidths[rect.c0]}
                        min={36}
                        max={600}
                        onChange={(v) =>
                          update((d) => ({
                            ...d,
                            colWidths: d.colWidths.map((w, i) =>
                              i >= rect.c0 && i <= rect.c1 ? v : w,
                            ),
                          }))
                        }
                        suffix="px"
                      />
                    </Field>
                    <Field label={`行高 ${rect.r0 + 1}`}>
                      <NumberInput
                        value={def.rowHeights[rect.r0]}
                        min={20}
                        max={200}
                        onChange={(v) =>
                          update((d) => ({
                            ...d,
                            rowHeights: d.rowHeights.map((h, i) =>
                              i >= rect.r0 && i <= rect.r1 ? v : h,
                            ),
                          }))
                        }
                        suffix="px"
                      />
                    </Field>
                  </div>
                  <div className="text-[11px] text-ink-3">
                    表格总宽 {def.colWidths.reduce((a, b) => a + b, 0)}px · {nRows} 行 × {nCols} 列
                    · {def.merges.length} 个合并区
                  </div>
                </Section>
              </>
            )}
            {tab === "region" && (
              <>
                {region ? (
                  <Section title={`动态区 ${region.id}（第 ${region.row + 1} 行）`}>
                    <Field label="数据集">
                      <Select
                        value={region.dataSetId}
                        onChange={(v) => {
                          const m = DATASETS[v];
                          setRegion({
                            dataSetId: v,
                            metric: m.measures[0],
                            groupBy:
                              v === "printStressRows"
                                ? []
                                : region.groupBy.filter((g) => m.dims.includes(g)),
                          });
                        }}
                        options={(
                          [
                            "resourceInput",
                            "resourceSplit",
                            "transferProgress",
                            "taskSchedule",
                            "printStressRows",
                          ] as const
                        ).map((d) => ({ value: d, label: `${DATASETS[d].label}（${d}）` }))}
                      />
                    </Field>
                    <Field label="行来源">
                      <Select<string>
                        value={region.groupBy[0] ?? "__detail"}
                        onChange={(v) => {
                          const g = v === "__detail" ? [] : [v];
                          const bindings = { ...region.columnBindings };
                          if (
                            g.length &&
                            bindings[0] &&
                            !DATASETS[region.dataSetId].measures.includes(bindings[0]) &&
                            !/\(/.test(bindings[0])
                          )
                            bindings[0] = g[0];
                          setRegion({ groupBy: g, columnBindings: bindings });
                        }}
                        options={[
                          { value: "__detail", label: "明细记录（每条一行）" },
                          ...DATASETS[region.dataSetId].dims
                            .filter(
                              (d) => !["simulationId", "branch", "note", "sequence"].includes(d),
                            )
                            .map((d) => ({ value: d, label: `按${fieldLabel(d)}汇总` })),
                        ]}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="指标">
                        <Select
                          value={region.metric}
                          onChange={(v) => setRegion({ metric: v })}
                          options={DATASETS[region.dataSetId].measures.map((m) => ({
                            value: m,
                            label: fieldLabel(m),
                          }))}
                        />
                      </Field>
                      <Field label="排序">
                        <Select
                          value={region.sort}
                          onChange={(v) => setRegion({ sort: v })}
                          options={[
                            { value: "keyAsc", label: "分类升序" },
                            { value: "keyDesc", label: "分类降序" },
                            { value: "valueDesc", label: "数值降序" },
                            { value: "valueAsc", label: "数值升序" },
                          ]}
                        />
                      </Field>
                    </div>
                    <Field label="列绑定">
                      <div className="space-y-1">
                        {def.colWidths.map((_, c) =>
                          covered.has(rcKey(region.row, c)) ? null : (
                            <div key={c} className="flex items-center gap-2">
                              <span className="w-6 text-[11px] font-mono text-ink-3">
                                {colName(c)}
                              </span>
                              <Select
                                size="sm"
                                className="flex-1"
                                value={region.columnBindings[c] ?? ""}
                                onChange={(v) =>
                                  setRegion({
                                    columnBindings: Object.fromEntries(
                                      Object.entries({ ...region.columnBindings, [c]: v }).filter(
                                        ([, x]) => x,
                                      ),
                                    ) as Record<string, string>,
                                  })
                                }
                                options={bindingOptions(def, region)}
                              />
                            </div>
                          ),
                        )}
                      </div>
                    </Field>
                    <Field label="分页重复表头行">
                      <Select<string>
                        value={
                          region.repeatHeaderRow === null ? "none" : String(region.repeatHeaderRow)
                        }
                        onChange={(v) =>
                          setRegion({ repeatHeaderRow: v === "none" ? null : Number(v) })
                        }
                        options={[
                          { value: "none", label: "不重复" },
                          ...def.rowHeights.map((_, i) => ({
                            value: String(i),
                            label: `第 ${i + 1} 行`,
                            disabled: i === region.row,
                          })),
                        ]}
                      />
                    </Field>
                    <div className="rounded-md bg-emerald-50 border border-emerald-100 p-2.5 text-[12px] text-emerald-900">
                      当前填数：{ex.regionStats.find((s) => s.id === region.id)?.count ?? 0} 行
                      {ex.regionStats.find((s) => s.id === region.id)?.status !== "ok" &&
                        ` · ${ex.regionStats.find((s) => s.id === region.id)?.message}`}
                    </div>
                    <Button size="sm" variant="danger" className="w-full" onClick={toggleRegion}>
                      取消动态行
                    </Button>
                  </Section>
                ) : (
                  <Section title="动态区">
                    <div className="text-[12px] text-ink-3">
                      所选第 {rect.r0 + 1} 行不是动态行。
                    </div>
                    <Button
                      size="sm"
                      variant="subtle"
                      className="w-full"
                      icon={<Repeat className="size-3.5" />}
                      onClick={toggleRegion}
                    >
                      将第 {rect.r0 + 1} 行设为动态行
                    </Button>
                  </Section>
                )}
                <Section title="全部动态区">
                  {def.regions.length === 0 && <div className="text-[12px] text-ink-3">无</div>}
                  {def.regions.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => select(g.row, 0, false)}
                      className="w-full text-left p-2 rounded border border-line hover:bg-gray-50 text-[12px]"
                    >
                      <div className="font-medium">
                        {g.id} · 第 {g.row + 1} 行
                      </div>
                      <div className="text-[11px] text-ink-3">
                        {g.dataSetId} ·{" "}
                        {g.groupBy.length ? `按${g.groupBy.map(fieldLabel).join("/")}汇总` : "明细"}{" "}
                        · {ex.regionStats.find((s) => s.id === g.id)?.count} 行
                      </div>
                    </button>
                  ))}
                </Section>
              </>
            )}
            {tab === "page" && (
              <>
                <Section title="纸张（A4）">
                  <Field label="方向">
                    <Segmented
                      value={def.page.orientation}
                      onChange={(v) => setDraft({ ...def, page: { ...def.page, orientation: v } })}
                      options={[
                        { value: "portrait", label: "纵向" },
                        { value: "landscape", label: "横向" },
                      ]}
                    />
                  </Field>
                  <Field label="页边距">
                    <NumberInput
                      value={def.page.marginMm}
                      min={5}
                      max={40}
                      onChange={(v) => setDraft({ ...def, page: { ...def.page, marginMm: v } })}
                      suffix="mm"
                    />
                  </Field>
                  <Toggle
                    label="显示页码"
                    checked={def.pageNumbering.show}
                    onChange={(v) =>
                      setDraft({ ...def, pageNumbering: { ...def.pageNumbering, show: v } })
                    }
                  />
                  <Field label="页码格式" hint="{page} 为页码">
                    <TextInput
                      value={def.pageNumbering.format}
                      onChange={(e) =>
                        setDraft({
                          ...def,
                          pageNumbering: { ...def.pageNumbering, format: e.target.value },
                        })
                      }
                    />
                  </Field>
                </Section>
                <Section title="填数数据范围">
                  <DataContextBar
                    value={def.viewParams}
                    onChange={(v) => setDraft({ ...def, viewParams: v })}
                  />
                  <FilterBar
                    filters={def.filters}
                    onChange={(f) => setDraft({ ...def, filters: f })}
                  />
                  <FilterEditor
                    dataSetId="resourceInput"
                    ctx={def.viewParams}
                    filters={def.filters}
                    onChange={(f) => setDraft({ ...def, filters: f })}
                  />
                </Section>
                <Section title="长表演示">
                  <Field
                    label="printStressRows 重复次数"
                    hint="仅用于排版与分页演示，不进入投入统计"
                  >
                    <Segmented
                      value={String(def.repeatFactor) as "1" | "2" | "4"}
                      onChange={(v) => setDraft({ ...def, repeatFactor: Number(v) })}
                      options={[
                        { value: "1", label: "×1（64 行）" },
                        { value: "2", label: "×2" },
                        { value: "4", label: "×4" },
                      ]}
                    />
                  </Field>
                </Section>
              </>
            )}
          </div>
        </SidePanel>
      </div>

      <Modal
        open={publish}
        title={`保存固定格式模板：${asset.assetId} r${asset.latest + 1}`}
        onClose={() => setPublish(false)}
        footer={
          <>
            <Button onClick={() => setPublish(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                const rev = useApp.getState().saveRevision(asset.assetId, def, note);
                markSaved();
                setPublish(false);
                setNote("");
                toast(`已保存 ${asset.assetId} r${rev}：布局、合并与绑定已持久化`);
              }}
            >
              保存 r{asset.latest + 1}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-brand-50 border border-brand-100 p-3 text-[12.5px]">
            保存内容：{nRows} 行 × {nCols} 列、{def.merges.length} 个合并区、{def.regions.length}{" "}
            个动态区、纸张 A4 {def.page.orientation === "portrait" ? "纵向" : "横向"}
            。既有报告实例保持原快照。
          </div>
          <Field label="版本说明">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：调整列宽与合并"
            />
          </Field>
        </div>
      </Modal>
      <InsertModal assetId={insert ? asset.assetId : null} onClose={() => setInsert(false)} />
      <ResourcePicker
        open={!!bindPicker}
        onClose={() => setBindPicker(null)}
        kinds={[bindPicker ?? "expression"]}
        datasetKey={bindPicker === "expression" && region ? region.dataSetId : undefined}
        title={`为单元格 ${rcRef(rect.r0, rect.c0)} 绑定共享${bindPicker === "variable" ? "变量" : "表达式"}`}
        actionLabel="绑定"
        onPick={(p) => setBinding(`${p.kind === "variable" ? "var" : "expr"}:${p.assetId}@${p.revision}`)}
      />
    </>
  );
}
