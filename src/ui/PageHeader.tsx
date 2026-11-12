import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useUI, type PageId } from "../store/store";
import { DemoBadge } from "./kit";

export function PageHeader({
  crumbs,
  title,
  meta,
  actions,
}: {
  crumbs: { label: string; page?: PageId }[];
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const go = useUI((s) => s.go);
  return (
    <header className="shrink-0 bg-white border-b border-line px-5 pt-2.5 pb-2.5">
      <nav className="flex items-center gap-1 text-[11px] text-ink-3 mb-1">
        <button onClick={() => go("assets")} className="hover:text-ink">
          报表与报告工作台
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            {c.page ? (
              <button onClick={() => go(c.page!)} className="hover:text-ink">
                {c.label}
              </button>
            ) : (
              <span className="text-ink-2">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-3 min-h-8">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <h1 className="text-[17px] font-semibold text-ink truncate">{title}</h1>
          {meta}
          <DemoBadge />
        </div>
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      </div>
    </header>
  );
}
