'use client';

import { useCallback, useMemo, useState } from 'react';

const EMPTY = [];

/**
 * Selected contact ids. The selection is tied to `scope` (a string of the active filters):
 * when the filters change the old picks are no longer visible, so they are dropped.
 */
export function useSelection(scope) {
  const [state, setState] = useState({ scope, ids: EMPTY });
  const ids = state.scope === scope ? state.ids : EMPTY;
  const selected = useMemo(() => new Set(ids), [ids]);

  const update = useCallback(
    (fn) =>
      setState((prev) => {
        const current = prev.scope === scope ? prev.ids : EMPTY;
        return { scope, ids: fn(current) };
      }),
    [scope],
  );

  const toggle = useCallback(
    (id, on) => update((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id))),
    [update],
  );
  const toggleMany = useCallback(
    (list, on) => update((cur) => (on ? [...new Set([...cur, ...list])] : cur.filter((x) => !list.includes(x)))),
    [update],
  );
  const clear = useCallback(() => update(() => EMPTY), [update]);

  return { ids, selected, toggle, toggleMany, clear };
}
