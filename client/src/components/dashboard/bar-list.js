'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCount } from '@/components/dashboard/stat-tile';

/**
 * False on the first paint, true one frame later, so bars can grow from 0 to their width on
 * mount. Under reduced motion the width transition is off and the bars simply appear.
 */
function useGrown() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return grown;
}

/**
 * One horizontal bar per row, scaled to the largest row (not the total) so the biggest bar
 * always spans the full track. rows: [{ key, label, count, href, dot?, fill?, hint? }].
 * Pass `total` to show each row's share of all contacts in its tooltip.
 */
export function BarList({ rows, total, fill = 'bg-primary/70' }) {
  const grown = useGrown();
  const max = Math.max(0, ...rows.map((r) => r.count || 0));
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const count = row.count || 0;
        const pct = max ? Math.round((count / max) * 100) : 0;
        const share = total ? Math.round((count / total) * 100) : 0;
        const link = (
          <Link
            href={row.href}
            className="group -mx-2 flex flex-col gap-1.5 rounded-md px-2 py-1.5 transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-2 text-sm">
              {row.dot ? <span className={cn('size-2 shrink-0 rounded-full', row.dot)} aria-hidden="true" /> : null}
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <span className="font-medium tabular-nums">{formatCount(count)}</span>
            </span>
            {/* The track darkens on hover so it stays visible against the row's accent background. */}
            <span
              className="block h-2.5 w-full overflow-hidden rounded-full bg-muted transition-colors duration-200 group-hover:bg-muted-foreground/20"
              aria-hidden="true"
            >
              <span
                className={cn('block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out', row.fill || fill)}
                style={{ width: `${grown ? pct : 0}%` }}
              />
            </span>
          </Link>
        );
        if (!row.hint && !total) return <li key={row.key}>{link}</li>;
        return (
          <li key={row.key}>
            <Tooltip>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent align="start" className="max-w-xs">
                {row.hint ? <p>{row.hint}</p> : null}
                {total ? <p className={cn(row.hint && 'text-background/70')}>{share}% of all contacts</p> : null}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
