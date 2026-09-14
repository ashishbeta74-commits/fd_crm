'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Excel-style frozen columns for the shadcn Table (desktop and up): the checkbox, Name, Title and
 * Company stay put while the rest scrolls horizontally.
 *
 * - Each frozen column has a fixed width; its `left` is the measured width of the columns before it,
 *   published as CSS variables by `useFrozenColumns` so the columns butt up exactly.
 * - The table needs `FROZEN_TABLE_CLASS` (separated borders: Chrome paints collapsed borders over
 *   sticky cells) and rows need `group/row` so frozen cells follow the hover / selected colour.
 * - The 2px box-shadow to the left of each frozen cell overlaps the previous one: at fractional scroll
 *   offsets on a 1.25x display the frozen layer and the scrolled content snap to different device
 *   pixels, which otherwise leaves a 1px seam.
 * - Once the table is scrolled sideways (data-scrolled) the last frozen column shows a divider line.
 */
export const FROZEN_KEYS = ['check', 'name', 'title', 'company'];

const STICKY = {
  check: 'md:sticky md:left-[var(--fz-check,0px)] md:z-10 md:w-10 md:min-w-10',
  name: 'md:sticky md:left-[var(--fz-name,2.5rem)] md:z-10 md:w-[calc(15rem*var(--fz-scale,1))] md:min-w-[calc(15rem*var(--fz-scale,1))] md:max-w-[calc(15rem*var(--fz-scale,1))]',
  title: 'md:sticky md:left-[var(--fz-title,17.5rem)] md:z-10 md:w-[calc(13rem*var(--fz-scale,1))] md:min-w-[calc(13rem*var(--fz-scale,1))] md:max-w-[calc(13rem*var(--fz-scale,1))]',
  company:
    'md:sticky md:left-[var(--fz-company,30.5rem)] md:z-10 md:w-[calc(14rem*var(--fz-scale,1))] md:min-w-[calc(14rem*var(--fz-scale,1))] md:max-w-[calc(14rem*var(--fz-scale,1))] md:border-r md:transition-[border-color,box-shadow] md:duration-200 ' +
    'md:group-data-[scrolled=true]/table:border-r-2 md:group-data-[scrolled=true]/table:border-r-primary/60 ' +
    'md:group-data-[scrolled=true]/table:shadow-[-2px_0_0_0_var(--card),8px_0_12px_-6px_rgba(0,0,0,0.25)] dark:md:group-data-[scrolled=true]/table:shadow-[-2px_0_0_0_var(--card),8px_0_12px_-6px_rgba(0,0,0,0.7)]',
};
const SEAM = 'md:shadow-[-2px_0_0_0_var(--card)]';
export const ROW_BG = 'bg-card group-hover/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] group-data-[state=selected]/row:bg-muted';

export const frozenCell = (key) => (STICKY[key] ? cn(SEAM, STICKY[key], ROW_BG) : undefined);
export const HEAD_BG = 'bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]';
export const frozenHead = (key) => (STICKY[key] ? cn(SEAM, STICKY[key], HEAD_BG) : undefined);

/** Pinned on the right instead (an Actions column that must stay reachable). */
export const PINNED_RIGHT_HEAD = 'md:sticky md:right-0 md:z-10 bg-card md:shadow-[-8px_0_10px_-8px_rgba(0,0,0,0.2)] dark:md:shadow-[-8px_0_10px_-8px_rgba(0,0,0,0.7)]';
export const PINNED_RIGHT_CELL = cn(PINNED_RIGHT_HEAD, ROW_BG);

// ---- frozen width (a slider on the toolbar; remembered per browser) ----
const SCALE_KEY = 'crm:frozen-scale';
const listeners = new Set();
const subscribe = (cb) => {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};
const readScale = () => {
  try {
    const v = Number(localStorage.getItem(SCALE_KEY));
    return v >= 0.5 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
};
export function setFrozenScale(v) {
  try {
    localStorage.setItem(SCALE_KEY, String(v));
  } catch {
    /* private mode */
  }
  listeners.forEach((cb) => cb());
}
/** 0.5 - 1: how wide the frozen columns are compared with their normal width. */
export const useFrozenScale = () => useSyncExternalStore(subscribe, readScale, () => 1);

// Base width of the three text columns (15 + 13 + 14 rem) - a drag of that many pixels is a full 100% -> 0% change.
const BASE_PX = 42 * 16;

/**
 * Excel-style split bar: a vertical grip on the border between the frozen and the scrolling columns.
 * Drag left to compress Name / Title / Company (down to half width), right to widen, double-click to reset.
 * Render it inside the table's outer wrapper (which must be `relative`), after the Table.
 */
export function FrozenResizeHandle() {
  const scale = useFrozenScale();
  const drag = useRef(null);
  const onPointerDown = (e) => {
    e.preventDefault();
    drag.current = { x: e.clientX, scale };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const next = Math.min(1, Math.max(0.5, drag.current.scale + (e.clientX - drag.current.x) / BASE_PX));
    setFrozenScale(Math.round(next * 100) / 100);
  };
  const onPointerUp = (e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Frozen columns width - drag to resize, double-click to reset"
      title={`Frozen columns at ${Math.round(scale * 100)}% - drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setFrozenScale(1)}
      className="group/handle absolute top-0 bottom-0 z-20 hidden w-5 -translate-x-1/2 cursor-col-resize touch-none select-none md:block"
      style={{ left: 'var(--fz-edge, 0px)' }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover/handle:bg-primary/60 group-active/handle:bg-primary" />
      {/* the knob: always visible so the border reads as draggable; sits on the header row so it is in view when you start scrolling */}
      <div className="absolute top-28 left-0 flex h-8 w-5 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground shadow-md transition-[color,border-color,transform] group-hover/handle:scale-110 group-hover/handle:border-primary group-hover/handle:text-primary group-active/handle:bg-primary group-active/handle:text-primary-foreground">
        <GripVertical className="size-3.5" aria-hidden />
      </div>
    </div>
  );
}

export const FROZEN_TABLE_CLASS = 'group/table border-separate border-spacing-0 [&_th]:border-b [&_td]:border-b [&_tbody_tr:last-child_td]:border-b-0';

/**
 * Measure the frozen header cells (assumed to be the first FROZEN_KEYS.length <th>s), publish their
 * cumulative widths as CSS variables, and flag sideways scrolling on the table.
 */
export function useFrozenColumns(tableRef, deps = []) {
  const scale = useFrozenScale();
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return undefined;
    table.style.setProperty('--fz-scale', String(scale));
    const update = () => {
      const ths = table.querySelectorAll('thead th');
      let left = 0;
      FROZEN_KEYS.forEach((key, i) => {
        table.style.setProperty(`--fz-${key}`, `${Math.round(left)}px`);
        left += ths[i]?.getBoundingClientRect().width || 0;
      });
      // the resize handle lives on the wrapper around the scroller, so it does not scroll away
      table.parentElement?.parentElement?.style.setProperty('--fz-edge', `${Math.round(left)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(table);
    const scroller = table.parentElement;
    const onScroll = () => table.setAttribute('data-scrolled', scroller.scrollLeft > 0 ? 'true' : 'false');
    onScroll();
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      scroller?.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, ...deps]);
}
