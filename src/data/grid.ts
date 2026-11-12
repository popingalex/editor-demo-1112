export const colName = (c: number) => {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
export const refToRC = (ref: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
};
export const rcKey = (r: number, c: number) => `${r}:${c}`;
export const rcRef = (r: number, c: number) => `${colName(c)}${r + 1}`;
export const parseKey = (k: string) => {
  const [r, c] = k.split(":").map(Number);
  return { r, c };
};
