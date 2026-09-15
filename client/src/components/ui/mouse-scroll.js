'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// A wide table scrolls sideways, but with a mouse the only handle is the scrollbar at the bottom of the
// table, which is off-screen whenever the table is taller than the window (a trackpad swipes, a mouse
// cannot). Two fixes, both hung off the table's own scroll container:
//  - a second scrollbar that stays pinned to the bottom of the window while the table is in view,
//    mirroring the real one in both directions;
//  - drag-to-scroll: press on any non-interactive spot of the table and drag sideways.
// Shift + wheel keeps working as before.

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [role="combobox"], [role="menuitem"], [contenteditable]';
const DRAG_THRESHOLD = 4;

/** The element that actually scrolls: the Table component wraps the <table> in its own overflow-x container. */
const scrollerOf = (tableRef) => tableRef.current?.parentElement || null;

/**
 * Drag-to-scroll on the table's scroll container. A click that moved less than a few pixels is left
 * alone (row links, checkboxes and selects still work); a real drag suppresses the click it would end with.
 */
export function useDragScroll(tableRef, deps = []) {
  useEffect(() => {
    const scroller = scrollerOf(tableRef);
    if (!scroller) return undefined;
    let startX = 0;
    let startLeft = 0;
    let dragging = false;
    let moved = false;

    const onDown = (e) => {
      if (e.button !== 0 || e.pointerType !== 'mouse') return;
      if (e.target.closest(INTERACTIVE)) return;
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startLeft = scroller.scrollLeft;
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        scroller.setPointerCapture?.(e.pointerId);
        scroller.dataset.dragging = 'true';
      }
      scroller.scrollLeft = startLeft - dx;
      e.preventDefault();
    };
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        scroller.releasePointerCapture?.(e.pointerId);
        delete scroller.dataset.dragging;
        // swallow the click that ends a drag, so a row link under the cursor does not open
        const stop = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        scroller.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => scroller.removeEventListener('click', stop, { capture: true }), 0);
      }
    };
    scroller.addEventListener('pointerdown', onDown);
    scroller.addEventListener('pointermove', onMove);
    scroller.addEventListener('pointerup', end);
    scroller.addEventListener('pointercancel', end);
    scroller.classList.add('cursor-grab', 'data-[dragging=true]:cursor-grabbing', 'data-[dragging=true]:select-none');
    return () => {
      scroller.removeEventListener('pointerdown', onDown);
      scroller.removeEventListener('pointermove', onMove);
      scroller.removeEventListener('pointerup', end);
      scroller.removeEventListener('pointercancel', end);
    };
    // the table element is replaced when rows load, so the caller passes what changes it (like useFrozenColumns)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRef, ...deps]);
}

/**
 * A horizontal scrollbar fixed to the bottom of the window, aligned with the table, shown only while
 * the table overflows sideways, is on screen, and its own scrollbar is below the fold.
 */
export function StickyScrollbar({ tableRef, deps = [], className }) {
  const [box, setBox] = useState(null); // { left, width, scrollWidth } or null when hidden
  const barRef = useRef(null);
  const [barMounted, setBarMounted] = useState(0); // bumps when the bar element (re)appears, so the sync effect re-runs
  // Stable callback ref: an inline one is re-created every render, React calls it again, the state bump re-renders, and so on.
  const attachBar = useCallback((el) => {
    barRef.current = el;
    if (el) setBarMounted((n) => n + 1);
  }, []);

  // A passive effect, not a layout one: refs are attached in tree order during the commit, so a layout
  // effect on a sibling rendered before the table would still see tableRef.current as null.
  useEffect(() => {
    const scroller = scrollerOf(tableRef);
    if (!scroller) return undefined;
    const update = () => {
      const r = scroller.getBoundingClientRect();
      const overflowing = scroller.scrollWidth > scroller.clientWidth + 1;
      const ownBarVisible = r.bottom <= window.innerHeight;
      const onScreen = r.top < window.innerHeight - 40 && r.bottom > 0;
      if (!overflowing || ownBarVisible || !onScreen) {
        setBox((b) => (b === null ? b : null));
        return;
      }
      setBox((b) => (b && b.left === r.left && b.width === r.width && b.scrollWidth === scroller.scrollWidth ? b : { left: r.left, width: r.width, scrollWidth: scroller.scrollWidth }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    if (tableRef.current) ro.observe(tableRef.current); // rows loading change the table's size, not the scroller's
    ro.observe(document.documentElement);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRef, ...deps]);

  // keep the two scrollbars in step, whichever one moved
  useEffect(() => {
    const scroller = scrollerOf(tableRef);
    const bar = barRef.current;
    if (!scroller || !bar) return undefined;
    let lock = false;
    const sync = (from, to) => () => {
      if (lock) return;
      lock = true;
      to.scrollLeft = from.scrollLeft;
      requestAnimationFrame(() => {
        lock = false;
      });
    };
    const a = sync(scroller, bar);
    const b = sync(bar, scroller);
    bar.scrollLeft = scroller.scrollLeft;
    scroller.addEventListener('scroll', a, { passive: true });
    bar.addEventListener('scroll', b, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', a);
      bar.removeEventListener('scroll', b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRef, barMounted, box, ...deps]);

  if (!box) return null;
  return (
    <div
      ref={attachBar}
      aria-label="Scroll the table sideways"
      className={cn('fixed bottom-0 z-30 overflow-x-scroll overflow-y-hidden border-t bg-card/95 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.25)] backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200', className)}
      style={{ left: box.left, width: box.width }}
    >
      <div style={{ width: box.scrollWidth, height: 1 }} />
    </div>
  );
}
