import { type ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, Check, ChevronDown, Info, Loader2, SearchX, X } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "xs" | "sm" | "md";
  icon?: ReactNode;
  active?: boolean;
}) {
  const v: Record<BtnVariant, string> = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-700 border border-brand-600 shadow-[0_1px_2px_rgba(16,24,40,.08)]",
    secondary:
      "bg-white text-ink-2 border border-line hover:bg-gray-50 hover:border-gray-300 shadow-[0_1px_2px_rgba(16,24,40,.04)]",
    ghost: "text-ink-2 hover:bg-gray-100 border border-transparent",
    subtle: "bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  };
  const s = {
    xs: "h-6 px-1.5 text-[11px] gap-1 rounded",
    sm: "h-7 px-2 text-xs gap-1.5 rounded-md",
    md: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  };
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:pointer-events-none select-none",
        v[variant],
        s[size],
        active && "bg-brand-50! text-brand-700! border-brand-200!",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export interface Opt<T extends string | number = string> {
  value: T;
  label: string;
  disabled?: boolean;
}
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  className,
  size = "md",
  placeholder,
  ...rest
}: {
  value: T | null | undefined;
  onChange: (v: T) => void;
  options: Opt<T>[];
  className?: string;
  size?: "sm" | "md";
  placeholder?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "size">) {
  return (
    <div className={cx("relative", className)}>
      <select
        {...rest}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
        className={cx(
          "w-full appearance-none bg-white border border-line rounded-md pl-2.5 pr-7 text-ink hover:border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none",
          size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]",
        )}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-ink-3" />
    </div>
  );
}

export function TextInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        "h-8 w-full bg-white border border-line rounded-md px-2.5 text-[13px] text-ink placeholder:text-gray-400 hover:border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none",
        className,
      )}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  suffix?: string;
}) {
  return (
    <div className={cx("relative", className)}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
        }}
        className="h-8 w-full bg-white border border-line rounded-md pl-2.5 pr-8 text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
      />
      {suffix && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
  right,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <label className={cx("block", className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">{label}</span>
        {right}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-ink-3 leading-snug">{hint}</div>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full py-1 text-[13px] text-ink-2 disabled:opacity-50"
    >
      <span>{label}</span>
      <span
        className={cx(
          "relative inline-flex h-4.5 w-8 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-gray-300",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  value: T;
  options: Opt<T>[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cx("inline-flex p-0.5 bg-gray-100 rounded-md border border-line", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            "px-2.5 rounded font-medium transition-colors disabled:opacity-40",
            size === "sm" ? "h-6 text-[11px]" : "h-7 text-xs",
            value === o.value
              ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,.12)]"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  tone = "gray",
  children,
  className,
  title,
}: {
  tone?: "gray" | "brand" | "green" | "amber" | "red" | "violet" | "cyan";
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const t = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    brand: "bg-brand-50 text-brand-700 border-brand-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    cyan: "bg-cyan-50 text-cyan-800 border-cyan-100",
  };
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[11px] font-medium whitespace-nowrap",
        t[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center h-5 px-1.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10.5px] font-semibold tracking-wide whitespace-nowrap",
        className,
      )}
    >
      DEMO / 演示数据
    </span>
  );
}

export function FilterChip({
  label,
  onRemove,
  tone = "brand",
}: {
  label: ReactNode;
  onRemove?: () => void;
  tone?: "brand" | "gray";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full border text-xs",
        tone === "brand"
          ? "bg-brand-50 border-brand-200 text-brand-700"
          : "bg-gray-50 border-line text-ink-2",
      )}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          aria-label="移除筛选"
          onClick={onRemove}
          className="size-4 grid place-items-center rounded-full hover:bg-brand-100"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

export function Section({
  title,
  children,
  actions,
  className,
  defaultOpen = true,
  dense,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  dense?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx("border-b border-line last:border-b-0", className)}>
      <div className="flex items-center justify-between px-3.5 h-9">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"
        >
          <ChevronDown
            className={cx("size-3.5 text-ink-3 transition-transform", !open && "-rotate-90")}
          />
          {title}
        </button>
        {actions}
      </div>
      {open && (
        <div className={cx("px-3.5 pb-3.5 space-y-3", dense && "space-y-2")}>{children}</div>
      )}
    </section>
  );
}

