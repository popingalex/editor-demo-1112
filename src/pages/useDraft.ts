import { useEffect, useMemo, useState } from "react";
import { useUI } from "../store/store";
import { clone } from "../data/reports";

/** Draft state with a baseline; registers a dirty label with the global leave guard. */
export function useDraft<T>(initial: T | undefined, label: string) {
  const [draft, setDraft] = useState<T | undefined>(() => (initial ? clone(initial) : undefined));
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(initial ?? null));
  const dirty = useMemo(
    () => draft !== undefined && JSON.stringify(draft) !== baseline,
    [draft, baseline],
  );
  const setDirty = useUI((s) => s.setDirty);
  useEffect(() => {
    setDirty(dirty ? label : null);
  }, [dirty, label, setDirty]);
  useEffect(() => () => setDirty(null), [setDirty]);
  return {
    draft,
    setDraft,
    dirty,
    markSaved: (v?: T) => setBaseline(JSON.stringify(v ?? draft ?? null)),
    revert: () => setDraft(JSON.parse(baseline)),
    load: (v: T) => {
      setDraft(clone(v));
      setBaseline(JSON.stringify(v));
    },
  };
}
