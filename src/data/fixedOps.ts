import type { FixedCell, FixedDef, Merge } from "./types";
import { parseKey, rcKey } from "./grid";
import { clone } from "./reports";

export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}
export const normRect = (a: { r: number; c: number }, b: { r: number; c: number }): Rect => ({
  r0: Math.min(a.r, b.r),
  c0: Math.min(a.c, b.c),
  r1: Math.max(a.r, b.r),
  c1: Math.max(a.c, b.c),
});
const inside = (m: Merge, x: Rect) =>
  m.r >= x.r0 && m.c >= x.c0 && m.r + m.rs - 1 <= x.r1 && m.c + m.cs - 1 <= x.c1;
const overlaps = (m: Merge, x: Rect) =>
  !(m.r > x.r1 || m.r + m.rs - 1 < x.r0 || m.c > x.c1 || m.c + m.cs - 1 < x.c0);

/** Grow a rect so that it fully contains any merge it touches. */
export function expandRect(def: FixedDef, x: Rect): Rect {
  let cur = { ...x };
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of def.merges)
      if (overlaps(m, cur) && !inside(m, cur)) {
        cur = {
          r0: Math.min(cur.r0, m.r),
          c0: Math.min(cur.c0, m.c),
          r1: Math.max(cur.r1, m.r + m.rs - 1),
          c1: Math.max(cur.c1, m.c + m.cs - 1),
        };
        changed = true;
      }
  }
  return cur;
}

export function mergeCells(
  def: FixedDef,
  x: Rect,
): { def?: FixedDef; error?: string; lost?: number } {
  if (x.r0 === x.r1 && x.c0 === x.c1)
    return { error: "请先选择至少两个相邻单元格（Shift+点击或拖动选择）" };
  const regionRows = def.regions.map((r) => r.row);
  if (x.r0 !== x.r1 && regionRows.some((r) => r >= x.r0 && r <= x.r1))
    return { error: "动态行不能与其它行纵向合并（动态行会按数据重复）" };
  const next = clone(def);
  next.merges = next.merges.filter((m) => !inside(m, x));
  let lost = 0;
  for (let r = x.r0; r <= x.r1; r++)
    for (let c = x.c0; c <= x.c1; c++) {
      if (r === x.r0 && c === x.c0) continue;
      const k = rcKey(r, c);
      if (next.cells[k]?.text || next.cells[k]?.binding) lost++;
      delete next.cells[k];
    }
  next.merges.push({ r: x.r0, c: x.c0, rs: x.r1 - x.r0 + 1, cs: x.c1 - x.c0 + 1 });
  return { def: next, lost };
}

export function splitCells(def: FixedDef, x: Rect): { def?: FixedDef; error?: string } {
  const hit = def.merges.filter((m) => overlaps(m, x));
  if (!hit.length) return { error: "所选区域没有合并单元格" };
  const next = clone(def);
  next.merges = next.merges.filter((m) => !overlaps(m, x));
  return { def: next };
}

function remapCells(
  cells: Record<string, FixedCell>,
  f: (r: number, c: number) => { r: number; c: number } | null,
) {
  const out: Record<string, FixedCell> = {};
  for (const [k, v] of Object.entries(cells)) {
    const { r, c } = parseKey(k);
    const n = f(r, c);
    if (n) out[rcKey(n.r, n.c)] = v;
  }
  return out;
}

export function insertRow(def: FixedDef, at: number): FixedDef {
  const n = clone(def);
  n.cells = remapCells(n.cells, (r, c) => ({ r: r >= at ? r + 1 : r, c }));
  n.merges = n.merges.map((m) =>
    m.r >= at ? { ...m, r: m.r + 1 } : m.r + m.rs - 1 >= at ? { ...m, rs: m.rs + 1 } : m,
  );
  n.regions = n.regions.map((g) => ({
    ...g,
    row: g.row >= at ? g.row + 1 : g.row,
    repeatHeaderRow:
      g.repeatHeaderRow !== null && g.repeatHeaderRow >= at
        ? g.repeatHeaderRow + 1
        : g.repeatHeaderRow,
  }));
  n.rowHeights.splice(at, 0, 30);
  return n;
}

export function deleteRow(def: FixedDef, at: number): FixedDef {
  const n = clone(def);
  if (n.rowHeights.length <= 1) return n;
  n.cells = remapCells(n.cells, (r, c) => (r === at ? null : { r: r > at ? r - 1 : r, c }));
  n.merges = n.merges
    .map((m) => {
      if (m.r > at) return { ...m, r: m.r - 1 };
      if (m.r <= at && m.r + m.rs - 1 >= at) return m.rs === 1 ? null : { ...m, rs: m.rs - 1 };
      return m;
    })
    .filter((m): m is Merge => !!m && m.rs * m.cs > 1);
  n.regions = n.regions
    .filter((g) => g.row !== at)
    .map((g) => ({
      ...g,
      row: g.row > at ? g.row - 1 : g.row,
      repeatHeaderRow:
        g.repeatHeaderRow === at
          ? null
          : g.repeatHeaderRow !== null && g.repeatHeaderRow > at
            ? g.repeatHeaderRow - 1
            : g.repeatHeaderRow,
    }));
  n.rowHeights.splice(at, 1);
  return n;
}

export function insertCol(def: FixedDef, at: number): FixedDef {
  const n = clone(def);
  n.cells = remapCells(n.cells, (r, c) => ({ r, c: c >= at ? c + 1 : c }));
  n.merges = n.merges.map((m) =>
    m.c >= at ? { ...m, c: m.c + 1 } : m.c + m.cs - 1 >= at ? { ...m, cs: m.cs + 1 } : m,
  );
  n.regions = n.regions.map((g) => ({
    ...g,
    columnBindings: Object.fromEntries(
      Object.entries(g.columnBindings).map(([c, v]) => [
        Number(c) >= at ? Number(c) + 1 : Number(c),
        v,
      ]),
    ),
  }));
  n.colWidths.splice(at, 0, 100);
  return n;
}

export function deleteCol(def: FixedDef, at: number): FixedDef {
  const n = clone(def);
  if (n.colWidths.length <= 1) return n;
  n.cells = remapCells(n.cells, (r, c) => (c === at ? null : { r, c: c > at ? c - 1 : c }));
  n.merges = n.merges
    .map((m) => {
      if (m.c > at) return { ...m, c: m.c - 1 };
      if (m.c <= at && m.c + m.cs - 1 >= at) return m.cs === 1 ? null : { ...m, cs: m.cs - 1 };
      return m;
    })
    .filter((m): m is Merge => !!m && m.rs * m.cs > 1);
  n.regions = n.regions.map((g) => ({
    ...g,
    columnBindings: Object.fromEntries(
      Object.entries(g.columnBindings)
        .filter(([c]) => Number(c) !== at)
        .map(([c, v]) => [Number(c) > at ? Number(c) - 1 : Number(c), v]),
    ),
  }));
  n.colWidths.splice(at, 1);
  return n;
}

export function mergeAt(def: FixedDef, r: number, c: number): Merge | undefined {
  return def.merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);
}
