'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tells whether an element's text is cut off by `truncate`, so a tooltip with the full value can be
 * shown only when it is actually needed. Returns `[ref, clipped]`; re-checked whenever the element resizes.
 */
export function useClipped() {
  const ref = useRef(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // ResizeObserver fires once on observe(), which doubles as the initial measurement.
    const observer = new ResizeObserver(() => setClipped(el.scrollWidth > el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, clipped];
}
