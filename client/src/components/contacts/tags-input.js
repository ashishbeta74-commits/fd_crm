'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { TagBadge } from '@/components/badges';
import { useMeta } from '@/hooks/use-meta';
import { cn } from '@/lib/utils';

const norm = (t) => t.trim().replace(/\s+/g, ' ');

/**
 * Chip editor for a contact's tags. Type and press Enter (or comma) to add; Backspace on an empty
 * input removes the last tag. Existing tags across the CRM are offered through a datalist.
 */
export function TagsInput({ value = [], onChange, id, placeholder = 'Add a tag and press Enter', className, autoFocus = false }) {
  const listId = useId();
  const [text, setText] = useState('');
  const { data: meta } = useMeta();
  const known = (meta?.tags || []).map((t) => t.tag);
  const lower = new Set(value.map((t) => t.toLowerCase()));

  const add = (raw) => {
    const parts = raw
      .split(/[,;]+/)
      .map(norm)
      .filter((t) => t && !lower.has(t.toLowerCase()));
    if (!parts.length) return;
    const seen = new Set(lower);
    const next = [...value];
    for (const p of parts) {
      if (seen.has(p.toLowerCase())) continue;
      seen.add(p.toLowerCase());
      next.push(p.slice(0, 40));
    }
    onChange(next);
  };

  const commit = () => {
    if (text.trim()) add(text);
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn('grid gap-1.5', className)}>
      {value.length ? (
        <div className="flex flex-wrap gap-1">
          {value.map((t) => (
            <TagBadge key={t} tag={t} onRemove={(tag) => onChange(value.filter((x) => x !== tag))} />
          ))}
        </div>
      ) : null}
      <Input
        id={id}
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label="Tags"
      />
      <datalist id={listId}>
        {known
          .filter((t) => !lower.has(t.toLowerCase()))
          .slice(0, 100)
          .map((t) => (
            <option key={t} value={t} />
          ))}
      </datalist>
    </div>
  );
}
