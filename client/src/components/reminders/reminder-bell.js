'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, BellRing } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { pushSupported, subscribePush, unsubscribePush } from '@/lib/push';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PriorityBadge } from '@/components/badges';
import { ReminderActions } from '@/components/reminders/reminder-actions';

const POLL_MS = 30_000;
const NOTIFY_KEY = 'crm:notify';

// The notification preference (localStorage) and the browser permission live outside React;
// useSyncExternalStore reads them without a hydration mismatch (server snapshot = off / default).
const listeners = new Set();
const subscribe = (cb) => {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};
const emitChange = () => listeners.forEach((cb) => cb());
const readPref = () => {
  try {
    return localStorage.getItem(NOTIFY_KEY) === '1';
  } catch {
    return false;
  }
};
const readPermission = () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

/**
 * Bell in the sidebar: due reminders (overdue + today), most urgent first, with Done / Snooze.
 * With "Browser notifications" on, reminders that come due while the app is open pop a system
 * notification once (the API remembers which ones were shown).
 */
export function ReminderBell({ className }) {
  const router = useRouter();
  const { data } = useQuery({ queryKey: qk.remindersDue, queryFn: api.reminders.due, refetchInterval: POLL_MS, refetchOnWindowFocus: true });
  const notify = useSyncExternalStore(subscribe, readPref, () => false);
  const permission = useSyncExternalStore(subscribe, readPermission, () => 'default');
  const shown = useRef(new Set());

  // Fire system notifications for reminders that are due and have not been shown yet.
  useEffect(() => {
    if (!notify || permission !== 'granted' || !data?.unnotified?.length) return;
    const fresh = data.unnotified.filter((r) => !shown.current.has(r._id));
    if (!fresh.length) return;
    for (const r of fresh) {
      shown.current.add(r._id);
      try {
        const n = new Notification(`${r.priority ? `[${r.priority.toUpperCase()}] ` : ''}${r.contact?.name || 'Reminder'}`, {
          body: r.note || `Reminder for ${r.contact?.companyName || r.contact?.email || 'contact'}`,
          tag: `reminder-${r._id}`,
        });
        n.onclick = () => {
          window.focus();
          router.push(`/contacts/${r.contactId}`);
        };
      } catch {
        /* notifications unsupported here */
      }
    }
    api.reminders.notified(fresh.map((r) => r._id)).catch(() => {});
  }, [data, notify, permission, router]);

  const [busy, setBusy] = useState(false);
  const toggleNotify = async (on) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      emitChange();
      if (p !== 'granted') {
        toast.error('Notifications are blocked for this site - allow them in the browser\'s site settings');
        return;
      }
    }
    setBusy(true);
    try {
      // Push = notifications even when the CRM tab is closed. Falls back to in-app notifications when unsupported.
      if (on && pushSupported()) {
        await subscribePush();
        toast.success('Notifications on - you will get reminders even when the app is closed');
      } else if (!on) {
        await unsubscribePush();
      } else {
        toast.message('Notifications on while the app is open (this browser cannot receive push)');
      }
      localStorage.setItem(NOTIFY_KEY, on ? '1' : '0');
    } catch (err) {
      toast.error(err?.message || 'Could not switch notifications on');
    } finally {
      setBusy(false);
      emitChange();
    }
  };
  const sendTest = () => api.push.test().then(() => toast.success('Test notification sent')).catch((err) => toast.error(err?.message || 'Could not send a test'));

  const due = (data?.overdue || 0) + (data?.today || 0);
  const items = data?.items || [];
  const Icon = data?.overdue ? BellRing : Bell;
  const supported = typeof window !== 'undefined' && typeof Notification !== 'undefined';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative', className)} aria-label={due ? `${due} reminders due` : 'Reminders'}>
          <Icon className={cn('size-5', data?.overdue && 'text-destructive')} />
          {due ? (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
                data?.overdue ? 'bg-destructive' : 'bg-primary',
              )}
              aria-hidden="true"
            >
              {due > 99 ? '99+' : due}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <p className="text-sm font-medium">Reminders</p>
            <p className="text-xs text-muted-foreground">
              {data ? `${data.overdue} overdue · ${data.today} due today` : 'Loading…'}
            </p>
          </div>
          <Button asChild size="xs" variant="outline">
            <Link href="/follow-ups">All follow-ups</Link>
          </Button>
        </div>
        <ScrollArea className="max-h-80">
          {items.length ? (
            <ul className="divide-y">
              {items.map((r) => (
                <li key={r._id} className="grid gap-1.5 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/contacts/${r.contactId}`} className="block truncate text-sm font-medium hover:underline">
                        {r.contact?.name || r.contact?.email || 'Contact'}
                      </Link>
                      <p className={cn('text-xs', r.overdue ? 'text-destructive' : 'text-muted-foreground')} suppressHydrationWarning title={formatDateTime(r.at)}>
                        {r.overdue ? `${timeAgo(r.at)} · overdue` : formatDateTime(r.at)}
                        {r.contact?.companyName ? ` · ${r.contact.companyName}` : ''}
                      </p>
                      {r.note ? <p className="line-clamp-2 text-xs text-foreground/80">{r.note}</p> : null}
                    </div>
                    <PriorityBadge priority={r.priority} size="xs" className="shrink-0" />
                  </div>
                  <ReminderActions reminder={r} contact={r.contact} compact showEdit={false} showDelete={false} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing due. Set reminders from a contact page.</p>
          )}
        </ScrollArea>
        <div className="grid gap-1 border-t px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="notify-switch" className="text-xs text-muted-foreground">
              Browser notifications{permission === 'denied' ? ' (blocked in browser settings)' : ''}
            </Label>
            <Switch id="notify-switch" size="sm" checked={notify && permission === 'granted'} onCheckedChange={toggleNotify} disabled={busy || !supported || permission === 'denied'} />
          </div>
          {notify && permission === 'granted' ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>Reminders as they come due, plus a morning summary. Works with the app closed.</span>
              <button type="button" onClick={sendTest} className="shrink-0 underline-offset-2 hover:underline">
                Send test
              </button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
