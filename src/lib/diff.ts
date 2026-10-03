export type Token = { text: string; kind: "same" | "removed" | "added" };

export function diffWords(original: string, corrected: string): Token[] {
  const a = original.trim().split(/\s+/);
  const b = corrected.trim().split(/\s+/);
  const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:«»„“"]/g, "");
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i]![j] =
        norm(a[i]!) === norm(b[j]!)
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: Token[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (norm(a[i]!) === norm(b[j]!)) {
      out.push({ text: b[j]!, kind: "same" });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ text: a[i++]!, kind: "removed" });
    else out.push({ text: b[j++]!, kind: "added" });
  }
  while (i < a.length) out.push({ text: a[i++]!, kind: "removed" });
  while (j < b.length) out.push({ text: b[j++]!, kind: "added" });
  return out;
}
