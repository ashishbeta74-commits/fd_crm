'use client';

import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Small tooltip helpers shared by the import page. They wrap the shadcn Tooltip so every call site reads the same.

/** Tooltip around one element. The child must forward props/refs (Button, Badge, a, span...). Empty content = no tooltip. */
export function Tip({ content, side, align, className, children }) {
  if (!content) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={cn('max-w-xs', className)}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * "Why is this disabled?" tooltip. A disabled button emits no pointer events, so the tooltip hangs off a focusable
 * wrapper (keyboard users reach it too). With no `reason` the child renders on its own.
 */
export function DisabledHint({ reason, className, children }) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn('inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One line of text with an ellipsis. The full value (or `tip`) shows in a tooltip only when the text is actually
 * clipped - measured when the pointer enters, so short values do not get a pointless tooltip. The text stays in the
 * DOM in full, so screen readers read it either way.
 */
export function Truncated({ text, tip, className, ...props }) {
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  const measure = (e) => {
    const el = e.currentTarget;
    setClipped(el.scrollWidth > el.clientWidth + 1);
  };
  return (
    <Tooltip open={open && clipped} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span className={cn('block min-w-0 truncate', className)} onPointerEnter={measure} onFocus={measure} {...props}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-words">{tip ?? text}</TooltipContent>
    </Tooltip>
  );
}
