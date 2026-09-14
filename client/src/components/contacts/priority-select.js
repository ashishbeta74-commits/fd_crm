'use client';

import { Flag } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRIORITIES, PRIORITY_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';

// Radix Select cannot use '' as a value, so "no priority" is a sentinel.
export const NO_PRIORITY = '__none__';

/** Compact priority dropdown ('' = none). `onChange` receives the priority key or ''. */
export function PrioritySelect({ value, onChange, disabled, className, size = 'sm', id, placeholder = 'Priority', allowNone = true }) {
  return (
    <Select value={value || NO_PRIORITY} onValueChange={(v) => onChange(v === NO_PRIORITY ? '' : v)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn('gap-1.5', className)} aria-label="Priority">
        <Flag className={cn('size-3.5', value ? PRIORITY_STYLES[value]?.dot.replace('bg-', 'text-') : 'text-muted-foreground')} aria-hidden="true" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((p) => (
          <SelectItem key={p.key} value={p.key}>
            <span className={cn('size-2 rounded-full', PRIORITY_STYLES[p.key].dot)} aria-hidden="true" />
            {p.label}
          </SelectItem>
        ))}
        {allowNone ? (
          <>
            <SelectSeparator />
            <SelectItem value={NO_PRIORITY}>No priority</SelectItem>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}
