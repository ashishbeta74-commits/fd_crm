'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { api, qk } from '@/lib/api';
import { tagQueryAt } from '@/lib/mentions';
import { cn } from '@/lib/utils';

const MAX_OPTIONS = 8;

/** The active team members who can be tagged (@Name). Rarely changes. */
export function useTeam() {
  const { data } = useQuery({ queryKey: qk.team, queryFn: api.auth.team, staleTime: 10 * 60_000 });
  return data?.items || [];
}

/**
 * A textarea that suggests "@all" and the team's names after "@". Arrow keys / Enter / Tab pick one,
 * Escape closes the list. `onChange` receives the new text (not the event).
 */
export function MentionTextarea({ value, onChange, onKeyDown, className, ...props }) {
  const team = useTeam();
  const ref = useRef(null);
  const [query, setQuery] = useState(null); // the "@…" being typed, null when the list is closed
  const [active, setActive] = useState(0);

  const q = (query || '').toLowerCase();
  const options =
    query === null
      ? []
      : [{ _id: 'all', displayName: 'all', hint: 'Everyone on the team' }, ...team.map((u) => ({ ...u, hint: `@${u.username}` }))]
          .filter((o) => !q || o.displayName.toLowerCase().includes(q) || o.username?.toLowerCase().startsWith(q))
          .slice(0, MAX_OPTIONS);
  const open = options.length > 0;

  const track = (el) => {
    setQuery(tagQueryAt(el.value, el.selectionStart));
    setActive(0);
  };

  const pick = (option) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]*)$/, `@${option.displayName} `);
    onChange(before + value.slice(caret));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const keyDown = (e) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(options[Math.min(active, options.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          track(e.target);
        }}
        onClick={(e) => track(e.currentTarget)}
        onKeyDown={keyDown}
        onBlur={() => setQuery(null)}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open ? (
        <ul role="listbox" aria-label="Tag someone" className="absolute top-full left-0 z-50 mt-1 w-64 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
          {options.map((o, i) => (
            <li
              key={o._id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: picking must happen before the textarea's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5', i === active && 'bg-accent text-accent-foreground')}
            >
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                {o._id === 'all' ? <Users className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                <span className="truncate">@{o.displayName}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
