import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Fixed locale so the server and the client render identical digit grouping.
const numberFormat = new Intl.NumberFormat('en-US');
export const formatCount = (n) => numberFormat.format(n || 0);

// Icon chip colours per tile. Light + dark pairs; the value text stays in the foreground colour.
const ACCENTS = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
};

const TILE = 'relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 text-card-foreground shadow-sm';
const COMPACT_TILE = 'relative flex h-full items-center gap-3 overflow-hidden rounded-xl border bg-card px-3.5 py-3 text-card-foreground shadow-sm';

/**
 * KPI tile: icon chip, big number, label and caption. `hint` explains what the number counts (tooltip).
 * `tone="destructive"` highlights the value and border (used for overdue counts above zero).
 */
export function StatTile({ label, value, display, caption, href, hint, tone = 'default', icon: Icon, accent = 'slate', compact = false }) {
  const destructive = tone === 'destructive';
  const chip = cn('flex shrink-0 items-center justify-center rounded-lg', destructive ? ACCENTS.red : ACCENTS[accent] || ACCENTS.slate);
  const body = compact ? (
    <>
      {Icon ? (
        <span className={cn(chip, 'size-9')} aria-hidden="true">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cn('text-xl leading-tight font-semibold tracking-tight tabular-nums', destructive && 'text-destructive')}>{display ?? formatCount(value)}</span>
          {caption ? <span className="min-w-0 truncate text-[11px] text-muted-foreground">{caption}</span> : null}
        </span>
      </div>
    </>
  ) : (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? (
          <span className={cn(chip, 'size-8')} aria-hidden="true">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div>
        <span className={cn('block text-3xl font-semibold tracking-tight tabular-nums', destructive && 'text-destructive')}>{display ?? formatCount(value)}</span>
        {caption ? <span className="mt-0.5 block text-xs text-muted-foreground">{caption}</span> : null}
      </div>
    </>
  );
  const className = cn(compact ? COMPACT_TILE : TILE, destructive && 'border-destructive/40 bg-destructive/5');
  const tile = href ? (
    <Link
      href={href}
      className={cn(
        className,
        'transition-[background-color,box-shadow,transform] duration-200 hover:bg-accent/60 hover:shadow-md motion-safe:hover:-translate-y-px',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
  if (!hint) return tile;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{tile}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
