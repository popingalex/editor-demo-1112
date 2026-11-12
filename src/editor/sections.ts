import type { JSONContent } from "@tiptap/core";

/** A section = an H2 (or H1/H3 when chosen) and following blocks until the next heading of same or higher level. */
export function sectionRange(doc: JSONContent, index: number): [number, number] {
  const nodes = doc.content ?? [];
  const level = nodes[index]?.attrs?.level ?? 2;
  let end = index + 1;
  while (
    end < nodes.length &&
    !(nodes[end].type === "heading" && (nodes[end].attrs?.level ?? 1) <= level)
  )
    end++;
  return [index, end];
}

export function moveSection(doc: JSONContent, index: number, dir: -1 | 1): JSONContent | null {
  const nodes = [...(doc.content ?? [])];
  const level = nodes[index]?.attrs?.level ?? 2;
  const [s, e] = sectionRange(doc, index);
  const block = nodes.slice(s, e);
  if (dir === -1) {
    let p = s - 1;
    while (p >= 0 && !(nodes[p].type === "heading" && (nodes[p].attrs?.level ?? 1) === level)) {
      if (nodes[p].type === "heading" && (nodes[p].attrs?.level ?? 1) < level) return null;
      p--;
    }
    if (p < 0) return null;
    nodes.splice(s, block.length);
    nodes.splice(p, 0, ...block);
  } else {
    if (e >= nodes.length || nodes[e].type !== "heading" || (nodes[e].attrs?.level ?? 1) !== level)
      return null;
    const [, e2] = sectionRange({ content: nodes }, e);
    const next = nodes.slice(e, e2);
    nodes.splice(s, e2 - s, ...next, ...block);
  }
  return { ...doc, content: nodes };
}

export function deleteSection(doc: JSONContent, index: number): JSONContent {
  const [s, e] = sectionRange(doc, index);
  const nodes = [...(doc.content ?? [])];
  nodes.splice(s, e - s);
  return { ...doc, content: nodes.length ? nodes : [{ type: "paragraph" }] };
}

export function addSection(
  doc: JSONContent,
  afterIndex: number | null,
  title: string,
): JSONContent {
  const nodes = [...(doc.content ?? [])];
  let at = nodes.length;
  if (afterIndex !== null) at = sectionRange(doc, afterIndex)[1];
  nodes.splice(
    at,
    0,
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: title }] },
    { type: "paragraph", content: [{ type: "text", text: "在此输入本节正文……" }] },
  );
  return { ...doc, content: nodes };
}
