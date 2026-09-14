'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pluralize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGE_SIZES } from '@/components/contacts/list/contact-filters';

export function ContactsPagination({ page, pages, limit, total, count, onPage, onLimit }) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = total === 0 ? 0 : from + count - 1;

  return (
    // Stacks on phones: the range on top, the controls below (wrapping into two groups if they must).
    <nav className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination">
      <p className="text-muted-foreground">
        {from}–{to} of {pluralize(total, 'contact')}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:justify-end">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows</span>
          <Select value={String(limit)} onValueChange={(v) => onLimit(Number(v))}>
            <SelectTrigger aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground whitespace-nowrap">
            Page {page} of {pages}
          </span>
          <Button variant="outline" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
            Prev
          </Button>
          <Button variant="outline" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}
