import { createContext, useContext } from 'react'
import type { AssetSnapshot, DataContext, EvalResult, ResourceSnapshot } from '../data/types'
import type { Env } from '../data/registry'
import { inlineKey, resolveInline, type InlineRef } from '../data/reports'

export interface ReportCtxValue {
  mode: 'template' | 'instance' | 'frozen'
  params: DataContext
  preview: boolean
  /** resources, records and variable values used for every value on this document */
  env: Env
  /** publication: materialized inline results (used instead of recomputing) */
  frozenResults?: Record<string, EvalResult>
  resolveSnapshot: (assetId: string, revision: number) => AssetSnapshot | null
  latestRevision: (assetId: string) => number | undefined
}

export const ReportCtx = createContext<ReportCtxValue | null>(null)
export const useReportCtx = () => useContext(ReportCtx)!

/** Single value-resolution path for editor NodeViews, preview and frozen rendering. */
export function useInlineValue(ref: InlineRef): { result: EvalResult; snap: ResourceSnapshot | null; frozen: boolean } {
  const ctx = useReportCtx()
  const key = inlineKey(ref)
  const r = resolveInline(ref, ctx.params, ctx.env)
  if (ctx.frozenResults && ctx.frozenResults[key]) return { ...r, result: ctx.frozenResults[key], frozen: true }
  return { ...r, frozen: false }
}
