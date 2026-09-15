'use client';

import { useState } from 'react';
import { Check, Gauge, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LEAD_QUALITIES, leadQualityStyle } from '@/lib/constants';
import { useMeta } from '@/hooks/use-meta';
import { cn } from '@/lib/utils';

// Radix Select cannot use '' as a value, so "not set" and "Other…" are sentinels.
const NONE = '__none__';
const OTHER = '__other__';

/**
 * Lead quality dropdown: the presets, every label already in use (from meta), "Other…" to type a new
 * one, and "Not set". `onChange` receives the label or ''. Picking "Other…" swaps the control for a
 * text box; Enter or the tick saves, Escape or the cross goes back.
 */
export function LeadQualitySelect({ value, onChange, disabled, className, size = 'sm', id, placeholder = 'Lead quality', allowNone = true }) {
  const { data: meta } = useMeta();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const known = (meta?.leadQualityCounts || []).map((q) => q.name);
  // presets first, then the team's own labels, then the current value if it is not listed yet
  const options = [...new Set([...LEAD_QUALITIES, ...known, ...(value ? [value] : [])])];

  const commit = () => {
    const v = draft.trim().slice(0, 40);
    setTyping(false);
    if (v && v !== value) onChange(v);
  };

  if (typing) {
    return (
      <form
        className={cn('flex items-center gap-1', className)}
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setTyping(false)}
          placeholder="Name it…"
          maxLength={40}
          aria-label="New lead quality"
          className={cn('min-w-0 flex-1', size === 'sm' ? 'h-8' : '')}
        />
        <Button type="submit" size="icon-sm" variant="outline" aria-label="Save" disabled={!draft.trim()}>
          <Check />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setTyping(false)}>
          <X />
        </Button>
      </form>
    );
  }

  return (
    <Select
      // '' = nothing selected, so the trigger shows the placeholder; "Not set" is only an item for clearing
      value={value || ''}
      onValueChange={(v) => {
        if (v === OTHER) {
          setDraft('');
          setTyping(true);
        } else onChange(v === NONE ? '' : v);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className={cn('gap-1.5', className)} aria-label="Lead quality">
        <Gauge className={cn('size-3.5', value ? leadQualityStyle(value).dot.replace('bg-', 'text-') : 'text-muted-foreground')} aria-hidden="true" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((q) => (
          <SelectItem key={q} value={q}>
            <span className={cn('size-2 rounded-full', leadQualityStyle(q).dot)} aria-hidden="true" />
            {q}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={OTHER}>Other…</SelectItem>
        {allowNone ? <SelectItem value={NONE}>Not set</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}
