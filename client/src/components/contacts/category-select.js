'use client';

import { Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, CATEGORY_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';

// Radix Select cannot use '' as a value, so "not set" is a sentinel.
export const NO_CATEGORY = '__none__';

/** Contact type dropdown (Travel Advisor / Executive Assistant / Other; '' = not set). `onChange` receives the key or ''. */
export function CategorySelect({ value, onChange, disabled, className, size = 'sm', id, placeholder = 'Type', allowNone = true, noneLabel = 'Not set' }) {
  return (
    <Select value={value || NO_CATEGORY} onValueChange={(v) => onChange(v === NO_CATEGORY ? '' : v)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn('gap-1.5', className)} aria-label="Contact type">
        <Users className={cn('size-3.5', value ? CATEGORY_STYLES[value]?.dot.replace('bg-', 'text-') : 'text-muted-foreground')} aria-hidden="true" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((c) => (
          <SelectItem key={c.key} value={c.key}>
            <span className={cn('size-2 rounded-full', CATEGORY_STYLES[c.key].dot)} aria-hidden="true" />
            {c.label}
          </SelectItem>
        ))}
        {allowNone ? (
          <>
            <SelectSeparator />
            <SelectItem value={NO_CATEGORY}>{noneLabel}</SelectItem>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}
