import { create, type StateCreator } from "zustand";
import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import type { JSONContent } from "@tiptap/core";
import type {
  AnyDef,
  AssetKind,
  AssetRecord,
  DataContext,
  PersonalView,
  Publication,
  ReportDef,
  ReportInstance,
} from "../data/types";
import { seedAssets, DEFAULT_CONTEXT } from "../data/seed";
import { buildInstance, clone, collectRefs, resummarize } from "../data/reports";

export const nowIso = () => new Date().toISOString();

export interface Activity {
  id: string;
  at: string;
  text: string;
}

interface DataState {
  assets: Record<string, AssetRecord>;
  views: PersonalView[];
  instances: Record<string, ReportInstance>;
  publications: Publication[];
  activity: Activity[];
  seq: number;
}

interface Actions {
  createAsset: (kind: AssetKind, def: AnyDef) => string;
  saveRevision: (assetId: string, def: AnyDef, note: string) => number;
  renameAsset: (assetId: string, title: string) => { ok: boolean; message?: string };
  duplicateAsset: (assetId: string) => string;
  deleteAsset: (assetId: string) => void;
  saveView: (v: Omit<PersonalView, "id" | "savedAt">) => PersonalView;
  deleteView: (id: string) => void;
  generateInstance: (templateId: string, revision: number, selection: DataContext) => string;
  saveInstanceDoc: (instanceId: string, doc: JSONContent) => void;
  createInstanceRevision: (instanceId: string, doc: JSONContent, note: string) => number;
  publishInstance: (instanceId: string) => string;
  resetDemo: () => void;
  log: (text: string) => void;
}

const PREFIX: Record<AssetKind, string> = {
  chart: "CHART",
  table: "TABLE",
  fixed: "FIXED",
  report: "REPORT-TEMPLATE",
};
export const KIND_LABEL: Record<AssetKind, string> = {
  chart: "图表",
  table: "分析型表格",
  fixed: "固定格式模板",
  report: "综合报告模板",
};

function initialState(): DataState {
  const assets = seedAssets();
  const tpl = assets["DEMO-REPORT-TEMPLATE-01"] as AssetRecord<ReportDef>;
  const inst = buildInstance(
    "DEMO-REPORT-INSTANCE-01",
    tpl,
    1,
    { ...DEFAULT_CONTEXT },
    assets,
    "2025-01-01T08:30:00.000Z",
  );
  return {
    assets,
    views: [],
    instances: { [inst.instanceId]: inst },
    publications: [],
    activity: [
      {
        id: "A0",
        at: "2025-01-01T08:30:00.000Z",
        text: "载入 DEMO 种子：6 图表 / 3 分析表 / 2 固定模板 / 2 报告模板 / 1 报告实例",
      },
    ],
    seq: 1,
  };
}

export const latestDef = <D extends AnyDef = AnyDef>(a: AssetRecord | undefined): D | undefined =>
  a ? (a.revisions.find((r) => r.revision === a.latest)?.def as D) : undefined;
export const revisionDef = <D extends AnyDef = AnyDef>(
  a: AssetRecord | undefined,
  rev: number,
): D | undefined => a?.revisions.find((r) => r.revision === rev)?.def as D | undefined;

export interface RefUse {
  type: "template" | "instance";
  id: string;
  title: string;
  revision: number;
  nodeIds: string[];
  pinnedRevision: number[];
}

export function findReferences(
  state: Pick<DataState, "assets" | "instances">,
  assetId: string,
): RefUse[] {
  const out: RefUse[] = [];
  for (const a of Object.values(state.assets)) {
    if (a.kind !== "report") continue;
    const def = latestDef<ReportDef>(a);
    const refs = collectRefs(def?.doc).filter((r) => r.assetId === assetId);
    if (refs.length)
      out.push({
        type: "template",
        id: a.assetId,
        title: a.title,
        revision: a.latest,
        nodeIds: refs.map((r) => r.nodeId),
        pinnedRevision: refs.map((r) => r.assetRevision),
      });
  }
  for (const i of Object.values(state.instances)) {
    const refs = collectRefs(i.doc).filter((r) => r.assetId === assetId);
    if (refs.length)
      out.push({
        type: "instance",
        id: i.instanceId,
        title: i.title,
        revision: i.currentRevision,
        nodeIds: refs.map((r) => r.nodeId),
        pinnedRevision: refs.map((r) => r.assetRevision),
      });
  }
  return out;
}

export type AppState = DataState & Actions;

