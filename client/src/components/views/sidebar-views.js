'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bookmark } from 'lucide-react';
import { parseListParams } from '@/components/contacts/list/contact-filters';
import { findActiveView, useViews, viewHref } from '@/components/views/use-views';
import { cn } from '@/lib/utils';

/** Pinned saved views, listed under "Contacts" in the sidebar. Renders nothing while loading or when there are none. */
export function SidebarViews({ onNavigate }) {
  const { data } = useViews();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pinned = (data?.items || []).filter((v) => v.pinned);
  if (!pinned.length) return null;
  const active = pathname === '/contacts' ? findActiveView(pinned, parseListParams(searchParams)) : null;

  return (
    <ul className="mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l pl-2" aria-label="Saved views">
      {pinned.map((v) => {
        const isActive = active?._id === v._id;
        return (
          <li key={v._id}>
            <Link
              href={viewHref(v)}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              title={v.name}
              className={cn(
                'flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors duration-200',
                isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              )}
            >
              <Bookmark className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{v.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
