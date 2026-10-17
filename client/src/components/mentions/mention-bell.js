'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, MessageSquareReply, Users } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { livePoll } from '@/lib/live';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

const headline = (m) => (m.kind === 'reply' ? `${m.byName} replied to you` : m.all ? `${m.byName} tagged everyone` : `${m.byName} tagged you`);

/** "Tagged me": notes that tagged you (@you / @all) and replies to your notes. Opening one marks it read. */
export function MentionBell({ className }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: qk.mentions, queryFn: api.mentions.list, refetchInterval: livePoll, refetchOnWindowFocus: true });
  const unread = data?.unread || 0;
  const items = data?.items || [];

  const markRead = (ids) => api.mentions.read(ids).then(() => qc.invalidateQueries({ queryKey: qk.mentions })).catch(() => {});
  const openItem = (m) => {
    if (!m.readAt) markRead([m._id]);
    setOpen(false);
    router.push(`/contacts/${m.contactId}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative', className)} aria-label={unread ? `${unread} unread tags` : 'Tagged me'}>
          <AtSign className="size-5" />
          {unread ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white" aria-hidden="true">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <p className="text-sm font-medium">Tagged me</p>
            <p className="text-xs text-muted-foreground">{data ? `${unread} unread` : 'Loading…'}</p>
          </div>
          {unread ? (
            <Button size="xs" variant="outline" onClick={() => markRead()}>
              Mark all read
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-96">
          {items.length ? (
            <ul className="divide-y">
              {items.map((m) => {
                const Icon = m.kind === 'reply' ? MessageSquareReply : m.all ? Users : AtSign;
                return (
                  <li key={m._id}>
                    <button type="button" onClick={() => openItem(m)} className={cn('flex w-full gap-2 px-3 py-2 text-left hover:bg-accent', !m.readAt && 'bg-primary/5')}>
                      <Icon className={cn('mt-0.5 size-4 shrink-0', m.readAt ? 'text-muted-foreground' : 'text-primary')} aria-hidden="true" />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className={cn('truncate text-sm', !m.readAt && 'font-medium')}>{headline(m)}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {m.contact?.name || m.contact?.companyName || 'Contact'}
                          {m.contact?.name && m.contact?.companyName ? ` · ${m.contact.companyName}` : ''}
                        </span>
                        {m.text ? <span className="line-clamp-2 text-xs text-foreground/80">{m.text}</span> : null}
                        <span className="text-[11px] text-muted-foreground" title={formatDateTime(m.createdAt)} suppressHydrationWarning>
                          {timeAgo(m.createdAt)}
                        </span>
                      </span>
                      {!m.readAt ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nobody has tagged you yet. Type @ in a note to tag a teammate.</p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