export function Card({
  children,
  className,
  title,
  actions,
  bodyClass,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
  bodyClass?: string;
}) {
  return (
    <div
      className={cx(
        "bg-white border border-line rounded-lg shadow-[0_1px_2px_rgba(16,24,40,.04)] flex flex-col min-w-0",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-line shrink-0">
          <div className="text-[13px] font-semibold text-ink truncate flex items-center gap-2">
            {title}
          </div>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>
      )}
      <div className={cx("min-h-0 flex-1", bodyClass)}>{children}</div>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  width = 480,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-gray-900/35 backdrop-blur-[1px] p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ width }}
        className="max-w-full max-h-[85vh] flex flex-col bg-white rounded-xl shadow-2xl border border-line"
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line shrink-0">
          <div className="text-sm font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="size-7 grid place-items-center rounded hover:bg-gray-100"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-auto scroll-thin text-[13px] text-ink-2">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-line bg-gray-50/60 rounded-b-xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusBlock({
  status,
  message,
  actions,
  compact,
}: {
  status: "empty" | "invalid" | "unfit" | "loading" | "missing" | "incomplete";
  message?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const cfg = {
    empty: {
      icon: SearchX,
      title: "当前条件下无数据",
      c: "text-gray-500 bg-gray-50 border-gray-200",
    },
    invalid: { icon: Ban, title: "数据范围无效", c: "text-red-700 bg-red-50 border-red-200" },
    unfit: {
      icon: AlertTriangle,
      title: "图型与数据不适配",
      c: "text-amber-800 bg-amber-50 border-amber-200",
    },
    loading: { icon: Loader2, title: "加载中…", c: "text-gray-500 bg-gray-50 border-gray-200" },
    missing: { icon: AlertTriangle, title: "引用失效", c: "text-red-700 bg-red-50 border-red-200" },
    incomplete: {
      icon: Info,
      title: "数据不完整",
      c: "text-amber-800 bg-amber-50 border-amber-200",
    },
  }[status];
  const I = cfg.icon;
  return (
    <div
      className={cx(
        "rounded-lg border flex flex-col items-center justify-center text-center gap-1.5",
        cfg.c,
        compact ? "p-3" : "p-6 min-h-[160px]",
      )}
    >
      <I className={cx("size-5", status === "loading" && "animate-spin")} />
      <div className="text-[13px] font-semibold">{cfg.title}</div>
      {message && <div className="text-xs opacity-90 max-w-md leading-relaxed">{message}</div>}
      {actions && <div className="flex flex-wrap justify-center gap-2 mt-1.5">{actions}</div>}
    </div>
  );
}

export function Kpi({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "brand" | "default";
}) {
  return (
    <div
      className={cx(
        "rounded-lg border px-3.5 py-2.5 min-w-0",
        tone === "brand" ? "bg-brand-50/60 border-brand-100" : "bg-white border-line",
      )}
    >
      <div className="text-[11px] text-ink-3 truncate">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-xl font-semibold tabular-nums text-ink" data-testid={`kpi-${label}`}>
          {value}
        </span>
        {unit && <span className="text-[11px] text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-ink-3 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

export function MultiCheck({
  options,
  value,
  onChange,
}: {
  options: Opt<string>[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cx(
              "inline-flex items-center gap-1 h-6 px-2 rounded border text-xs",
              on
                ? "bg-brand-50 border-brand-200 text-brand-700"
                : "bg-white border-line text-ink-2 hover:border-gray-300",
            )}
          >
            {on && <Check className="size-3" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-4 border-b border-line", className)}>
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            "h-9 -mb-px border-b-2 text-[13px] font-medium flex items-center gap-1.5",
            value === i.value
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function InlineEdit({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  if (!editing)
    return (
      <button
        title="点击编辑名称"
        onClick={() => setEditing(true)}
        className={cx("text-left hover:bg-gray-100 rounded px-1 -mx-1 truncate", className)}
      >
        {value || placeholder}
      </button>
    );
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (v.trim() && v !== value) onCommit(v.trim());
        else setV(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value);
          setEditing(false);
        }
      }}
      className={cx(
        "bg-white border border-brand-500 ring-2 ring-brand-100 rounded px-1 outline-none",
        className,
      )}
    />
  );
}

export function SaveState({ dirty, label }: { dirty: boolean; label?: string }) {
  return dirty ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
      <span className="size-1.5 rounded-full bg-amber-500" />
      {label ?? "有未保存修改"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
      <Check className="size-3" />
      已保存
    </span>
  );
}
