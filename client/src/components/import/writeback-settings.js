'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUpFromLine, CheckCircle2, CircleAlert, Copy, Loader2 } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { pluralize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Explains the two-way sync state: which account to share sheets with, or how to set one up. */
export function WritebackInfo({ info }) {
  if (!info) return null;
  const copy = () => navigator.clipboard?.writeText(info.email).then(() => toast.success('Service account email copied'));
  if (info.configured) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm sm:flex-row sm:items-start sm:justify-between dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Two-way sync is ready
          </p>
          <p className="mt-1 text-muted-foreground">
            Share each sheet with <code className="rounded bg-background px-1 py-0.5 text-xs">{info.email}</code> as <strong>Editor</strong>, then switch on <em>Two-way</em> for
            the sheet. The CRM writes its own <em>CRM …</em> columns ({info.columns.length}) at the right of the tab; changes are pushed about {info.debounceSeconds}s
            after they happen.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
          <Copy /> Copy email
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <p className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        Two-way sync is not set up yet
      </p>
      {info.error ? <p className="mt-1 text-destructive">{info.error}</p> : null}
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
        <li>
          In Google Cloud create a <strong>service account</strong> (APIs &amp; Services → Credentials) and download its JSON key. Enable the <em>Google Sheets API</em> and{' '}
          <em>Google Drive API</em> for the project.
        </li>
        <li>
          Save the key as <code className="rounded bg-background px-1 py-0.5 text-xs">server/google-service-account.json</code> and add{' '}
          <code className="rounded bg-background px-1 py-0.5 text-xs">GOOGLE_SERVICE_ACCOUNT_FILE=./google-service-account.json</code> to <code className="text-xs">server/.env</code>,
          then restart the API.
        </li>
        <li>Share each calling sheet with the service account&apos;s email as Editor and switch on Two-way below.</li>
      </ol>
    </div>
  );
}

/** Per-sheet two-way controls: enable switch, "also update mapped columns", Push now + last push status. */
export function WritebackCell({ item, configured }) {
  const qc = useQueryClient();
  const wb = item.writeBack || {};
  const refresh = () => qc.invalidateQueries({ queryKey: qk.importSources });
  const update = useMutation({
    mutationFn: (body) => api.sheets.update(item.sheetId, body),
    onSuccess: (saved) => {
      refresh();
      toast.success(saved.writeBack?.enabled ? `Two-way sync on for "${item.name || 'sheet'}"` : `Two-way sync off for "${item.name || 'sheet'}"`);
    },
    onError: (err) => toast.error(err?.message || 'Could not save'),
  });
  const push = useMutation({
    mutationFn: () => api.sheets.push(item.sheetId),
    onSuccess: (r) => {
      refresh();
      toast.success(`${r.matched} ${r.matched === 1 ? 'row' : 'rows'} written to the sheet${r.unmatched ? ` · ${pluralize(r.unmatched, 'contact')} not found in it` : ''}`);
    },
    onError: (err) => {
      refresh();
      toast.error(err?.message || 'Push failed');
    },
  });
  if (!item.sheetId || !item.lastBatchId) return <span className="text-xs text-muted-foreground">–</span>;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Switch
          id={`wb-${item.sheetId}`}
          size="sm"
          checked={Boolean(wb.enabled)}
          disabled={!configured || update.isPending}
          onCheckedChange={(v) => update.mutate({ writeBack: { enabled: v } })}
          aria-label="Two-way sync"
        />
        <Label htmlFor={`wb-${item.sheetId}`} className="text-xs font-normal">
          Two-way
        </Label>
        {wb.enabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Label className="ml-1 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Switch size="sm" checked={Boolean(wb.updateMappedColumns)} disabled={update.isPending} onCheckedChange={(v) => update.mutate({ writeBack: { updateMappedColumns: v } })} aria-label="Also update mapped columns" />
                mapped cols
              </Label>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Also overwrite the sheet&apos;s own Stage / Next follow-up / Booking / Priority / Tags columns (never the call rounds or remarks).</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="xs" variant="outline" disabled={!configured || push.isPending} onClick={() => push.mutate()} aria-label={`Push CRM data to ${item.name || 'sheet'}`}>
          {push.isPending ? <Loader2 className="animate-spin" /> : <ArrowUpFromLine />}
          {push.isPending ? 'Pushing…' : 'Push now'}
        </Button>
        {wb.lastPushAt ? (
          wb.lastPushResult === 'error' ? (
            <Badge variant="destructive" className="max-w-40 gap-1 font-normal" title={wb.lastPushError}>
              <span className="truncate">Failed · {wb.lastPushError}</span>
            </Badge>
          ) : (
            <span className={cn('text-xs text-muted-foreground')} suppressHydrationWarning title={wb.lastPushUnmatched ? `${wb.lastPushUnmatched} contact(s) were not found in the sheet` : undefined}>
              Pushed {wb.lastPushCount} · {timeAgo(wb.lastPushAt)}
              {wb.lastPushUnmatched ? ` · ${wb.lastPushUnmatched} unmatched` : ''}
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
