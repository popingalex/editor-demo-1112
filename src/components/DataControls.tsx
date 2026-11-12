import { Plus, X, ArrowLeft, ArrowRight, Filter } from "lucide-react";
import type { DataContext, DataSetId, Filters, LabelMode } from "../data/types";
import { DATASETS, RUNS, displayValue, distinctValues, fieldLabel } from "../data/engine";
import { Button, FilterChip, MultiCheck, Select, cx } from "../ui/kit";

export function DataContextBar({
  value,
  onChange,
  dataSetId,
  compact,
  className,
}: {
  value: DataContext;
  onChange: (v: DataContext) => void;
  dataSetId?: DataSetId;
  compact?: boolean;
  className?: string;
}) {
  const keys = dataSetId ? DATASETS[dataSetId].contextKeys : ["simulationId", "branch", "tick"];
  const run = RUNS.find((r) => r.simulationId === value.simulationId);
  const head = run?.headByBranch[value.branch] ?? 0;
  if (!keys.length)
    return (
      <div className={cx("text-[11px] text-ink-3", className)}>该数据集不受运行/时间点参数约束</div>
    );
  return (
    <div className={cx(compact ? "flex items-center gap-2" : "grid grid-cols-2 gap-2", className)}>
      <Select
        size={compact ? "sm" : "md"}
        className={compact ? "w-44" : "col-span-2"}
        value={value.simulationId}
        onChange={(v) =>
          onChange({
            ...value,
            simulationId: v,
            branch: RUNS.find((r) => r.simulationId === v)?.branchNames[0] ?? "main",
          })
        }
        options={RUNS.map((r) => ({ value: r.simulationId, label: r.simulationId }))}
        aria-label="演示运行"
      />
      <Select
        size={compact ? "sm" : "md"}
        className={compact ? "w-20" : ""}
        value={value.branch}
        disabled={!keys.includes("branch")}
        onChange={(v) => onChange({ ...value, branch: v })}
        options={(run?.branchNames ?? ["main"]).map((b) => ({ value: b, label: b }))}
        aria-label="分支"
      />
      <Select<string>
        size={compact ? "sm" : "md"}
        className={compact ? "w-28" : ""}
        value={value.tick === null ? "null" : String(value.tick)}
        disabled={!keys.includes("tick")}
        onChange={(v) => onChange({ ...value, tick: v === "null" ? null : Number(v) })}
        options={[
          { value: "null", label: "未选择" },
          ...[0, 1, 2].map((t) => ({
            value: String(t),
            label: `Tick ${t}${t > head ? "（无）" : ""}`,
          })),
        ]}
        aria-label="时间点"
      />
    </div>
  );
}

export function DimensionPicker({
  dataSetId,
  value,
  onChange,
  max = 3,
  exclude = [],
}: {
  dataSetId: DataSetId;
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  exclude?: string[];
}) {
  const all = DATASETS[dataSetId].dims.filter((d) => !exclude.includes(d));
  const avail = all.filter((d) => !value.includes(d));
  const move = (i: number, dir: -1 | 1) => {
    const n = [...value];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div className="space-y-1.5">
      {value.map((d, i) => (
        <div
          key={d}
          className="flex items-center gap-1 h-7 pl-2 pr-1 rounded-md border border-brand-200 bg-brand-50 text-xs text-brand-700"
        >
          <span className="text-[10px] text-brand-500 w-3">{i + 1}</span>
          <span className="flex-1 font-medium">{fieldLabel(d)}</span>
          <span className="text-[10px] text-brand-500 font-mono">{d}</span>
          <button
            onClick={() => move(i, -1)}
            disabled={i === 0}
            className="size-5 grid place-items-center rounded hover:bg-brand-100 disabled:opacity-30"
            aria-label="上移"
          >
            <ArrowLeft className="size-3 rotate-90" />
          </button>
          <button
            onClick={() => move(i, 1)}
            disabled={i === value.length - 1}
            className="size-5 grid place-items-center rounded hover:bg-brand-100 disabled:opacity-30"
            aria-label="下移"
          >
            <ArrowRight className="size-3 rotate-90" />
          </button>
          <button
            onClick={() => onChange(value.filter((x) => x !== d))}
            className="size-5 grid place-items-center rounded hover:bg-brand-100"
            aria-label="移除维度"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {value.length < max && avail.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {avail.map((d) => (
            <button
              key={d}
              onClick={() => onChange([...value, d])}
              className="inline-flex items-center gap-1 h-6 px-2 rounded border border-dashed border-gray-300 text-xs text-ink-2 hover:border-brand-500 hover:text-brand-700"
            >
              <Plus className="size-3" />
              {fieldLabel(d)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const FILTERABLE = [
  "unitId",
  "targetId",
  "resourceCategory",
  "status",
  "fieldId",
  "entityId",
  "itemName",
];

export function FilterEditor({
  dataSetId,
  ctx,
  filters,
  onChange,
  labelMode = "id",
}: {
  dataSetId: DataSetId;
  ctx: DataContext;
  filters: Filters;
  onChange: (f: Filters) => void;
  labelMode?: LabelMode;
}) {
  const dims = DATASETS[dataSetId].dims.filter((d) => FILTERABLE.includes(d));
  if (!dims.length) return <div className="text-[11px] text-ink-3">该数据集无可筛选的分类维度</div>;
  return (
    <div className="space-y-2.5">
      {dims.map((d) => (
        <div key={d}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-ink-2">{fieldLabel(d)}</span>
            {(filters[d]?.length ?? 0) > 0 && (
              <button
                className="text-[11px] text-brand-600 hover:underline"
                onClick={() => onChange(cleanFilters({ ...filters, [d]: [] }))}
              >
                清除
              </button>
            )}
          </div>
          <MultiCheck
            options={distinctValues(dataSetId, d, ctx).map((v) => ({
              value: v,
              label: displayValue(d, v, labelMode),
            }))}
            value={filters[d] ?? []}
            onChange={(v) => onChange(cleanFilters({ ...filters, [d]: v }))}
          />
        </div>
      ))}
      <div className="text-[11px] text-ink-3">未勾选任何值 = 不筛选（全部）</div>
    </div>
  );
}

export function cleanFilters(f: Filters): Filters {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v && v.length));
}

export function toggleFilter(f: Filters, dim: string, value: string): Filters {
  const cur = f[dim] ?? [];
  if (cur.length === 1 && cur[0] === value) return cleanFilters({ ...f, [dim]: [] });
  return cleanFilters({ ...f, [dim]: [value] });
}

export function FilterBar({
  filters,
  onChange,
  labelMode = "id",
  empty = "无筛选条件（全部数据）",
  className,
  extra,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  labelMode?: LabelMode;
  empty?: string;
  className?: string;
  extra?: React.ReactNode;
}) {
  const entries = Object.entries(filters).filter(([, v]) => v?.length);
  return (
    <div className={cx("flex items-center gap-1.5 flex-wrap min-h-7", className)}>
      <Filter className="size-3.5 text-ink-3" />
      {entries.length === 0 && <span className="text-xs text-ink-3">{empty}</span>}
      {entries.flatMap(([d, vals]) =>
        vals.map((v) => (
          <FilterChip
            key={d + v}
            label={`${fieldLabel(d)} = ${displayValue(d, v, labelMode)}`}
            onRemove={() =>
              onChange(cleanFilters({ ...filters, [d]: vals.filter((x) => x !== v) }))
            }
          />
        )),
      )}
      {extra}
      {entries.length > 0 && (
        <Button size="xs" variant="ghost" onClick={() => onChange({})}>
          清除全部
        </Button>
      )}
    </div>
  );
}