const appSlice: StateCreator<AppState> = (set, get) => ({
  ...initialState(),
  log: (text) =>
    set((s) => ({
      activity: [{ id: `A${s.seq}`, at: nowIso(), text }, ...s.activity].slice(0, 80),
      seq: s.seq + 1,
    })),
  createAsset: (kind, def) => {
    const s = get();
    const n = Object.values(s.assets).filter((a) => a.kind === kind && !a.seed).length + 1;
    let id = `DEMO-${PREFIX[kind]}-U${String(n).padStart(2, "0")}`;
    let k = n;
    while (s.assets[id]) id = `DEMO-${PREFIX[kind]}-U${String(++k).padStart(2, "0")}`;
    const t = nowIso();
    const rec: AssetRecord = {
      assetId: id,
      kind,
      title: (def as any).title,
      seed: false,
      createdAt: t,
      updatedAt: t,
      latest: 1,
      revisions: [{ revision: 1, def: clone(def), savedAt: t, note: "新建" }],
      provenance: "DEMO_USER_ASSET",
    };
    set({ assets: { ...s.assets, [id]: rec } });
    get().log(`新建${KIND_LABEL[kind]} ${id}「${rec.title}」r1`);
    return id;
  },
  saveRevision: (assetId, def, note) => {
    const a = get().assets[assetId];
    const rev = Math.max(...a.revisions.map((r) => r.revision)) + 1;
    const t = nowIso();
    const next: AssetRecord = {
      ...a,
      title: (def as any).title ?? a.title,
      latest: rev,
      updatedAt: t,
      revisions: [
        ...a.revisions,
        { revision: rev, def: clone(def), savedAt: t, note: note || `共享新版本 r${rev}` },
      ],
    };
    set((s) => ({ assets: { ...s.assets, [assetId]: next } }));
    get().log(`发布共享新版本 ${assetId} r${rev}${note ? `：${note}` : ""}`);
    return rev;
  },
  renameAsset: (assetId, title) => {
    const t = title.trim();
    if (!t) return { ok: false, message: "名称不能为空" };
    const a = get().assets[assetId];
    if (
      Object.values(get().assets).some(
        (x) => x.assetId !== assetId && x.kind === a.kind && x.title === t,
      )
    )
      return { ok: false, message: `已存在同名${KIND_LABEL[a.kind]}「${t}」` };
    set((s) => ({ assets: { ...s.assets, [assetId]: { ...a, title: t, updatedAt: nowIso() } } }));
    get().log(`重命名 ${assetId} →「${t}」`);
    return { ok: true };
  },
  duplicateAsset: (assetId) => {
    const a = get().assets[assetId];
    const def = clone(latestDef(a)!) as any;
    let title = `${a.title} 副本`;
    let k = 2;
    while (Object.values(get().assets).some((x) => x.kind === a.kind && x.title === title))
      title = `${a.title} 副本 ${k++}`;
    def.title = title;
    const id = get().createAsset(a.kind, def);
    get().log(`复制 ${assetId} r${a.latest} → ${id}`);
    return id;
  },
  deleteAsset: (assetId) => {
    const { [assetId]: _, ...rest } = get().assets;
    set({ assets: rest, views: get().views.filter((v) => v.assetId !== assetId) });
    get().log(`删除资产 ${assetId}`);
  },
  saveView: (v) => {
    const view: PersonalView = { ...clone(v), id: `VIEW-${get().seq}`, savedAt: nowIso() };
    set((s) => ({
      views: [
        view,
        ...s.views.filter(
          (x) => !(x.name === v.name && x.scope === v.scope && x.assetId === v.assetId),
        ),
      ],
    }));
    get().log(`保存个人视图「${v.name}」（不改变共享资产）`);
    return view;
  },
  deleteView: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),
  generateInstance: (templateId, revision, selection) => {
    const s = get();
    const nums = Object.keys(s.instances).map((k) => Number(/(\d+)$/.exec(k)?.[1] ?? 0));
    const id = `DEMO-REPORT-INSTANCE-${String(Math.max(0, ...nums) + 1).padStart(2, "0")}`;
    const inst = buildInstance(
      id,
      s.assets[templateId] as AssetRecord<ReportDef>,
      revision,
      selection,
      s.assets,
      nowIso(),
    );
    set({ instances: { ...s.instances, [id]: inst } });
    get().log(
      `生成演示报告实例 ${id}（模板 ${templateId} r${revision} · ${selection.simulationId} Tick ${selection.tick}）`,
    );
    return id;
  },
  saveInstanceDoc: (instanceId, doc) => {
    const i = get().instances[instanceId];
    const t = nowIso();
    const revisions = i.revisions.map((r) =>
      r.revision === i.currentRevision ? { ...r, doc: clone(doc), savedAt: t } : r,
    );
    set((s) => ({
      instances: {
        ...s.instances,
        [instanceId]: {
          ...i,
          doc: clone(doc),
          revisions,
          updatedAt: t,
          resolvedData: resummarize(i, doc),
        },
      },
    }));
    get().log(`保存报告实例修改 ${instanceId} 修订 ${i.currentRevision}（仅本报告生效）`);
  },
  createInstanceRevision: (instanceId, doc, note) => {
    const i = get().instances[instanceId];
    const rev = Math.max(...i.revisions.map((r) => r.revision)) + 1;
    const t = nowIso();
    set((s) => ({
      instances: {
        ...s.instances,
        [instanceId]: {
          ...i,
          doc: clone(doc),
          currentRevision: rev,
          state: "draft",
          revisions: [
            ...i.revisions,
            { revision: rev, doc: clone(doc), savedAt: t, note: note || `修订 ${rev}` },
          ],
          updatedAt: t,
          resolvedData: resummarize(i, doc),
        },
      },
    }));
    get().log(`报告实例 ${instanceId} 新建修订 ${rev}`);
    return rev;
  },
  publishInstance: (instanceId) => {
    const i = get().instances[instanceId];
    const id = `DEMO-PUB-${String(get().publications.length + 1).padStart(3, "0")}`;
    const pub: Publication = {
      publicationId: id,
      instanceId,
      instanceRevision: i.currentRevision,
      createdAt: nowIso(),
      state: "demo-published",
      frozenContent: clone({
        title: i.title,
        doc: i.doc,
        selection: i.selection,
        resolvedValues: i.resolvedValues,
        assetSnapshots: i.assetSnapshots,
        resolvedData: i.resolvedData,
        templateRef: i.templateRef,
      }),
    };
    set((s) => ({
      publications: [pub, ...s.publications],
      instances: { ...s.instances, [instanceId]: { ...i, state: "demo-published" } },
    }));
    get().log(`模拟发布 ${id}（${instanceId} 修订 ${i.currentRevision}，内容已冻结）`);
    return id;
  },
  resetDemo: () => {
    set({ ...initialState() });
    useUI.getState().resetNav();
  },
});

