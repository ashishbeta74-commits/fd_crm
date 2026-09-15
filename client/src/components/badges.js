import { Flag, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_MAP, CATEGORY_STYLES, PRIORITY_MAP, PRIORITY_STYLES, STAGE_MAP, STAGE_STYLES, categoryLabel, leadQualityStyle, priorityLabel, stageLabel } from '@/lib/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const stageDescription = (key) => STAGE_MAP[key]?.description || '';

/** Wraps `children` in a tooltip when there is text to show; otherwise renders them as-is. */
function MaybeTooltip({ text, children }) {
  if (!text) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Stage pill. `withTooltip` adds a hover/focus tooltip with the stage description
 * (STAGES[].description); default rendering is unchanged.
 */
export function StageBadge({ stage, className, withTooltip = false }) {
  const style = STAGE_STYLES[stage] || STAGE_STYLES.new;
  const description = withTooltip ? stageDescription(stage) : '';
  return (
    <MaybeTooltip text={description}>
      <span
        tabIndex={description ? 0 : undefined}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
          description && 'cursor-help',
          style.badge,
          className,
        )}
      >
        <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
        {stageLabel(stage)}
      </span>
    </MaybeTooltip>
  );
}

/**
 * Priority pill with a flag icon. Renders nothing (or `emptyLabel`) when the contact has no priority.
 * `withTooltip` shows the priority description on hover/focus.
 */
export function PriorityBadge({ priority, className, emptyLabel = '', withTooltip = false, size = 'sm' }) {
  if (!priority) {
    return emptyLabel ? <span className={cn('text-xs text-muted-foreground', className)}>{emptyLabel}</span> : null;
  }
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.low;
  const description = withTooltip ? PRIORITY_MAP[priority]?.description || '' : '';
  return (
    <MaybeTooltip text={description}>
      <span
        tabIndex={description ? 0 : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
          size === 'xs' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs',
          description && 'cursor-help',
          style.badge,
          className,
        )}
      >
        <Flag className={cn(size === 'xs' ? 'size-2.5' : 'size-3', priority === 'urgent' && 'fill-current')} aria-hidden="true" />
        {priorityLabel(priority)}
      </span>
    </MaybeTooltip>
  );
}

/**
 * Contact type pill (Travel Advisor / Executive Assistant / Other). `short` shows "TA" / "EA" instead of the
 * full label. Renders nothing (or `emptyLabel`) when the type is not set.
 */
export function CategoryBadge({ category, className, emptyLabel = '', withTooltip = false, size = 'sm', short = false }) {
  if (!category) {
    return emptyLabel ? <span className={cn('text-xs text-muted-foreground', className)}>{emptyLabel}</span> : null;
  }
  const def = CATEGORY_MAP[category];
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.other;
  const description = withTooltip ? def?.description || '' : '';
  const label = short ? def?.short || categoryLabel(category) : categoryLabel(category) || category;
  return (
    <MaybeTooltip text={description || (short ? categoryLabel(category) : '')}>
      <span
        tabIndex={description ? 0 : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
          size === 'xs' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs',
          description && 'cursor-help',
          style.badge,
          className,
        )}
      >
        <span className={cn('rounded-full', style.dot, size === 'xs' ? 'size-1.5' : 'size-2')} aria-hidden="true" />
        {label}
      </span>
    </MaybeTooltip>
  );
}

/** Lead quality pill ("Money minded", "Cheap rate", "Services" or the team's own label). Renders nothing (or `emptyLabel`) when unset. */
export function LeadQualityBadge({ value, className, emptyLabel = '', size = 'sm' }) {
  if (!value) {
    return emptyLabel ? <span className={cn('text-xs text-muted-foreground', className)}>{emptyLabel}</span> : null;
  }
  const style = leadQualityStyle(value);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap', size === 'xs' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs', style.badge, className)}>
      <span className={cn('rounded-full', style.dot, size === 'xs' ? 'size-1.5' : 'size-2')} aria-hidden="true" />
      {value}
    </span>
  );
}

/** One tag chip. `onRemove` adds an "x" button (used by the tags editor). */
export function TagBadge({ tag, className, onRemove, onClick }) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex max-w-40 items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-xs whitespace-nowrap text-foreground/90',
        onClick && 'transition-colors hover:bg-accent',
        className,
      )}
      title={tag}
    >
      <Tag className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{tag}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="-mr-1 ml-0.5 rounded-full px-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      ) : null}
    </Comp>
  );
}

/** Tag chips in a wrapping row. `max` collapses the rest into "+N" (with a tooltip listing them). */
export function TagList({ tags = [], max = 3, className, onTagClick, size }) {
  if (!tags.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const rest = tags.slice(shown.length);
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {shown.map((t) => (
        <TagBadge key={t} tag={t} onClick={onTagClick ? () => onTagClick(t) : undefined} className={size === 'xs' ? 'px-1.5 py-px text-[11px]' : undefined} />
      ))}
      {rest.length ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="rounded-full border px-1.5 py-px text-[11px] text-muted-foreground" tabIndex={0}>
              +{rest.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>{rest.join(', ')}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
