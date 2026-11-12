import { createContext, useContext } from "react";
import type { AssetSnapshot, DataContext } from "../data/types";

export interface ReportCtxValue {
  mode: "template" | "instance" | "frozen";
  params: DataContext;
  vars: Record<string, string | number | null>;
  preview: boolean;
  resolveSnapshot: (assetId: string, revision: number) => AssetSnapshot | null;
  latestRevision: (assetId: string) => number | undefined;
}

export const ReportCtx = createContext<ReportCtxValue | null>(null);
export const useReportCtx = () => useContext(ReportCtx)!;
