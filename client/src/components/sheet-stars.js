'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { useMeta } from '@/hooks/use-meta';
import { cn } from '@/lib/utils';

/** A list's rating from meta.sheetStars; sub-lists ("<list> - <tab>") share their list's stars. */
export function starsFor(sheetStars, name) {
  if (!sheetStars || !name) return 0;
  if (sheetStars[name]) return sheetStars[name];
  const parent = Object.keys(sheetStars).find((n) => name.startsWith(`${n} - `));
  return parent ? sheetStars[parent] : 0;
}

/** Read-only stars for tight spots (filter menus, table cells). Renders nothing for an unrated list. */
export function StarsText({ stars, className }) {
  if (!stars) return null;
  return (
    <span className={cn('text-brand-gold-deep tracking-tight dark:text-brand-gold', className)} aria-label={`${stars} of 5 stars`}>
      {'★'.repeat(stars)}
    </span>
  );
}

/**
 * Rate a list 1-5 stars. Click a star to set it, click the current one again to clear. Saves at once for
 * the whole team (the Contacts "Sheet stars" filter uses it); the meta cache is updated optimistically.
 */
export function SheetStars({ name, className }) {
  const qc = useQueryClient();
  const { data: meta } = useMeta();
  const current = starsFor(meta?.sheetStars, name);
  const own = Boolean(meta?.sheetStars?.[name]);
  const [hover, setHover] = useState(0);

  const rate = useMutation({
    mutationFn: (stars) => api.sheets.rate(name, stars),
    onMutate: async (stars) => {
      await qc.cancelQueries({ queryKey: qk.meta, exact: true });
      const prev = qc.getQueryData(qk.meta);
      qc.setQueryData(qk.meta, (m) => {
        if (!m) return m;
        const next = { ...(m.sheetStars || {}) };
        if (stars) next[name] = stars;
        else delete next[name];
        return { ...m, sheetStars: next };
      });
      return { prev };
    },
    onError: (err, _stars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.meta, ctx.prev);
      toast.error(err.message || 'Could not save the rating');
    },
    onSuccess: (_res, stars) => toast.success(stars ? `${name}: ${stars} star${stars > 1 ? 's' : ''}` : `Rating removed from ${name}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.meta });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const shown = hover || current;
  return (
    <div className={cn('inline-flex items-center', className)} role="radiogroup" aria-label={`Rating for ${name}`} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          title={current === n && own ? 'Click again to remove the rating' : `Rate ${n} of 5`}
          disabled={rate.isPending}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => rate.mutate(current === n && own ? 0 : n)}
          className="rounded-sm p-0.5 transition-transform duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:scale-110 disabled:opacity-60"
        >
          <Star
            className={cn('size-4 transition-colors duration-150', n <= shown ? 'fill-brand-gold text-brand-gold-deep dark:text-brand-gold' : 'text-muted-foreground/50')}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
