import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Bookmark,
  GitBranchPlus,
  FilePlus2,
  Undo2,
  X,
  GripVertical,
  Plus,
} from "lucide-react";
import { useApp, useUI, latestDef, toast } from "../store/store";
import type { DataSetId, TableDef, TableMode } from "../data/types";
import { computeTable } from "../data/tableModel";
import { DATASETS, DATASET_IDS, displayValue, fieldLabel, fmt, unitText } from "../data/engine";
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
} from "../ui/kit";
import { AnalysisTableView, RecordsTable, type CellPick } from "../components/TableViews";
import { DataContextBar, FilterBar, FilterEditor } from "../components/DataControls";
import { InsertModal } from "./AssetCenter";
import { useDraft } from "./useDraft";
import { SidePanel } from "../ui/SidePanel";
import { SharedDatasetSelect, MeasureBindingEditor, VariableFilterEditor } from "../components/BindingControls";

type ZoneId = "rows" | "cols" | "group" | "columns";

function Zone({
  label,
  tone,
  fields,
  onDrop,
  onRemove,
  empty,
}: {
  label: string;
  tone: "brand" | "violet" | "gray";
  fields: string[];
  onDrop: (f: string) => void;
  onRemove: (f: string) => void;
  empty: string;
}) {
  const [over, setOver] = useState(false);
  const toneCls = {
    brand: "bg-brand-50 border-brand-200 text-brand-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    gray: "bg-gray-50 border-line text-ink-2",
  }[tone];
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.getData("text/field");
        if (f) onDrop(f);
      }}
      className={cx(
        "rounded-md border border-dashed p-1.5 min-h-[40px] transition-colors",
        over ? "border-brand-500 bg-brand-50/60" : "border-gray-300",
      )}
    >
      <div className="text-[10.5px] font-semibold text-ink-3 mb-1 px-0.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        {fields.length === 0 && <span className="text-[11px] text-gray-400 px-0.5">{empty}</span>}
        {fields.map((f) => (
          <span
            key={f}
            className={cx(
              "inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded border text-xs font-medium",
              toneCls,
            )}
          >
            {fieldLabel(f)}
            <button onClick={() => onRemove(f)} aria-label="移除">
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function TableStudio() {
  const params = useUI((s) => s.params);
  const go = useUI((s) => s.go);
  const assets = useApp((s) => s.assets);
  const views = useApp((s) => s.views);
  const tables = Object.values(assets).filter((a) => a.kind === "table");
  const assetId =
    params.assetId && assets[params.assetId]?.kind === "table"
      ? params.assetId
      : (tables.find((t) => t.assetId === "DEMO-TABLE-02") ?? tables[0])?.assetId;
  const asset = assetId ? assets[assetId] : undefined;
  const loadedView = params.viewId
    ? views.find((v) => v.id === params.viewId && v.assetId === assetId)
    : undefined;
  const {
    draft: def,
    setDraft,
    dirty,
    markSaved,
    revert,
    load,
  } = useDraft<TableDef>(
    loadedView?.state ?? latestDef<TableDef>(asset),
    `分析型表格 · ${assetId}`,
  );
  const [pick, setPick] = useState<CellPick | null>(null);
  const [publish, setPublish] = useState(false);
  const [note, setNote] = useState("");
  const [viewModal, setViewModal] = useState(false);
  const [viewName, setViewName] = useState(loadedView?.name ?? "我的表格视图");
  const [insert, setInsert] = useState(false);
  const model = useMemo(() => (def ? computeTable(def) : null), [def]);
  if (!asset || !def || !model)
    return <div className="p-10 text-center text-ink-3">暂无分析表资产</div>;
  const set = (p: Partial<TableDef>) => {
    setDraft({ ...def, ...p });
    setPick(null);
  };
  const tableViews = views.filter((v) => v.scope === "table" && v.assetId === assetId);
  const meta = DATASETS[def.dataSetId];
  const dims = meta.dims.filter((d) => !["simulationId", "branch"].includes(d));
  const allFields = ["recordId", ...meta.dims, ...meta.measures, "provenance"];

  const addTo = (zone: ZoneId, f: string) => {
    if (zone === "columns")
      return set({ columns: def.columns.includes(f) ? def.columns : [...def.columns, f] });
    if (meta.measures.includes(f)) return set({ measure: f });
    if (zone === "rows")
      set({
        rowDimensions: [...def.rowDimensions.filter((x) => x !== f), f],
        columnDimensions: def.columnDimensions.filter((x) => x !== f),
      });
    if (zone === "cols")
      set({
        columnDimensions: [...def.columnDimensions.filter((x) => x !== f), f],
        rowDimensions: def.rowDimensions.filter((x) => x !== f),
      });
    if (zone === "group") set({ groupBy: [...def.groupBy.filter((x) => x !== f), f] });
  };
  const changedDataset = (ds: DataSetId): TableDef => {
    const m = DATASETS[ds];
    const ok = (arr: string[]) => arr.filter((d) => m.dims.includes(d));
    return {
      ...def,
      measureBinding: undefined,
      variableFilters: undefined,
      datasetRef: undefined,
      dataSetId: ds,
      measure: m.measures.includes(def.measure) ? def.measure : m.measures[0],
      groupBy: ok(def.groupBy),
      rowDimensions: ok(def.rowDimensions),
      columnDimensions: ok(def.columnDimensions),
      columns: ["recordId", ...m.dims.filter((d) => d !== "branch"), ...m.measures],
      filters: {},
    };
  };
  const changeDataset = (ds: DataSetId) => {
    setDraft(changedDataset(ds));
    setPick(null);
  };
  const srcDesc = (p: CellPick) => {
    const r = p.records;
    if (!r.length) return "该单元格无源记录（空值）";
    const uniq = (f: string) => [...new Set(r.map((x) => x[f]))].filter((x) => x !== undefined);
    return ["simulationId", "tick", "unitId", "targetId", "resourceCategory"]
      .filter((f) => f in r[0])
      .map((f) => {
        const u = uniq(f);
        return u.length === 1 ? displayValue(f, u[0]) : `${fieldLabel(f)}×${u.length}`;
      })
      .join(" / ");
  };

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "组件与资产中心", page: "assets" },
          { label: "分析型表格设计器" },
          { label: asset.assetId },
        ]}
        title={<InlineEdit value={def.title} onCommit={(v) => set({ title: v })} />}
        meta={
          <>
            <Badge tone="brand">共享 r{asset.latest}</Badge>
            {loadedView && <Badge tone="violet">个人视图：{loadedView.name}</Badge>}
            <SaveState dirty={dirty} />
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Undo2 className="size-3.5" />}
              disabled={!dirty}
              onClick={revert}
            >
              撤销修改
            </Button>
            <Button icon={<Bookmark className="size-3.5" />} onClick={() => setViewModal(true)}>
              保存个人视图
            </Button>
            <Button
              variant="primary"
              icon={<GitBranchPlus className="size-3.5" />}
              onClick={() => setPublish(true)}
            >
              保存表格资产（新版本）
            </Button>
            <Button icon={<FilePlus2 className="size-3.5" />} onClick={() => setInsert(true)}>
              插入到报告
            </Button>
          </>
        }
      />
      <div className="flex-1 min-h-0 flex">
        <SidePanel id="studioLeft" side="left" title="数据与字段">
          <Section title="表格资产与数据">
            <Select
              value={assetId!}
              onChange={(v) => go("table", { assetId: v })}
              options={tables.map((c) => ({
                value: c.assetId,
                label: `${c.assetId} · ${c.title}`,
              }))}
            />
            {tableViews.length > 0 && (
              <Field label="我的个人视图">
                <Select
                  placeholder="选择以载入…"
                  value={loadedView?.id ?? null}
                  onChange={(v) => go("table", { assetId, viewId: v })}
                  options={tableViews.map((v) => ({
                    value: v.id,
                    label: `${v.name}（基于 r${v.baseRevision}）`,
                  }))}
                />
              </Field>
            )}
            <SharedDatasetSelect
              value={def.datasetRef}
              sourceKey={def.dataSetId}
              onChange={(ref, src) => (src !== def.dataSetId ? setDraft({ ...changedDataset(src), datasetRef: ref }) : set({ datasetRef: ref }))}
            />
            <Field label="演示数据集" hint={<span className="font-mono">{meta.source}</span>}>
              <Select
                value={def.dataSetId}
                onChange={changeDataset}
                options={DATASET_IDS.map((d) => ({
                  value: d,
                  label: `${DATASETS[d].label}（${d}）`,
                }))}
              />
            </Field>
            <Field label="运行 / 分支 / 时间点">
              <DataContextBar
                value={def.viewParams}
                dataSetId={def.dataSetId}
                onChange={(v) => set({ viewParams: v })}
              />
            </Field>
          </Section>
          <Section title="字段配置">
            <Field label="可用字段（拖入下方区域，或点 + 快速添加）">
              <div className="flex flex-wrap gap-1">
                {(def.mode === "detail" ? allFields : [...dims, ...meta.measures]).map((f) => {
                  const isM = meta.measures.includes(f);
                  return (
                    <span
                      key={f}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/field", f)}
                      className={cx(
                        "group inline-flex items-center gap-0.5 h-6 pl-1 pr-1 rounded border text-xs cursor-grab active:cursor-grabbing",
                        isM
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-line bg-white text-ink-2",
                      )}
                    >
                      <GripVertical className="size-3 text-gray-400" />
                      {fieldLabel(f)}
                      {def.mode === "pivot" && !isM && (
                        <>
                          <button
                            title="放入行"
                            onClick={() => addTo("rows", f)}
                            className="ml-0.5 px-1 rounded text-[10px] text-brand-600 hover:bg-brand-50"
                          >
                            行
                          </button>
                          <button
                            title="放入列"
                            onClick={() => addTo("cols", f)}
                            className="px-1 rounded text-[10px] text-violet-600 hover:bg-violet-50"
                          >
                            列
                          </button>
                        </>
                      )}
                      {def.mode === "grouped" && !isM && (
                        <button
                          title="添加为分组"
                          onClick={() => addTo("group", f)}
                          className="ml-0.5 rounded hover:bg-brand-50"
                        >
                          <Plus className="size-3 text-brand-600" />
                        </button>
                      )}
                      {def.mode === "detail" && (
                        <button
                          title="添加为列"
                          onClick={() => addTo("columns", f)}
                          className="ml-0.5 rounded hover:bg-brand-50"
                        >
                          <Plus className="size-3 text-brand-600" />
                        </button>
                      )}
                      {isM && def.mode !== "detail" && (
                        <button
                          title="设为指标"
                          onClick={() => set({ measure: f })}
                          className="ml-0.5 px-1 rounded text-[10px] text-emerald-700 hover:bg-emerald-100"
                        >
                          指标
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </Field>
            {def.mode === "pivot" && (
              <>
                <Zone
                  label="行维度"
                  tone="brand"
                  fields={def.rowDimensions}
                  onDrop={(f) => addTo("rows", f)}
                  onRemove={(f) => set({ rowDimensions: def.rowDimensions.filter((x) => x !== f) })}
                  empty="拖入维度作为行"
                />
                <div className="flex justify-center -my-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<ArrowLeftRight className="size-3 rotate-90" />}
                    onClick={() =>
                      set({
                        rowDimensions: def.columnDimensions,
                        columnDimensions: def.rowDimensions,
                      })
                    }
                  >
                    交换行列
                  </Button>
                </div>
                <Zone
                  label="列维度"
                  tone="violet"
                  fields={def.columnDimensions}
                  onDrop={(f) => addTo("cols", f)}
                  onRemove={(f) =>
                    set({ columnDimensions: def.columnDimensions.filter((x) => x !== f) })
                  }
                  empty="拖入维度作为列"
                />
              </>
            )}
            {def.mode === "grouped" && (
              <Zone
                label="分组维度（多个时按第一个出小计）"
                tone="brand"
                fields={def.groupBy}
                onDrop={(f) => addTo("group", f)}
                onRemove={(f) => set({ groupBy: def.groupBy.filter((x) => x !== f) })}
                empty="拖入分组维度"
              />
            )}
            {def.mode === "detail" && (
              <Zone
                label="显示列"
                tone="gray"
                fields={def.columns}
                onDrop={(f) => addTo("columns", f)}
                onRemove={(f) => set({ columns: def.columns.filter((x) => x !== f) })}
                empty="拖入字段"
              />
            )}
            {def.mode !== "detail" && (
              <MeasureBindingEditor
                dataSetId={def.dataSetId}
                binding={def.measureBinding}
                onChange={(b) => set({ measureBinding: b })}
                fieldEditor={
                  <>
              <div
                className="rounded-md border border-dashed border-gray-300 p-1.5"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  meta.measures.includes(e.dataTransfer.getData("text/field")) &&
                  set({ measure: e.dataTransfer.getData("text/field") })
                }
              >
                <div className="text-[10.5px] font-semibold text-ink-3 mb-1 px-0.5">指标</div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center h-6 px-2 rounded border text-xs font-medium border-emerald-200 bg-emerald-50 text-emerald-800">
                    {fieldLabel(def.measure)}
                  </span>
                  <Segmented
                    size="sm"
                    value={def.aggregation}
                    onChange={(v) => set({ aggregation: v })}
                    options={[
                      { value: "sum", label: "SUM" },
                      { value: "count", label: "COUNT" },
                    ]}
                  />
                </div>
              </div>
                              </>
                }
              />
            )}
          </Section>
          <Section title="汇总、排序与显示">
            <Toggle
              label="显示合计（行 / 列 / 总计）"
              checked={def.showTotals}
              onChange={(v) => set({ showTotals: v })}
            />
            {def.mode === "grouped" && (
              <Toggle
                label="显示小计"
                checked={def.showSubtotals}
                onChange={(v) => set({ showSubtotals: v })}
              />
            )}
            <Field label="排序">
              <Select
                value={def.sort}
                onChange={(v) => set({ sort: v })}
                options={[
                  { value: "keyAsc", label: def.mode === "detail" ? "记录 ID 升序" : "分类 升序" },
                  { value: "keyDesc", label: def.mode === "detail" ? "记录 ID 降序" : "分类 降序" },
                  { value: "valueAsc", label: "数值 升序" },
                  { value: "valueDesc", label: "数值 降序" },
                ]}
              />
            </Field>
            <Field label="空值显示">
              <Segmented
                size="sm"
                value={def.nullDisplay}
                onChange={(v) => set({ nullDisplay: v })}
                options={[
                  { value: "dash", label: "—" },
                  { value: "zero", label: "0" },
                  { value: "text", label: "（空）" },
                ]}
              />
            </Field>
            <Field label="分类显示">
              <Segmented
                size="sm"
                value={def.labelMode}
                onChange={(v) => set({ labelMode: v })}
                options={[
                  { value: "id", label: "ID" },
                  { value: "name", label: "名称" },
                  { value: "both", label: "ID+名称" },
                ]}
              />
            </Field>
            {def.mode === "detail" && (
              <Field label="每页行数">
                <NumberInput
                  value={def.pageSize}
                  min={5}
                  max={100}
                  onChange={(v) => set({ pageSize: v })}
                />
              </Field>
            )}
          </Section>
          <Section title="筛选条件">
            <VariableFilterEditor dataSetId={def.dataSetId} value={def.variableFilters ?? []} onChange={(v) => set({ variableFilters: v.length ? v : undefined })} />
            <FilterEditor
              dataSetId={def.dataSetId}
              ctx={def.viewParams}
              filters={def.filters}
              onChange={(f) => set({ filters: f })}
              labelMode={def.labelMode}
            />
          </Section>
        </SidePanel>

        <div className="flex-1 min-w-0 overflow-auto scroll-thin p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Segmented
              value={def.mode}
              onChange={(v: TableMode) => set({ mode: v })}
              options={[
                { value: "detail", label: "明细表" },
                { value: "grouped", label: "分组汇总表" },
                { value: "pivot", label: "交叉透视表" },
              ]}
            />
            <FilterBar
              className="flex-1"
              filters={def.filters}
              onChange={(f) => set({ filters: f })}
              labelMode={def.labelMode}
            />
          </div>
          <Card
            title={
              <>
                {def.title}
                <span className="text-[11px] font-normal text-ink-3">
                  {def.viewParams.simulationId} · Tick {def.viewParams.tick ?? "—"} ·{" "}
                  {def.aggregation.toUpperCase()}({fieldLabel(def.measure)}) · 单位{" "}
                  {unitText(model.unit)}
                </span>
              </>
            }
            actions={
              model.status === "ok" && (
                <Badge tone="gray">
                  总计 {fmt(model.total)} · {model.records.length} 条源记录
                </Badge>
              )
            }
          >
            <AnalysisTableView
              def={def}
              model={model}
              onPick={setPick}
              selectedKey={pick?.key}
              maxHeight={520}
              onClearFilters={() => set({ filters: {} })}
            />
          </Card>
          <div className="text-[11.5px] text-ink-3">
            {def.mode === "pivot"
              ? "点击任意数值、行合计、列合计或总计查看构成它的源记录。"
              : def.mode === "grouped"
                ? "点击分组行或小计行查看源记录。"
                : "点击行查看记录详情。"}{" "}
            结构随维度变化而重新计算（区别于固定格式报表）。
          </div>
        </div>

        {pick && (
          <aside className="w-[340px] shrink-0 bg-white border-l border-line flex flex-col">
            <div className="flex items-center justify-between px-3.5 h-10 border-b border-line">
              <span className="text-[13px] font-semibold">源记录下钻</span>
              <Button
                size="xs"
                variant="ghost"
                icon={<X className="size-3.5" />}
                onClick={() => setPick(null)}
              />
            </div>
            <div className="p-3.5 border-b border-line space-y-1">
              <div className="text-[12px] text-ink-3">{pick.label}</div>
              <div className="text-2xl font-semibold tabular-nums" data-testid="drill-value">
                {fmt(pick.value)}
              </div>
              <div className="text-[12px] text-ink-2">来自：{srcDesc(pick)}</div>
              <div className="text-[11px] text-ink-3">
                {pick.records.length} 条源记录 ·{" "}
                {def.aggregation === "count" ? "COUNT = 记录条数" : `SUM(${def.measure})`}
              </div>
            </div>
            <div className="flex-1 overflow-auto scroll-thin">
              <RecordsTable records={pick.records} />
            </div>
          </aside>
        )}
      </div>

      <Modal
        open={publish}
        title={`保存表格资产新版本：${asset.assetId} r${asset.latest + 1}`}
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
                toast(`已保存 ${asset.assetId} r${rev}`);
              }}
            >
              保存 r{asset.latest + 1}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-brand-50 border border-brand-100 p-3 text-[12.5px]">
            <b>作用范围：共享表格定义</b>
            。既有报告实例保持原引用快照；模板节点固定引用原版本直至手动升级。
          </div>
          <Field label="版本说明">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：交换行列，改为 COUNT"
            />
          </Field>
        </div>
      </Modal>
      <Modal
        open={viewModal}
        title="保存个人视图"
        onClose={() => setViewModal(false)}
        footer={
          <>
            <Button onClick={() => setViewModal(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                const v = useApp
                  .getState()
                  .saveView({
                    name: viewName.trim() || "我的表格视图",
                    scope: "table",
                    assetId: asset.assetId,
                    baseRevision: asset.latest,
                    state: def,
                  });
                markSaved();
                load(def);
                setViewModal(false);
                toast(`已保存个人视图「${v.name}」`);
              }}
            >
              保存视图
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-violet-50 border border-violet-100 p-3 text-[12.5px]">
            <b>作用范围：仅本地个人视图</b>，不创建共享版本。
          </div>
          <Field label="视图名称">
            <TextInput value={viewName} onChange={(e) => setViewName(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <InsertModal assetId={insert ? asset.assetId : null} onClose={() => setInsert(false)} />
    </>
  );
}
