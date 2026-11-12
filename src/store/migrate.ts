import type { AssetRecord, Publication, ReportDef, ReportInstance, ResourceRecord } from '../data/types'
import { seedResources } from '../data/registry'
import { collectRefs } from '../data/reports'

export const SCHEMA_VERSION = 2
export const STORE_KEY = 'rr-workbench-v3'

export interface Counts {
  assets: number
  assetIds: string[]
  latest: Record<string, number>
  revisions: Record<string, number[]>
  templateNodes: Record<string, number>
  instances: string[]
  instanceRevisions: Record<string, number>
  publications: string[]
  views: number
}
export interface MigrationReport {
  from: number
  to: number
  at: string
  ok: boolean
  before: Counts
  after: Counts
  backupKey: string | null
  issues: string[]
}

export function countState(s: any): Counts {
  const assets: Record<string, AssetRecord> = s?.assets ?? {}
  const ids = Object.keys(assets).sort()
  return {
    assets: ids.length,
    assetIds: ids,
    latest: Object.fromEntries(ids.map((id) => [id, assets[id].latest])),
    revisions: Object.fromEntries(ids.map((id) => [id, assets[id].revisions.map((r) => r.revision)])),
    templateNodes: Object.fromEntries(
      ids.filter((id) => assets[id].kind === 'report').map((id) => [id, collectRefs((assets[id].revisions.find((r) => r.revision === assets[id].latest)?.def as ReportDef)?.doc).length]),
    ),
    instances: Object.keys(s?.instances ?? {}).sort(),
    instanceRevisions: Object.fromEntries(Object.entries((s?.instances ?? {}) as Record<string, ReportInstance>).map(([k, i]) => [k, i.revisions?.length ?? 0])),
    publications: ((s?.publications ?? []) as Publication[]).map((p) => p.publicationId).sort(),
    views: (s?.views ?? []).length,
  }
}

/** Basic runtime validation of a persisted state (any version). Returns human-readable issues. */
export function validatePersisted(s: any): string[] {
  const issues: string[] = []
  if (!s || typeof s !== 'object') return ['持久化内容不是对象']
  if (!s.assets || typeof s.assets !== 'object') issues.push('缺少 assets')
  else
    for (const [id, a] of Object.entries<any>(s.assets)) {
      if (a?.assetId !== id) issues.push(`资产 ${id} 的 assetId 不一致`)
      if (!['chart', 'table', 'fixed', 'report'].includes(a?.kind)) issues.push(`资产 ${id} 类型无效：${a?.kind}`)
      if (!Array.isArray(a?.revisions) || !a.revisions.length) issues.push(`资产 ${id} 没有修订`)
      else if (!a.revisions.some((r: any) => r.revision === a.latest)) issues.push(`资产 ${id} 的 latest r${a.latest} 不在修订列表中`)
      if (a?.kind === 'report') {
        const doc = a.revisions?.find((r: any) => r.revision === a.latest)?.def?.doc
        if (doc?.type !== 'doc') issues.push(`报告模板 ${id} 的 Tiptap JSON 无效`)
      }
    }
  if (s.instances && typeof s.instances !== 'object') issues.push('instances 格式无效')
  for (const [id, i] of Object.entries<any>(s.instances ?? {})) if (i?.doc?.type !== 'doc') issues.push(`实例 ${id} 的文档无效`)
  if (s.publications && !Array.isArray(s.publications)) issues.push('publications 格式无效')
  if (s.resources) for (const [id, r] of Object.entries<any>(s.resources)) if (!['connection', 'dataset', 'variable', 'expression'].includes(r?.kind)) issues.push(`资源 ${id} 类型无效`)
  return issues
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public issues: string[],
  ) {
    super(message)
  }
}

/**
 * Additive v1 → v2 migration. Never drops or rewrites existing assets, revisions, template JSON,
 * instances or publications; only adds `status` and the shared resource registry.
 */
export function migrateState(persisted: any, version: number, backupKey: string | null = null): any {
  const issues = validatePersisted(persisted)
  if (issues.length) throw new MigrationError(`存储校验失败（${issues.length} 项）`, issues)
  if (version > SCHEMA_VERSION) throw new MigrationError(`存储版本 v${version} 高于当前应用支持的 v${SCHEMA_VERSION}`, [])
  const before = countState(persisted)
  let s = { ...persisted }
  if (version < 2) {
    s = {
      ...s,
      assets: Object.fromEntries(Object.entries<AssetRecord>(s.assets).map(([k, a]) => [k, { ...a, status: a.status ?? 'active' }])),
      resources: { ...seedResources(), ...((s.resources as Record<string, ResourceRecord>) ?? {}) },
    }
  }
  const after = countState(s)
  const same = JSON.stringify({ ...before, views: 0 }) === JSON.stringify({ ...after, views: 0 })
  if (!same) throw new MigrationError('迁移前后资产/修订/实例/发布数量或 ID 不一致，已中止', [])
  const report: MigrationReport = { from: version, to: SCHEMA_VERSION, at: new Date().toISOString(), ok: true, before, after, backupKey, issues: [] }
  s.migrations = [...(s.migrations ?? []), report]
  return s
}