export const useApp = create<AppState>()(
  persist(appSlice, { name: "rr-workbench-v3", version: 1 }),
);

/** Isolated, non-persisted store with the same actions — used by the acceptance runner. */
export const createTestStore = () => createStore<AppState>()(appSlice);

/* ---------------- UI store ---------------- */

export type PageId =
  | "assets"
  | "chart"
  | "workspace"
  | "table"
  | "fixed"
  | "report"
  | "generate"
  | "instances"
  | "states"
  | "acceptance";
export interface NavParams {
  assetId?: string;
  instanceId?: string;
  templateId?: string;
  publicationId?: string;
  insertAssetId?: string;
  viewId?: string;
}
export interface Toast {
  id: number;
  text: string;
  tone: "success" | "info" | "warn" | "error";
}

interface UIState {
  page: PageId;
  params: NavParams;
  dirty: string | null;
  pending: { page: PageId; params: NavParams } | null;
  toasts: Toast[];
  go: (page: PageId, params?: NavParams) => void;
  confirmLeave: () => void;
  cancelLeave: () => void;
  setDirty: (label: string | null) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismiss: (id: number) => void;
  resetNav: () => void;
}

let toastSeq = 1;
export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      page: "assets",
      params: {},
      dirty: null,
      pending: null,
      toasts: [],
      go: (page, params = {}) => {
        if (get().dirty) set({ pending: { page, params } });
        else set({ page, params });
      },
      confirmLeave: () => {
        const p = get().pending;
        if (p) set({ page: p.page, params: p.params, pending: null, dirty: null });
      },
      cancelLeave: () => set({ pending: null }),
      setDirty: (label) => {
        if (get().dirty !== label) set({ dirty: label });
      },
      toast: (text, tone = "success") => {
        const id = toastSeq++;
        set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
        setTimeout(() => get().dismiss(id), 3600);
      },
      dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      resetNav: () => set({ page: "assets", params: {}, dirty: null, pending: null }),
    }),
    {
      name: "rr-workbench-nav",
      partialize: (s) => ({ page: s.page, params: { ...s.params, insertAssetId: undefined } }),
    },
  ),
);

export const toast = (text: string, tone?: Toast["tone"]) => useUI.getState().toast(text, tone);
